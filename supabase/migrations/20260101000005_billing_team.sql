-- Phase 6: payment claims, subscription activation (server-only), team management.

-- ---------- Payment claims (manual verification workflow) ----------
create table payment_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  plan plan_tier not null,
  provider text not null default 'selar',
  reference text not null check (char_length(reference) between 4 and 120),
  payer_email text not null check (char_length(payer_email) between 5 and 200),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on payment_claims (organization_id, created_at desc);
create unique index payment_claims_ref_unique on payment_claims (provider, lower(reference)) where status in ('pending','approved');
alter table payment_claims enable row level security;
alter table payment_claims force row level security;
create policy payment_claims_select on payment_claims for select to authenticated using (is_member(organization_id));
-- no insert/update policies: claims are created through submit_payment_claim() and reviewed only by the server.

create or replace function submit_payment_claim(p_org uuid, p_plan plan_tier, p_reference text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not has_role(p_org, array['owner','admin']::member_role[]) then raise exception 'Only an owner or administrator can submit payment details'; end if;
  if (select count(*) from payment_claims where organization_id = p_org and status = 'pending') >= 5 then
    raise exception 'You already have pending payment confirmations. Please wait for them to be reviewed';
  end if;
  insert into payment_claims (organization_id, user_id, plan, reference, payer_email)
  values (p_org, auth.uid(), p_plan, trim(p_reference), lower(trim(p_email))) returning id into cid;
  -- shows "awaiting verification" without granting any access
  update subscriptions set status = 'pending' where organization_id = p_org and status in ('inactive','expired','cancelled');
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, details)
  values (p_org, auth.uid(), 'billing.claim_submitted', 'payment_claim', cid, jsonb_build_object('plan', p_plan));
  return cid;
end $$;

-- ---------- Server-only entitlement functions (service role only) ----------
create or replace function activate_subscription(p_org uuid, p_plan plan_tier, p_days integer, p_provider text, p_reference text)
returns void language plpgsql security definer set search_path = public as $$
declare cur subscriptions; start_from timestamptz;
begin
  if p_days < 1 or p_days > 400 then raise exception 'Invalid period'; end if;
  select * into cur from subscriptions where organization_id = p_org for update;
  if not found then raise exception 'Organization has no subscription record'; end if;
  -- extend from the current end if the same plan is still running; otherwise start now
  start_from := case when cur.status = 'active' and cur.plan = p_plan and cur.current_period_end > now() then cur.current_period_end else now() end;
  update subscriptions set plan = p_plan, status = 'active', provider = p_provider, provider_subscription_id = coalesce(p_reference, provider_subscription_id),
    current_period_start = case when start_from = now() then now() else cur.current_period_start end,
    current_period_end = start_from + make_interval(days => p_days), cancel_at_period_end = false
  where organization_id = p_org;
  insert into audit_logs (organization_id, action, entity_type, details)
  values (p_org, 'billing.activated', 'subscription', jsonb_build_object('plan', p_plan, 'days', p_days, 'provider', p_provider, 'reference', p_reference));
end $$;

