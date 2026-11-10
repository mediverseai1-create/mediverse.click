-- Phase 4/5 server functions: plan gates, procurement workflow, alerts, report aggregates.

-- ---------- Professional-only gates (enforced in the database) ----------
create or replace function require_professional() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if org_plan(new.organization_id) is distinct from 'professional' then
    raise exception 'This feature requires the Professional plan' using errcode = 'P0004';
  end if;
  return new;
end $$;
create trigger suppliers_pro before insert on suppliers for each row execute function require_professional();
create trigger purchase_orders_pro before insert on purchase_orders for each row execute function require_professional();

-- ---------- Procurement ----------
create or replace function create_purchase_order(
  p_org uuid, p_supplier uuid, p_location uuid, p_expected date, p_notes text, p_is_request boolean, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare po uuid; n integer; l jsonb;
begin
  if not is_member(p_org) then raise exception 'Not allowed'; end if;
  if org_plan(p_org) is distinct from 'professional' then raise exception 'This feature requires the Professional plan' using errcode = 'P0004'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one product'; end if;
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and organization_id = p_org) then raise exception 'Invalid supplier'; end if;
  if p_location is not null and not exists (select 1 from locations where id = p_location and organization_id = p_org) then raise exception 'Invalid location'; end if;
  perform pg_advisory_xact_lock(hashtext('po:' || p_org::text));
  select count(*) + 1 into n from purchase_orders where organization_id = p_org;
  insert into purchase_orders (organization_id, po_number, supplier_id, location_id, expected_delivery, notes, is_request, status, created_by, updated_by)
  values (p_org, (case when p_is_request then 'PR-' else 'PO-' end) || lpad(n::text, 5, '0'), p_supplier, p_location, p_expected, p_notes, p_is_request, 'draft', auth.uid(), auth.uid())
  returning id into po;
  for l in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from inventory_items where id = (l->>'item_id')::uuid and organization_id = p_org) then raise exception 'Invalid product'; end if;
    if coalesce((l->>'quantity')::numeric, 0) <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    insert into purchase_order_items (organization_id, purchase_order_id, item_id, quantity_ordered, unit_cost)
    values (p_org, po, (l->>'item_id')::uuid, (l->>'quantity')::numeric, coalesce((l->>'unit_cost')::numeric, 0));
  end loop;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id) values (p_org, auth.uid(), 'purchase_order.created', 'purchase_order', po);
  return po;
end $$;

create or replace function set_po_status(p_po uuid, p_status po_status) returns void
language plpgsql security definer set search_path = public as $$
declare po purchase_orders; ok boolean;
begin
  select * into po from purchase_orders where id = p_po for update;
  if not found or not is_member(po.organization_id) then raise exception 'Order not found'; end if;
  ok := case po.status
    when 'draft' then p_status in ('pending_approval', 'cancelled')
    when 'pending_approval' then p_status in ('approved', 'draft', 'cancelled')
    when 'approved' then p_status in ('ordered', 'cancelled')
    when 'ordered' then p_status in ('cancelled')
    else false end;
  if not ok then raise exception 'Cannot change status from % to %', po.status, p_status; end if;
  if p_status = 'approved' and not has_role(po.organization_id, array['owner','admin']::member_role[]) then
    raise exception 'Only an owner or administrator can approve purchases';
  end if;
  update purchase_orders set status = p_status, updated_by = auth.uid(),
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    ordered_at = case when p_status = 'ordered' then now() else ordered_at end
  where id = p_po;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, details)
  values (po.organization_id, auth.uid(), 'purchase_order.' || p_status, 'purchase_order', p_po, jsonb_build_object('from', po.status));
end $$;

