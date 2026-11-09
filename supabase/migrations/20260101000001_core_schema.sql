-- Mediverse core schema: multi-tenant, org-owned tables, RLS enabled everywhere.
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type org_type as enum ('hospital','pharmacy','medical_laboratory','clinic','healthcare_network','medical_distributor','other');
create type member_role as enum ('owner','admin','staff');
create type plan_tier as enum ('starter','professional');
create type sub_status as enum ('inactive','pending','active','past_due','cancelled','expired');
create type po_status as enum ('draft','pending_approval','approved','ordered','partially_received','received','cancelled');
create type movement_type as enum ('initial','purchase_receipt','consumption','adjustment_in','adjustment_out','transfer_in','transfer_out','expired_writeoff','import');
create type alert_type as enum ('low_stock','out_of_stock','approaching_expiry','expired','unusual_consumption','reorder_recommendation');
create type import_status as enum ('uploaded','validated','processing','completed','failed');

-- ---------- Generic helpers ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  country text,
  signup_org_name text,
  signup_org_type org_type,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare t text := new.raw_user_meta_data->>'org_type';
begin
  insert into profiles (id, full_name, phone, country, signup_org_name, signup_org_type)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'phone',''),
    nullif(new.raw_user_meta_data->>'country',''),
    nullif(new.raw_user_meta_data->>'org_name',''),
    case when t in ('hospital','pharmacy','medical_laboratory','clinic','healthcare_network','medical_distributor','other') then t::org_type else null end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- Organizations ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  type org_type not null default 'other',
  country text,
  currency text not null default 'USD',
  onboarding_completed boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on organizations for each row execute function set_updated_at();

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on organization_members (user_id);

create table organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'staff' check (role <> 'owner'),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create index on organization_invitations (organization_id);

-- ---------- Membership helpers (used by RLS) ----------
create or replace function is_member(org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where organization_id = org and user_id = auth.uid());
$$;
create or replace function has_role(org uuid, roles member_role[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where organization_id = org and user_id = auth.uid() and role = any(roles));
$$;
create or replace function org_plan(org uuid) returns plan_tier language sql stable security definer set search_path = public as $$
  select plan from subscriptions where organization_id = org and status = 'active' and (current_period_end is null or current_period_end > now()) limit 1;
$$;

-- ---------- Subscriptions & usage ----------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  plan plan_tier,
  status sub_status not null default 'inactive',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();

-- Configurable limits (edit rows to change allowances; nothing hardcoded in app code)
create table plan_limits (
  plan plan_tier primary key,
  monthly_ai_requests integer not null check (monthly_ai_requests >= 0),
  max_locations integer,           -- null = unlimited
  updated_at timestamptz not null default now()
);
insert into plan_limits (plan, monthly_ai_requests, max_locations) values ('starter', 50, 1), ('professional', 500, null);

create table usage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  kind text not null default 'ai_request',
  units integer not null default 1,
  period_start date not null default date_trunc('month', now())::date,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on usage_records (organization_id, period_start, kind);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  organization_id uuid references organizations(id) on delete set null,
  payload jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------- Master data ----------
create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'facility',
  address text,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on locations (organization_id);
create trigger locations_updated before update on locations for each row execute function set_updated_at();

create table inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  contact_name text, email text, phone text, address text, notes text,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on suppliers (organization_id);
create trigger suppliers_updated before update on suppliers for each row execute function set_updated_at();

-- ---------- Inventory ----------
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  sku text,
  description text,
  category_id uuid references inventory_categories(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  unit text not null default 'unit',
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  selling_price numeric(14,4) check (selling_price is null or selling_price >= 0),
  batch_number text,
  expiration_date date,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on inventory_items (organization_id, is_archived);
create index on inventory_items (organization_id, expiration_date);
create unique index inventory_items_sku_unique on inventory_items (organization_id, lower(sku), coalesce(location_id, '00000000-0000-0000-0000-000000000000')) where sku is not null and not is_archived;
create trigger inventory_items_updated before update on inventory_items for each row execute function set_updated_at();

-- Quantity may only change through apply_stock_movement()
create or replace function guard_quantity_change() returns trigger language plpgsql as $$
begin
  if new.quantity is distinct from old.quantity and coalesce(current_setting('app.stock_rpc', true),'') <> 'on' then
    raise exception 'Quantity can only be changed by recording a stock movement';
  end if;
  return new;
end $$;
create trigger inventory_items_guard before update on inventory_items for each row execute function guard_quantity_change();

create table inventory_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  batch_number text not null,
  expiration_date date,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  received_at date default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, batch_number)
);
create index on inventory_batches (organization_id, expiration_date);
create trigger inventory_batches_updated before update on inventory_batches for each row execute function set_updated_at();

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  type movement_type not null,
  quantity_change numeric(14,3) not null check (quantity_change <> 0),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on inventory_movements (organization_id, created_at desc);
create index on inventory_movements (item_id, created_at desc);

-- ---------- Procurement ----------
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  po_number text not null,
  supplier_id uuid references suppliers(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  status po_status not null default 'draft',
  is_request boolean not null default false,
  expected_delivery date,
  ordered_at timestamptz,
  received_at timestamptz,
  notes text,
  approved_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, po_number)
);
create index on purchase_orders (organization_id, status);
create trigger purchase_orders_updated before update on purchase_orders for each row execute function set_updated_at();

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete restrict,
  quantity_ordered numeric(14,3) not null check (quantity_ordered > 0),
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  check (quantity_received <= quantity_ordered)
);
create index on purchase_order_items (purchase_order_id);

-- ---------- Alerts, preferences, forecasts ----------
create table inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  item_id uuid references inventory_items(id) on delete cascade,
  type alert_type not null,
  message text not null,
  severity text not null default 'warning',
  is_read boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on inventory_alerts (organization_id, is_read, created_at desc);
create unique index inventory_alerts_open_unique on inventory_alerts (organization_id, item_id, type) where resolved_at is null;

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  low_stock boolean not null default true,
  out_of_stock boolean not null default true,
  approaching_expiry boolean not null default true,
  expired boolean not null default true,
  unusual_consumption boolean not null default true,
  reorder_recommendation boolean not null default true,
  email_enabled boolean not null default true,
  expiry_warning_days integer not null default 30 check (expiry_warning_days between 1 and 365),
  unusual_consumption_factor numeric(4,2) not null default 2.0 check (unusual_consumption_factor >= 1),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  generated_at timestamptz not null default now(),
  history_days integer not null,
  avg_daily_usage numeric(14,4) not null,
  trend_pct numeric(8,2),
  days_remaining numeric(10,1),
  forecast_30d numeric(14,3),
  recommended_reorder numeric(14,3),
  confidence text not null check (confidence in ('insufficient','low','medium','high'))
);
create index on demand_forecasts (organization_id, item_id, generated_at desc);

-- ---------- AI ----------
create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);
create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  supporting_data jsonb,
  created_at timestamptz not null default now()
);
create index on ai_messages (conversation_id, created_at);

-- ---------- Imports & audit ----------
create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  file_name text not null,
  file_hash text not null,
  status import_status not null default 'uploaded',
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  failed_rows integer not null default 0,
  errors jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index import_jobs_no_dupes on import_jobs (organization_id, file_hash) where status in ('processing','completed');

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on audit_logs (organization_id, created_at desc);
