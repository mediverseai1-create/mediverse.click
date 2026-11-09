-- Row Level Security + secure server-side functions.

-- ---------- Enable RLS on every table ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','organizations','organization_members','organization_invitations','subscriptions','plan_limits',
    'usage_records','payment_events','locations','inventory_categories','suppliers','inventory_items',
    'inventory_batches','inventory_movements','purchase_orders','purchase_order_items','inventory_alerts',
    'notification_preferences','demand_forecasts','ai_conversations','ai_messages','import_jobs','audit_logs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ---------- Read access: members of the owning organization ----------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','subscriptions','usage_records','locations','inventory_categories','suppliers','inventory_items',
    'inventory_batches','inventory_movements','purchase_orders','purchase_order_items','inventory_alerts',
    'demand_forecasts','ai_messages','import_jobs','organization_members']
  loop
    execute format('create policy %I on %I for select to authenticated using (is_member(%s))',
      t||'_select', t, case when t='organizations' then 'id' else 'organization_id' end);
  end loop;
end $$;

-- ---------- Write access for day-to-day tables (any member; deletes need admin) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'inventory_categories','inventory_items','inventory_batches','purchase_orders','purchase_order_items','import_jobs']
  loop
    execute format('create policy %I on %I for insert to authenticated with check (is_member(organization_id))', t||'_insert', t);
    execute format('create policy %I on %I for update to authenticated using (is_member(organization_id)) with check (is_member(organization_id))', t||'_update', t);
    execute format('create policy %I on %I for delete to authenticated using (has_role(organization_id, array[''owner'',''admin'']::member_role[]))', t||'_delete', t);
  end loop;
end $$;

-- Admin-level tables
do $$
declare t text;
begin
  foreach t in array array['locations','suppliers']
  loop
    execute format('create policy %I on %I for insert to authenticated with check (has_role(organization_id, array[''owner'',''admin'']::member_role[]))', t||'_insert', t);
    execute format('create policy %I on %I for update to authenticated using (has_role(organization_id, array[''owner'',''admin'']::member_role[])) with check (has_role(organization_id, array[''owner'',''admin'']::member_role[]))', t||'_update', t);
    execute format('create policy %I on %I for delete to authenticated using (has_role(organization_id, array[''owner'',''admin'']::member_role[]))', t||'_delete', t);
  end loop;
end $$;

-- Organization settings: owner/admin may update
create policy organizations_update on organizations for update to authenticated
  using (has_role(id, array['owner','admin']::member_role[])) with check (has_role(id, array['owner','admin']::member_role[]));

-- Alerts: members read and mark read (no inserts/deletes from client)
create policy inventory_alerts_update on inventory_alerts for update to authenticated
  using (is_member(organization_id)) with check (is_member(organization_id));

-- Profiles
create policy profiles_select_self on profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_coworkers on profiles for select to authenticated using (
  exists (select 1 from organization_members a join organization_members b on a.organization_id = b.organization_id
          where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Invitations (admin+)
create policy invitations_select on organization_invitations for select to authenticated using (has_role(organization_id, array['owner','admin']::member_role[]));
create policy invitations_insert on organization_invitations for insert to authenticated with check (has_role(organization_id, array['owner','admin']::member_role[]) and role <> 'owner');
create policy invitations_delete on organization_invitations for delete to authenticated using (has_role(organization_id, array['owner','admin']::member_role[]));

-- Own notification preferences
create policy notif_select on notification_preferences for select to authenticated using (user_id = auth.uid() and is_member(organization_id));
create policy notif_insert on notification_preferences for insert to authenticated with check (user_id = auth.uid() and is_member(organization_id));
create policy notif_update on notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(organization_id));

-- AI conversations: private to the user who started them
create policy ai_conv_select on ai_conversations for select to authenticated using (user_id = auth.uid() and is_member(organization_id));
create policy ai_conv_insert on ai_conversations for insert to authenticated with check (user_id = auth.uid() and is_member(organization_id));

-- Plan limits readable by any signed-in user
create policy plan_limits_select on plan_limits for select to authenticated using (true);

-- Audit logs readable by admin+. payment_events: no client access at all.
create policy audit_select on audit_logs for select to authenticated using (organization_id is not null and has_role(organization_id, array['owner','admin']::member_role[]));

-- No client write policies exist for: subscriptions, usage_records, inventory_movements, inventory_alerts (insert),
-- demand_forecasts, ai_messages, organization_members, audit_logs, payment_events. Those change only through
-- the security-definer functions below or the server's service-role key.

-- ---------- Plan enforcement on locations (backend, not UI) ----------
create or replace function enforce_location_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare max_loc integer; cur integer; p plan_tier;
begin
  p := org_plan(new.organization_id);
  select max_locations into max_loc from plan_limits where plan = coalesce(p, 'starter');
  if p is null then max_loc := 1; end if;
  if max_loc is not null then
    select count(*) into cur from locations where organization_id = new.organization_id and not is_archived;
    if cur >= max_loc then
      raise exception 'Your plan allows % location(s). Upgrade to Professional for multi-location management.', max_loc using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger locations_limit before insert on locations for each row execute function enforce_location_limit();

-- Inserts must also start at zero; stock enters only through movements
create or replace function guard_quantity_insert() returns trigger language plpgsql as $$
begin
  if new.quantity <> 0 and coalesce(current_setting('app.stock_rpc', true),'') <> 'on' then
    raise exception 'New items start at zero; record an opening stock movement instead';
  end if;
  return new;
end $$;
create trigger inventory_items_guard_insert before insert on inventory_items for each row execute function guard_quantity_insert();

-- ---------- Create organization (one per user for now) ----------
create or replace function create_organization(p_name text, p_type org_type, p_country text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from organization_members where user_id = auth.uid()) then
    raise exception 'You already belong to an organization';
  end if;
  insert into organizations (name, type, country, created_by) values (trim(p_name), p_type, nullif(trim(p_country),''), auth.uid()) returning id into oid;
  insert into organization_members (organization_id, user_id, role) values (oid, auth.uid(), 'owner');
  insert into subscriptions (organization_id, status) values (oid, 'inactive');
  insert into notification_preferences (organization_id, user_id) values (oid, auth.uid());
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id) values (oid, auth.uid(), 'organization.created', 'organization', oid);
  return oid;