create or replace function set_subscription_status(p_org uuid, p_status sub_status, p_cancel_at_end boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update subscriptions set status = p_status, cancel_at_period_end = coalesce(p_cancel_at_end, cancel_at_period_end),
    current_period_end = case when p_status in ('expired','cancelled','past_due') and p_cancel_at_end is not true then least(coalesce(current_period_end, now()), now()) else current_period_end end
  where organization_id = p_org;
  insert into audit_logs (organization_id, action, entity_type, details)
  values (p_org, 'billing.status_changed', 'subscription', jsonb_build_object('status', p_status));
end $$;

create or replace function find_org_for_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select m.organization_id from organization_members m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(p_email) and m.role = 'owner' limit 1;
$$;

create or replace function review_payment_claim(p_claim uuid, p_approve boolean, p_note text, p_reviewer text, p_days integer default 30)
returns void language plpgsql security definer set search_path = public as $$
declare c payment_claims;
begin
  select * into c from payment_claims where id = p_claim for update;
  if not found or c.status <> 'pending' then raise exception 'Claim not found or already reviewed'; end if;
  update payment_claims set status = case when p_approve then 'approved' else 'rejected' end, review_note = p_note, reviewed_by = p_reviewer, reviewed_at = now() where id = p_claim;
  if p_approve then perform activate_subscription(c.organization_id, c.plan, p_days, c.provider, c.reference);
  else update subscriptions set status = 'inactive' where organization_id = c.organization_id and status = 'pending'
         and not exists (select 1 from payment_claims x where x.organization_id = c.organization_id and x.status = 'pending'); end if;
end $$;

-- ---------- Team management ----------
create or replace function list_org_members(p_org uuid)
returns table (user_id uuid, full_name text, email text, role member_role, joined_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, p.full_name, u.email::text, m.role, m.created_at
  from organization_members m join auth.users u on u.id = m.user_id left join profiles p on p.id = m.user_id
  where m.organization_id = p_org and is_member(p_org) order by m.created_at;
$$;

create or replace function set_member_role(p_org uuid, p_user uuid, p_role member_role) returns void
language plpgsql security definer set search_path = public as $$
declare cur member_role;
begin
  if not has_role(p_org, array['owner']::member_role[]) then raise exception 'Only the owner can change roles'; end if;
  select role into cur from organization_members where organization_id = p_org and user_id = p_user;
  if not found then raise exception 'Member not found'; end if;
  if cur = 'owner' and p_role <> 'owner' and (select count(*) from organization_members where organization_id = p_org and role = 'owner') <= 1 then
    raise exception 'Cannot remove the last owner';
  end if;
  update organization_members set role = p_role where organization_id = p_org and user_id = p_user;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, details)
  values (p_org, auth.uid(), 'member.role_changed', 'user', p_user, jsonb_build_object('from', cur, 'to', p_role));
end $$;

create or replace function remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tgt member_role;
begin
  select role into tgt from organization_members where organization_id = p_org and user_id = p_user;
  if not found then raise exception 'Member not found'; end if;
  if tgt = 'owner' then raise exception 'The owner cannot be removed'; end if;
  if not (has_role(p_org, array['owner']::member_role[]) or (has_role(p_org, array['admin']::member_role[]) and tgt = 'staff')) then
    raise exception 'Not allowed to remove this member';
  end if;
  delete from organization_members where organization_id = p_org and user_id = p_user;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id) values (p_org, auth.uid(), 'member.removed', 'user', p_user);
end $$;

-- ---------- Execution rights ----------
do $$
declare f text;
begin
  -- user-callable functions: signed-in users only (Supabase grants anon by default; remove it)
  foreach f in array array[
    'submit_payment_claim(uuid, plan_tier, text, text)', 'list_org_members(uuid)', 'set_member_role(uuid, uuid, member_role)', 'remove_member(uuid, uuid)',
    'create_organization(text, org_type, text)', 'complete_onboarding(uuid)', 'apply_stock_movement(uuid, movement_type, numeric, text)',
    'consume_ai_request(uuid)', 'accept_invitation(uuid)', 'create_purchase_order(uuid, uuid, uuid, date, text, boolean, jsonb)',
    'set_po_status(uuid, po_status)', 'receive_purchase_order(uuid, jsonb)', 'generate_alerts(uuid)', 'item_consumption_stats(uuid, integer)',
    'report_consumption(uuid, date, date)', 'report_category_stock(uuid)', 'report_supplier_performance(uuid)', 'import_items(uuid, jsonb)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- server-only functions: callable ONLY with the service-role key
  foreach f in array array[
    'activate_subscription(uuid, plan_tier, integer, text, text)', 'set_subscription_status(uuid, sub_status, boolean)',
    'find_org_for_email(text)', 'review_payment_claim(uuid, boolean, text, text, integer)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
