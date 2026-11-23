-- ============================================================
-- GRANT PERMISSIONS TO AUTHENTICATED AND ANON ROLES
-- Supabase Migration: 004_grant_permissions
-- ============================================================

-- 1. Berikan hak akses schema public
grant usage on schema public to anon, authenticated;

-- 2. Berikan hak akses ke seluruh tabel dan view
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- Pastikan view bisa diakses
grant select on public.v_saldo_bahan_baku to authenticated, anon;
grant select on public.v_mutasi_dashboard to authenticated, anon;

-- 3. Berikan hak akses ke sequence (id autoincrement jika ada)
grant usage, select on all sequences in schema public to authenticated;

-- 4. Berikan izin eksekusi fungsi RPC
grant execute on all functions in schema public to authenticated, anon;

-- 5. Atur default privileges agar tabel/view baru otomatis dapat izin
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated, anon;
