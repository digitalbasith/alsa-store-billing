-- Nila Supermarket core schema for Supabase Postgres.
-- All exposed tables use RLS. Authorization comes from store_members,
-- never from user-editable auth metadata.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.app_role as enum (
  'super_admin',
  'admin',
  'cashier',
  'inventory_manager',
  'accountant',
  'staff'
);

create type public.sale_status as enum ('held', 'completed', 'voided', 'refunded');
create type public.purchase_status as enum ('draft', 'ordered', 'part_received', 'received', 'cancelled');
create type public.payment_method as enum ('cash', 'upi', 'card', 'bank_transfer', 'credit', 'other');
create type public.stock_movement_type as enum (
  'opening', 'purchase', 'sale', 'sale_return', 'purchase_return',
  'adjustment_in', 'adjustment_out', 'damage', 'expiry', 'transfer_in', 'transfer_out'
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  gstin text,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  currency text not null default 'INR' check (char_length(currency) = 3),
  timezone text not null default 'Asia/Kolkata',
  invoice_prefix text not null default 'NS',
  purchase_prefix text not null default 'PO',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'staff',
  display_name text,
  phone text,
  employee_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id),
  unique (store_id, employee_code)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name_en text not null,
  name_ta text,
  parent_id uuid references public.categories(id) on delete set null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name_en)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  sku text not null,
  name_en text not null,
  name_ta text,
  description text,
  hsn_code text,
  unit text not null default 'unit',
  unit_size numeric(14,3) not null default 1 check (unit_size > 0),
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  mrp numeric(14,2) not null default 0 check (mrp >= 0),
  gst_rate numeric(5,2) not null default 0 check (gst_rate between 0 and 100),
  current_stock numeric(14,3) not null default 0,
  minimum_stock numeric(14,3) not null default 0,
  maximum_stock numeric(14,3),
  track_inventory boolean not null default true,
  allow_negative_stock boolean not null default false,
  batch_tracking boolean not null default false,
  expiry_tracking boolean not null default false,
  active boolean not null default true,
  image_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku),
  check (mrp = 0 or selling_price <= mrp)
);

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, barcode)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  gstin text,
  address jsonb not null default '{}'::jsonb,
  opening_balance numeric(14,2) not null default 0,
  credit_days integer not null default 0 check (credit_days >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  gstin text,
  address jsonb not null default '{}'::jsonb,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  outstanding_balance numeric(14,2) not null default 0,
  loyalty_points integer not null default 0,
  lifetime_value numeric(14,2) not null default 0,
  visit_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (store_id, phone)
);

create table public.document_counters (
  store_id uuid not null references public.stores(id) on delete cascade,
  document_type text not null check (document_type in ('sale', 'purchase', 'return')),
  fiscal_year text not null,
  next_number bigint not null default 1 check (next_number > 0),
  primary key (store_id, document_type, fiscal_year)
);

create table public.register_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  register_name text not null default 'Counter 1',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(14,2) not null default 0,
  expected_cash numeric(14,2),
  closing_cash numeric(14,2),
  difference numeric(14,2),
  notes text,
  check (closed_at is null or closed_at >= opened_at)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_no text not null,
  register_session_id uuid references public.register_sessions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid not null references auth.users(id),
  status public.sale_status not null default 'completed',
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  round_off numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  item_count integer not null default 0,
  notes text,
  held_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, invoice_no)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  hsn_code text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  mrp numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  taxable_amount numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(14,2) not null check (amount > 0),
  reference_no text,
  received_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_no text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_invoice_no text,
  status public.purchase_status not null default 'draft',
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  created_by uuid not null references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, purchase_no)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_no text,
  expiry_date date,
  quantity numeric(14,3) not null check (quantity > 0),
  free_quantity numeric(14,3) not null default 0 check (free_quantity >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  discount_amount numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  received_quantity numeric(14,3) not null default 0,
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id),
  movement_type public.stock_movement_type not null,
  quantity numeric(14,3) not null check (quantity <> 0),
  balance_after numeric(14,3) not null,
  unit_cost numeric(14,2),
  reference_type text,
  reference_id uuid,
  batch_no text,
  expiry_date date,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  return_no text not null,
  sale_id uuid not null references public.sales(id),
  customer_id uuid references public.customers(id) on delete set null,
  total_amount numeric(14,2) not null default 0,
  refund_method public.payment_method,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (store_id, return_no)
);

