-- ============================================================
-- 018: OPERASIONAL HARIAN BAR (ATOMIC RPCs, ANTI DOUBLE-IMPORT,
--      ADMIN DELETE TRANSAKSI, & KONSISTENSI RLS BOM)
-- Jalankan di Supabase SQL Editor setelah 001-017.
-- ============================================================

-- 1. Konsistensi RLS BOM: semua authenticated bisa baca (untuk Input Masak),
--    hanya admin yang boleh tambah / ubah / hapus BOM.
drop policy if exists "bom_all_auth" on public.bom_batch;
drop policy if exists "bom_select_auth" on public.bom_batch;
drop policy if exists "bom_insert_admin" on public.bom_batch;
drop policy if exists "bom_update_admin" on public.bom_batch;
drop policy if exists "bom_delete_admin" on public.bom_batch;

create policy "bom_select_auth" on public.bom_batch
  for select to authenticated using (true);
create policy "bom_insert_admin" on public.bom_batch
  for insert to authenticated with check (public.get_my_role() = 'admin');
create policy "bom_update_admin" on public.bom_batch
  for update to authenticated using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
create policy "bom_delete_admin" on public.bom_batch
  for delete to authenticated using (public.get_my_role() = 'admin');

drop policy if exists "bomd_all_auth" on public.bom_batch_detail;
drop policy if exists "bomd_select_auth" on public.bom_batch_detail;
drop policy if exists "bomd_insert_admin" on public.bom_batch_detail;
drop policy if exists "bomd_update_admin" on public.bom_batch_detail;
drop policy if exists "bomd_delete_admin" on public.bom_batch_detail;

create policy "bomd_select_auth" on public.bom_batch_detail
  for select to authenticated using (true);
create policy "bomd_insert_admin" on public.bom_batch_detail
  for insert to authenticated with check (public.get_my_role() = 'admin');
create policy "bomd_update_admin" on public.bom_batch_detail
  for update to authenticated using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
create policy "bomd_delete_admin" on public.bom_batch_detail
  for delete to authenticated using (public.get_my_role() = 'admin');

