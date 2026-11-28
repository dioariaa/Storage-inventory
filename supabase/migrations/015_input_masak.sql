-- ============================================================
-- 015: INPUT MASAK (bahan terpakai & hasil ditentukan kitchen)
-- Jalankan SETELAH 013 & 014.
-- Beda dari 013: 013 pakai BOM otomatis; 015 input manual, bebas,
-- satu batch bisa hasil banyak item dan pemakaian bisa beda tiap hari.
-- ============================================================

create or replace function public.catat_masak(
  p_tanggal    date,
  p_bahan_in   jsonb,  -- [{"id":"uuid","qty":n}, ...]
  p_bahan_out  jsonb,  -- [{"id":"uuid","qty":n}, ...]
  p_catatan    text default null,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      uuid := gen_random_uuid();
  v_out_id  uuid;
  v_in_id   uuid;
  v_saldo   numeric;
  v_nama    text;
  r         record;
begin
  if jsonb_array_length(p_bahan_in) = 0 then
    raise exception 'Minimal satu bahan terpakai';
  end if;
  if jsonb_array_length(p_bahan_out) = 0 then
    raise exception 'Minimal satu hasil masak';
  end if;

  -- Cek dulu: jangan sampai transaksi setengah jalan
  for r in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_bahan_in) e
  loop
    if r.qty is null or r.qty <= 0 then
      raise exception 'Qty bahan terpakai harus lebih dari 0';
    end if;
    select nama into v_nama from public.bahan_baku where id = r.id;
    if v_nama is null then
      raise exception 'Bahan terpakai tidak ditemukan';
    end if;
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    if v_saldo < r.qty then
      raise exception 'Stok % kurang: butuh %, tersedia %', v_nama, r.qty, v_saldo;
    end if;
  end loop;

  for r in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_bahan_out) e
  loop
    if r.qty is null or r.qty <= 0 then
      raise exception 'Qty hasil harus lebih dari 0';
    end if;
    select nama into v_nama from public.bahan_baku
    where id = r.id and jenis = 'BAHAN_PRODUKSI';
    if v_nama is null then
      raise exception 'Hasil masak harus BAHAN_PRODUKSI';
    end if;
  end loop;

  -- OUT: bahan terpakai
  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, catatan, is_posted, posted_at, created_by, produksi_id)
  values
    (p_tanggal, 'OUT', 'PRODUKSI', p_catatan, true, now(), p_created_by, v_id)
  returning id into v_out_id;

  for r in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_bahan_in) e
  loop
    v_saldo := coalesce(public.get_saldo_bahan(r.id), 0);
    insert into public.transaksi_detail
      (transaksi_id, bahan_baku_id, qty, saldo_sebelum, saldo_sesudah)
    values
      (v_out_id, r.id, r.qty, v_saldo, v_saldo - r.qty);
  end loop;

  -- IN: hasil masak (bisa lebih dari satu)
  insert into public.transaksi
    (tgl_transaksi, jenis, sumber, catatan, is_posted, posted_at, created_by, produksi_id)
  values
    (p_tanggal, 'IN', 'PRODUKSI', p_catatan, true, now(), p_created_by, v_id)
  returning id into v_in_id;

  for r in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_bahan_out) e
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

grant execute on function public.catat_masak(date, jsonb, jsonb, text, uuid) to authenticated;

notify pgrst, 'reload schema';