create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id),
  product_id uuid references public.products(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount >= 0),
  restock boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  expense_date date not null default current_date,
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount > 0),
  payment_method public.payment_method not null default 'cash',
  reference_no text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  points integer not null check (points <> 0),
  reason text,
  created_at timestamptz not null default now()
);

create table public.store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'ta')),
  tax_inclusive boolean not null default true,
  low_stock_alerts boolean not null default true,
  expiry_alert_days integer not null default 30 check (expiry_alert_days >= 0),
  loyalty_enabled boolean not null default true,
  loyalty_points_per_100 numeric(8,2) not null default 1,
  receipt_footer_en text,
  receipt_footer_ta text,
  invoice_template jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index products_store_name_idx on public.products (store_id, name_en);
create index products_store_stock_idx on public.products (store_id, current_stock) where active;
create index product_barcodes_lookup_idx on public.product_barcodes (store_id, barcode);
create index customers_store_name_idx on public.customers (store_id, name);
create index customers_store_phone_idx on public.customers (store_id, phone);
create index suppliers_store_name_idx on public.suppliers (store_id, name);
create index sales_store_created_idx on public.sales (store_id, created_at desc);
create index sales_store_status_idx on public.sales (store_id, status, created_at desc);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index payments_sale_idx on public.payments (sale_id);
create index purchases_store_date_idx on public.purchases (store_id, invoice_date desc);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index stock_movements_product_idx on public.stock_movements (store_id, product_id, created_at desc);
create index expenses_store_date_idx on public.expenses (store_id, expense_date desc);
create index audit_logs_store_created_idx on public.audit_logs (store_id, created_at desc);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_updated_at before update on public.stores for each row execute function private.set_updated_at();
create trigger store_members_updated_at before update on public.store_members for each row execute function private.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function private.set_updated_at();
create trigger brands_updated_at before update on public.brands for each row execute function private.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function private.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function private.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function private.set_updated_at();
create trigger sales_updated_at before update on public.sales for each row execute function private.set_updated_at();
create trigger purchases_updated_at before update on public.purchases for each row execute function private.set_updated_at();

create function private.has_store_role(
  requested_store_id uuid,
  allowed_roles public.app_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.store_members member
      where member.store_id = requested_store_id
        and member.user_id = (select auth.uid())
        and member.active
        and (allowed_roles is null or member.role = any(allowed_roles))
    );
$$;

revoke all on function private.has_store_role(uuid, public.app_role[]) from public, anon;
grant execute on function private.has_store_role(uuid, public.app_role[]) to authenticated;

create function private.guard_store_member_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_store_id uuid := coalesce(new.store_id, old.store_id);
  bootstrap_owner boolean := false;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;

  if tg_op = 'UPDATE' and (new.store_id <> old.store_id or new.user_id <> old.user_id) then
    raise exception 'Store membership identity cannot be changed';
  end if;

  if tg_op = 'INSERT' then
    bootstrap_owner := new.user_id = caller_id
      and new.role = 'super_admin'
      and exists (
        select 1 from public.stores
        where id = new.store_id and created_by = caller_id
      )
      and not exists (
        select 1 from public.store_members where store_id = new.store_id
      );
  end if;

  if (
    (tg_op <> 'DELETE' and new.role = 'super_admin')
    or (tg_op <> 'INSERT' and old.role = 'super_admin')
  ) and not bootstrap_owner
    and not private.has_store_role(target_store_id, array['super_admin']::public.app_role[])
  then
    raise exception 'Only a super admin can manage super admin membership';
  end if;

  if tg_op = 'DELETE'
    and old.role = 'super_admin'
    and not exists (
      select 1 from public.store_members
      where store_id = old.store_id and role = 'super_admin' and active and user_id <> old.user_id
    )
  then
    raise exception 'A store must keep at least one active super admin';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_store_member_roles() from public, anon;