-- Stock only increases here, after an explicit receiving confirmation
create or replace function receive_purchase_order(p_po uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare po purchase_orders; l jsonb; pl purchase_order_items; q numeric; it inventory_items; newq numeric; allfull boolean;
begin
  select * into po from purchase_orders where id = p_po for update;
  if not found or not is_member(po.organization_id) then raise exception 'Order not found'; end if;
  if po.status not in ('ordered', 'partially_received') then raise exception 'Only ordered purchase orders can be received'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  for l in select * from jsonb_array_elements(p_lines) loop
    q := (l->>'quantity')::numeric;
    if q is null or q <= 0 then continue; end if;
    select * into pl from purchase_order_items where id = (l->>'line_id')::uuid and purchase_order_id = p_po for update;
    if not found then raise exception 'Invalid order line'; end if;
    if pl.quantity_received + q > pl.quantity_ordered then raise exception 'Cannot receive more than was ordered'; end if;
    update purchase_order_items set quantity_received = quantity_received + q where id = pl.id;
    select * into it from inventory_items where id = pl.item_id for update;
    newq := it.quantity + q;
    update inventory_items set quantity = newq, updated_by = auth.uid() where id = it.id;
    insert into inventory_movements (organization_id, item_id, location_id, type, quantity_change, quantity_after, reason, reference_type, reference_id, created_by)
    values (po.organization_id, it.id, it.location_id, 'purchase_receipt', q, newq, 'Received on ' || po.po_number, 'purchase_order', po.id, auth.uid());
  end loop;
  if not exists (select 1 from purchase_order_items where purchase_order_id = p_po and quantity_received > 0) then
    raise exception 'Enter at least one received quantity';
  end if;
  select bool_and(quantity_received >= quantity_ordered) into allfull from purchase_order_items where purchase_order_id = p_po;
  update purchase_orders set status = case when allfull then 'received'::po_status else 'partially_received'::po_status end,
    received_at = case when allfull then now() else received_at end, updated_by = auth.uid()
  where id = p_po;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id) values (po.organization_id, auth.uid(), 'purchase_order.received', 'purchase_order', p_po);
end $$;

