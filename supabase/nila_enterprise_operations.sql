-- Nila Supermarket enterprise operations.
-- Audited returns, accounts, stock controls, quotations, delivery and day-end.

alter table public.document_counters
  drop constraint if exists document_counters_document_type_check;

alter table public.document_counters
  add constraint document_counters_document_type_check
  check (document_type in (
    'sale', 'purchase', 'return', 'purchase_return', 'account',
    'quotation', 'delivery', 'transfer', 'day_end'
  ));

alter table public.store_settings
  add column if not exists operating_date date;

create table public.account_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  account_no text not null,
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('receipt', 'payment', 'credit_note', 'debit_note', 'refund')),
  party_type text not null default 'other' check (party_type in ('customer', 'supplier', 'other')),
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method public.payment_method not null default 'cash',
  reference_no text,
  description text,
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, account_no),
  check (
    (party_type = 'customer' and customer_id is not null and supplier_id is null)
    or (party_type = 'supplier' and supplier_id is not null and customer_id is null)
    or (party_type = 'other' and customer_id is null and supplier_id is null)
  )
);

create table public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  return_no text not null,
  purchase_id uuid not null references public.purchases(id),
  supplier_id uuid references public.suppliers(id) on delete set null,
  total_amount numeric(14,2) not null default 0,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (store_id, return_no)
);

create table public.purchase_return_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  return_id uuid not null references public.purchase_returns(id) on delete cascade,
  purchase_item_id uuid not null references public.purchase_items(id),
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table public.business_documents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  document_no text not null,
  document_type text not null check (document_type in (
    'quotation', 'home_delivery', 'day_end', 'internal_transfer',
    'bill_verification', 'sales_modification', 'purchase_modification',
    'barcode_batch', 'physical_inventory', 'stock_advice'
  )),
  document_date date not null default current_date,
  source_type text,
  source_id uuid,
  status text not null default 'active' check (status in (
    'draft', 'active', 'scheduled', 'completed', 'verified', 'cancelled', 'expired'
  )),
  amount numeric(14,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, document_no)
);

create index account_entries_store_date_idx on public.account_entries (store_id, entry_date desc, status);
create index account_entries_customer_idx on public.account_entries (customer_id) where customer_id is not null;
create index account_entries_supplier_idx on public.account_entries (supplier_id) where supplier_id is not null;
create index purchase_returns_store_date_idx on public.purchase_returns (store_id, created_at desc);
create index purchase_returns_purchase_idx on public.purchase_returns (purchase_id);
create index purchase_return_items_return_idx on public.purchase_return_items (return_id);
create index purchase_return_items_purchase_item_idx on public.purchase_return_items (purchase_item_id);
create index business_documents_store_type_date_idx on public.business_documents (store_id, document_type, document_date desc);
create index business_documents_source_idx on public.business_documents (store_id, source_type, source_id) where source_id is not null;
create index sale_return_items_sale_item_idx on public.sale_return_items (sale_item_id);
create unique index business_documents_day_end_unique
  on public.business_documents (store_id, document_date)
  where document_type = 'day_end' and status <> 'cancelled';
create unique index business_documents_delivery_unique
  on public.business_documents (store_id, source_id)
  where document_type = 'home_delivery' and status <> 'cancelled';

alter table public.account_entries enable row level security;
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_items enable row level security;
alter table public.business_documents enable row level security;

create policy account_entries_read on public.account_entries for select to authenticated
using ((select private.has_store_role(store_id)));
create policy purchase_returns_read on public.purchase_returns for select to authenticated
using ((select private.has_store_role(store_id)));
create policy purchase_return_items_read on public.purchase_return_items for select to authenticated
using ((select private.has_store_role(store_id)));
create policy business_documents_read on public.business_documents for select to authenticated
using ((select private.has_store_role(store_id)));

