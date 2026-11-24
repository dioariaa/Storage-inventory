-- ============================================================
-- 010: Pemisahan Division (Bar vs Kitchen) pada Bahan Baku dan Menu
-- ============================================================

-- 1. Tambah kolom division ('bar' | 'kitchen') pada bahan_baku & menu
alter table public.bahan_baku
  add column if not exists division text not null default 'bar'
  check (division in ('bar', 'kitchen'));

alter table public.menu
  add column if not exists division text not null default 'bar'
  check (division in ('bar', 'kitchen'));

-- 2. Update otomatis menu kitchen berdasarkan keyword makanan sebelumnya
update public.menu
set division = 'kitchen'
where lower(nama) ~ 'nasi|ayam|bebek|goreng|mie|bihun|sayur|lontong|bubur|burger|pizza|chips|iga|sandwich|wings|macaroni|singkong|pisang|gado|finger|rice bowl|breakfast|steak|bakar';

-- 3. Update view saldo bahan baku agar tetap aman
drop view if exists public.v_saldo_bahan_baku;
create or replace view public.v_saldo_bahan_baku as
select
  b.id,
  b.nama,
  b.satuan,
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
group by b.id, b.nama, b.satuan, b.stok_awal, b.minimum_stok, b.is_active, b.division;

grant select on public.v_saldo_bahan_baku to authenticated, anon;

-- 4. Update function get_mutasi_bahan_range
create or replace function public.get_mutasi_bahan_range(p_date_from date, p_date_to date)
returns table (
  bahan_baku_id uuid,
  total_in numeric,
  total_out numeric
) as $$
begin
  return query
  select
    td.bahan_baku_id,
    coalesce(sum(case when t.jenis = 'IN' then td.qty else 0 end), 0) as total_in,
    coalesce(sum(case when t.jenis = 'OUT' then td.qty else 0 end), 0) as total_out
  from public.transaksi_detail td
  join public.transaksi t on t.id = td.transaksi_id and t.is_posted = true
  where t.tgl_transaksi >= p_date_from and t.tgl_transaksi <= p_date_to
  group by td.bahan_baku_id;
end;
$$ language plpgsql;
