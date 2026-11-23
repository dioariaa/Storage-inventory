-- ============================================================
-- 008: View mutasi per menu (penjualan / rekam penggunaan per menu)
-- ============================================================
drop view if exists public.v_mutasi_menu;

create or replace view public.v_mutasi_menu as
select
  p.id as penjualan_id,
  p.tgl_penjualan as tgl_transaksi,
  pd.menu_id,
  m.nama as menu_nama,
  m.kategori,
  m.kategori as menu_kategori,
  pd.qty_terjual,
  m.harga as harga_satuan,
  (pd.qty_terjual * coalesce(m.harga, 0)) as total_nilai,
  p.created_at as waktu_pencatatan
from public.penjualan_detail pd
join public.penjualan p on p.id = pd.penjualan_id
join public.menu m on m.id = pd.menu_id;

grant select on public.v_mutasi_menu to authenticated, anon;
