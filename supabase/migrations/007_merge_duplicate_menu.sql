-- ============================================================
-- 007: Merge menu duplikat (case-insensitive) + cegah duplikasi baru
-- ============================================================
-- Menyatukan baris menu yang nama sama tapi beda casing (mis. "Affogato" vs "AFFOGATO").
-- Baris kanonik = yang sudah punya recipe; bila seri, yang punya harga; bila seri, terlama.
-- Recipe & penjualan_detail dipindah ke kanonik. Duplikat dihapus.
-- Terakhir: unique index pada lower(nama) agar duplikasi case-variant tidak terjadi lagi.
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang (idempotent).
-- ============================================================

begin;

-- 1) Peta dup_id -> keep_id
create temp table _menu_merge_map on commit drop as
with scored as (
  select
    m.id,
    lower(m.nama) as key,
    row_number() over (
      partition by lower(m.nama)
      order by
        (select count(*) from public.recipe r where r.menu_id = m.id) desc,
        (m.harga is not null) desc,
        m.created_at asc,
        m.nama asc
    ) as rn
  from public.menu m
  where lower(m.nama) in (
    select lower(nama) from public.menu group by lower(nama) having count(*) > 1
  )
)
select d.id as dup_id, k.id as keep_id
from scored d
join scored k on k.key = d.key and k.rn = 1
where d.rn > 1;

-- 2) Pindahkan penjualan_detail.menu_id ke kanonik
update public.penjualan_detail pd
  set menu_id = m.keep_id
from _menu_merge_map m
where pd.menu_id = m.dup_id;

-- 3) Recipe: hapus baris dup yang bahan-nya sudah ada di kanonik (cegah konflik unique)
delete from public.recipe r
using _menu_merge_map m
where r.menu_id = m.dup_id
  and exists (
    select 1 from public.recipe c
    where c.menu_id = m.keep_id and c.bahan_baku_id = r.bahan_baku_id
  );

-- 4) Recipe: pindahkan sisa baris dup ke kanonik
update public.recipe r
  set menu_id = m.keep_id, updated_at = now()
from _menu_merge_map m
where r.menu_id = m.dup_id;

-- 5) Gabungkan field harga/kategori/is_active ke kanonik
update public.menu k
set
  harga     = coalesce(k.harga, agg.harga),
  kategori  = coalesce(k.kategori, agg.kategori),
  is_active = (k.is_active or agg.is_active),
  updated_at = now()
from (
  select
    m.keep_id,
    max(mm.harga) as harga,
    (array_agg(mm.kategori order by (mm.kategori is not null) desc, mm.nama))[1] as kategori,
    bool_or(mm.is_active) as is_active
  from _menu_merge_map m
  join public.menu mm on mm.id = m.dup_id
  group by m.keep_id
) agg
where k.id = agg.keep_id;

-- 6) Hapus baris duplikat (recipe & penjualan_detail sudah direlokasi)
delete from public.menu m
using _menu_merge_map map
where m.id = map.dup_id;

-- 7) Cegah duplikasi case-variant di masa depan
create unique index if not exists menu_nama_lower_unique
  on public.menu (lower(nama));

commit;

-- Laporan ringkas (jalankan terpisah untuk verifikasi)
-- select lower(nama) as nama, count(*) from public.menu group by 1 having count(*) > 1;