create or replace function private.next_nila_document(
  p_store_id uuid,
  p_document_type text,
  p_prefix text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fiscal_year text := to_char(current_date, 'YYYY');
  counter_value bigint;
begin
  insert into public.document_counters (store_id, document_type, fiscal_year, next_number)
  values (p_store_id, p_document_type, v_fiscal_year, 2)
  on conflict (store_id, document_type, fiscal_year)
  do update set next_number = public.document_counters.next_number + 1
  returning next_number - 1 into counter_value;
  return upper(p_prefix) || '-' || v_fiscal_year || '-' || lpad(counter_value::text, 6, '0');
end;
$$;

revoke all on function private.next_nila_document(uuid, text, text) from public, anon, authenticated;

create or replace function public.process_sale_return(
  p_store_id uuid,
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method text default 'cash',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  sale_row public.sales%rowtype;
  sale_item_row public.sale_items%rowtype;
  product_row public.products%rowtype;
  item jsonb;
  qty numeric(14,3);
  returned_qty numeric(14,3);
  line_refund numeric(14,2);
  refund_total numeric(14,2) := 0;
  new_return_id uuid;
  return_no text;
  account_no text;
  prefix text;
  fully_returned boolean;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin','cashier']::public.app_role[]
  ) then raise exception 'Not authorized for sales returns'; end if;
  if p_refund_method not in ('cash','upi','card','bank_transfer','credit','other') then
    raise exception 'Invalid refund method';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one return item';
  end if;

  select * into sale_row from public.sales
  where id = p_sale_id and store_id = p_store_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if sale_row.status <> 'completed' then raise exception 'Only completed bills can be returned'; end if;

  select invoice_prefix into prefix from public.stores where id = p_store_id and active;
  return_no := private.next_nila_document(p_store_id, 'return', coalesce(prefix, 'NS') || 'R');
  insert into public.sale_returns (
    store_id, return_no, sale_id, customer_id, refund_method, reason, created_by
  ) values (
    p_store_id, return_no, p_sale_id, sale_row.customer_id,
    p_refund_method::public.payment_method, nullif(trim(p_reason), ''), caller_id
  ) returning id into new_return_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    qty := coalesce((item ->> 'quantity')::numeric, 0);
    if qty <= 0 then raise exception 'Return quantity must be positive'; end if;
    select * into sale_item_row from public.sale_items
    where id = (item ->> 'sale_item_id')::uuid
      and sale_id = p_sale_id and store_id = p_store_id for update;
    if not found then raise exception 'Sale item not found'; end if;
    select coalesce(sum(quantity), 0) into returned_qty
    from public.sale_return_items where sale_item_id = sale_item_row.id;
    if returned_qty + qty > sale_item_row.quantity then
      raise exception 'Return quantity exceeds sold quantity for %', sale_item_row.product_name;
    end if;

    line_refund := round((sale_item_row.line_total / sale_item_row.quantity) * qty, 2);
    insert into public.sale_return_items (
      store_id, return_id, sale_item_id, product_id, quantity, amount, restock
    ) values (
      p_store_id, new_return_id, sale_item_row.id, sale_item_row.product_id,
      qty, line_refund, coalesce((item ->> 'restock')::boolean, true)
    );
    if sale_item_row.product_id is not null and coalesce((item ->> 'restock')::boolean, true) then
      select * into product_row from public.products
      where id = sale_item_row.product_id and store_id = p_store_id for update;
      if found and product_row.track_inventory then
        update public.products set current_stock = current_stock + qty where id = product_row.id;
        insert into public.stock_movements (
          store_id, product_id, movement_type, quantity, balance_after,
          unit_cost, reference_type, reference_id, reason, created_by
        ) values (
          p_store_id, product_row.id, 'sale_return', qty,
          product_row.current_stock + qty, product_row.purchase_price,
          'sale_return', new_return_id, nullif(trim(p_reason), ''), caller_id
        );
      end if;
    end if;
    refund_total := refund_total + line_refund;
  end loop;

  update public.sale_returns set total_amount = refund_total where id = new_return_id;
  select not exists (
    select 1 from public.sale_items si
    where si.sale_id = p_sale_id
      and coalesce((select sum(sri.quantity) from public.sale_return_items sri where sri.sale_item_id = si.id), 0) < si.quantity
  ) into fully_returned;
  if fully_returned then update public.sales set status = 'refunded' where id = p_sale_id; end if;

  account_no := private.next_nila_document(p_store_id, 'account', 'AC');
  insert into public.account_entries (
    store_id, account_no, entry_type, party_type, customer_id, amount,
    payment_method, reference_no, description, created_by
  ) values (
    p_store_id, account_no, 'refund',
    case when sale_row.customer_id is null then 'other' else 'customer' end,
    sale_row.customer_id, refund_total, p_refund_method::public.payment_method,
    return_no, coalesce(nullif(trim(p_reason), ''), 'Sales return refund'), caller_id
  );
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, caller_id, 'return', 'sale', p_sale_id,
    jsonb_build_object('return_id', new_return_id, 'return_no', return_no, 'amount', refund_total));
  return jsonb_build_object(
    'return_id', new_return_id, 'return_no', return_no, 'total_amount', refund_total,
    'sale_status', case when fully_returned then 'refunded' else 'completed' end
  );
end;
$$;

