-- ============================================================
-- 016: QA P0 SECURITY HARDENING, VIEWS & ATOMIC RPC FIXES
-- Jalankan di Supabase SQL Editor setelah 001-015.
-- ============================================================

-- 1. Kunci role pendaftaran selalu 'staff' (cegah privilege escalation via user_metadata)
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1), 'Staff Bar'),
    'staff'::user_role
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$ language plpgsql;

-- 2. Perketat RLS tabel profiles: user biasa tidak boleh mengubah kolom role
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.get_my_role() = 'admin')
  with check (
    public.get_my_role() = 'admin'
    or (
      id = auth.uid()
      and role = (select p.role from public.profiles p where p.id = auth.uid())
    )
  );

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (
    public.get_my_role() = 'admin'
    or (id = auth.uid() and role = 'staff'::user_role)
  );

-- 3. Cabut seluruh akses role anon (cegah kebocoran data tanpa login)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke select on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 4. Update view v_saldo_bahan_baku agar menyertakan kolom jenis + aktifkan security_invoker
drop view if exists public.v_saldo_bahan_baku;
create or replace view public.v_saldo_bahan_baku
with (security_invoker = true) as
select
  b.id,
  b.nama,
  b.satuan,
  b.jenis,
  b.stok_awal,
  b.minimum_stok,
  b.is_active,
  b.division,
  coalesce(sum(case when t.jenis = 'IN'  then td.qty else 0 end), 0) as total_in,
  coalesce(sum(case when t.jenis = 'OUT' then td.qty else 0 end), 0) as total_out,
  b.stok_awal
  + coalesce(sum(case when t.jenis = 'IN'  then td.qty else 0 end), 0)
  - coalesce(sum(case when t.jenis = 'OUT' then td.qty else 0 end), 0) as saldo_akhir
from public.bahan_baku b
left join public.transaksi_detail td on td.bahan_baku_id = b.id
left join public.transaksi t on t.id = td.transaksi_id and t.is_posted = true
group by b.id, b.nama, b.satuan, b.jenis, b.stok_awal, b.minimum_stok, b.is_active, b.division;

alter view public.v_mutasi_dashboard set (security_invoker = true);
alter view public.v_mutasi_menu set (security_invoker = true);

revoke all on public.v_saldo_bahan_baku from anon;
revoke all on public.v_mutasi_dashboard from anon;
revoke all on public.v_mutasi_menu from anon;

grant select on public.v_saldo_bahan_baku to authenticated;
grant select on public.v_mutasi_dashboard to authenticated;
grant select on public.v_mutasi_menu to authenticated;