create trigger guard_store_member_roles
before insert or update or delete on public.store_members
for each row execute function private.guard_store_member_roles();

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.document_counters enable row level security;
alter table public.register_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;
alter table public.expenses enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.store_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy stores_read on public.stores for select to authenticated
using (private.has_store_role(id));
create policy stores_update on public.stores for update to authenticated
using (private.has_store_role(id, array['super_admin','admin']::public.app_role[]))
with check (private.has_store_role(id, array['super_admin','admin']::public.app_role[]));

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'store_members','categories','brands','products','product_barcodes','suppliers',
    'customers','register_sessions','sales','sale_items','payments','purchases',
    'purchase_items','stock_movements','sale_returns','sale_return_items','expenses',
    'loyalty_transactions','store_settings'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_store_role(store_id))',
      table_name || '_read', table_name
    );
  end loop;
end;
$policies$;

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'categories','brands','products','product_barcodes','suppliers','customers','store_settings'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_store_role(store_id, array[''super_admin'',''admin'',''inventory_manager'']::public.app_role[]))',
      table_name || '_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_store_role(store_id, array[''super_admin'',''admin'',''inventory_manager'']::public.app_role[])) with check (private.has_store_role(store_id, array[''super_admin'',''admin'',''inventory_manager'']::public.app_role[]))',
      table_name || '_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_store_role(store_id, array[''super_admin'',''admin'']::public.app_role[]))',
      table_name || '_delete', table_name
    );
  end loop;
end;
$policies$;

create policy store_members_insert on public.store_members for insert to authenticated
with check (private.has_store_role(store_id, array['super_admin','admin']::public.app_role[]));
create policy store_members_update on public.store_members for update to authenticated
using (private.has_store_role(store_id, array['super_admin','admin']::public.app_role[]))
with check (private.has_store_role(store_id, array['super_admin','admin']::public.app_role[]));
create policy store_members_delete on public.store_members for delete to authenticated
using (private.has_store_role(store_id, array['super_admin']::public.app_role[]));

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'register_sessions','sales','sale_items','payments','sale_returns',
    'sale_return_items','loyalty_transactions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_store_role(store_id, array[''super_admin'',''admin'',''cashier'',''staff'']::public.app_role[]))',
      table_name || '_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_store_role(store_id, array[''super_admin'',''admin'',''cashier'']::public.app_role[])) with check (private.has_store_role(store_id, array[''super_admin'',''admin'',''cashier'']::public.app_role[]))',
      table_name || '_update', table_name
    );
  end loop;
end;
$policies$;

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array['purchases','purchase_items','stock_movements','expenses']
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_store_role(store_id, array[''super_admin'',''admin'',''inventory_manager'',''accountant'']::public.app_role[]))',
      table_name || '_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_store_role(store_id, array[''super_admin'',''admin'',''inventory_manager'',''accountant'']::public.app_role[])) with check (private.has_store_role(store_id, array[''super_admin'',''admin'',''inventory_manager'',''accountant'']::public.app_role[]))',
      table_name || '_update', table_name
    );
  end loop;
end;
$policies$;

create policy audit_logs_read on public.audit_logs for select to authenticated
using (private.has_store_role(store_id, array['super_admin','admin','accountant']::public.app_role[]));

create function public.create_store(
  store_name text,
  store_gstin text default null,
  store_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_store_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(store_name), '') is null then
    raise exception 'Store name is required';
  end if;

  insert into public.stores (name, gstin, phone, created_by)
  values (trim(store_name), nullif(trim(store_gstin), ''), nullif(trim(store_phone), ''), current_user_id)
  returning id into new_store_id;

  insert into public.store_members (store_id, user_id, role, display_name)
  values (new_store_id, current_user_id, 'super_admin', coalesce((select raw_user_meta_data ->> 'full_name' from auth.users where id = current_user_id), 'Owner'));

  insert into public.store_settings (store_id, language, receipt_footer_en, receipt_footer_ta)
  values (new_store_id, 'en', 'Thank you. Visit again!', 'நன்றி. மீண்டும் வருக!');

  return new_store_id;