create or replace function public.cancel_sale(
  p_store_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  sale_row public.sales%rowtype;
  item_row public.sale_items%rowtype;
  product_row public.products%rowtype;
  account_no text;
  refund_method public.payment_method := 'cash';
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin']::public.app_role[]
  ) then raise exception 'Administrator access is required'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Cancellation reason is required'; end if;
  select * into sale_row from public.sales where id = p_sale_id and store_id = p_store_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if sale_row.status <> 'completed' then raise exception 'Only completed bills can be cancelled'; end if;
  if exists (select 1 from public.sale_returns where sale_id = p_sale_id) then
    raise exception 'A bill with returns cannot be cancelled';
  end if;

  for item_row in select * from public.sale_items where sale_id = p_sale_id order by product_id
  loop
    if item_row.product_id is not null then
      select * into product_row from public.products
      where id = item_row.product_id and store_id = p_store_id for update;
      if found and product_row.track_inventory then
        update public.products set current_stock = current_stock + item_row.quantity where id = product_row.id;
        insert into public.stock_movements (
          store_id, product_id, movement_type, quantity, balance_after,
          unit_cost, reference_type, reference_id, reason, created_by
        ) values (
          p_store_id, product_row.id, 'sale_return', item_row.quantity,
          product_row.current_stock + item_row.quantity, product_row.purchase_price,
          'sale_cancellation', p_sale_id, trim(p_reason), caller_id
        );
      end if;
    end if;
  end loop;
  update public.sales set status = 'voided', notes = concat_ws(E'\n', notes, 'Cancelled: ' || trim(p_reason))
  where id = p_sale_id;
  if sale_row.customer_id is not null then
    update public.customers
    set lifetime_value = greatest(lifetime_value - sale_row.grand_total, 0),
        outstanding_balance = greatest(outstanding_balance - sale_row.balance_due, 0),
        visit_count = greatest(visit_count - 1, 0)
    where id = sale_row.customer_id and store_id = p_store_id;
  end if;
  if sale_row.paid_total > 0 then
    select coalesce((select method from public.payments where sale_id = p_sale_id order by created_at limit 1), 'cash'::public.payment_method)
    into refund_method;
    account_no := private.next_nila_document(p_store_id, 'account', 'AC');
    insert into public.account_entries (
      store_id, account_no, entry_type, party_type, customer_id, amount,
      payment_method, reference_no, description, created_by
    ) values (
      p_store_id, account_no, 'refund',
      case when sale_row.customer_id is null then 'other' else 'customer' end,
      sale_row.customer_id, sale_row.paid_total, refund_method,
      sale_row.invoice_no, 'Cancelled bill refund: ' || trim(p_reason), caller_id
    );
  end if;
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_store_id, caller_id, 'cancel', 'sale', p_sale_id,
    jsonb_build_object('status', sale_row.status), jsonb_build_object('status', 'voided', 'reason', trim(p_reason)));
  return jsonb_build_object('sale_id', p_sale_id, 'invoice_no', sale_row.invoice_no, 'status', 'voided');
end;
$$;

create or replace function public.process_purchase_return(
  p_store_id uuid,
  p_purchase_id uuid,
  p_items jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  purchase_row public.purchases%rowtype;
  item_row public.purchase_items%rowtype;
  product_row public.products%rowtype;
  item jsonb;
  qty numeric(14,3);
  returned_qty numeric(14,3);
  line_amount numeric(14,2);
  return_total numeric(14,2) := 0;
  new_return_id uuid;
  return_no text;
  account_no text;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin','inventory_manager','accountant']::public.app_role[]
  ) then raise exception 'Not authorized for purchase returns'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one purchase return item';
  end if;
  select * into purchase_row from public.purchases
  where id = p_purchase_id and store_id = p_store_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if purchase_row.status not in ('received','part_received') then
    raise exception 'Only received purchases can be returned';
  end if;

  return_no := private.next_nila_document(p_store_id, 'purchase_return', 'PR');
  insert into public.purchase_returns (store_id, return_no, purchase_id, supplier_id, reason, created_by)
  values (p_store_id, return_no, p_purchase_id, purchase_row.supplier_id, nullif(trim(p_reason), ''), caller_id)
  returning id into new_return_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    qty := coalesce((item ->> 'quantity')::numeric, 0);
    if qty <= 0 then raise exception 'Return quantity must be positive'; end if;
    select * into item_row from public.purchase_items
    where id = (item ->> 'purchase_item_id')::uuid
      and purchase_id = p_purchase_id and store_id = p_store_id for update;
    if not found then raise exception 'Purchase item not found'; end if;
    select coalesce(sum(quantity), 0) into returned_qty
    from public.purchase_return_items where purchase_item_id = item_row.id;
    if returned_qty + qty > item_row.received_quantity then
      raise exception 'Return quantity exceeds received quantity';
    end if;
    select * into product_row from public.products
    where id = item_row.product_id and store_id = p_store_id for update;
    if not found then raise exception 'Product not found'; end if;
    if product_row.current_stock < qty and not product_row.allow_negative_stock then
      raise exception 'Insufficient stock to return %', product_row.name_en;
    end if;
    line_amount := round((item_row.line_total / greatest(item_row.quantity, 0.001)) * qty, 2);
    insert into public.purchase_return_items (
      store_id, return_id, purchase_item_id, product_id, quantity, amount
    ) values (p_store_id, new_return_id, item_row.id, product_row.id, qty, line_amount);
    update public.products set current_stock = current_stock - qty where id = product_row.id;
    insert into public.stock_movements (
      store_id, product_id, movement_type, quantity, balance_after,
      unit_cost, reference_type, reference_id, reason, created_by
    ) values (
      p_store_id, product_row.id, 'purchase_return', -qty,
      product_row.current_stock - qty, item_row.unit_cost,
      'purchase_return', new_return_id, nullif(trim(p_reason), ''), caller_id
    );
    return_total := return_total + line_amount;
  end loop;
  update public.purchase_returns set total_amount = return_total where id = new_return_id;
  account_no := private.next_nila_document(p_store_id, 'account', 'AC');
  insert into public.account_entries (
    store_id, account_no, entry_type, party_type, supplier_id, amount,
    payment_method, reference_no, description, created_by
  ) values (
    p_store_id, account_no, 'debit_note',
    case when purchase_row.supplier_id is null then 'other' else 'supplier' end,
    purchase_row.supplier_id, return_total, 'credit', return_no,
    coalesce(nullif(trim(p_reason), ''), 'Purchase return'), caller_id
  );
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, caller_id, 'return', 'purchase', p_purchase_id,
    jsonb_build_object('return_id', new_return_id, 'return_no', return_no, 'amount', return_total));
  return jsonb_build_object('return_id', new_return_id, 'return_no', return_no, 'total_amount', return_total);
