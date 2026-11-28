-- ============================================================
-- 012: BOM PRODUKSI + LENGKAPI RESEP KITCHEN (dari Kartu Wawancara BOM SOP)
-- Sumber: Downloads/Kartu_Wawancara_BOM_SOP.xlsx (23 processed item + 27 menu)
-- Jalankan SETELAH 001-011. Cek laporan unmatched di bagian paling bawah file.
-- ============================================================

-- 1. Flag jenis bahan: BAHAN_BAKU (mentah/dibeli) | BAHAN_PRODUKSI (hasil olahan)
alter table public.bahan_baku
  add column if not exists jenis text not null default 'BAHAN_BAKU'
  check (jenis in ('BAHAN_BAKU', 'BAHAN_PRODUKSI'));

-- 2. Tabel batch BOM: 1 batch = 1 bahan hasil + N bahan asal
create table if not exists public.bom_batch (
  id             uuid primary key default uuid_generate_v4(),
  bahan_hasil_id uuid not null references public.bahan_baku(id) on delete cascade,
  qty_hasil      numeric(12,3),
  satuan_hasil   text not null default 'GR',
  catatan        text,
  created_at     timestamptz not null default now(),
  unique (bahan_hasil_id)
);
create table if not exists public.bom_batch_detail (
  id            uuid primary key default uuid_generate_v4(),
  batch_id      uuid not null references public.bom_batch(id) on delete cascade,
  bahan_asal_id uuid not null references public.bahan_baku(id) on delete restrict,
  qty_asal      numeric(12,3) not null,
  satuan_asal   text not null default 'GR',
  unique (batch_id, bahan_asal_id)
);
alter table public.bom_batch enable row level security;
alter table public.bom_batch_detail enable row level security;
drop policy if exists "bom_all_auth" on public.bom_batch;
create policy "bom_all_auth" on public.bom_batch for all to authenticated using (true) with check (true);
drop policy if exists "bomd_all_auth" on public.bom_batch_detail;
create policy "bomd_all_auth" on public.bom_batch_detail for all to authenticated using (true) with check (true);