-- ---------- Alerts (computed on the server from real records) ----------
create or replace function generate_alerts(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare pref notification_preferences; n integer := 0; c integer;
begin
  if not is_member(p_org) then raise exception 'Not allowed'; end if;
  select * into pref from notification_preferences where organization_id = p_org and user_id = auth.uid();
  if not found then
    insert into notification_preferences (organization_id, user_id) values (p_org, auth.uid()) returning * into pref;
  end if;

  -- close alerts whose condition no longer holds
  update inventory_alerts a set resolved_at = now()
  where a.organization_id = p_org and a.resolved_at is null
    and a.type in ('out_of_stock','low_stock','expired','approaching_expiry')
    and not exists (
      select 1 from inventory_items i where i.id = a.item_id and not i.is_archived and (
        (a.type = 'out_of_stock' and i.quantity = 0) or
        (a.type = 'low_stock' and i.quantity > 0 and i.min_stock > 0 and i.quantity <= i.min_stock) or
        (a.type = 'expired' and i.quantity > 0 and i.expiration_date < current_date) or
        (a.type = 'approaching_expiry' and i.quantity > 0 and i.expiration_date >= current_date
           and i.expiration_date <= current_date + pref.expiry_warning_days)));
  update inventory_alerts set resolved_at = now()
  where organization_id = p_org and resolved_at is null and type in ('unusual_consumption','reorder_recommendation')
    and created_at < now() - interval '7 days';

  if pref.out_of_stock then
    insert into inventory_alerts (organization_id, item_id, type, message, severity)
    select i.organization_id, i.id, 'out_of_stock', i.name || ' is out of stock', 'critical'
    from inventory_items i where i.organization_id = p_org and not i.is_archived and i.quantity = 0
    on conflict (organization_id, item_id, type) where resolved_at is null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;
  if pref.low_stock then
    insert into inventory_alerts (organization_id, item_id, type, message, severity)
    select i.organization_id, i.id, 'low_stock', i.name || ' is low: ' || i.quantity || ' ' || i.unit || ' left (minimum ' || i.min_stock || ')', 'warning'
    from inventory_items i where i.organization_id = p_org and not i.is_archived and i.quantity > 0 and i.min_stock > 0 and i.quantity <= i.min_stock
    on conflict (organization_id, item_id, type) where resolved_at is null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;
  if pref.expired then
    insert into inventory_alerts (organization_id, item_id, type, message, severity)
    select i.organization_id, i.id, 'expired', i.name || ' expired on ' || i.expiration_date, 'critical'
    from inventory_items i where i.organization_id = p_org and not i.is_archived and i.quantity > 0 and i.expiration_date < current_date
    on conflict (organization_id, item_id, type) where resolved_at is null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;
  if pref.approaching_expiry then
    insert into inventory_alerts (organization_id, item_id, type, message, severity)
    select i.organization_id, i.id, 'approaching_expiry', i.name || ' expires in ' || (i.expiration_date - current_date) || ' days (' || i.expiration_date || ')', 'warning'
    from inventory_items i where i.organization_id = p_org and not i.is_archived and i.quantity > 0
      and i.expiration_date >= current_date and i.expiration_date <= current_date + pref.expiry_warning_days
    on conflict (organization_id, item_id, type) where resolved_at is null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;
  if pref.unusual_consumption then
    insert into inventory_alerts (organization_id, item_id, type, message, severity)
    select i.organization_id, i.id, 'unusual_consumption',
      i.name || ': last 7 days usage averages ' || round(s.recent, 2) || '/day versus ' || round(s.base, 2) || '/day normally', 'warning'
    from (
      select item_id,
        coalesce(sum(-quantity_change) filter (where created_at >= now() - interval '7 days'), 0) / 7.0 as recent,
        coalesce(sum(-quantity_change) filter (where created_at < now() - interval '7 days'), 0) / 30.0 as base
      from inventory_movements
      where organization_id = p_org and type = 'consumption' and created_at >= now() - interval '37 days'
      group by item_id) s
    join inventory_items i on i.id = s.item_id
    where not i.is_archived and s.base > 0 and s.recent > s.base * pref.unusual_consumption_factor
    on conflict (organization_id, item_id, type) where resolved_at is null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;
  if pref.reorder_recommendation then
    insert into inventory_alerts (organization_id, item_id, type, message, severity)
    select i.organization_id, i.id, 'reorder_recommendation',
      'Consider reordering ' || i.name || ': about ' || round(i.quantity / s.daily, 0) || ' days of stock left at recent usage (estimate)', 'info'
    from (
      select item_id, sum(-quantity_change) / 30.0 as daily from inventory_movements
      where organization_id = p_org and type = 'consumption' and created_at >= now() - interval '30 days' group by item_id) s
    join inventory_items i on i.id = s.item_id
    where not i.is_archived and s.daily > 0 and i.quantity > 0 and i.quantity / s.daily <= 14
    on conflict (organization_id, item_id, type) where resolved_at is null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;
  return n;
end $$;

-- ---------- Aggregates for forecasting and reports ----------
create or replace function item_consumption_stats(p_org uuid, p_days integer default 90)
returns table (item_id uuid, consumed numeric, consumed_first_half numeric, consumed_second_half numeric, first_consumption date, events integer)
language sql stable security definer set search_path = public as $$
  select m.item_id,
    sum(-m.quantity_change),
    coalesce(sum(-m.quantity_change) filter (where m.created_at < now() - make_interval(days => p_days / 2)), 0),
    coalesce(sum(-m.quantity_change) filter (where m.created_at >= now() - make_interval(days => p_days / 2)), 0),
    min(m.created_at)::date,
    count(*)::int
  from inventory_movements m
  where m.organization_id = p_org and is_member(p_org) and m.type = 'consumption'
    and m.created_at >= now() - make_interval(days => p_days)
  group by m.item_id;
$$;

create or replace function report_consumption(p_org uuid, p_from date, p_to date)
returns table (day date, units numeric, value numeric)
language sql stable security definer set search_path = public as $$
  select m.created_at::date, sum(-m.quantity_change), sum(-m.quantity_change * i.unit_cost)
  from inventory_movements m join inventory_items i on i.id = m.item_id
  where m.organization_id = p_org and is_member(p_org) and m.type = 'consumption'
    and m.created_at::date between p_from and p_to
  group by 1 order by 1;
$$;

create or replace function report_category_stock(p_org uuid)
returns table (category text, items bigint, units numeric, value numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(c.name, 'Uncategorized'), count(*), sum(i.quantity), sum(i.quantity * i.unit_cost)
  from inventory_items i left join inventory_categories c on c.id = i.category_id
  where i.organization_id = p_org and is_member(p_org) and not i.is_archived
  group by 1 order by 4 desc;
$$;

create or replace function report_supplier_performance(p_org uuid)
returns table (supplier_id uuid, supplier text, orders bigint, received_orders bigint, on_time_orders bigint, spend numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.name,
    count(po.id) filter (where po.status not in ('draft','cancelled')),
    count(po.id) filter (where po.status = 'received'),
    count(po.id) filter (where po.status = 'received' and po.expected_delivery is not null and po.received_at::date <= po.expected_delivery),
    coalesce(sum((select sum(l.quantity_ordered * l.unit_cost) from purchase_order_items l where l.purchase_order_id = po.id))
      filter (where po.status not in ('draft','cancelled','pending_approval')), 0)
  from suppliers s left join purchase_orders po on po.supplier_id = s.id
  where s.organization_id = p_org and is_member(p_org)
  group by s.id, s.name order by 6 desc;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_purchase_order(uuid, uuid, uuid, date, text, boolean, jsonb)', 'set_po_status(uuid, po_status)',
    'receive_purchase_order(uuid, jsonb)', 'generate_alerts(uuid)', 'item_consumption_stats(uuid, integer)',
    'report_consumption(uuid, date, date)', 'report_category_stock(uuid)', 'report_supplier_performance(uuid)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
