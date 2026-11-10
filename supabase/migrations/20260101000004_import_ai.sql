-- Phase 5: bulk import, AI conversation privacy, AI rate limiting.

-- AI messages are private to the user who owns the conversation (not the whole organization)
drop policy if exists ai_messages_select on ai_messages;
create policy ai_messages_select on ai_messages for select to authenticated using (
  exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid() and c.organization_id = ai_messages.organization_id));
create policy ai_messages_insert on ai_messages for insert to authenticated with check (
  exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid() and c.organization_id = ai_messages.organization_id));

-- AI allowance with a short-term rate limit (6 requests per user per minute)
create or replace function consume_ai_request(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p plan_tier; lim integer; used integer; recent integer;
begin
  if not is_member(p_org) then raise exception 'Not allowed'; end if;
  p := org_plan(p_org);
  if p is null then raise exception 'An active subscription is required to use AI features' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('ai:' || p_org::text));
  select count(*) into recent from usage_records
    where organization_id = p_org and user_id = auth.uid() and kind = 'ai_request' and created_at > now() - interval '1 minute';
  if recent >= 6 then raise exception 'Too many requests. Please wait a minute and try again.' using errcode = 'P0005'; end if;
  select monthly_ai_requests into lim from plan_limits where plan = p;
  select coalesce(sum(units), 0) into used from usage_records
    where organization_id = p_org and kind = 'ai_request' and period_start = date_trunc('month', now())::date;
  if used >= lim then raise exception 'Monthly AI allowance reached' using errcode = 'P0003'; end if;
  insert into usage_records (organization_id, user_id, kind, units) values (p_org, auth.uid(), 'ai_request', 1);
  return lim - used - 1;
end $$;

-- Bulk import: every row is validated by the database; failures are reported per row, never silently dropped.
create or replace function import_items(p_org uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; idx integer := 0; ok integer := 0; errs jsonb := '[]'::jsonb;
  cat uuid; loc uuid; sup uuid; itm uuid; qty numeric; cname text;
begin
  if not is_member(p_org) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Invalid import batch'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  for r in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    begin
      cat := null; loc := null; sup := null;
      cname := nullif(trim(r->>'category'), '');
      if cname is not null then
        select id into cat from inventory_categories where organization_id = p_org and lower(name) = lower(cname);
        if cat is null then insert into inventory_categories (organization_id, name) values (p_org, cname) returning id into cat; end if;
      end if;
      if nullif(trim(r->>'location'), '') is not null then
        select id into loc from locations where organization_id = p_org and not is_archived and lower(name) = lower(trim(r->>'location'));
        if loc is null then raise exception 'Unknown location "%"', r->>'location'; end if;
      end if;
      if nullif(trim(r->>'supplier'), '') is not null then
        select id into sup from suppliers where organization_id = p_org and not is_archived and lower(name) = lower(trim(r->>'supplier'));
        if sup is null then raise exception 'Unknown supplier "%"', r->>'supplier'; end if;
      end if;
      qty := coalesce(nullif(r->>'quantity', '')::numeric, 0);
      insert into inventory_items (organization_id, name, sku, description, category_id, supplier_id, location_id, unit, quantity, min_stock,
        unit_cost, selling_price, batch_number, expiration_date, created_by, updated_by)
      values (p_org, trim(r->>'name'), nullif(trim(r->>'sku'), ''), nullif(trim(r->>'description'), ''), cat, sup, loc,
        coalesce(nullif(trim(r->>'unit'), ''), 'unit'), qty, coalesce(nullif(r->>'min_stock', '')::numeric, 0),
        coalesce(nullif(r->>'unit_cost', '')::numeric, 0), nullif(r->>'selling_price', '')::numeric,
        nullif(trim(r->>'batch_number'), ''), nullif(r->>'expiration_date', '')::date, auth.uid(), auth.uid())
      returning id into itm;
      if qty > 0 then
        insert into inventory_movements (organization_id, item_id, location_id, type, quantity_change, quantity_after, reason, created_by)
        values (p_org, itm, loc, 'import', qty, qty, 'Imported from spreadsheet', auth.uid());
      end if;
      ok := ok + 1;
    exception
      when unique_violation then
        errs := errs || jsonb_build_array(jsonb_build_object('row', coalesce((r->>'_row')::int, idx), 'message', 'Duplicate SKU for this location (already in your inventory)'));
      when others then
        errs := errs || jsonb_build_array(jsonb_build_object('row', coalesce((r->>'_row')::int, idx), 'message', sqlerrm));
    end;
  end loop;
  insert into audit_logs (organization_id, user_id, action, entity_type, details)
  values (p_org, auth.uid(), 'inventory.import_batch', 'import', jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errs)));
  return jsonb_build_object('imported', ok, 'errors', errs);
end $$;

revoke all on function import_items(uuid, jsonb) from public;
grant execute on function import_items(uuid, jsonb) to authenticated;