end;
$$;

revoke all on function public.create_store(text, text, text) from public, anon;
grant execute on function public.create_store(text, text, text) to authenticated;

create function public.complete_sale(
  p_store_id uuid,
  p_customer_id uuid,
  p_register_session_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  fiscal_year text := to_char(current_date, 'YYYY');
  counter_value bigint;
  v_invoice_prefix text;
  generated_invoice text;
  new_sale_id uuid;
  item jsonb;
  payment jsonb;
  product_row public.products%rowtype;
  item_quantity numeric(14,3);
  item_discount numeric(14,2);
  line_before_discount numeric(14,2);
  line_total_value numeric(14,2);
  line_tax numeric(14,2);
  subtotal_value numeric(14,2) := 0;
  tax_value numeric(14,2) := 0;
  grand_total_value numeric(14,2) := 0;
  paid_value numeric(14,2) := 0;
  total_quantity numeric(14,3) := 0;
begin
  if current_user_id is null or not private.has_store_role(
    p_store_id,
    array['super_admin','admin','cashier','staff']::public.app_role[]
  ) then
    raise exception 'Not authorized for this store';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;

  select stores.invoice_prefix into v_invoice_prefix from public.stores where id = p_store_id and active;
  if v_invoice_prefix is null then raise exception 'Store is inactive or missing'; end if;

  insert into public.document_counters (store_id, document_type, fiscal_year, next_number)
  values (p_store_id, 'sale', fiscal_year, 2)
  on conflict (store_id, document_type, fiscal_year)
  do update set next_number = public.document_counters.next_number + 1
  returning next_number - 1 into counter_value;

  generated_invoice := v_invoice_prefix || '-' || fiscal_year || '-' || lpad(counter_value::text, 6, '0');

  insert into public.sales (
    store_id, invoice_no, register_session_id, customer_id, cashier_id,
    status, notes, completed_at
  ) values (
    p_store_id, generated_invoice, p_register_session_id, p_customer_id,
    current_user_id, 'completed', p_notes, now()
  ) returning id into new_sale_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity := coalesce((item ->> 'quantity')::numeric, 0);
    item_discount := greatest(coalesce((item ->> 'discount_amount')::numeric, 0), 0);
    if item_quantity <= 0 then raise exception 'Sale quantity must be positive'; end if;

    select * into product_row
    from public.products
    where id = (item ->> 'product_id')::uuid
      and store_id = p_store_id
      and active
    for update;

    if not found then raise exception 'Product not found or inactive'; end if;
    if product_row.track_inventory and not product_row.allow_negative_stock and product_row.current_stock < item_quantity then
      raise exception 'Insufficient stock for %', product_row.name_en;
    end if;

    line_before_discount := round(product_row.selling_price * item_quantity, 2);
    if item_discount > line_before_discount then raise exception 'Discount exceeds line value'; end if;
    line_total_value := round(line_before_discount - item_discount, 2);
    line_tax := case when product_row.gst_rate > 0
      then round(line_total_value - (line_total_value / (1 + product_row.gst_rate / 100)), 2)
      else 0 end;

    insert into public.sale_items (
      store_id, sale_id, product_id, product_name, sku, hsn_code, quantity,
      unit_price, mrp, discount_amount, taxable_amount, gst_rate, tax_amount, line_total
    ) values (
      p_store_id, new_sale_id, product_row.id, product_row.name_en, product_row.sku,
      product_row.hsn_code, item_quantity, product_row.selling_price, product_row.mrp,
      item_discount, line_total_value - line_tax, product_row.gst_rate, line_tax, line_total_value
    );

    if product_row.track_inventory then
      update public.products
      set current_stock = current_stock - item_quantity
      where id = product_row.id;

      insert into public.stock_movements (
        store_id, product_id, movement_type, quantity, balance_after,
        unit_cost, reference_type, reference_id, created_by
      ) values (
        p_store_id, product_row.id, 'sale', -item_quantity,
        product_row.current_stock - item_quantity, product_row.purchase_price,
        'sale', new_sale_id, current_user_id
      );
    end if;

    subtotal_value := subtotal_value + line_before_discount;
    tax_value := tax_value + line_tax;
    grand_total_value := grand_total_value + line_total_value;
    total_quantity := total_quantity + item_quantity;
  end loop;

  grand_total_value := greatest(round(grand_total_value - greatest(p_discount, 0), 2), 0);

  if jsonb_typeof(p_payments) = 'array' then
    for payment in select value from jsonb_array_elements(p_payments)
    loop
      if coalesce((payment ->> 'amount')::numeric, 0) <= 0 then
        raise exception 'Payment amount must be positive';
      end if;
      paid_value := paid_value + round((payment ->> 'amount')::numeric, 2);
      insert into public.payments (store_id, sale_id, method, amount, reference_no, received_by)
      values (
        p_store_id, new_sale_id, (payment ->> 'method')::public.payment_method,
        round((payment ->> 'amount')::numeric, 2), nullif(payment ->> 'reference_no', ''), current_user_id
      );
    end loop;
  end if;

  if paid_value > grand_total_value + 0.01 then
    raise exception 'Payment exceeds bill total';
  end if;

  update public.sales
  set subtotal = subtotal_value,
      discount_total = (subtotal_value - grand_total_value),
      tax_total = tax_value,
      grand_total = grand_total_value,
      paid_total = paid_value,
      balance_due = grand_total_value - paid_value,
      item_count = ceil(total_quantity)::integer
  where id = new_sale_id;

  if p_customer_id is not null then
    update public.customers
    set lifetime_value = lifetime_value + grand_total_value,
        outstanding_balance = outstanding_balance + (grand_total_value - paid_value),
        visit_count = visit_count + 1
    where id = p_customer_id and store_id = p_store_id;
  end if;

  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, current_user_id, 'complete', 'sale', new_sale_id,
    jsonb_build_object('invoice_no', generated_invoice, 'grand_total', grand_total_value));

  return jsonb_build_object(
    'sale_id', new_sale_id,
    'invoice_no', generated_invoice,
    'grand_total', grand_total_value,
    'paid_total', paid_value,
    'balance_due', grand_total_value - paid_value
  );