-- 2. RPC ATOMIK: Barang Masuk / Barang Keluar Manual (IN / OUT)
create or replace function public.catat_transaksi_manual(
  p_tanggal    date,
  p_jenis      text,   -- 'IN' | 'OUT'
  p_alasan_out text default null,
  p_catatan    text default null,
  p_items      jsonb default '[]'::jsonb -- [{"bahan_baku_id":"uuid","qty":n}, ...]
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_trx_id uuid;
  v_saldo  numeric;
  v_nama   text;
  v_sumber transaction_source;
  r        record;
begin
  if v_uid is null then
    raise exception 'Harus login terlebih dahulu';
  end if;
  if p_jenis not in ('IN', 'OUT') then
    raise exception 'Jenis transaksi tidak valid: %', p_jenis;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu bahan baku harus diisi';
  end if;

  for r in
    select (e->>'bahan_baku_id')::uuid as id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_items) e
  loop
    if r.id is null then
      raise exception 'ID bahan baku tidak valid';
    end if;
    if r.qty is null or r.qty <= 0 then
      raise exception 'Jumlah (qty) harus lebih dari 0';
    end if;
  end loop;

  -- Lock baris bahan baku untuk cegah race condition
  perform 1
  from public.bahan_baku
  where id in (select (e->>'bahan_baku_id')::uuid from jsonb_array_elements(p_items) e)
  order by id
  for update;

  -- Cek saldo total per bahan bila OUT
  if p_jenis = 'OUT' then
    for r in
      select (e->>'bahan_baku_id')::uuid as id, sum((e->>'qty')::numeric) as total_qty
      from jsonb_array_elements(p_items) e
      group by (e->>'bahan_baku_id')::uuid
    loop
      select nama into v_nama from public.bahan_baku where id = r.id;
      if v_nama is null then
        raise exception 'Bahan baku tidak ditemukan';
      end if;
      v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
      if v_saldo < r.total_qty then
        raise exception 'Stok % kurang: butuh %, tersedia %', v_nama, r.total_qty, v_saldo;
      end if;
    end loop;
  end if;

  v_sumber := case when p_jenis = 'IN' then 'MANUAL_IN'::transaction_source else 'MANUAL_OUT'::transaction_source end;

  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, alasan_out, catatan, is_posted, posted_at, created_by)
  values
    (
      p_tanggal,
      p_jenis::transaction_type,
      v_sumber,
      case when p_jenis = 'OUT' and p_alasan_out is not null then p_alasan_out::out_reason else null end,
      p_catatan,
      true,
      now(),
      v_uid
    )
  returning id into v_trx_id;

  for r in
    select (e->>'bahan_baku_id')::uuid as id, sum((e->>'qty')::numeric) as qty
    from jsonb_array_elements(p_items) e
    group by (e->>'bahan_baku_id')::uuid
  loop
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    insert into public.transaksi_detail
      (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
    values (
      v_trx_id,
      r.id,
      r.qty,
      v_saldo,
      case when p_jenis = 'IN' then v_saldo + r.qty else v_saldo - r.qty end
    );
  end loop;

  return v_trx_id;
end;
$$;

revoke all on function public.catat_transaksi_manual(date, text, text, text, jsonb) from public, anon;
grant execute on function public.catat_transaksi_manual(date, text, text, text, jsonb) to authenticated;

-- 3. RPC ATOMIK: Posting Penjualan (POS Grid & Import POS) — aman untuk Staff & Admin + anti double-import
create or replace function public.catat_penjualan(
  p_tanggal        date,
  p_metode         text,   -- 'POS_IMPORT' | 'MANUAL'
  p_pos_filename   text default null,
  p_pos_import_ref text default null,
  p_catatan        text default null,
  p_items          jsonb default '[]'::jsonb -- [{"menu_id":"uuid","qty":n}, ...]
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_penj_id  uuid;
  v_trx_id   uuid;
  v_sumber   transaction_source;
  v_saldo    numeric;
  v_nama     text;
  v_has_cons boolean := false;
  r          record;
begin
  if v_uid is null then
    raise exception 'Harus login terlebih dahulu';
  end if;
  if p_metode not in ('POS_IMPORT', 'MANUAL') then
    raise exception 'Metode penjualan tidak valid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu menu terjual harus diisi';
  end if;

  if p_pos_import_ref is not null and exists (
    select 1 from public.transaksi where pos_import_ref = p_pos_import_ref
  ) then
    raise exception 'File POS ini sudah pernah di-import sebelumnya (%). Hapus transaksi lama di Riwayat jika ingin import ulang.', p_pos_import_ref;
  end if;

  -- Lock seluruh bahan baku yang akan terpotong oleh resep menu terjual
  perform 1
  from public.bahan_baku
  where id in (
    select distinct rec.bahan_baku_id
    from jsonb_array_elements(p_items) e
    join public.recipe rec on rec.menu_id = (e->>'menu_id')::uuid
    where (e->>'qty')::numeric > 0
  )
  order by id
  for update;

  -- Validasi kecukupan stok berdasarkan total konsumsi seluruh menu
  for r in
    select
      rec.bahan_baku_id as id,
      sum(rec.qty * (e->>'qty')::numeric) as total_qty
    from jsonb_array_elements(p_items) e
    join public.recipe rec on rec.menu_id = (e->>'menu_id')::uuid
    where (e->>'qty')::numeric > 0
    group by rec.bahan_baku_id
  loop
    v_has_cons := true;
    select nama into v_nama from public.bahan_baku where id = r.id;
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    if v_saldo < r.total_qty then
      raise exception 'Stok % kurang: butuh %, tersedia %', v_nama, r.total_qty, v_saldo;
    end if;
  end loop;

  if not v_has_cons then
    raise exception 'Tidak ada konsumsi bahan baku yang dapat dihitung. Pastikan menu memiliki resep.';
  end if;

  v_sumber := case when p_metode = 'POS_IMPORT' then 'POS_IMPORT'::transaction_source else 'MANUAL_SALE'::transaction_source end;

  insert into public.penjualan
    (tgl_penjualan, metode, pos_filename, catatan, is_posted, posted_at, created_by)
  values
    (p_tanggal, p_metode, p_pos_filename, p_catatan, true, now(), v_uid)
  returning id into v_penj_id;

  insert into public.penjualan_detail (penjualan_id, menu_id, qty_terjual)
  select
    v_penj_id,
    (e->>'menu_id')::uuid,
    sum((e->>'qty')::numeric)
  from jsonb_array_elements(p_items) e
  where (e->>'qty')::numeric > 0
  group by (e->>'menu_id')::uuid;

  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, alasan_out, catatan, is_posted, posted_at, pos_import_ref, penjualan_id, created_by)
  values
    (
      p_tanggal,
      'OUT',
      v_sumber,
      'OPERATIONAL',
      coalesce(p_catatan, 'Penjualan ' || p_metode || ': ' || p_tanggal::text),
      true,
      now(),
      p_pos_import_ref,
      v_penj_id,
      v_uid
    )
  returning id into v_trx_id;

  update public.penjualan
  set transaksi_id = v_trx_id
  where id = v_penj_id;

  for r in
    select
      rec.bahan_baku_id as id,
      sum(rec.qty * (e->>'qty')::numeric) as total_qty
    from jsonb_array_elements(p_items) e
    join public.recipe rec on rec.menu_id = (e->>'menu_id')::uuid
    where (e->>'qty')::numeric > 0
    group by rec.bahan_baku_id
  loop
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    insert into public.transaksi_detail
      (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
    values
      (v_trx_id, r.id, r.total_qty, v_saldo, v_saldo - r.total_qty);
  end loop;

  return v_trx_id;
end;
$$;

revoke all on function public.catat_penjualan(date, text, text, text, text, jsonb) from public, anon;
grant execute on function public.catat_penjualan(date, text, text, text, text, jsonb) to authenticated;

-- 4. RPC ATOMIK: Hapus Transaksi Permanen (KHUSUS ADMIN)
--    Otomatis menghapus pasangan penjualan (POS/Manual Sale) atau pasangan OUT+IN (PRODUKSI).
create or replace function public.hapus_transaksi(p_transaksi_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trx public.transaksi%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Harus login terlebih dahulu';
  end if;
  if public.get_my_role() <> 'admin' then
    raise exception 'Hanya Admin yang diizinkan menghapus transaksi';
  end if;

  select * into v_trx from public.transaksi where id = p_transaksi_id;
  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  -- Putus referensi & hapus penjualan terkait terlebih dahulu (penjualan_detail ikut cascade)
  if v_trx.penjualan_id is not null then
    delete from public.penjualan where id = v_trx.penjualan_id;
  end if;
  delete from public.penjualan where transaksi_id = p_transaksi_id;

  -- Jika berasal dari Input Masak / Produksi, hapus kedua header OUT & IN sekaligus
  if v_trx.produksi_id is not null then
    delete from public.transaksi where produksi_id = v_trx.produksi_id;
  else
    delete from public.transaksi where id = p_transaksi_id;
  end if;
end;
$$;

revoke all on function public.hapus_transaksi(uuid) from public, anon;
grant execute on function public.hapus_transaksi(uuid) to authenticated;

notify pgrst, 'reload schema';
