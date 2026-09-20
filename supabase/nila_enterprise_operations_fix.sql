-- Fix ambiguous PL/pgSQL counter variable found by the rollback smoke test.
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
