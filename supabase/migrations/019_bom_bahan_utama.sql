-- ============================================================
-- 019: PENANDA BAHAN UTAMA PADA BOM (AUTO-SCALE BUMBU PENDUKUNG)
-- Jalankan di Supabase SQL Editor setelah 001-018.
-- ============================================================

-- 1. Tambahkan kolom is_utama pada bom_batch_detail
--    true  = Bahan Utama (barang besar yang diinput dapur saat Input Masak)
--    false = Bumbu & Pendukung (otomatis diskalakan proporsional mengikuti bahan utama)
alter table public.bom_batch_detail
  add column if not exists is_utama boolean not null default false;

-- 2. Reset dulu lalu tandai bahan utama hanya untuk BOM yang memang punya barang besar
--    (Resep murni bumbu/sambal seperti Bumbu Hitam, Bumbu Kuning, Bumbu Putih, dll. dibiarkan 0 bahan utama)
update public.bom_batch_detail set is_utama = false;

update public.bom_batch_detail d
set is_utama = true
from public.bom_batch bb
join public.bahan_baku bh on bh.id = bb.bahan_hasil_id,
     public.bahan_baku ba
where d.batch_id = bb.id
  and ba.id = d.bahan_asal_id
  and (lower(bh.nama), lower(ba.nama)) in (
    ('buntut sapi @150gr', 'buntut sapi @150gr'),
    ('iga sapi @150gr', 'iga sapi @150gr'),
    ('paha dungdung', 'paha dungdung'),
    ('ayam suir @20gr', 'dada fillet'),
    ('ayam ungkep', 'ayam utuh'),
    ('ayam ungkep', 'bebek utuh'),
    ('daging sapi soto betawi @40gr', 'daging sapi lamosir'),
    ('daging sapi soto betawi @40gr', 'sandung lamur'),
    ('sauce bolognaise @80gr', 'mince beef'),
    ('sauce cream 150ml', 'freshmilk diamond / uht'),
    ('sauce cream 150ml', 'cream cooking'),
    ('dough pizza', 'terigu'),
    ('garlic bread', 'roti baguette'),
    ('ratatouille', 'timun'),
    ('ratatouille', 'terong ungu'),
    ('ratatouille', 'tomat merah')
  );

notify pgrst, 'reload schema';
