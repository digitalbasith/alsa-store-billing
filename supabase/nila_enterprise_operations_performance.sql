-- Remove the duplicate created by the enterprise migration.
-- The core schema already provides sale_return_items_sale_item_id_idx.
drop index if exists public.sale_return_items_sale_item_idx;