end;
$$;

create or replace function public.cancel_purchase(
  p_store_id uuid,
  p_purchase_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  purchase_row public.purchases%rowtype;
  item_row public.purchase_items%rowtype;
  product_row public.products%rowtype;
  account_no text;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin']::public.app_role[]
  ) then raise exception 'Administrator access is required'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Cancellation reason is required'; end if;
  select * into purchase_row from public.purchases
  where id = p_purchase_id and store_id = p_store_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if purchase_row.status = 'cancelled' then raise exception 'Purchase is already cancelled'; end if;
  if exists (select 1 from public.purchase_returns where purchase_id = p_purchase_id) then
    raise exception 'A purchase with returns cannot be cancelled';
  end if;
  if purchase_row.status in ('received','part_received') then
    for item_row in select * from public.purchase_items where purchase_id = p_purchase_id order by product_id
    loop
      select * into product_row from public.products
      where id = item_row.product_id and store_id = p_store_id for update;
      if product_row.current_stock < item_row.received_quantity and not product_row.allow_negative_stock then
        raise exception 'Insufficient stock to cancel purchase for %', product_row.name_en;
      end if;
      update public.products set current_stock = current_stock - item_row.received_quantity where id = product_row.id;
      insert into public.stock_movements (
        store_id, product_id, movement_type, quantity, balance_after,
        unit_cost, reference_type, reference_id, reason, created_by
      ) values (
        p_store_id, product_row.id, 'purchase_return', -item_row.received_quantity,
        product_row.current_stock - item_row.received_quantity, item_row.unit_cost,
        'purchase_cancellation', p_purchase_id, trim(p_reason), caller_id
      );
    end loop;
  end if;
  update public.purchases set status = 'cancelled', notes = concat_ws(E'\n', notes, 'Cancelled: ' || trim(p_reason))
  where id = p_purchase_id;
  if purchase_row.paid_total > 0 then
    account_no := private.next_nila_document(p_store_id, 'account', 'AC');
    insert into public.account_entries (
      store_id, account_no, entry_type, party_type, supplier_id, amount,
      payment_method, reference_no, description, created_by
    ) values (
      p_store_id, account_no, 'debit_note',
      case when purchase_row.supplier_id is null then 'other' else 'supplier' end,
      purchase_row.supplier_id, purchase_row.paid_total, 'credit', purchase_row.purchase_no,
      'Cancelled purchase recovery: ' || trim(p_reason), caller_id
    );
  end if;
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_store_id, caller_id, 'cancel', 'purchase', p_purchase_id,
    jsonb_build_object('status', purchase_row.status), jsonb_build_object('status', 'cancelled', 'reason', trim(p_reason)));
  return jsonb_build_object('purchase_id', p_purchase_id, 'purchase_no', purchase_row.purchase_no, 'status', 'cancelled');
end;
$$;

create or replace function public.post_account_entry(
  p_store_id uuid,
  p_entry_type text,
  p_party_type text,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_method text default 'cash',
  p_reference_no text default null,
  p_description text default null,
  p_entry_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  account_no text;
  entry_id uuid;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin','accountant','cashier']::public.app_role[]
  ) then raise exception 'Not authorized for accounts'; end if;
  if p_entry_type not in ('receipt','payment','credit_note','debit_note','refund') then
    raise exception 'Invalid account entry type';
  end if;
  if p_party_type not in ('customer','supplier','other') then raise exception 'Invalid party type'; end if;
  if p_payment_method not in ('cash','upi','card','bank_transfer','credit','other') then
    raise exception 'Invalid payment method';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Amount must be positive'; end if;
  if p_party_type = 'customer' and not exists (
    select 1 from public.customers where id = p_customer_id and store_id = p_store_id and active
  ) then raise exception 'Customer not found'; end if;
  if p_party_type = 'supplier' and not exists (
    select 1 from public.suppliers where id = p_supplier_id and store_id = p_store_id and active
  ) then raise exception 'Supplier not found'; end if;

  account_no := private.next_nila_document(p_store_id, 'account', 'AC');
  insert into public.account_entries (
    store_id, account_no, entry_date, entry_type, party_type, customer_id,
    supplier_id, amount, payment_method, reference_no, description, created_by
  ) values (
    p_store_id, account_no, coalesce(p_entry_date, current_date), p_entry_type, p_party_type,
    case when p_party_type = 'customer' then p_customer_id else null end,
    case when p_party_type = 'supplier' then p_supplier_id else null end,
    round(p_amount, 2), p_payment_method::public.payment_method,
    nullif(trim(p_reference_no), ''), nullif(trim(p_description), ''), caller_id
  ) returning id into entry_id;
  if p_entry_type = 'receipt' and p_party_type = 'customer' then
    update public.customers set outstanding_balance = greatest(outstanding_balance - round(p_amount, 2), 0)
    where id = p_customer_id and store_id = p_store_id;
  end if;
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, caller_id, 'post', 'account_entry', entry_id,
    jsonb_build_object('account_no', account_no, 'type', p_entry_type, 'amount', round(p_amount, 2)));
  return jsonb_build_object('entry_id', entry_id, 'account_no', account_no, 'status', 'posted');
