-- Atomic purchase receipt: purchase document, stock and audit update together.

create or replace function public.receive_purchase(
  p_store_id uuid,
  p_supplier_id uuid,
  p_supplier_invoice_no text,
  p_items jsonb,
  p_payment_amount numeric default 0,
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
  v_purchase_prefix text;
  generated_purchase_no text;
  new_purchase_id uuid;
  item jsonb;
  product_row public.products%rowtype;
  item_quantity numeric(14,3);
  item_free_quantity numeric(14,3);
  item_unit_cost numeric(14,2);
  item_discount numeric(14,2);
  item_gst_rate numeric(5,2);
  taxable_value numeric(14,2);
  line_tax numeric(14,2);
  line_total_value numeric(14,2);
  subtotal_value numeric(14,2) := 0;
  discount_value numeric(14,2) := 0;
  tax_value numeric(14,2) := 0;
  grand_total_value numeric(14,2) := 0;
  paid_value numeric(14,2) := greatest(coalesce(p_payment_amount, 0), 0);
begin
  if current_user_id is null or not private.has_store_role(
    p_store_id,
    array['super_admin','admin','inventory_manager','accountant']::public.app_role[]
  ) then
    raise exception 'Not authorized for purchase receipt';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one purchase item is required';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and store_id = p_store_id and active
  ) then
    raise exception 'Supplier not found or inactive';
  end if;

  select stores.purchase_prefix into v_purchase_prefix
  from public.stores
  where id = p_store_id and active;
  if v_purchase_prefix is null then raise exception 'Store is inactive or missing'; end if;

  insert into public.document_counters (store_id, document_type, fiscal_year, next_number)
  values (p_store_id, 'purchase', fiscal_year, 2)
  on conflict (store_id, document_type, fiscal_year)
  do update set next_number = public.document_counters.next_number + 1
  returning next_number - 1 into counter_value;

  generated_purchase_no := v_purchase_prefix || '-' || fiscal_year || '-' || lpad(counter_value::text, 6, '0');

  insert into public.purchases (
    store_id, purchase_no, supplier_id, supplier_invoice_no, status,
    invoice_date, created_by, notes
  ) values (
    p_store_id, generated_purchase_no, p_supplier_id,
    nullif(trim(p_supplier_invoice_no), ''), 'received', current_date,
    current_user_id, p_notes
  ) returning id into new_purchase_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity := coalesce((item ->> 'quantity')::numeric, 0);
    item_free_quantity := greatest(coalesce((item ->> 'free_quantity')::numeric, 0), 0);
    item_unit_cost := greatest(coalesce((item ->> 'unit_cost')::numeric, 0), 0);
    item_discount := greatest(coalesce((item ->> 'discount_amount')::numeric, 0), 0);
    if item_quantity <= 0 then raise exception 'Purchase quantity must be positive'; end if;

    select * into product_row
    from public.products
    where id = (item ->> 'product_id')::uuid
      and store_id = p_store_id
      and active
    for update;
    if not found then raise exception 'Product not found or inactive'; end if;

    item_gst_rate := coalesce((item ->> 'gst_rate')::numeric, product_row.gst_rate);
    taxable_value := round(item_quantity * item_unit_cost - item_discount, 2);
    if taxable_value < 0 then raise exception 'Discount exceeds purchase line value'; end if;
    line_tax := round(taxable_value * item_gst_rate / 100, 2);
    line_total_value := taxable_value + line_tax;

    insert into public.purchase_items (
      store_id, purchase_id, product_id, batch_no, expiry_date,
      quantity, free_quantity, unit_cost, discount_amount, gst_rate,
      tax_amount, line_total, received_quantity
    ) values (
      p_store_id, new_purchase_id, product_row.id,
      nullif(item ->> 'batch_no', ''), nullif(item ->> 'expiry_date', '')::date,
      item_quantity, item_free_quantity, item_unit_cost, item_discount,
      item_gst_rate, line_tax, line_total_value, item_quantity + item_free_quantity
    );

    update public.products
    set current_stock = current_stock + item_quantity + item_free_quantity,
        purchase_price = item_unit_cost
    where id = product_row.id;

    insert into public.stock_movements (
      store_id, product_id, movement_type, quantity, balance_after,
      unit_cost, reference_type, reference_id, batch_no, expiry_date,
      created_by
    ) values (
      p_store_id, product_row.id, 'purchase', item_quantity + item_free_quantity,
      product_row.current_stock + item_quantity + item_free_quantity,
      item_unit_cost, 'purchase', new_purchase_id,
      nullif(item ->> 'batch_no', ''), nullif(item ->> 'expiry_date', '')::date,
      current_user_id
    );

    subtotal_value := subtotal_value + round(item_quantity * item_unit_cost, 2);
    discount_value := discount_value + item_discount;
    tax_value := tax_value + line_tax;
    grand_total_value := grand_total_value + line_total_value;
  end loop;

  if paid_value > grand_total_value then
    raise exception 'Payment exceeds purchase total';
  end if;

  update public.purchases
  set subtotal = subtotal_value,
      discount_total = discount_value,
      tax_total = tax_value,
      grand_total = grand_total_value,
      paid_total = paid_value,
      balance_due = grand_total_value - paid_value
  where id = new_purchase_id;

  insert into public.audit_logs (store_id, user_id, action, entity_type, entity_id, after_data)
  values (
    p_store_id, current_user_id, 'receive', 'purchase', new_purchase_id,
    jsonb_build_object('purchase_no', generated_purchase_no, 'grand_total', grand_total_value)
  );

  return jsonb_build_object(
    'purchase_id', new_purchase_id,
    'purchase_no', generated_purchase_no,
    'grand_total', grand_total_value,
    'balance_due', grand_total_value - paid_value
  );
end;
$$;

revoke all on function public.receive_purchase(uuid, uuid, text, jsonb, numeric, text) from public, anon;
grant execute on function public.receive_purchase(uuid, uuid, text, jsonb, numeric, text) to authenticated;

comment on function public.receive_purchase(uuid, uuid, text, jsonb, numeric, text) is
  'Authenticated atomic purchase receipt RPC. SECURITY DEFINER is intentional; permitted store roles are verified before stock or purchase writes.';
