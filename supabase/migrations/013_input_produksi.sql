-- ============================================================
-- 013: INPUT PRODUKSI (bahan mentah -> bahan matang)
-- Jalankan SETELAH 012. Frontend Input Produksi butuh migrasi ini.
-- ============================================================

-- 1. Sumber transaksi baru + tautan 2 header (OUT bahan asal, IN bahan hasil)
alter type public.transaction_source add value if not exists 'PRODUKSI';
alter table public.transaksi add column if not exists produksi_id uuid;
create index if not exists idx_transaksi_produksi on public.transaksi(produksi_id);

-- 2. Satu aksi = satu transaksi DB. Cek saldo, potong asal, tambah hasil.
create or replace function public.catat_produksi(
  p_tanggal      date,
  p_bahan_hasil_id uuid,
  p_qty_hasil    numeric,
  p_catatan      text default null,
  p_created_by   uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch    public.bom_batch%rowtype;
  v_jenis    text;
  v_scale    numeric;
  v_saldo    numeric;
  v_id       uuid := gen_random_uuid();
  v_out_id   uuid;
  v_in_id    uuid;
  r          record;
begin
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

  -- Cek dulu supaya tidak ada transaksi setengah jalan
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
    (p_tanggal, 'OUT', 'PRODUKSI', p_catatan, true, now(), p_created_by, v_id)
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
    (p_tanggal, 'IN', 'PRODUKSI', p_catatan, true, now(), p_created_by, v_id)
  returning id into v_in_id;

  insert into public.transaksi_detail
    (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
  values
    (v_in_id, p_bahan_hasil_id, p_qty_hasil, v_saldo, v_saldo + p_qty_hasil);

  return v_id;
end;
$$;

grant execute on function public.catat_produksi(date, uuid, numeric, text, uuid) to authenticated;

-- 3. Verifikasi: batch tanpa yield ( belum bisa dipakai )
-- select b.nama, bb.qty_hasil from public.bom_batch bb
-- join public.bahan_baku b on b.id = bb.bahan_hasil_id
-- where bb.qty_hasil is null;

-- PostgREST perlu reload schema cache supaya tabel baru terlihat di API
notify pgrst, 'reload schema';
