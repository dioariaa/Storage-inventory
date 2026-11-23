-- ============================================================
-- FIX: PROFILES SIGNUP RLS & TRIGGER
-- Supabase Migration: 003_fix_profiles_signup
-- ============================================================

-- 1. Perbaiki policy insert pada profiles agar trigger signup diizinkan
drop policy if exists "profiles_insert" on public.profiles;

create policy "profiles_insert" on public.profiles for insert
  with check (true);

-- 2. Perbaiki fungsi handle_new_user dengan search_path dan error handling yang aman
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  -- Cek apakah role dikirim dan valid, jika tidak default ke 'staff'
  begin
    v_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'staff'::user_role);
  exception when others then
    v_role := 'staff'::user_role;
  end;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Staff Bar'),
    v_role
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$ language plpgsql;
