-- ============================================================
-- 009: Function to get aggregated IN/OUT totals per bahan baku within range
-- ============================================================
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