-- 3. BAHAN BARU — BAHAN PRODUKSI (hasil olahan, 21 item)
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'ACAR @50GR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('ACAR @50GR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'AYAM UNGKEP', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('AYAM UNGKEP'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BEBEK UNGKEP', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BEBEK UNGKEP'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BUMBU BAKARAN', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BUMBU BAKARAN'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BUMBU HITAM @50GR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BUMBU HITAM @50GR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BUMBU KUNING', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BUMBU KUNING'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BUMBU PUTIH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BUMBU PUTIH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CHILLI PASTE @250GR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CHILLI PASTE @250GR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'DAGING SUWIR @20GR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('DAGING SUWIR @20GR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'FETTUCINE MATANG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('FETTUCINE MATANG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'GARLIC BREAD', 'PCS', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('GARLIC BREAD'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KECAP NASI GORENG 1180ML', 'ML', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KECAP NASI GORENG 1180ML'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'MIE TELUR MATANG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('MIE TELUR MATANG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'MIE URAI MATANG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('MIE URAI MATANG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'NASI PUTIH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('NASI PUTIH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'PASTE IJO', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('PASTE IJO'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SAMBAL IJO @20GR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SAMBAL IJO @20GR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SAMBAL KECOMBRANG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SAMBAL KECOMBRANG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SANDUNG LAMUR @20GR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SANDUNG LAMUR @20GR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SAUCE BOLOGNAISE @80GR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SAUCE BOLOGNAISE @80GR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SERUNDENG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_PRODUKSI'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SERUNDENG'));

-- 4. BAHAN BARU — BAHAN BAKU (mentah, 78 item)
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'AIR', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('AIR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'ASAM JAWA', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('ASAM JAWA'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'ASAM KANDIS', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('ASAM KANDIS'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'AYAM UTUH', 'EKOR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('AYAM UTUH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BAWANG BOMBAY', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BAWANG BOMBAY'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BAWANG GORENG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BAWANG GORENG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BAWANG MERAH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BAWANG MERAH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BAWANG PUTIH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BAWANG PUTIH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BAY LEAVE', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BAY LEAVE'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BEBEK UTUH', 'EKOR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BEBEK UTUH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BEEF KNORR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BEEF KNORR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BIJI PALA', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BIJI PALA'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BIJI WIJEN', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BIJI WIJEN'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'BLUE BAND', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('BLUE BAND'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CABAI HIJAU TW', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CABAI HIJAU TW'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CABAI MERAH KERITING', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CABAI MERAH KERITING'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CABAI MERAH TW', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CABAI MERAH TW'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CABAI RAWIT HIJAU', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CABAI RAWIT HIJAU'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CABAI RAWIT MERAH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CABAI RAWIT MERAH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CABE GILING', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CABE GILING'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CAKWE', 'PCS', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CAKWE'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CHICKEN KNORR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CHICKEN KNORR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CREAM COOKING', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CREAM COOKING'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'CUKA', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('CUKA'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'DADA FILLET', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('DADA FILLET'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'DAGING SAPI LAMOSIR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('DAGING SAPI LAMOSIR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'DAUN BAWANG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('DAUN BAWANG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'DAUN JERUK', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('DAUN JERUK'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'DAUN SALAM', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('DAUN SALAM'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'EBI', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('EBI'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'EMPING', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('EMPING'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'FERMIPAN', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('FERMIPAN'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'GARAM', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('GARAM'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'JAMUR CHAMPIGNON', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('JAMUR CHAMPIGNON'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KACANG KEDELAI', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KACANG KEDELAI'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KACANG PANJANG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KACANG PANJANG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KACANG TANAH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KACANG TANAH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KECAP ASIN', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KECAP ASIN'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KECAP INGGRIS', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KECAP INGGRIS'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KECAP MANIS', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KECAP MANIS'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KELAPA PARUT', 'BUAH', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KELAPA PARUT'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KEMIRI', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KEMIRI'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KENTANG', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KENTANG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KERUPUK WARNA', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KERUPUK WARNA'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KETUMBAR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KETUMBAR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KOL', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KOL'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KUNYIT', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KUNYIT'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'KUNYIT BUBUK', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('KUNYIT BUBUK'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'LABU SIAM', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('LABU SIAM'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'LADA HITAM', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('LADA HITAM'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'LADA PUTIH BUBUK', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('LADA PUTIH BUBUK'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'LENGKUAS', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('LENGKUAS'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'LIMO', 'PCS', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('LIMO'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'MICIN', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('MICIN'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'MINCE BEEF', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('MINCE BEEF'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'MINYAK GORENG', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('MINYAK GORENG'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'MINYAK SAMIN', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('MINYAK SAMIN'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'ORANGE CHEESE', 'PCS', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('ORANGE CHEESE'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'PAPRIKA HIJAU', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('PAPRIKA HIJAU'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'PAPRIKA KUNING', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('PAPRIKA KUNING'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'PAPRIKA MERAH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('PAPRIKA MERAH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'PARSLEY', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('PARSLEY'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'PEKAK', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('PEKAK'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'ROYCO', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('ROYCO'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SALAD OIL', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SALAD OIL'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SANDUNG LAMUR', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SANDUNG LAMUR'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SAUCE TIRAM', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SAUCE TIRAM'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SAUS TOMAT', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SAUS TOMAT'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SAWI HIJAU', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SAWI HIJAU'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SELEDRI', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SELEDRI'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'SESAME OIL', 'ML', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('SESAME OIL'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'TERASI', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('TERASI'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'TERIGU', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('TERIGU'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'TERONG UNGU', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('TERONG UNGU'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'TOMAT IJO', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('TOMAT IJO'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'TOMAT MERAH', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('TOMAT MERAH'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'TOMATO PASTE', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('TOMATO PASTE'));
insert into public.bahan_baku (nama, satuan, stok_awal, minimum_stok, is_active, division, jenis)
select 'WORTEL', 'GR', 0, 0, true, 'kitchen', 'BAHAN_BAKU'
where not exists (select 1 from public.bahan_baku where lower(nama) = lower('WORTEL'));

-- 5. Update jenis = BAHAN_PRODUKSI untuk bahan olahan yang sudah ada
update public.bahan_baku set jenis = 'BAHAN_PRODUKSI'
where lower(nama) in (lower('AYAM SUIR @20GR'), lower('BUNTUT SAPI @150GR'), lower('NASGOR BUNTUT @30GR'), lower('IGA SAPI @150GR'), lower('IGA SUIR KWETIAU @30GR'), lower('DAGING SAPI SOTO BETAWI @40GR'), lower('DOUGH PIZZA'), lower('RATATOUILLE'), lower('PAHA DUNGDUNG'), lower('SAMBAL BAWANG'), lower('SAMBAL EMPAL'), lower('SAMOSA'), lower('SAUCE CREAM 150ML'), lower('SATE SAPI MARANGGI @200GR/(10 TSK)'), lower('SATE AYAM @200GR (10 TUSUK)'), lower('BEEF BOLOGNAISE @80GR'), lower('TAHU ISI @4PCS'), lower('TAPE GORENG @150GR 4PCS'), lower('TEMPE MENDOAN @3PCS'), lower('IGA NASI GORENG'), lower('JAGUNG CARNEL'), lower('BUMBU KACANG'), lower('BUMBU BEBEK'), lower('KUAH SOTO @200ML'), lower('KUAH SOTO MIE'), lower('RISOL SOTO'), lower('SINGKONG 100GR'), lower('SINGKONG @200GR'), lower('KETUPAT'), lower('UDANG KUPAS'), lower('KECOMBRANG'), lower('RUMPI'), lower('AYAM BERLARIS'), lower('AYAM DADA SLICE @100gr'), lower('AYAM DADU @20GR'), lower('MIX SEAFOOD @30GR'), lower('TUNA CHUNK @30GR'), lower('DAGING KAMBING @50GR'), lower('DAGING KAMBING UTUH'), lower('DAGING SAPI TONGSENG'), lower('SOSIS 40GR'), lower('SMOKE BEEF @20GR'), lower('SMOKED BEEF UTUH'), lower('TELUR AYAM'), lower('PISANG TANDUK'), lower('MOZARELLA FINGER'), lower('MUSHROOM SOUP'), lower('FISH'' N CHIPS @100GR'), lower('FRENCH FRIES @100GR'), lower('FRENCH FRIES @200GR'), lower('POTATO WADGES'), lower('KOREAN SPICY WING @200GR'), lower('MOZARELLA PIZZA'), lower('ACAR @50GR'), lower('AYAM UNGKEP'), lower('BEBEK UNGKEP'), lower('BUMBU BAKARAN'), lower('BUMBU HITAM @50GR'), lower('BUMBU KUNING'), lower('BUMBU PUTIH'), lower('CHILLI PASTE @250GR'), lower('DAGING SUWIR @20GR'), lower('FETTUCINE MATANG'), lower('GARLIC BREAD'), lower('KECAP NASI GORENG 1180ML'), lower('MIE TELUR MATANG'), lower('MIE URAI MATANG'), lower('NASI PUTIH'), lower('PASTE IJO'), lower('SAMBAL IJO @20GR'), lower('SAMBAL KECOMBRANG'), lower('SANDUNG LAMUR @20GR'), lower('SAUCE BOLOGNAISE @80GR'), lower('SERUNDENG'));

-- 6. BOM BATCH (resep produksi per batch, dari kartu wawancara)
insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 23, 'PCS', 'Yield kartu wawancara: 23'
from public.bahan_baku b where lower(b.nama) = lower('RATATOUILLE')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('RATATOUILLE', 'TIMUN', 100, 'GR'),
  ('RATATOUILLE', 'TERONG UNGU', 100, 'GR'),
  ('RATATOUILLE', 'PAPRIKA MERAH', 50, 'GR'),
  ('RATATOUILLE', 'PAPRIKA KUNING', 50, 'GR'),
  ('RATATOUILLE', 'PAPRIKA HIJAU', 50, 'GR'),
  ('RATATOUILLE', 'TOMAT MERAH', 100, 'GR'),
  ('RATATOUILLE', 'BAWANG BOMBAY', 50, 'GR'),
  ('RATATOUILLE', 'TOMATO PASTE', 150, 'GR'),
  ('RATATOUILLE', 'SAUS TOMAT', 100, 'GR'),
  ('RATATOUILLE', 'BAWANG PUTIH', 50, 'GR'),
  ('RATATOUILLE', 'AIR', 1000, 'ML'),
  ('RATATOUILLE', 'CHICKEN KNORR', 50, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 6, 'PCS', 'Yield kartu wawancara: 6'
from public.bahan_baku b where lower(b.nama) = lower('DOUGH PIZZA')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('DOUGH PIZZA', 'TERIGU', 500, 'GR'),
  ('DOUGH PIZZA', 'GARAM', 8, 'GR'),
  ('DOUGH PIZZA', 'GULA PASIR', 8, 'GR'),
  ('DOUGH PIZZA', 'FERMIPAN', 7, 'GR'),
  ('DOUGH PIZZA', 'SALAD OIL', 10, 'ML'),
  ('DOUGH PIZZA', 'AIR', 350, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 82.5, 'PCS', 'Yield kartu wawancara: 80 - 85 PCS'
from public.bahan_baku b where lower(b.nama) = lower('AYAM SUIR @20GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('AYAM SUIR @20GR', 'DADA FILLET', 2000, 'GR'),
  ('AYAM SUIR @20GR', 'BUMBU KUNING', 1000, 'GR'),
  ('AYAM SUIR @20GR', 'BUMBU PUTIH', 1000, 'GR'),
  ('AYAM SUIR @20GR', 'KAYU MANIS', 20, 'GR'),
  ('AYAM SUIR @20GR', 'SEREH', 100, 'GR'),
  ('AYAM SUIR @20GR', 'KAPOLAGA', 10, 'GR'),
  ('AYAM SUIR @20GR', 'PEKAK', 10, 'GR'),
  ('AYAM SUIR @20GR', 'CENGKEH', 10, 'GR'),
  ('AYAM SUIR @20GR', 'DAUN JERUK', 10, 'GR'),
  ('AYAM SUIR @20GR', 'DAUN SALAM', 10, 'GR'),
  ('AYAM SUIR @20GR', 'CHICKEN KNORR', 150, 'GR'),
  ('AYAM SUIR @20GR', 'MICIN', 250, 'GR'),
  ('AYAM SUIR @20GR', 'GARAM', 80, 'GR'),
  ('AYAM SUIR @20GR', 'KETUMBAR', 50, 'GR'),
  ('AYAM SUIR @20GR', 'MINYAK GORENG', 200, 'ML'),
  ('AYAM SUIR @20GR', 'ROYCO', 150, 'GR'),
  ('AYAM SUIR @20GR', 'KUNYIT BUBUK', 50, 'GR'),
  ('AYAM SUIR @20GR', 'AIR', 5000, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

-- SKIP batch SAMBAL KECOMBRANG: semua qty bahan kosong di kartu (lengkapi manual)
insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 22.5, 'PCS', 'Yield kartu wawancara: 22 - 23'
from public.bahan_baku b where lower(b.nama) = lower('SAUCE CREAM 150ML')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('SAUCE CREAM 150ML', 'FRESHMILK DIAMOND / UHT', 3000, 'ML'),
  ('SAUCE CREAM 150ML', 'CREAM COOKING', 1000, 'ML'),
  ('SAUCE CREAM 150ML', 'CHICKEN KNORR', 1000, 'GR'),
  ('SAUCE CREAM 150ML', 'LADA PUTIH BUBUK', 20, 'GR'),
  ('SAUCE CREAM 150ML', 'BAWANG BOMBAY', 50, 'GR'),
  ('SAUCE CREAM 150ML', 'MINYAK GORENG', 30, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 40, 'PCS', 'Yield kartu wawancara: 40'
from public.bahan_baku b where lower(b.nama) = lower('GARLIC BREAD')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('GARLIC BREAD', 'ROTI BAGUETTE', 2, 'PCS'),
  ('GARLIC BREAD', 'BAWANG PUTIH', 20, 'GR'),
  ('GARLIC BREAD', 'PARSLEY', 1, 'GR'),
  ('GARLIC BREAD', 'BLUE BAND', 60, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 17, 'PCS', 'Yield kartu wawancara: 17'
from public.bahan_baku b where lower(b.nama) = lower('SAUCE BOLOGNAISE @80GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('SAUCE BOLOGNAISE @80GR', 'MINCE BEEF', 1000, 'GR'),
  ('SAUCE BOLOGNAISE @80GR', 'TOMATO PASTE', 150, 'GR'),
  ('SAUCE BOLOGNAISE @80GR', 'BAWANG BOMBAY', 50, 'GR'),
  ('SAUCE BOLOGNAISE @80GR', 'BAWANG PUTIH', 20, 'GR'),
  ('SAUCE BOLOGNAISE @80GR', 'TERIGU', 50, 'GR'),
  ('SAUCE BOLOGNAISE @80GR', 'SELEDRI', 50, 'GR'),
  ('SAUCE BOLOGNAISE @80GR', 'GARAM', 10, 'GR'),
  ('SAUCE BOLOGNAISE @80GR', 'BAY LEAVE', 3, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 6750, 'GR', 'Yield kartu wawancara: 40 - 50 POTONG'
from public.bahan_baku b where lower(b.nama) = lower('PAHA DUNGDUNG')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('PAHA DUNGDUNG', 'PAHA DUNGDUNG', 3000, 'GR'),
  ('PAHA DUNGDUNG', 'BUMBU KUNING', 1000, 'GR'),
  ('PAHA DUNGDUNG', 'BUMBU PUTIH', 1000, 'GR'),
  ('PAHA DUNGDUNG', 'KAYU MANIS', 20, 'GR'),
  ('PAHA DUNGDUNG', 'SEREH', 100, 'GR'),
  ('PAHA DUNGDUNG', 'KAPOLAGA', 10, 'GR'),
  ('PAHA DUNGDUNG', 'PEKAK', 10, 'GR'),
  ('PAHA DUNGDUNG', 'CENGKEH', 10, 'GR'),
  ('PAHA DUNGDUNG', 'DAUN JERUK', 10, 'GR'),
  ('PAHA DUNGDUNG', 'DAUN SALAM', 10, 'GR'),
  ('PAHA DUNGDUNG', 'CHICKEN KNORR', 150, 'GR'),
  ('PAHA DUNGDUNG', 'MICIN', 250, 'GR'),
  ('PAHA DUNGDUNG', 'GARAM', 80, 'GR'),
  ('PAHA DUNGDUNG', 'KETUMBAR', 50, 'GR'),
  ('PAHA DUNGDUNG', 'MINYAK GORENG', 200, 'ML'),
  ('PAHA DUNGDUNG', 'ROYCO', 150, 'GR'),
  ('PAHA DUNGDUNG', 'KUNYIT BUBUK', 50, 'GR'),
  ('PAHA DUNGDUNG', 'AIR', 5000, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 1750, 'GR', 'Yield kartu wawancara: 7 PACK'
from public.bahan_baku b where lower(b.nama) = lower('CHILLI PASTE @250GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('CHILLI PASTE @250GR', 'CABAI MERAH TW', 1000, 'GR'),
  ('CHILLI PASTE @250GR', 'CABAI MERAH KERITING', 200, 'GR'),
  ('CHILLI PASTE @250GR', 'BAWANG MERAH', 200, 'GR'),
  ('CHILLI PASTE @250GR', 'BAWANG PUTIH', 20, 'GR'),
  ('CHILLI PASTE @250GR', 'EBI', 30, 'GR'),
  ('CHILLI PASTE @250GR', 'KACANG TANAH', 50, 'GR'),
  ('CHILLI PASTE @250GR', 'PEKAK', 2, 'GR'),
  ('CHILLI PASTE @250GR', 'KAPOLAGA', 3, 'GR'),
  ('CHILLI PASTE @250GR', 'TERASI', 50, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 3000, 'GR', 'Yield kartu wawancara: 20 POTONG'
from public.bahan_baku b where lower(b.nama) = lower('AYAM UNGKEP')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('AYAM UNGKEP', 'AYAM UTUH', 5, 'EKOR'),
  ('AYAM UNGKEP', 'BEBEK UTUH', 5, 'EKOR'),
  ('AYAM UNGKEP', 'BUMBU KUNING', 1000, 'GR'),
  ('AYAM UNGKEP', 'BUMBU PUTIH', 1000, 'GR'),
  ('AYAM UNGKEP', 'KAYU MANIS', 20, 'GR'),
  ('AYAM UNGKEP', 'SEREH', 100, 'GR'),
  ('AYAM UNGKEP', 'KAPOLAGA', 10, 'GR'),
  ('AYAM UNGKEP', 'PEKAK', 10, 'GR'),
  ('AYAM UNGKEP', 'CENGKEH', 10, 'GR'),
  ('AYAM UNGKEP', 'DAUN JERUK', 10, 'GR'),
  ('AYAM UNGKEP', 'DAUN SALAM', 10, 'GR'),
  ('AYAM UNGKEP', 'CHICKEN KNORR', 150, 'GR'),
  ('AYAM UNGKEP', 'MICIN', 250, 'GR'),
  ('AYAM UNGKEP', 'GARAM', 80, 'GR'),
  ('AYAM UNGKEP', 'KETUMBAR', 50, 'GR'),
  ('AYAM UNGKEP', 'MINYAK GORENG', 200, 'ML'),
  ('AYAM UNGKEP', 'ROYCO', 150, 'GR'),
  ('AYAM UNGKEP', 'KUNYIT BUBUK', 50, 'GR'),
  ('AYAM UNGKEP', 'AIR', 5000, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 3000, 'GR', 'Yield kartu wawancara: 20 POTONG'
from public.bahan_baku b where lower(b.nama) = lower('BEBEK UNGKEP')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('BEBEK UNGKEP', 'BUMBU KUNING', 1000, 'GR'),
  ('BEBEK UNGKEP', 'BUMBU PUTIH', 1000, 'GR'),
  ('BEBEK UNGKEP', 'KAYU MANIS', 20, 'GR'),
  ('BEBEK UNGKEP', 'SEREH', 100, 'GR'),
  ('BEBEK UNGKEP', 'KAPOLAGA', 10, 'GR'),
  ('BEBEK UNGKEP', 'PEKAK', 10, 'GR'),
  ('BEBEK UNGKEP', 'CENGKEH', 10, 'GR'),
  ('BEBEK UNGKEP', 'DAUN JERUK', 10, 'GR'),
  ('BEBEK UNGKEP', 'DAUN SALAM', 10, 'GR'),
  ('BEBEK UNGKEP', 'CHICKEN KNORR', 150, 'GR'),
  ('BEBEK UNGKEP', 'MICIN', 250, 'GR'),
  ('BEBEK UNGKEP', 'GARAM', 80, 'GR'),
  ('BEBEK UNGKEP', 'KETUMBAR', 50, 'GR'),
  ('BEBEK UNGKEP', 'MINYAK GORENG', 200, 'ML'),
  ('BEBEK UNGKEP', 'ROYCO', 150, 'GR'),
  ('BEBEK UNGKEP', 'KUNYIT BUBUK', 50, 'GR'),
  ('BEBEK UNGKEP', 'AIR', 5000, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 90, 'PCS', 'Yield kartu wawancara: 90 PACK'
from public.bahan_baku b where lower(b.nama) = lower('SAMBAL BAWANG')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('SAMBAL BAWANG', 'CABAI RAWIT MERAH', 1000, 'GR'),
  ('SAMBAL BAWANG', 'BAWANG MERAH', 200, 'GR'),
  ('SAMBAL BAWANG', 'BAWANG PUTIH', 200, 'GR'),
  ('SAMBAL BAWANG', 'CHICKEN KNORR', 20, 'GR'),
  ('SAMBAL BAWANG', 'MICIN', 30, 'GR'),
  ('SAMBAL BAWANG', 'GULA PASIR', 50, 'GR'),
  ('SAMBAL BAWANG', 'GARAM', 10, 'GR'),
  ('SAMBAL BAWANG', 'MINYAK GORENG', 300, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 1350, 'GR', 'Yield kartu wawancara: 1350 GR'
from public.bahan_baku b where lower(b.nama) = lower('BUMBU BAKARAN')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('BUMBU BAKARAN', 'BUMBU KUNING', 200, 'GR'),
  ('BUMBU BAKARAN', 'KECAP MANIS', 1000, 'ML'),
  ('BUMBU BAKARAN', 'BUMBU PUTIH', 100, 'GR'),
  ('BUMBU BAKARAN', 'KETUMBAR', 50, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 33, 'PCS', 'Yield kartu wawancara: 33 PCS'
from public.bahan_baku b where lower(b.nama) = lower('BUMBU HITAM @50GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('BUMBU HITAM @50GR', 'KELAPA PARUT', 2, 'BUAH'),
  ('BUMBU HITAM @50GR', 'BUMBU KUNING', 250, 'GR'),
  ('BUMBU HITAM @50GR', 'BUMBU PUTIH', 250, 'GR'),
  ('BUMBU HITAM @50GR', 'DAUN JERUK', 7, 'GR'),
  ('BUMBU HITAM @50GR', 'DAUN SALAM', 7, 'GR'),
  ('BUMBU HITAM @50GR', 'SEREH', 4, 'GR'),
  ('BUMBU HITAM @50GR', 'ASAM JAWA', 20, 'GR'),
  ('BUMBU HITAM @50GR', 'CHICKEN KNORR', 50, 'GR'),
  ('BUMBU HITAM @50GR', 'GARAM', 20, 'GR'),
  ('BUMBU HITAM @50GR', 'GULA PASIR', 10, 'GR'),
  ('BUMBU HITAM @50GR', 'MICIN', 40, 'GR'),
  ('BUMBU HITAM @50GR', 'AIR', 500, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 38, 'PCS', 'Yield kartu wawancara: 38 PCS'
from public.bahan_baku b where lower(b.nama) = lower('SAMBAL IJO @20GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('SAMBAL IJO @20GR', 'CABAI RAWIT HIJAU', 500, 'GR'),
  ('SAMBAL IJO @20GR', 'BAWANG PUTIH', 50, 'GR'),
  ('SAMBAL IJO @20GR', 'GARAM', 20, 'GR'),
  ('SAMBAL IJO @20GR', 'CHICKEN KNORR', 10, 'GR'),
  ('SAMBAL IJO @20GR', 'MINYAK GORENG', 200, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, null, 'GR', 'Yield kartu wawancara: DAGING SAPI 1,5 KG SANDUNG LAMUR 500GR'
from public.bahan_baku b where lower(b.nama) = lower('DAGING SAPI SOTO BETAWI @40GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('DAGING SAPI SOTO BETAWI @40GR', 'DAGING SAPI LAMOSIR', 3000, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'SANDUNG LAMUR', 1000, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'BUMBU KUNING', 300, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'BUMBU PUTIH', 200, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'CABE GILING', 100, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'SEREH', 50, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'DAUN JERUK', 5, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'DAUN SALAM', 5, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'KAPOLAGA', 10, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'CENGKEH', 10, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'PEKAK', 10, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'ROYCO', 100, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'GARAM', 20, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'MICIN', 200, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'GULA PASIR', 100, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'BIJI PALA', 1, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'SANTAN KARA', 1000, 'ML'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'FRESHMILK DIAMOND / UHT', 1000, 'ML'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'MINYAK SAMIN', 100, 'ML'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'MINYAK GORENG', 100, 'ML'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'KAYU MANIS', 20, 'GR'),
  ('DAGING SAPI SOTO BETAWI @40GR', 'AIR', 6000, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, null, 'GR', 'Yield kartu wawancara'
from public.bahan_baku b where lower(b.nama) = lower('BUMBU KUNING')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('BUMBU KUNING', 'KUNYIT', 300, 'GR'),
  ('BUMBU KUNING', 'JAHE', 200, 'GR'),
  ('BUMBU KUNING', 'LENGKUAS', 600, 'GR'),
  ('BUMBU KUNING', 'BAWANG PUTIH', 100, 'GR'),
  ('BUMBU KUNING', 'BAWANG MERAH', 100, 'GR'),
  ('BUMBU KUNING', 'KAPOLAGA', 5, 'GR'),
  ('BUMBU KUNING', 'CENGKEH', 5, 'GR'),
  ('BUMBU KUNING', 'PEKAK', 5, 'GR'),
  ('BUMBU KUNING', 'KETUMBAR', 50, 'GR'),
  ('BUMBU KUNING', 'SEREH', 100, 'GR'),
  ('BUMBU KUNING', 'DAUN JERUK', 5, 'GR'),
  ('BUMBU KUNING', 'DAUN SALAM', 5, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, null, 'GR', 'Yield kartu wawancara'
from public.bahan_baku b where lower(b.nama) = lower('BUMBU PUTIH')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('BUMBU PUTIH', 'JAHE', 200, 'GR'),
  ('BUMBU PUTIH', 'LENGKUAS', 600, 'GR'),
  ('BUMBU PUTIH', 'BAWANG PUTIH', 100, 'GR'),
  ('BUMBU PUTIH', 'BAWANG MERAH', 200, 'GR'),
  ('BUMBU PUTIH', 'KAPOLAGA', 5, 'GR'),
  ('BUMBU PUTIH', 'KEMIRI', 50, 'GR'),
  ('BUMBU PUTIH', 'SEREH', 100, 'GR'),
  ('BUMBU PUTIH', 'DAUN JERUK', 5, 'GR'),
  ('BUMBU PUTIH', 'DAUN SALAM', 5, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, null, 'GR', 'Yield kartu wawancara'
from public.bahan_baku b where lower(b.nama) = lower('ACAR @50GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('ACAR @50GR', 'TIMUN', 1000, 'GR'),
  ('ACAR @50GR', 'WORTEL', 500, 'GR'),
  ('ACAR @50GR', 'CABAI RAWIT HIJAU', 30, 'GR'),
  ('ACAR @50GR', 'BAWANG MERAH', 20, 'GR'),
  ('ACAR @50GR', 'CUKA', 100, 'ML'),
  ('ACAR @50GR', 'GULA PASIR', 50, 'GR'),
  ('ACAR @50GR', 'GARAM', 30, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, null, 'GR', 'Yield kartu wawancara'
from public.bahan_baku b where lower(b.nama) = lower('KECAP NASI GORENG 1180ML')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('KECAP NASI GORENG 1180ML', 'KECAP MANIS', 1000, 'ML'),
  ('KECAP NASI GORENG 1180ML', 'SAUCE TIRAM', 100, 'ML'),
  ('KECAP NASI GORENG 1180ML', 'SESAME OIL', 50, 'ML'),
  ('KECAP NASI GORENG 1180ML', 'KECAP INGGRIS', 30, 'ML')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 3250, 'GR', 'Yield kartu wawancara: 3 - 3,5 KG'
from public.bahan_baku b where lower(b.nama) = lower('BUNTUT SAPI @150GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('BUNTUT SAPI @150GR', 'BUNTUT SAPI @150GR', 5000, 'GR'),
  ('BUNTUT SAPI @150GR', 'SELEDRI', 100, 'GR'),
  ('BUNTUT SAPI @150GR', 'WORTEL', 30, 'GR'),
  ('BUNTUT SAPI @150GR', 'DAUN BAWANG', 50, 'GR'),
  ('BUNTUT SAPI @150GR', 'CENGKEH', 30, 'GR'),
  ('BUNTUT SAPI @150GR', 'KAPOLAGA', 30, 'GR'),
  ('BUNTUT SAPI @150GR', 'PEKAK', 30, 'GR'),
  ('BUNTUT SAPI @150GR', 'SEREH', 30, 'GR'),
  ('BUNTUT SAPI @150GR', 'BAWANG MERAH', 100, 'GR'),
  ('BUNTUT SAPI @150GR', 'BAWANG PUTIH', 100, 'GR'),
  ('BUNTUT SAPI @150GR', 'LENGKUAS', 200, 'GR'),
  ('BUNTUT SAPI @150GR', 'JAHE', 200, 'GR'),
  ('BUNTUT SAPI @150GR', 'DAUN JERUK', 5, 'GR'),
  ('BUNTUT SAPI @150GR', 'DAUN SALAM', 5, 'GR'),
  ('BUNTUT SAPI @150GR', 'BIJI PALA', 20, 'GR'),
  ('BUNTUT SAPI @150GR', 'KAYU MANIS', 50, 'GR'),
  ('BUNTUT SAPI @150GR', 'BEEF KNORR', 150, 'GR'),
  ('BUNTUT SAPI @150GR', 'MICIN', 200, 'GR'),
  ('BUNTUT SAPI @150GR', 'GARAM', 100, 'GR'),
  ('BUNTUT SAPI @150GR', 'LADA HITAM', 20, 'GR'),
  ('BUNTUT SAPI @150GR', 'CABAI MERAH TW', 50, 'GR'),
  ('BUNTUT SAPI @150GR', 'MINYAK GORENG', 100, 'ML'),
  ('BUNTUT SAPI @150GR', 'AIR', 8000, 'ML'),
  ('BUNTUT SAPI @150GR', 'LADA PUTIH BUBUK', 10, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, 3250, 'GR', 'Yield kartu wawancara: 3 - 3,5 KG'
from public.bahan_baku b where lower(b.nama) = lower('IGA SAPI @150GR')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('IGA SAPI @150GR', 'IGA SAPI @150GR', 5000, 'GR'),
  ('IGA SAPI @150GR', 'SELEDRI', 100, 'GR'),
  ('IGA SAPI @150GR', 'WORTEL', 30, 'GR'),
  ('IGA SAPI @150GR', 'DAUN BAWANG', 50, 'GR'),
  ('IGA SAPI @150GR', 'CENGKEH', 30, 'GR'),
  ('IGA SAPI @150GR', 'KAPOLAGA', 30, 'GR'),
  ('IGA SAPI @150GR', 'PEKAK', 30, 'GR'),
  ('IGA SAPI @150GR', 'SEREH', 30, 'GR'),
  ('IGA SAPI @150GR', 'BAWANG MERAH', 100, 'GR'),
  ('IGA SAPI @150GR', 'BAWANG PUTIH', 100, 'GR'),
  ('IGA SAPI @150GR', 'LENGKUAS', 200, 'GR'),
  ('IGA SAPI @150GR', 'JAHE', 200, 'GR'),
  ('IGA SAPI @150GR', 'DAUN JERUK', 5, 'GR'),
  ('IGA SAPI @150GR', 'DAUN SALAM', 5, 'GR'),
  ('IGA SAPI @150GR', 'BIJI PALA', 20, 'GR'),
  ('IGA SAPI @150GR', 'KAYU MANIS', 50, 'GR'),
  ('IGA SAPI @150GR', 'BEEF KNORR', 150, 'GR'),
  ('IGA SAPI @150GR', 'MICIN', 200, 'GR'),
  ('IGA SAPI @150GR', 'GARAM', 100, 'GR'),
  ('IGA SAPI @150GR', 'LADA HITAM', 20, 'GR'),
  ('IGA SAPI @150GR', 'CABAI MERAH TW', 50, 'GR'),
  ('IGA SAPI @150GR', 'MINYAK GORENG', 100, 'ML'),
  ('IGA SAPI @150GR', 'AIR', 8000, 'ML'),
  ('IGA SAPI @150GR', 'LADA PUTIH BUBUK', 10, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, null, 'GR', 'Yield kartu wawancara'
from public.bahan_baku b where lower(b.nama) = lower('PASTE IJO')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('PASTE IJO', 'CABAI HIJAU TW', 1000, 'GR'),
  ('PASTE IJO', 'DAUN JERUK', 5, 'GR'),
  ('PASTE IJO', 'BAWANG MERAH', 100, 'GR'),
  ('PASTE IJO', 'BAWANG PUTIH', 50, 'GR'),
  ('PASTE IJO', 'DAUN SALAM', 5, 'GR'),
  ('PASTE IJO', 'SEREH', 50, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

insert into public.bom_batch (bahan_hasil_id, qty_hasil, satuan_hasil, catatan)
select b.id, null, 'GR', 'Yield kartu wawancara'
from public.bahan_baku b where lower(b.nama) = lower('SERUNDENG')
and not exists (select 1 from public.bom_batch bb where bb.bahan_hasil_id = b.id);
insert into public.bom_batch_detail (batch_id, bahan_asal_id, qty_asal, satuan_asal)
select bb.id, a.id, v.qty, v.sat
from (values
  ('SERUNDENG', 'KELAPA PARUT', 2, 'BUAH'),
  ('SERUNDENG', 'MINYAK GORENG', 1000, 'ML'),
  ('SERUNDENG', 'GARAM', 200, 'GR'),
  ('SERUNDENG', 'CHICKEN KNORR', 200, 'GR')
) as v(hasil, asal, qty, sat)
join public.bom_batch bb on bb.bahan_hasil_id = (select id from public.bahan_baku where lower(nama) = lower(v.hasil))
join public.bahan_baku a on lower(a.nama) = lower(v.asal)
on conflict (batch_id, bahan_asal_id) do update set qty_asal = excluded.qty_asal, satuan_asal = excluded.satuan_asal;

-- 7. MENU BARU (7)
insert into public.menu (nama, kategori, is_active, division)
select 'PIZZA 4 PORSI', 'AGUSTUSAN', true, 'kitchen'
where not exists (select 1 from public.menu where lower(nama) = lower('PIZZA 4 PORSI'));
insert into public.menu (nama, kategori, is_active, division)
select 'PIZZA CHICKEN', 'Makanan', true, 'kitchen'
where not exists (select 1 from public.menu where lower(nama) = lower('PIZZA CHICKEN'));
insert into public.menu (nama, kategori, is_active, division)
select 'RICE BOWL KECOMBRANG', 'RICE BOWL', true, 'kitchen'
where not exists (select 1 from public.menu where lower(nama) = lower('RICE BOWL KECOMBRANG'));
insert into public.menu (nama, kategori, is_active, division)
select 'RICE BOWL AYAM SOSIS', 'RICE BOWL', true, 'kitchen'
where not exists (select 1 from public.menu where lower(nama) = lower('RICE BOWL AYAM SOSIS'));
insert into public.menu (nama, kategori, is_active, division)
select 'NACHOS', 'Makanan', true, 'kitchen'
where not exists (select 1 from public.menu where lower(nama) = lower('NACHOS'));
insert into public.menu (nama, kategori, is_active, division)
select 'EMPAL IGA SERUNDENG', 'NASI', true, 'kitchen'
where not exists (select 1 from public.menu where lower(nama) = lower('EMPAL IGA SERUNDENG'));
insert into public.menu (nama, kategori, is_active, division)
select 'IGA GARANG ASAM', 'SOP', true, 'kitchen'
where not exists (select 1 from public.menu where lower(nama) = lower('IGA GARANG ASAM'));

-- 8. RESEP MENU (qty per 1 porsi; PACK @N => N GR; POTONG => 150 GR; SDT=>5, SDM=>15)
insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('PIZZA 4 PORSI', 'TERIGU', 250),
  ('PIZZA 4 PORSI', 'GULA PASIR', 5),
  ('PIZZA 4 PORSI', 'GARAM', 1),
  ('PIZZA 4 PORSI', 'FERMIPAN', 6),
  ('PIZZA 4 PORSI', 'SOSIS BRATWURSE (HANZEL) 5PCS/PACK', 2),
  ('PIZZA 4 PORSI', 'RATATOUILLE', 4)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Pizza Smoke Beef', 'DOUGH PIZZA', 1),
  ('Pizza Smoke Beef', 'SMOKE BEEF @20GR', 40),
  ('Pizza Smoke Beef', 'PAPRIKA MERAH', 20),
  ('Pizza Smoke Beef', 'PAPRIKA HIJAU', 20),
  ('Pizza Smoke Beef', 'BAWANG BOMBAY', 20),
  ('Pizza Smoke Beef', 'MOZARELLA PIZZA', 150),
  ('Pizza Smoke Beef', 'RATATOUILLE', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Pizza Bolognaise', 'DOUGH PIZZA', 1),
  ('Pizza Bolognaise', 'SAUCE BOLOGNAISE @80GR', 80),
  ('Pizza Bolognaise', 'BAWANG BOMBAY', 20),
  ('Pizza Bolognaise', 'MOZARELLA PIZZA', 150),
  ('Pizza Bolognaise', 'RATATOUILLE', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('PIZZA CHICKEN', 'DOUGH PIZZA', 1),
  ('PIZZA CHICKEN', 'AYAM SUIR @20GR', 20),
  ('PIZZA CHICKEN', 'PAPRIKA KUNING', 20),
  ('PIZZA CHICKEN', 'PAPRIKA HIJAU', 20),
  ('PIZZA CHICKEN', 'BAWANG BOMBAY', 20),
  ('PIZZA CHICKEN', 'MOZARELLA PIZZA', 150),
  ('PIZZA CHICKEN', 'RATATOUILLE', 1),
  ('PIZZA CHICKEN', 'PAPRIKA MERAH', 20)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Bubur Ayam Peranakan', 'AYAM SUIR @20GR', 20),
  ('Bubur Ayam Peranakan', 'NASI PUTIH', 200),
  ('Bubur Ayam Peranakan', 'CAKWE', 1),
  ('Bubur Ayam Peranakan', 'KACANG KEDELAI', 10),
  ('Bubur Ayam Peranakan', 'TELUR AYAM', 1),
  ('Bubur Ayam Peranakan', 'DAUN BAWANG', 1),
  ('Bubur Ayam Peranakan', 'BAWANG GORENG', 1),
  ('Bubur Ayam Peranakan', 'KERUPUK WARNA', 5),
  ('Bubur Ayam Peranakan', 'SAMBAL BAWANG', 1),
  ('Bubur Ayam Peranakan', 'KECAP ASIN', 10)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('RICE BOWL KECOMBRANG', 'AYAM SUIR @20GR', 20),
  ('RICE BOWL KECOMBRANG', 'NASI PUTIH', 200),
  ('RICE BOWL KECOMBRANG', 'SAMBAL KECOMBRANG', 10),
  ('RICE BOWL KECOMBRANG', 'TIMUN', 1),
  ('RICE BOWL KECOMBRANG', 'TOMAT MERAH', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Mie Goreng Ayam', 'AYAM SUIR @20GR', 20),
  ('Mie Goreng Ayam', 'MIE TELUR MATANG', 130),
  ('Mie Goreng Ayam', 'CHILLI PASTE @250GR', 20),
  ('Mie Goreng Ayam', 'SAWI HIJAU', 2),
  ('Mie Goreng Ayam', 'WORTEL', 2),
  ('Mie Goreng Ayam', 'KOL', 2),
  ('Mie Goreng Ayam', 'DAUN BAWANG', 1),
  ('Mie Goreng Ayam', 'BAWANG GORENG', 1),
  ('Mie Goreng Ayam', 'EMPING', 5),
  ('Mie Goreng Ayam', 'TOMAT MERAH', 1),
  ('Mie Goreng Ayam', 'TIMUN', 1),
  ('Mie Goreng Ayam', 'ACAR @50GR', 2)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('RICE BOWL AYAM SOSIS', 'AYAM SUIR @20GR', 20),
  ('RICE BOWL AYAM SOSIS', 'NASI PUTIH', 200),
  ('RICE BOWL AYAM SOSIS', 'SOSIS 40GR', 20),
  ('RICE BOWL AYAM SOSIS', 'TIMUN', 1),
  ('RICE BOWL AYAM SOSIS', 'TOMAT MERAH', 1),
  ('RICE BOWL AYAM SOSIS', 'SAUS TOMAT', 2),
  ('RICE BOWL AYAM SOSIS', 'SESAME OIL', 5),
  ('RICE BOWL AYAM SOSIS', 'KECAP INGGRIS', 5),
  ('RICE BOWL AYAM SOSIS', 'BIJI WIJEN', 0.1),
  ('RICE BOWL AYAM SOSIS', 'TELUR AYAM', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Mie Nyemek', 'AYAM SUIR @20GR', 20),
  ('Mie Nyemek', 'MIE URAI MATANG', 100),
  ('Mie Nyemek', 'CHILLI PASTE @250GR', 20),
  ('Mie Nyemek', 'SAWI HIJAU', 2),
  ('Mie Nyemek', 'WORTEL', 2),
  ('Mie Nyemek', 'KOL', 2),
  ('Mie Nyemek', 'DAUN BAWANG', 1),
  ('Mie Nyemek', 'BAWANG GORENG', 1),
  ('Mie Nyemek', 'EMPING', 5),
  ('Mie Nyemek', 'TOMAT MERAH', 1),
  ('Mie Nyemek', 'TIMUN', 1),
  ('Mie Nyemek', 'ACAR @50GR', 2)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Fettuccine Carbonara', 'SAUCE CREAM 150ML', 1),
  ('Fettuccine Carbonara', 'FETTUCINE MATANG', 130),
  ('Fettuccine Carbonara', 'TELUR AYAM', 1),
  ('Fettuccine Carbonara', 'JAMUR CHAMPIGNON', 5),
  ('Fettuccine Carbonara', 'SMOKE BEEF @20GR', 20),
  ('Fettuccine Carbonara', 'GARLIC BREAD', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Macaroni and Cheese', 'AYAM DADU @20GR', 20),
  ('Macaroni and Cheese', 'SAUCE CREAM 150ML', 1),
  ('Macaroni and Cheese', 'MACARONI ELBOW @130GR', 130),
  ('Macaroni and Cheese', 'JAMUR CHAMPIGNON', 5),
  ('Macaroni and Cheese', 'SMOKE BEEF @20GR', 20),
  ('Macaroni and Cheese', 'MOZARELLA PIZZA', 10),
  ('Macaroni and Cheese', 'GARLIC BREAD', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Spaghetti Bolognaise', 'SPAGHETTI @130GR', 130),
  ('Spaghetti Bolognaise', 'SAUCE BOLOGNAISE @80GR', 80),
  ('Spaghetti Bolognaise', 'GARLIC BREAD', 1),
  ('Spaghetti Bolognaise', 'SAUS TOMAT', 100)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('NACHOS', 'KULIT CORN TORTILA', 40),
  ('NACHOS', 'RATATOUILLE', 1),
  ('NACHOS', 'SAUCE BOLOGNAISE @80GR', 80),
  ('NACHOS', 'TOMAT MERAH', 1),
  ('NACHOS', 'DAUN BAWANG', 1),
  ('NACHOS', 'ORANGE CHEESE', 1),
  ('NACHOS', 'MOZARELLA PIZZA', 20)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Nasi Goreng Babe', 'PAHA DUNGDUNG', 150),
  ('Nasi Goreng Babe', 'NASI PUTIH', 200),
  ('Nasi Goreng Babe', 'SERUNDENG', 2),
  ('Nasi Goreng Babe', 'TIMUN', 1),
  ('Nasi Goreng Babe', 'TOMAT MERAH', 1),
  ('Nasi Goreng Babe', 'ACAR @50GR', 2),
  ('Nasi Goreng Babe', 'CHILLI PASTE @250GR', 20),
  ('Nasi Goreng Babe', 'BAWANG GORENG', 1),
  ('Nasi Goreng Babe', 'AYAM SUIR @20GR', 20),
  ('Nasi Goreng Babe', 'TELUR AYAM', 2),
  ('Nasi Goreng Babe', 'SAWI HIJAU', 2),
  ('Nasi Goreng Babe', 'WORTEL', 2),
  ('Nasi Goreng Babe', 'KOL', 2),
  ('Nasi Goreng Babe', 'DAUN BAWANG', 1),
  ('Nasi Goreng Babe', 'CHICKEN KNORR', 2.5),
  ('Nasi Goreng Babe', 'GARAM', 1.25),
  ('Nasi Goreng Babe', 'KECAP NASI GORENG 1180ML', 20)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Lontong Sayur Mpok', 'PAHA DUNGDUNG', 150),
  ('Lontong Sayur Mpok', 'KETUPAT', 1),
  ('Lontong Sayur Mpok', 'KUAH SOTO @200ML', 200),
  ('Lontong Sayur Mpok', 'CHILLI PASTE @250GR', 20),
  ('Lontong Sayur Mpok', 'KACANG PANJANG', 1),
  ('Lontong Sayur Mpok', 'LABU SIAM', 1),
  ('Lontong Sayur Mpok', 'TELUR AYAM', 1),
  ('Lontong Sayur Mpok', 'KERUPUK WARNA', 10),
  ('Lontong Sayur Mpok', 'SAMBAL BAWANG', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Ayam Goreng Berlaris', 'AYAM UNGKEP', 150),
  ('Ayam Goreng Berlaris', 'NASI PUTIH', 200),
  ('Ayam Goreng Berlaris', 'SERUNDENG', 2),
  ('Ayam Goreng Berlaris', 'TIMUN', 1),
  ('Ayam Goreng Berlaris', 'TOMAT MERAH', 1),
  ('Ayam Goreng Berlaris', 'ACAR @50GR', 2),
  ('Ayam Goreng Berlaris', 'SAMBAL BAWANG', 1),
  ('Ayam Goreng Berlaris', 'BAWANG GORENG', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Ayam Bakar Berlaris', 'AYAM UNGKEP', 150),
  ('Ayam Bakar Berlaris', 'NASI PUTIH', 200),
  ('Ayam Bakar Berlaris', 'SERUNDENG', 2),
  ('Ayam Bakar Berlaris', 'TIMUN', 1),
  ('Ayam Bakar Berlaris', 'TOMAT MERAH', 1),
  ('Ayam Bakar Berlaris', 'ACAR @50GR', 2),
  ('Ayam Bakar Berlaris', 'SAMBAL BAWANG', 1),
  ('Ayam Bakar Berlaris', 'BAWANG GORENG', 1),
  ('Ayam Bakar Berlaris', 'BUMBU BAKARAN', 5)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Bebek Bumbu Hitam', 'BEBEK UNGKEP', 150),
  ('Bebek Bumbu Hitam', 'NASI PUTIH', 200),
  ('Bebek Bumbu Hitam', 'SERUNDENG', 2),
  ('Bebek Bumbu Hitam', 'TIMUN', 1),
  ('Bebek Bumbu Hitam', 'TOMAT MERAH', 1),
  ('Bebek Bumbu Hitam', 'ACAR @50GR', 2),
  ('Bebek Bumbu Hitam', 'SAMBAL BAWANG', 1),
  ('Bebek Bumbu Hitam', 'BAWANG GORENG', 1),
  ('Bebek Bumbu Hitam', 'BUMBU HITAM @50GR', 5),
  ('Bebek Bumbu Hitam', 'SAMBAL IJO @20GR', 20)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Soto Betawi', 'DAGING SAPI SOTO BETAWI @40GR', 40),
  ('Soto Betawi', 'SANDUNG LAMUR @20GR', 20),
  ('Soto Betawi', 'KUAH SOTO @200ML', 200),
  ('Soto Betawi', 'KENTANG', 5),
  ('Soto Betawi', 'TOMAT MERAH', 5),
  ('Soto Betawi', 'DAUN BAWANG', 1),
  ('Soto Betawi', 'BAWANG GORENG', 1),
  ('Soto Betawi', 'NASI PUTIH', 200),
  ('Soto Betawi', 'EMPING', 2),
  ('Soto Betawi', 'ACAR @50GR', 5),
  ('Soto Betawi', 'LIMO', 1)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Tongseng Sapi', 'DAGING SAPI SOTO BETAWI @40GR', 40),
  ('Tongseng Sapi', 'KUAH SOTO @200ML', 200),
  ('Tongseng Sapi', 'KOL', 2),
  ('Tongseng Sapi', 'TOMAT MERAH', 5),
  ('Tongseng Sapi', 'DAUN BAWANG', 1),
  ('Tongseng Sapi', 'BAWANG GORENG', 1),
  ('Tongseng Sapi', 'NASI PUTIH', 200),
  ('Tongseng Sapi', 'EMPING', 2),
  ('Tongseng Sapi', 'ACAR @50GR', 5),
  ('Tongseng Sapi', 'LIMO', 1),
  ('Tongseng Sapi', 'KECAP MANIS', 2)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Kwetiauw Sapi', 'DAGING SUWIR @20GR', 20),
  ('Kwetiauw Sapi', 'KWETIAW @130GR', 150),
  ('Kwetiauw Sapi', 'KOL', 2),
  ('Kwetiauw Sapi', 'TOMAT MERAH', 1),
  ('Kwetiauw Sapi', 'DAUN BAWANG', 1),
  ('Kwetiauw Sapi', 'BAWANG GORENG', 1),
  ('Kwetiauw Sapi', 'SAWI HIJAU', 2),
  ('Kwetiauw Sapi', 'KERUPUK WARNA', 2),
  ('Kwetiauw Sapi', 'ACAR @50GR', 5),
  ('Kwetiauw Sapi', 'TIMUN', 1),
  ('Kwetiauw Sapi', 'KECAP NASI GORENG 1180ML', 2),
  ('Kwetiauw Sapi', 'WORTEL', 2)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Nasi Goreng Buntut', 'NASGOR BUNTUT @30GR', 30),
  ('Nasi Goreng Buntut', 'NASI PUTIH', 200),
  ('Nasi Goreng Buntut', 'WORTEL', 5),
  ('Nasi Goreng Buntut', 'BAWANG GORENG', 1),
  ('Nasi Goreng Buntut', 'DAUN BAWANG', 1),
  ('Nasi Goreng Buntut', 'ACAR @50GR', 5),
  ('Nasi Goreng Buntut', 'TOMAT MERAH', 1),
  ('Nasi Goreng Buntut', 'TIMUN', 1),
  ('Nasi Goreng Buntut', 'EMPING', 2),
  ('Nasi Goreng Buntut', 'GARAM', 1.25),
  ('Nasi Goreng Buntut', 'CHICKEN KNORR', 1.25),
  ('Nasi Goreng Buntut', 'MICIN', 1.25),
  ('Nasi Goreng Buntut', 'SAUCE TIRAM', 1.25)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Sop Buntut', 'BUNTUT SAPI @150GR', 150),
  ('Sop Buntut', 'NASI PUTIH', 200),
  ('Sop Buntut', 'WORTEL', 5),
  ('Sop Buntut', 'BAWANG GORENG', 1),
  ('Sop Buntut', 'DAUN BAWANG', 1),
  ('Sop Buntut', 'ACAR @50GR', 5),
  ('Sop Buntut', 'TOMAT MERAH', 2),
  ('Sop Buntut', 'TIMUN', 1),
  ('Sop Buntut', 'EMPING', 2),
  ('Sop Buntut', 'KUAH SOTO @200ML', 200),
  ('Sop Buntut', 'KENTANG', 5)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Nasi Goreng Iga', 'IGA SUIR KWETIAU @30GR', 30),
  ('Nasi Goreng Iga', 'NASI PUTIH', 200),
  ('Nasi Goreng Iga', 'PASTE IJO', 5),
  ('Nasi Goreng Iga', 'BAWANG GORENG', 1),
  ('Nasi Goreng Iga', 'DAUN BAWANG', 1),
  ('Nasi Goreng Iga', 'ACAR @50GR', 5),
  ('Nasi Goreng Iga', 'TOMAT MERAH', 1),
  ('Nasi Goreng Iga', 'TIMUN', 1),
  ('Nasi Goreng Iga', 'EMPING', 2),
  ('Nasi Goreng Iga', 'GARAM', 1.25),
  ('Nasi Goreng Iga', 'CHICKEN KNORR', 1.25),
  ('Nasi Goreng Iga', 'MICIN', 1.25),
  ('Nasi Goreng Iga', 'KECAP INGGRIS', 5),
  ('Nasi Goreng Iga', 'SESAME OIL', 5)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('Sop Iga', 'IGA SAPI @150GR', 150),
  ('Sop Iga', 'NASI PUTIH', 200),
  ('Sop Iga', 'WORTEL', 5),
  ('Sop Iga', 'BAWANG GORENG', 1),
  ('Sop Iga', 'DAUN BAWANG', 1),
  ('Sop Iga', 'ACAR @50GR', 5),
  ('Sop Iga', 'TOMAT MERAH', 2),
  ('Sop Iga', 'TIMUN', 1),
  ('Sop Iga', 'EMPING', 2),
  ('Sop Iga', 'KUAH SOTO @200ML', 200),
  ('Sop Iga', 'KENTANG', 5)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('EMPAL IGA SERUNDENG', 'IGA SAPI @150GR', 150),
  ('EMPAL IGA SERUNDENG', 'NASI PUTIH', 200),
  ('EMPAL IGA SERUNDENG', 'WORTEL', 5),
  ('EMPAL IGA SERUNDENG', 'BAWANG GORENG', 1),
  ('EMPAL IGA SERUNDENG', 'DAUN BAWANG', 1),
  ('EMPAL IGA SERUNDENG', 'ACAR @50GR', 5),
  ('EMPAL IGA SERUNDENG', 'TOMAT MERAH', 2),
  ('EMPAL IGA SERUNDENG', 'TIMUN', 1),
  ('EMPAL IGA SERUNDENG', 'EMPING', 2),
  ('EMPAL IGA SERUNDENG', 'SERUNDENG', 2),
  ('EMPAL IGA SERUNDENG', 'KOL', 2)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

insert into public.recipe (menu_id, bahan_baku_id, qty)
select mm.id, bb.id, v.qty
from (values
  ('IGA GARANG ASAM', 'IGA SAPI @150GR', 150),
  ('IGA GARANG ASAM', 'NASI PUTIH', 200),
  ('IGA GARANG ASAM', 'WORTEL', 5),
  ('IGA GARANG ASAM', 'BAWANG GORENG', 1),
  ('IGA GARANG ASAM', 'DAUN BAWANG', 1),
  ('IGA GARANG ASAM', 'ACAR @50GR', 5),
  ('IGA GARANG ASAM', 'EMPING', 2),
  ('IGA GARANG ASAM', 'KUAH SOTO @200ML', 200),
  ('IGA GARANG ASAM', 'TOMAT IJO', 5),
  ('IGA GARANG ASAM', 'EBI', 50),
  ('IGA GARANG ASAM', 'JAHE', 50),
  ('IGA GARANG ASAM', 'ASAM KANDIS', 10),
  ('IGA GARANG ASAM', 'LENGKUAS', 50),
  ('IGA GARANG ASAM', 'SEREH', 50)
) as v(menu_nama, bahan_nama, qty)
join public.menu mm on lower(mm.nama) = lower(v.menu_nama)
join public.bahan_baku bb on lower(bb.nama) = lower(v.bahan_nama)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

-- 9. LAPORAN VERIFIKASI — harus 0 baris
select 'RESEP_GAGAL' as cek, v.menu_nama, v.bahan_nama
from (values
('PIZZA 4 PORSI', 'TERIGU'),
('PIZZA 4 PORSI', 'GULA PASIR'),
('PIZZA 4 PORSI', 'GARAM'),
('PIZZA 4 PORSI', 'FERMIPAN'),
('PIZZA 4 PORSI', 'SOSIS BRATWURSE (HANZEL) 5PCS/PACK'),
('PIZZA 4 PORSI', 'RATATOUILLE'),
('Pizza Smoke Beef', 'DOUGH PIZZA'),
('Pizza Smoke Beef', 'SMOKE BEEF @20GR'),
('Pizza Smoke Beef', 'PAPRIKA MERAH'),
('Pizza Smoke Beef', 'PAPRIKA HIJAU'),
('Pizza Smoke Beef', 'BAWANG BOMBAY'),
('Pizza Smoke Beef', 'MOZARELLA PIZZA'),
('Pizza Smoke Beef', 'RATATOUILLE'),
('Pizza Bolognaise', 'DOUGH PIZZA'),
('Pizza Bolognaise', 'SAUCE BOLOGNAISE @80GR'),
('Pizza Bolognaise', 'BAWANG BOMBAY'),
('Pizza Bolognaise', 'MOZARELLA PIZZA'),
('Pizza Bolognaise', 'RATATOUILLE'),
('PIZZA CHICKEN', 'DOUGH PIZZA'),
('PIZZA CHICKEN', 'AYAM SUIR @20GR'),
('PIZZA CHICKEN', 'PAPRIKA KUNING'),
('PIZZA CHICKEN', 'PAPRIKA HIJAU'),
('PIZZA CHICKEN', 'BAWANG BOMBAY'),
('PIZZA CHICKEN', 'MOZARELLA PIZZA'),
('PIZZA CHICKEN', 'RATATOUILLE'),
('PIZZA CHICKEN', 'PAPRIKA MERAH'),
('Bubur Ayam Peranakan', 'AYAM SUIR @20GR'),
('Bubur Ayam Peranakan', 'NASI PUTIH'),
('Bubur Ayam Peranakan', 'CAKWE'),
('Bubur Ayam Peranakan', 'KACANG KEDELAI'),
('Bubur Ayam Peranakan', 'TELUR AYAM'),
('Bubur Ayam Peranakan', 'DAUN BAWANG'),
('Bubur Ayam Peranakan', 'BAWANG GORENG'),
('Bubur Ayam Peranakan', 'KERUPUK WARNA'),
('Bubur Ayam Peranakan', 'SAMBAL BAWANG'),
('Bubur Ayam Peranakan', 'KECAP ASIN'),
('RICE BOWL KECOMBRANG', 'AYAM SUIR @20GR'),
('RICE BOWL KECOMBRANG', 'NASI PUTIH'),
('RICE BOWL KECOMBRANG', 'SAMBAL KECOMBRANG'),
('RICE BOWL KECOMBRANG', 'TIMUN'),
('RICE BOWL KECOMBRANG', 'TOMAT MERAH'),
('Mie Goreng Ayam', 'AYAM SUIR @20GR'),
('Mie Goreng Ayam', 'MIE TELUR MATANG'),
('Mie Goreng Ayam', 'CHILLI PASTE @250GR'),
('Mie Goreng Ayam', 'SAWI HIJAU'),
('Mie Goreng Ayam', 'WORTEL'),
('Mie Goreng Ayam', 'KOL'),
('Mie Goreng Ayam', 'DAUN BAWANG'),
('Mie Goreng Ayam', 'BAWANG GORENG'),
('Mie Goreng Ayam', 'EMPING'),
('Mie Goreng Ayam', 'TOMAT MERAH'),
('Mie Goreng Ayam', 'TIMUN'),
('Mie Goreng Ayam', 'ACAR @50GR'),
('RICE BOWL AYAM SOSIS', 'AYAM SUIR @20GR'),
('RICE BOWL AYAM SOSIS', 'NASI PUTIH'),
('RICE BOWL AYAM SOSIS', 'SOSIS 40GR'),
('RICE BOWL AYAM SOSIS', 'TIMUN'),
('RICE BOWL AYAM SOSIS', 'TOMAT MERAH'),
('RICE BOWL AYAM SOSIS', 'SAUS TOMAT'),
('RICE BOWL AYAM SOSIS', 'SESAME OIL'),
('RICE BOWL AYAM SOSIS', 'KECAP INGGRIS'),
('RICE BOWL AYAM SOSIS', 'BIJI WIJEN'),
('RICE BOWL AYAM SOSIS', 'TELUR AYAM'),
('Mie Nyemek', 'AYAM SUIR @20GR'),
('Mie Nyemek', 'MIE URAI MATANG'),
('Mie Nyemek', 'CHILLI PASTE @250GR'),
('Mie Nyemek', 'SAWI HIJAU'),
('Mie Nyemek', 'WORTEL'),
('Mie Nyemek', 'KOL'),
('Mie Nyemek', 'DAUN BAWANG'),
('Mie Nyemek', 'BAWANG GORENG'),
('Mie Nyemek', 'EMPING'),
('Mie Nyemek', 'TOMAT MERAH'),
('Mie Nyemek', 'TIMUN'),
('Mie Nyemek', 'ACAR @50GR'),
('Fettuccine Carbonara', 'SAUCE CREAM 150ML'),
('Fettuccine Carbonara', 'FETTUCINE MATANG'),
('Fettuccine Carbonara', 'TELUR AYAM'),
('Fettuccine Carbonara', 'JAMUR CHAMPIGNON'),
('Fettuccine Carbonara', 'SMOKE BEEF @20GR'),
('Fettuccine Carbonara', 'GARLIC BREAD'),
('Macaroni and Cheese', 'AYAM DADU @20GR'),
('Macaroni and Cheese', 'SAUCE CREAM 150ML'),
('Macaroni and Cheese', 'MACARONI ELBOW @130GR'),
('Macaroni and Cheese', 'JAMUR CHAMPIGNON'),
('Macaroni and Cheese', 'SMOKE BEEF @20GR'),
('Macaroni and Cheese', 'MOZARELLA PIZZA'),
('Macaroni and Cheese', 'GARLIC BREAD'),
('Spaghetti Bolognaise', 'SPAGHETTI @130GR'),
('Spaghetti Bolognaise', 'SAUCE BOLOGNAISE @80GR'),
('Spaghetti Bolognaise', 'GARLIC BREAD'),
('Spaghetti Bolognaise', 'SAUS TOMAT'),
('NACHOS', 'KULIT CORN TORTILA'),
('NACHOS', 'RATATOUILLE'),
('NACHOS', 'SAUCE BOLOGNAISE @80GR'),
('NACHOS', 'TOMAT MERAH'),
('NACHOS', 'DAUN BAWANG'),
('NACHOS', 'ORANGE CHEESE'),
('NACHOS', 'MOZARELLA PIZZA'),
('Nasi Goreng Babe', 'PAHA DUNGDUNG'),
('Nasi Goreng Babe', 'NASI PUTIH'),
('Nasi Goreng Babe', 'SERUNDENG'),
('Nasi Goreng Babe', 'TIMUN'),
('Nasi Goreng Babe', 'TOMAT MERAH'),
('Nasi Goreng Babe', 'ACAR @50GR'),
('Nasi Goreng Babe', 'CHILLI PASTE @250GR'),
('Nasi Goreng Babe', 'BAWANG GORENG'),
('Nasi Goreng Babe', 'AYAM SUIR @20GR'),
('Nasi Goreng Babe', 'TELUR AYAM'),
('Nasi Goreng Babe', 'SAWI HIJAU'),
('Nasi Goreng Babe', 'WORTEL'),
('Nasi Goreng Babe', 'KOL'),
('Nasi Goreng Babe', 'DAUN BAWANG'),
('Nasi Goreng Babe', 'CHICKEN KNORR'),
('Nasi Goreng Babe', 'GARAM'),
('Nasi Goreng Babe', 'KECAP NASI GORENG 1180ML'),
('Lontong Sayur Mpok', 'PAHA DUNGDUNG'),
('Lontong Sayur Mpok', 'KETUPAT'),
('Lontong Sayur Mpok', 'KUAH SOTO @200ML'),
('Lontong Sayur Mpok', 'CHILLI PASTE @250GR'),
('Lontong Sayur Mpok', 'KACANG PANJANG'),
('Lontong Sayur Mpok', 'LABU SIAM'),
('Lontong Sayur Mpok', 'TELUR AYAM'),
('Lontong Sayur Mpok', 'KERUPUK WARNA'),
('Lontong Sayur Mpok', 'SAMBAL BAWANG'),
('Ayam Goreng Berlaris', 'AYAM UNGKEP'),
('Ayam Goreng Berlaris', 'NASI PUTIH'),
('Ayam Goreng Berlaris', 'SERUNDENG'),
('Ayam Goreng Berlaris', 'TIMUN'),
('Ayam Goreng Berlaris', 'TOMAT MERAH'),
('Ayam Goreng Berlaris', 'ACAR @50GR'),
('Ayam Goreng Berlaris', 'SAMBAL BAWANG'),
('Ayam Goreng Berlaris', 'BAWANG GORENG'),
('Ayam Bakar Berlaris', 'AYAM UNGKEP'),
('Ayam Bakar Berlaris', 'NASI PUTIH'),
('Ayam Bakar Berlaris', 'SERUNDENG'),
('Ayam Bakar Berlaris', 'TIMUN'),
('Ayam Bakar Berlaris', 'TOMAT MERAH'),
('Ayam Bakar Berlaris', 'ACAR @50GR'),
('Ayam Bakar Berlaris', 'SAMBAL BAWANG'),
('Ayam Bakar Berlaris', 'BAWANG GORENG'),
('Ayam Bakar Berlaris', 'BUMBU BAKARAN'),
('Bebek Bumbu Hitam', 'BEBEK UNGKEP'),
('Bebek Bumbu Hitam', 'NASI PUTIH'),
('Bebek Bumbu Hitam', 'SERUNDENG'),
('Bebek Bumbu Hitam', 'TIMUN'),
('Bebek Bumbu Hitam', 'TOMAT MERAH'),
('Bebek Bumbu Hitam', 'ACAR @50GR'),
('Bebek Bumbu Hitam', 'SAMBAL BAWANG'),
('Bebek Bumbu Hitam', 'BAWANG GORENG'),
('Bebek Bumbu Hitam', 'BUMBU HITAM @50GR'),
('Bebek Bumbu Hitam', 'SAMBAL IJO @20GR'),
('Soto Betawi', 'DAGING SAPI SOTO BETAWI @40GR'),
('Soto Betawi', 'SANDUNG LAMUR @20GR'),
('Soto Betawi', 'KUAH SOTO @200ML'),
('Soto Betawi', 'KENTANG'),
('Soto Betawi', 'TOMAT MERAH'),
('Soto Betawi', 'DAUN BAWANG'),
('Soto Betawi', 'BAWANG GORENG'),
('Soto Betawi', 'NASI PUTIH'),
('Soto Betawi', 'EMPING'),
('Soto Betawi', 'ACAR @50GR'),
('Soto Betawi', 'LIMO'),
('Tongseng Sapi', 'DAGING SAPI SOTO BETAWI @40GR'),
('Tongseng Sapi', 'KUAH SOTO @200ML'),
('Tongseng Sapi', 'KOL'),
('Tongseng Sapi', 'TOMAT MERAH'),
('Tongseng Sapi', 'DAUN BAWANG'),
('Tongseng Sapi', 'BAWANG GORENG'),
('Tongseng Sapi', 'NASI PUTIH'),
('Tongseng Sapi', 'EMPING'),
('Tongseng Sapi', 'ACAR @50GR'),
('Tongseng Sapi', 'LIMO'),
('Tongseng Sapi', 'KECAP MANIS'),
('Kwetiauw Sapi', 'DAGING SUWIR @20GR'),
('Kwetiauw Sapi', 'KWETIAW @130GR'),
('Kwetiauw Sapi', 'KOL'),
('Kwetiauw Sapi', 'TOMAT MERAH'),
('Kwetiauw Sapi', 'DAUN BAWANG'),
('Kwetiauw Sapi', 'BAWANG GORENG'),
('Kwetiauw Sapi', 'SAWI HIJAU'),
('Kwetiauw Sapi', 'KERUPUK WARNA'),
('Kwetiauw Sapi', 'ACAR @50GR'),
('Kwetiauw Sapi', 'TIMUN'),
('Kwetiauw Sapi', 'KECAP NASI GORENG 1180ML'),
('Kwetiauw Sapi', 'WORTEL'),
('Nasi Goreng Buntut', 'NASGOR BUNTUT @30GR'),
('Nasi Goreng Buntut', 'NASI PUTIH'),
('Nasi Goreng Buntut', 'WORTEL'),
('Nasi Goreng Buntut', 'BAWANG GORENG'),
('Nasi Goreng Buntut', 'DAUN BAWANG'),
('Nasi Goreng Buntut', 'ACAR @50GR'),
('Nasi Goreng Buntut', 'TOMAT MERAH'),
('Nasi Goreng Buntut', 'TIMUN'),
('Nasi Goreng Buntut', 'EMPING'),
('Nasi Goreng Buntut', 'GARAM'),
('Nasi Goreng Buntut', 'CHICKEN KNORR'),
('Nasi Goreng Buntut', 'MICIN'),
('Nasi Goreng Buntut', 'SAUCE TIRAM'),
('Sop Buntut', 'BUNTUT SAPI @150GR'),
('Sop Buntut', 'NASI PUTIH'),
('Sop Buntut', 'WORTEL'),
('Sop Buntut', 'BAWANG GORENG'),
('Sop Buntut', 'DAUN BAWANG'),
('Sop Buntut', 'ACAR @50GR'),
('Sop Buntut', 'TOMAT MERAH'),
('Sop Buntut', 'TIMUN'),
('Sop Buntut', 'EMPING'),
('Sop Buntut', 'KUAH SOTO @200ML'),
('Sop Buntut', 'KENTANG'),
('Nasi Goreng Iga', 'IGA SUIR KWETIAU @30GR'),
('Nasi Goreng Iga', 'NASI PUTIH'),
('Nasi Goreng Iga', 'PASTE IJO'),
('Nasi Goreng Iga', 'BAWANG GORENG'),
('Nasi Goreng Iga', 'DAUN BAWANG'),
('Nasi Goreng Iga', 'ACAR @50GR'),
('Nasi Goreng Iga', 'TOMAT MERAH'),
('Nasi Goreng Iga', 'TIMUN'),
('Nasi Goreng Iga', 'EMPING'),
('Nasi Goreng Iga', 'GARAM'),
('Nasi Goreng Iga', 'CHICKEN KNORR'),
('Nasi Goreng Iga', 'MICIN'),
('Nasi Goreng Iga', 'KECAP INGGRIS'),
('Nasi Goreng Iga', 'SESAME OIL'),
('Sop Iga', 'IGA SAPI @150GR'),
('Sop Iga', 'NASI PUTIH'),
('Sop Iga', 'WORTEL'),
('Sop Iga', 'BAWANG GORENG'),
('Sop Iga', 'DAUN BAWANG'),
('Sop Iga', 'ACAR @50GR'),
('Sop Iga', 'TOMAT MERAH'),
('Sop Iga', 'TIMUN'),
('Sop Iga', 'EMPING'),
('Sop Iga', 'KUAH SOTO @200ML'),
('Sop Iga', 'KENTANG'),
('EMPAL IGA SERUNDENG', 'IGA SAPI @150GR'),
('EMPAL IGA SERUNDENG', 'NASI PUTIH'),
('EMPAL IGA SERUNDENG', 'WORTEL'),
('EMPAL IGA SERUNDENG', 'BAWANG GORENG'),
('EMPAL IGA SERUNDENG', 'DAUN BAWANG'),
('EMPAL IGA SERUNDENG', 'ACAR @50GR'),
('EMPAL IGA SERUNDENG', 'TOMAT MERAH'),
('EMPAL IGA SERUNDENG', 'TIMUN'),
('EMPAL IGA SERUNDENG', 'EMPING'),
('EMPAL IGA SERUNDENG', 'SERUNDENG'),
('EMPAL IGA SERUNDENG', 'KOL'),
('IGA GARANG ASAM', 'IGA SAPI @150GR'),
('IGA GARANG ASAM', 'NASI PUTIH'),
('IGA GARANG ASAM', 'WORTEL'),
('IGA GARANG ASAM', 'BAWANG GORENG'),
('IGA GARANG ASAM', 'DAUN BAWANG'),
('IGA GARANG ASAM', 'ACAR @50GR'),
('IGA GARANG ASAM', 'EMPING'),
('IGA GARANG ASAM', 'KUAH SOTO @200ML'),
('IGA GARANG ASAM', 'TOMAT IJO'),
('IGA GARANG ASAM', 'EBI'),
('IGA GARANG ASAM', 'JAHE'),
('IGA GARANG ASAM', 'ASAM KANDIS'),
('IGA GARANG ASAM', 'LENGKUAS'),
('IGA GARANG ASAM', 'SEREH')
) as v(menu_nama, bahan_nama)
where not exists (select 1 from public.menu mm where lower(mm.nama) = lower(v.menu_nama))
   or not exists (select 1 from public.bahan_baku bb where lower(bb.nama) = lower(v.bahan_nama));

-- PostgREST perlu reload schema cache supaya tabel baru terlihat di API
notify pgrst, 'reload schema';