-- 5. Perketat RPC catat_masak:
--    - wajib authenticated (pakai auth.uid(), tidak bisa spoofing p_created_by)
--    - validasi jsonb array non-null
--    - lock baris bahan_baku (FOR UPDATE) untuk mencegah race condition
--    - agregasi SUM(qty) per bahan agar bahan duplikat tidak lolos cek stok
create or replace function public.catat_masak(
  p_tanggal    date,
  p_bahan_in   jsonb,
  p_bahan_out  jsonb,
  p_catatan    text default null,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_id      uuid := gen_random_uuid();
  v_out_id  uuid;
  v_in_id   uuid;
  v_saldo   numeric;
  v_nama    text;
  r         record;
begin
  if v_uid is null then
    raise exception 'Harus login terlebih dahulu';
  end if;

  if p_bahan_in is null or jsonb_typeof(p_bahan_in) <> 'array' or jsonb_array_length(p_bahan_in) = 0 then
    raise exception 'Minimal satu bahan terpakai';
  end if;
  if p_bahan_out is null or jsonb_typeof(p_bahan_out) <> 'array' or jsonb_array_length(p_bahan_out) = 0 then
    raise exception 'Minimal satu hasil masak';
  end if;

  -- Validasi dasar per item bahan terpakai
  for r in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_bahan_in) e
  loop
    if r.id is null then
      raise exception 'ID bahan terpakai tidak valid';
    end if;
    if r.qty is null or r.qty <= 0 then
      raise exception 'Qty bahan terpakai harus lebih dari 0';
    end if;
  end loop;

  -- Validasi dasar per item hasil masak
  for r in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_bahan_out) e
  loop
    if r.id is null then
      raise exception 'ID hasil masak tidak valid';
    end if;
    if r.qty is null or r.qty <= 0 then
      raise exception 'Qty hasil harus lebih dari 0';
    end if;
    select nama into v_nama from public.bahan_baku
    where id = r.id and jenis = 'BAHAN_PRODUKSI';
    if v_nama is null then
      raise exception 'Hasil masak harus BAHAN_PRODUKSI';
    end if;
  end loop;

  -- Lock semua baris bahan_baku yang terlibat secara deterministik (cegah race condition & deadlock)
  perform 1
  from public.bahan_baku
  where id in (
    select (e->>'id')::uuid from jsonb_array_elements(p_bahan_in) e
    union
    select (e->>'id')::uuid from jsonb_array_elements(p_bahan_out) e
  )
  order by id
  for update;

  -- Cek saldo berdasarkan TOTAL agregasi per bahan (cegah bypass lewat baris duplikat)
  for r in
    select (e->>'id')::uuid as id, sum((e->>'qty')::numeric) as total_qty
    from jsonb_array_elements(p_bahan_in) e
    group by (e->>'id')::uuid
  loop
    select nama into v_nama from public.bahan_baku where id = r.id;
    if v_nama is null then
      raise exception 'Bahan terpakai tidak ditemukan';
    end if;
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    if v_saldo < r.total_qty then
      raise exception 'Stok % kurang: butuh %, tersedia %', v_nama, r.total_qty, v_saldo;
    end if;
  end loop;

  -- OUT: bahan terpakai (diagregasi per bahan agar saldo_sebelum/sesudah akurat)
  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, catatan, is_posted, posted_at, created_by, produksi_id)
  values
    (p_tanggal, 'OUT', 'PRODUKSI', p_catatan, true, now(), v_uid, v_id)
  returning id into v_out_id;

  for r in
    select (e->>'id')::uuid as id, sum((e->>'qty')::numeric) as qty
    from jsonb_array_elements(p_bahan_in) e
    group by (e->>'id')::uuid
  loop
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    insert into public.transaksi_detail
      (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
    values
      (v_out_id, r.id, r.qty, v_saldo, v_saldo - r.qty);
  end loop;

  -- IN: hasil masak (diagregasi per bahan)
  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, catatan, is_posted, posted_at, created_by, produksi_id)
  values
    (p_tanggal, 'IN', 'PRODUKSI', p_catatan, true, now(), v_uid, v_id)
  returning id into v_in_id;

  for r in
    select (e->>'id')::uuid as id, sum((e->>'qty')::numeric) as qty
    from jsonb_array_elements(p_bahan_out) e
    group by (e->>'id')::uuid
  loop
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    insert into public.transaksi_detail
      (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
    values
      (v_in_id, r.id, r.qty, v_saldo, v_saldo + r.qty);
  end loop;

  return v_id;
end;
$$;

revoke all on function public.catat_masak(date, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.catat_masak(date, jsonb, jsonb, text, uuid) to authenticated;

-- 6. Perketat RPC catat_produksi (auth.uid() + row lock + revoke anon)
create or replace function public.catat_produksi(
  p_tanggal        date,
  p_bahan_hasil_id uuid,
  p_qty_hasil      numeric,
  p_catatan        text default null,
  p_created_by     uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_batch    public.bom_batch%rowtype;
  v_jenis    text;
  v_scale    numeric;
  v_saldo    numeric;
  v_id       uuid := gen_random_uuid();
  v_out_id   uuid;
  v_in_id    uuid;
  r          record;
begin
  if v_uid is null then
    raise exception 'Harus login terlebih dahulu';
  end if;

  if p_qty_hasil is null or p_qty_hasil <= 0 then
    raise exception 'Qty hasil harus lebih dari 0';
  end if;

  select jenis into v_jenis from public.bahan_baku where id = p_bahan_hasil_id;
  if v_jenis is distinct from 'BAHAN_PRODUKSI' then
    raise exception 'Bahan hasil bukan BAHAN_PRODUKSI';
  end if;

  select * into v_batch from public.bom_batch where bahan_hasil_id = p_bahan_hasil_id;
  if not found then
    raise exception 'BOM untuk bahan ini belum ada';
  end if;
  if v_batch.qty_hasil is null or v_batch.qty_hasil <= 0 then
    raise exception 'Yield BOM belum diisi — lengkapi dulu di kartu wawancara';
  end if;

  v_scale := p_qty_hasil / v_batch.qty_hasil;

  perform 1
  from public.bahan_baku
  where id = p_bahan_hasil_id
     or id in (select d.bahan_asal_id from public.bom_batch_detail d where d.batch_id = v_batch.id)
  order by id
  for update;

  for r in
    select d.bahan_asal_id, d.qty_asal * v_scale as qty
    from public.bom_batch_detail d
    where d.batch_id = v_batch.id
  loop
    v_saldo := coalesce(public.get_saldo_bahan(r.bahan_asal_id), 0);
    if v_saldo < r.qty then
      raise exception 'Stok % kurang: butuh %, tersedia %',
        (select nama from public.bahan_baku where id = r.bahan_asal_id), r.qty, v_saldo;
    end if;
  end loop;

  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, catatan, is_posted, posted_at, created_by, produksi_id)
  values
    (p_tanggal, 'OUT', 'PRODUKSI', p_catatan, true, now(), v_uid, v_id)
  returning id into v_out_id;

  for r in
    select d.bahan_asal_id, d.qty_asal * v_scale as qty
    from public.bom_batch_detail d
    where d.batch_id = v_batch.id
  loop
    v_saldo := coalesce(public.get_saldo_bahan(r.bahan_asal_id), 0);
    insert into public.transaksi_detail
      (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
    values
      (v_out_id, r.bahan_asal_id, r.qty, v_saldo, v_saldo - r.qty);
  end loop;

  v_saldo := coalesce(public.get_saldo_bahan(p_bahan_hasil_id), 0);

  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, catatan, is_posted, posted_at, created_by, produksi_id)
  values
    (p_tanggal, 'IN', 'PRODUKSI', p_catatan, true, now(), v_uid, v_id)
  returning id into v_in_id;

  insert into public.transaksi_detail
    (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
  values
    (v_in_id, p_bahan_hasil_id, p_qty_hasil, v_saldo, v_saldo + p_qty_hasil);

  return v_id;
end;
$$;

revoke all on function public.catat_produksi(date, uuid, numeric, text, uuid) from public, anon;
grant execute on function public.catat_produksi(date, uuid, numeric, text, uuid) to authenticated;

-- Pastikan fungsi pembacaan juga hanya untuk authenticated
revoke all on function public.get_saldo_bahan(uuid) from public, anon;
grant execute on function public.get_saldo_bahan(uuid) to authenticated;

revoke all on function public.menu_recipe_lengkap(uuid) from public, anon;
grant execute on function public.menu_recipe_lengkap(uuid) to authenticated;

revoke all on function public.get_mutasi_bahan_range(date, date) from public, anon;
grant execute on function public.get_mutasi_bahan_range(date, date) to authenticated;

notify pgrst, 'reload schema';