end;
$$;

create or replace function public.cancel_account_entry(
  p_store_id uuid,
  p_entry_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  entry_row public.account_entries%rowtype;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin','accountant']::public.app_role[]
  ) then raise exception 'Not authorized to cancel account entries'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Cancellation reason is required'; end if;
  select * into entry_row from public.account_entries
  where id = p_entry_id and store_id = p_store_id for update;
  if not found then raise exception 'Account entry not found'; end if;
  if entry_row.status = 'cancelled' then raise exception 'Account entry is already cancelled'; end if;
  update public.account_entries
  set status = 'cancelled', description = concat_ws(E'\n', description, 'Cancelled: ' || trim(p_reason))
  where id = p_entry_id;
  if entry_row.entry_type = 'receipt' and entry_row.customer_id is not null then
    update public.customers set outstanding_balance = outstanding_balance + entry_row.amount
    where id = entry_row.customer_id and store_id = p_store_id;
  end if;
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_store_id, caller_id, 'cancel', 'account_entry', p_entry_id,
    jsonb_build_object('status', entry_row.status), jsonb_build_object('status', 'cancelled', 'reason', trim(p_reason)));
  return jsonb_build_object('entry_id', p_entry_id, 'account_no', entry_row.account_no, 'status', 'cancelled');
end;
$$;

create or replace function public.adjust_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_operation text,
  p_quantity numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  product_row public.products%rowtype;
  delta numeric(14,3);
  new_balance numeric(14,3);
  movement public.stock_movement_type;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin','inventory_manager']::public.app_role[]
  ) then raise exception 'Not authorized for stock adjustments'; end if;
  if p_operation not in ('adjustment_in','adjustment_out','damage','expiry','physical_inventory','stock_correction','temp_adjustment') then
    raise exception 'Invalid stock operation';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Adjustment reason is required'; end if;
  select * into product_row from public.products
  where id = p_product_id and store_id = p_store_id for update;
  if not found then raise exception 'Product not found'; end if;
  delta := case
    when p_operation = 'adjustment_in' then abs(coalesce(p_quantity, 0))
    when p_operation in ('adjustment_out','damage','expiry') then -abs(coalesce(p_quantity, 0))
    when p_operation in ('physical_inventory','stock_correction') then coalesce(p_quantity, 0) - product_row.current_stock
    else coalesce(p_quantity, 0)
  end;
  if delta = 0 then raise exception 'Stock is already at the requested quantity'; end if;
  new_balance := product_row.current_stock + delta;
  if new_balance < 0 and not product_row.allow_negative_stock then raise exception 'Stock cannot become negative'; end if;
  movement := case
    when p_operation = 'damage' then 'damage'::public.stock_movement_type
    when p_operation = 'expiry' then 'expiry'::public.stock_movement_type
    when delta > 0 then 'adjustment_in'::public.stock_movement_type
    else 'adjustment_out'::public.stock_movement_type
  end;
  update public.products set current_stock = new_balance where id = p_product_id;
  insert into public.stock_movements (
    store_id, product_id, movement_type, quantity, balance_after,
    unit_cost, reference_type, reason, created_by
  ) values (
    p_store_id, p_product_id, movement, delta, new_balance,
    product_row.purchase_price, p_operation, trim(p_reason), caller_id
  );
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_store_id, caller_id, p_operation, 'product', p_product_id,
    jsonb_build_object('stock', product_row.current_stock), jsonb_build_object('stock', new_balance, 'reason', trim(p_reason)));
  return jsonb_build_object('product_id', p_product_id, 'before_stock', product_row.current_stock,
    'change', delta, 'after_stock', new_balance);
end;
$$;

