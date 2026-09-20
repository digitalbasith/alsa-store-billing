-- Nila single-store bootstrap hardening.
-- Run once in the Supabase SQL editor after nila_schema.sql.

create or replace function public.nila_bootstrap_status()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.stores);
$$;
revoke all on function public.nila_bootstrap_status() from public;
grant execute on function public.nila_bootstrap_status() to anon, authenticated;

create or replace function public.create_store(
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
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if nullif(trim(store_name), '') is null then raise exception 'Store name is required'; end if;

  perform pg_advisory_xact_lock(73194521);
  if exists (select 1 from public.stores) then
    raise exception 'Nila Supermarket is already configured. Ask the Super Admin to add you in Staff & Roles.';
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