end;
$$;

revoke all on function public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, text) from public, anon;
grant execute on function public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, text) to authenticated;

create view public.daily_sales_summary
with (security_invoker = true)
as
select
  store_id,
  (created_at at time zone 'Asia/Kolkata')::date as sale_date,
  count(*) filter (where status = 'completed') as bill_count,
  coalesce(sum(grand_total) filter (where status = 'completed'), 0) as net_sales,
  coalesce(sum(tax_total) filter (where status = 'completed'), 0) as tax_total,
  coalesce(sum(discount_total) filter (where status = 'completed'), 0) as discount_total
from public.sales
group by store_id, (created_at at time zone 'Asia/Kolkata')::date;

grant usage on schema public to authenticated;
grant select, update on public.stores to authenticated;
grant select on public.store_members, public.categories, public.brands,
  public.products, public.product_barcodes, public.suppliers, public.customers,
  public.register_sessions, public.sales, public.sale_items, public.payments,
  public.purchases, public.purchase_items, public.stock_movements,
  public.sale_returns, public.sale_return_items, public.expenses,
  public.loyalty_transactions, public.store_settings, public.daily_sales_summary
to authenticated;

grant insert, update, delete on public.store_members, public.categories, public.brands,
  public.products, public.product_barcodes, public.suppliers, public.customers,
  public.register_sessions, public.purchases, public.purchase_items,
  public.sale_returns, public.sale_return_items, public.expenses, public.store_settings
to authenticated;

grant select on public.audit_logs to authenticated;

revoke all on public.document_counters from anon, authenticated;
revoke all on public.audit_logs from anon;
revoke all on all tables in schema public from anon;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