create or replace function public.repack_stock(
  p_store_id uuid,
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_source_quantity numeric,
  p_target_quantity numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_row public.products%rowtype;
  target_row public.products%rowtype;
  document_id uuid;
  document_no text;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin','inventory_manager']::public.app_role[]
  ) then raise exception 'Not authorized for repacking'; end if;
  if p_source_product_id = p_target_product_id then raise exception 'Source and target products must differ'; end if;
  if coalesce(p_source_quantity, 0) <= 0 or coalesce(p_target_quantity, 0) <= 0 then
    raise exception 'Quantities must be positive';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Repack reason is required'; end if;
  perform 1 from public.products
  where store_id = p_store_id and id in (p_source_product_id, p_target_product_id)
  order by id for update;
  select * into source_row from public.products
  where id = p_source_product_id and store_id = p_store_id and active;
  select * into target_row from public.products
  where id = p_target_product_id and store_id = p_store_id and active;
  if source_row.id is null or target_row.id is null then raise exception 'Product not found'; end if;
  if source_row.current_stock < p_source_quantity and not source_row.allow_negative_stock then
    raise exception 'Insufficient source stock';
  end if;
  update public.products set current_stock = current_stock - p_source_quantity where id = source_row.id;
  update public.products set current_stock = current_stock + p_target_quantity where id = target_row.id;
  document_no := private.next_nila_document(p_store_id, 'transfer', 'RP');
  insert into public.business_documents (
    store_id, document_no, document_type, source_type, source_id, status, payload, created_by
  ) values (
    p_store_id, document_no, 'internal_transfer', 'product', target_row.id, 'completed',
    jsonb_build_object('operation', 'repack', 'source_product_id', source_row.id,
      'source_quantity', p_source_quantity, 'target_product_id', target_row.id,
      'target_quantity', p_target_quantity, 'reason', trim(p_reason)), caller_id
  ) returning id into document_id;
  insert into public.stock_movements (
    store_id, product_id, movement_type, quantity, balance_after, unit_cost,
    reference_type, reference_id, reason, created_by
  ) values
    (p_store_id, source_row.id, 'transfer_out', -p_source_quantity,
      source_row.current_stock - p_source_quantity, source_row.purchase_price,
      'repack', document_id, trim(p_reason), caller_id),
    (p_store_id, target_row.id, 'transfer_in', p_target_quantity,
      target_row.current_stock + p_target_quantity, target_row.purchase_price,
      'repack', document_id, trim(p_reason), caller_id);
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, caller_id, 'repack', 'product', target_row.id,
    jsonb_build_object('document_no', document_no, 'source_product_id', source_row.id,
      'source_quantity', p_source_quantity, 'target_quantity', p_target_quantity));
  return jsonb_build_object('document_id', document_id, 'document_no', document_no,
    'source_stock', source_row.current_stock - p_source_quantity,
    'target_stock', target_row.current_stock + p_target_quantity);
end;
$$;

create or replace function public.merge_products(
  p_store_id uuid,
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_row public.products%rowtype;
  target_row public.products%rowtype;
  new_stock numeric(14,3);
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin']::public.app_role[]
  ) then raise exception 'Administrator access is required'; end if;
  if p_source_product_id = p_target_product_id then raise exception 'Choose two different products'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Merge reason is required'; end if;
  perform 1 from public.products
  where store_id = p_store_id and id in (p_source_product_id, p_target_product_id)
  order by id for update;
  select * into source_row from public.products
  where id = p_source_product_id and store_id = p_store_id and active;
  select * into target_row from public.products
  where id = p_target_product_id and store_id = p_store_id and active;
  if source_row.id is null or target_row.id is null then raise exception 'Product not found'; end if;
  new_stock := target_row.current_stock + source_row.current_stock;
  update public.products set current_stock = new_stock where id = target_row.id;
  update public.products
  set current_stock = 0, active = false,
      metadata = metadata || jsonb_build_object('merged_into', target_row.id, 'merged_at', now())
  where id = source_row.id;
  update public.product_barcodes set product_id = target_row.id
  where product_id = source_row.id and store_id = p_store_id;
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, caller_id, 'merge', 'product', target_row.id,
    jsonb_build_object('source_product_id', source_row.id, 'moved_stock', source_row.current_stock,
      'target_stock', new_stock, 'reason', trim(p_reason)));
  return jsonb_build_object('source_product_id', source_row.id,
    'target_product_id', target_row.id, 'target_stock', new_stock);
end;
$$;

