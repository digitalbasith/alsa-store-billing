-- Nila Supermarket: performance and explicit internal-table hardening.

-- The counter table is intentionally RPC-only. Keep a deny-all RLS policy so
-- accidental future grants still cannot expose invoice counters directly.
create policy document_counters_no_direct_access
on public.document_counters
for all
to authenticated
using (false)
with check (false);

-- Cover every foreign key used by joins, cascades, stock lookups and reports.
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index categories_parent_id_idx on public.categories (parent_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index loyalty_transactions_customer_id_idx on public.loyalty_transactions (customer_id);
create index loyalty_transactions_sale_id_idx on public.loyalty_transactions (sale_id);
create index loyalty_transactions_store_id_idx on public.loyalty_transactions (store_id);
create index payments_received_by_idx on public.payments (received_by);
create index payments_store_id_idx on public.payments (store_id);
create index product_barcodes_product_id_idx on public.product_barcodes (product_id);
create index products_brand_id_idx on public.products (brand_id);
create index products_category_id_idx on public.products (category_id);
create index purchase_items_product_id_idx on public.purchase_items (product_id);
create index purchase_items_store_id_idx on public.purchase_items (store_id);
create index purchases_created_by_idx on public.purchases (created_by);
create index purchases_supplier_id_idx on public.purchases (supplier_id);
create index register_sessions_store_id_idx on public.register_sessions (store_id);
create index register_sessions_user_id_idx on public.register_sessions (user_id);
create index sale_items_product_id_idx on public.sale_items (product_id);
create index sale_items_store_id_idx on public.sale_items (store_id);
create index sale_return_items_product_id_idx on public.sale_return_items (product_id);
create index sale_return_items_return_id_idx on public.sale_return_items (return_id);
create index sale_return_items_sale_item_id_idx on public.sale_return_items (sale_item_id);
create index sale_return_items_store_id_idx on public.sale_return_items (store_id);
create index sale_returns_created_by_idx on public.sale_returns (created_by);
create index sale_returns_customer_id_idx on public.sale_returns (customer_id);
create index sale_returns_sale_id_idx on public.sale_returns (sale_id);
create index sales_cashier_id_idx on public.sales (cashier_id);
create index sales_customer_id_idx on public.sales (customer_id);
create index sales_register_session_id_idx on public.sales (register_session_id);
create index stock_movements_created_by_idx on public.stock_movements (created_by);
create index stock_movements_product_id_idx on public.stock_movements (product_id);
create index store_members_user_id_idx on public.store_members (user_id);
create index stores_created_by_idx on public.stores (created_by);

comment on function public.create_store(text, text, text) is
  'Authenticated onboarding RPC. SECURITY DEFINER is intentional; auth.uid is required and the caller only receives ownership of the newly created store.';

comment on function public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, text) is
  'Authenticated atomic checkout RPC. SECURITY DEFINER is intentional; store membership and permitted POS roles are verified before any write.';