end $$;

create or replace function complete_onboarding(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(p_org, array['owner','admin']::member_role[]) then raise exception 'Not allowed'; end if;
  update organizations set onboarding_completed = true where id = p_org;
end $$;

-- ---------- Stock movements: the only way quantity changes ----------
create or replace function apply_stock_movement(p_item uuid, p_type movement_type, p_quantity numeric, p_reason text default null)
returns inventory_movements language plpgsql security definer set search_path = public as $$
declare it inventory_items; delta numeric; newq numeric; mv inventory_movements;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  select * into it from inventory_items where id = p_item for update;
  if not found or not is_member(it.organization_id) then raise exception 'Item not found'; end if;
  if it.is_archived then raise exception 'Cannot change stock on an archived item'; end if;
  if p_type in ('adjustment_in','adjustment_out','expired_writeoff') and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'A reason is required for adjustments and write-offs';
  end if;
  delta := case when p_type in ('consumption','adjustment_out','transfer_out','expired_writeoff') then -p_quantity else p_quantity end;
  newq := it.quantity + delta;
  if newq < 0 then raise exception 'Insufficient stock: % available, % requested', it.quantity, p_quantity; end if;
  perform set_config('app.stock_rpc', 'on', true);
  update inventory_items set quantity = newq, updated_by = auth.uid() where id = it.id;
  insert into inventory_movements (organization_id, item_id, location_id, type, quantity_change, quantity_after, reason, created_by)
    values (it.organization_id, it.id, it.location_id, p_type, delta, newq, p_reason, auth.uid()) returning * into mv;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, details)
    values (it.organization_id, auth.uid(), 'stock.'||p_type, 'inventory_item', it.id, jsonb_build_object('change', delta, 'after', newq));
  return mv;
end $$;

-- ---------- AI allowance (atomic check + record) ----------
create or replace function consume_ai_request(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p plan_tier; lim integer; used integer;
begin
  if not is_member(p_org) then raise exception 'Not allowed'; end if;
  p := org_plan(p_org);
  if p is null then raise exception 'An active subscription is required to use AI features' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('ai:'||p_org::text));
  select monthly_ai_requests into lim from plan_limits where plan = p;
  select coalesce(sum(units),0) into used from usage_records
    where organization_id = p_org and kind = 'ai_request' and period_start = date_trunc('month', now())::date;
  if used >= lim then raise exception 'Monthly AI allowance reached' using errcode = 'P0003'; end if;
  insert into usage_records (organization_id, user_id, kind, units) values (p_org, auth.uid(), 'ai_request', 1);
  return lim - used - 1;
end $$;

-- ---------- Accept an invitation (email must match the signed-in user) ----------
create or replace function accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv organization_invitations;
begin
  select * into inv from organization_invitations where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt()->>'email','')) then raise exception 'This invitation was sent to a different email address'; end if;
  insert into organization_members (organization_id, user_id, role) values (inv.organization_id, auth.uid(), inv.role) on conflict do nothing;
  insert into notification_preferences (organization_id, user_id) values (inv.organization_id, auth.uid()) on conflict do nothing;
  update organization_invitations set accepted_at = now() where id = inv.id;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id) values (inv.organization_id, auth.uid(), 'member.joined', 'organization', inv.organization_id);
  return inv.organization_id;
end $$;

-- ---------- Lock down function execution ----------
revoke all on function create_organization(text, org_type, text) from public;
revoke all on function complete_onboarding(uuid) from public;
revoke all on function apply_stock_movement(uuid, movement_type, numeric, text) from public;
revoke all on function consume_ai_request(uuid) from public;
revoke all on function accept_invitation(uuid) from public;
grant execute on function create_organization(text, org_type, text) to authenticated;
grant execute on function complete_onboarding(uuid) to authenticated;
grant execute on function apply_stock_movement(uuid, movement_type, numeric, text) to authenticated;
grant execute on function consume_ai_request(uuid) to authenticated;
grant execute on function accept_invitation(uuid) to authenticated;