create or replace function public.save_business_document(
  p_store_id uuid,
  p_document_type text,
  p_source_id uuid,
  p_document_date date,
  p_amount numeric,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  document_id uuid;
  document_no text;
  prefix text;
  counter_type text;
  source_type text;
  initial_status text;
  needed_roles public.app_role[];
begin
  if p_document_type not in (
    'quotation','home_delivery','internal_transfer','bill_verification',
    'sales_modification','purchase_modification','barcode_batch',
    'physical_inventory','stock_advice'
  ) then raise exception 'Unsupported business document'; end if;
  needed_roles := case
    when p_document_type in ('quotation','home_delivery')
      then array['super_admin','admin','cashier','staff']::public.app_role[]
    when p_document_type in ('bill_verification','sales_modification','purchase_modification')
      then array['super_admin','admin','accountant']::public.app_role[]
    else array['super_admin','admin','inventory_manager']::public.app_role[]
  end;
  if caller_id is null or not private.has_store_role(p_store_id, needed_roles) then
    raise exception 'Not authorized for this operation';
  end if;

  if p_document_type in ('home_delivery','sales_modification','bill_verification') then
    if not exists (select 1 from public.sales where id = p_source_id and store_id = p_store_id) then
      raise exception 'Sale not found';
    end if;
    source_type := 'sale';
  elsif p_document_type = 'purchase_modification' then
    if not exists (select 1 from public.purchases where id = p_source_id and store_id = p_store_id) then
      raise exception 'Purchase not found';
    end if;
    source_type := 'purchase';
  elsif p_document_type in ('internal_transfer','physical_inventory','stock_advice','barcode_batch') then
    if p_source_id is not null and not exists (
      select 1 from public.products where id = p_source_id and store_id = p_store_id
    ) then raise exception 'Product not found'; end if;
    source_type := 'product';
  else
    source_type := null;
  end if;

  if p_document_type = 'quotation' then
    prefix := 'QT'; counter_type := 'quotation'; initial_status := 'draft';
  elsif p_document_type = 'home_delivery' then
    prefix := 'HD'; counter_type := 'delivery'; initial_status := 'scheduled';
    if nullif(trim(p_payload ->> 'address'), '') is null then raise exception 'Delivery address is required'; end if;
  elsif p_document_type = 'internal_transfer' then
    prefix := 'TR'; counter_type := 'transfer'; initial_status := 'completed';
    if nullif(trim(p_payload ->> 'from_location'), '') is null
      or nullif(trim(p_payload ->> 'to_location'), '') is null
      or lower(trim(p_payload ->> 'from_location')) = lower(trim(p_payload ->> 'to_location')) then
      raise exception 'Choose two different stock locations';
    end if;
  elsif p_document_type in ('physical_inventory','stock_advice','barcode_batch') then
    prefix := case when p_document_type = 'physical_inventory' then 'PI'
      when p_document_type = 'stock_advice' then 'SA' else 'BC' end;
    counter_type := 'transfer'; initial_status := 'completed';
  else
    prefix := 'EV'; counter_type := 'transfer'; initial_status := 'completed';
  end if;
  document_no := private.next_nila_document(p_store_id, counter_type, prefix);

  if p_document_type = 'home_delivery' then
    insert into public.business_documents (
      store_id, document_no, document_type, document_date, source_type,
      source_id, status, amount, payload, created_by
    ) values (
      p_store_id, document_no, p_document_type, coalesce(p_document_date, current_date),
      source_type, p_source_id, initial_status, greatest(coalesce(p_amount, 0), 0),
      coalesce(p_payload, '{}'::jsonb), caller_id
    ) on conflict (store_id, source_id)
      where document_type = 'home_delivery' and status <> 'cancelled'
    do update set
      document_date = excluded.document_date, amount = excluded.amount,
      payload = excluded.payload, status = 'scheduled', updated_at = now()
    returning id, business_documents.document_no into document_id, document_no;
  else
    insert into public.business_documents (
      store_id, document_no, document_type, document_date, source_type,
      source_id, status, amount, payload, created_by
    ) values (
      p_store_id, document_no, p_document_type, coalesce(p_document_date, current_date),
      source_type, p_source_id, initial_status, greatest(coalesce(p_amount, 0), 0),
      coalesce(p_payload, '{}'::jsonb), caller_id
    ) returning id into document_id;
  end if;

  if p_document_type = 'sales_modification' then
    update public.sales set notes = nullif(trim(p_payload ->> 'notes'), '') where id = p_source_id;
  elsif p_document_type = 'purchase_modification' then
    update public.purchases
    set notes = nullif(trim(p_payload ->> 'notes'), ''),
        supplier_invoice_no = coalesce(nullif(trim(p_payload ->> 'supplier_invoice_no'), ''), supplier_invoice_no)
    where id = p_source_id;
  end if;
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, caller_id, p_document_type, coalesce(source_type, 'business_document'),
    coalesce(p_source_id, document_id), jsonb_build_object('document_id', document_id,
      'document_no', document_no, 'payload', coalesce(p_payload, '{}'::jsonb)));
  return jsonb_build_object('document_id', document_id, 'document_no', document_no,
    'document_type', p_document_type, 'status', initial_status);
end;
$$;

create or replace function public.close_business_day(
  p_store_id uuid,
  p_business_date date,
  p_opening_cash numeric,
  p_counted_cash numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_date date := coalesce(p_business_date, current_date);
  sales_count integer := 0;
  gross_sales numeric(14,2) := 0;
  return_total numeric(14,2) := 0;
  cash_sales numeric(14,2) := 0;
  upi_sales numeric(14,2) := 0;
  card_sales numeric(14,2) := 0;
  cash_refunds numeric(14,2) := 0;
  cash_receipts numeric(14,2) := 0;
  cash_payments numeric(14,2) := 0;
  expected_cash numeric(14,2);
  counted_cash numeric(14,2) := greatest(coalesce(p_counted_cash, 0), 0);
  variance numeric(14,2);
  document_no text;
  document_id uuid;
  payload jsonb;
begin
  if caller_id is null or not private.has_store_role(
    p_store_id, array['super_admin','admin','accountant']::public.app_role[]
  ) then raise exception 'Not authorized for day end'; end if;
  select count(*), coalesce(sum(grand_total), 0) into sales_count, gross_sales
  from public.sales where store_id = p_store_id and status = 'completed'
    and (completed_at at time zone 'Asia/Kolkata')::date = v_date;
  select
    coalesce(sum(pay.amount) filter (where pay.method = 'cash'), 0),
    coalesce(sum(pay.amount) filter (where pay.method = 'upi'), 0),
    coalesce(sum(pay.amount) filter (where pay.method = 'card'), 0)
  into cash_sales, upi_sales, card_sales
  from public.payments pay join public.sales sale on sale.id = pay.sale_id
  where pay.store_id = p_store_id and sale.status = 'completed'
    and (sale.completed_at at time zone 'Asia/Kolkata')::date = v_date;
  select coalesce(sum(total_amount), 0),
    coalesce(sum(total_amount) filter (where refund_method = 'cash'), 0)
  into return_total, cash_refunds
  from public.sale_returns where store_id = p_store_id
    and (created_at at time zone 'Asia/Kolkata')::date = v_date;
  select
    coalesce(sum(amount) filter (where entry_type = 'receipt' and status = 'posted'), 0),
    coalesce(sum(amount) filter (where entry_type in ('payment','refund') and status = 'posted'), 0)
  into cash_receipts, cash_payments
  from public.account_entries
  where store_id = p_store_id and entry_date = v_date and payment_method = 'cash';
  expected_cash := round(greatest(coalesce(p_opening_cash, 0), 0)
    + cash_sales - cash_refunds + cash_receipts - cash_payments, 2);
  variance := round(counted_cash - expected_cash, 2);
  payload := jsonb_build_object(
    'sales_count', sales_count, 'gross_sales', gross_sales, 'return_total', return_total,
    'cash_sales', cash_sales, 'upi_sales', upi_sales, 'card_sales', card_sales,
    'cash_refunds', cash_refunds, 'cash_receipts', cash_receipts,
    'cash_payments', cash_payments, 'opening_cash', greatest(coalesce(p_opening_cash, 0), 0),
    'expected_cash', expected_cash, 'counted_cash', counted_cash,
    'variance', variance, 'notes', nullif(trim(p_notes), '')
  );
  document_no := private.next_nila_document(p_store_id, 'day_end', 'DE');
  insert into public.business_documents (
    store_id, document_no, document_type, document_date, status,
    amount, payload, created_by
  ) values (
    p_store_id, document_no, 'day_end', v_date, 'completed', gross_sales, payload, caller_id
  ) on conflict (store_id, document_date)
    where document_type = 'day_end' and status <> 'cancelled'
  do update set amount = excluded.amount, payload = excluded.payload,
    updated_at = now(), created_by = excluded.created_by
  returning id, business_documents.document_no into document_id, document_no;
  update public.store_settings set operating_date = v_date + 1, updated_at = now()
  where store_id = p_store_id;
  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (p_store_id, caller_id, 'close', 'day_end', document_id, payload);
  return payload || jsonb_build_object('document_id', document_id, 'document_no', document_no);
end;
$$;

revoke all on function public.process_sale_return(uuid, uuid, jsonb, text, text) from public, anon;
revoke all on function public.cancel_sale(uuid, uuid, text) from public, anon;
revoke all on function public.process_purchase_return(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.cancel_purchase(uuid, uuid, text) from public, anon;
revoke all on function public.post_account_entry(uuid, text, text, uuid, uuid, numeric, text, text, text, date) from public, anon;
revoke all on function public.cancel_account_entry(uuid, uuid, text) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, text, numeric, text) from public, anon;
revoke all on function public.repack_stock(uuid, uuid, uuid, numeric, numeric, text) from public, anon;
revoke all on function public.merge_products(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.save_business_document(uuid, text, uuid, date, numeric, jsonb) from public, anon;
revoke all on function public.close_business_day(uuid, date, numeric, numeric, text) from public, anon;

grant execute on function public.process_sale_return(uuid, uuid, jsonb, text, text) to authenticated;
grant execute on function public.cancel_sale(uuid, uuid, text) to authenticated;
grant execute on function public.process_purchase_return(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.cancel_purchase(uuid, uuid, text) to authenticated;
grant execute on function public.post_account_entry(uuid, text, text, uuid, uuid, numeric, text, text, text, date) to authenticated;
grant execute on function public.cancel_account_entry(uuid, uuid, text) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.repack_stock(uuid, uuid, uuid, numeric, numeric, text) to authenticated;
grant execute on function public.merge_products(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.save_business_document(uuid, text, uuid, date, numeric, jsonb) to authenticated;
grant execute on function public.close_business_day(uuid, date, numeric, numeric, text) to authenticated;

grant select on public.account_entries, public.purchase_returns,
  public.purchase_return_items, public.business_documents to authenticated;
revoke all on public.account_entries, public.purchase_returns,
  public.purchase_return_items, public.business_documents from anon;

comment on function public.process_sale_return(uuid, uuid, jsonb, text, text) is
  'Authenticated atomic sale return; permitted store role is verified before refund and stock writes.';
comment on function public.cancel_sale(uuid, uuid, text) is
  'Authenticated atomic sale cancellation; admin role is verified before stock reversal.';
comment on function public.process_purchase_return(uuid, uuid, jsonb, text) is
  'Authenticated atomic purchase return; store role is verified before stock and account writes.';
comment on function public.adjust_stock(uuid, uuid, text, numeric, text) is
  'Authenticated atomic stock operation; inventory role is verified before stock writes.';
