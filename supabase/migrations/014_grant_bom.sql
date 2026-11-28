-- ============================================================
-- 014: GRANT akses untuk tabel BOM yang dibuat di 012
-- Gejala: 403 Forbidden pada GET /rest/v1/bom_batch
-- Penyebab: GRANT di 001 hanya berlaku untuk tabel yang sudah ada saat itu.
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.bom_batch to authenticated;
grant select, insert, update, delete on public.bom_batch_detail to authenticated;
grant select on public.bom_batch to anon;
grant select on public.bom_batch_detail to anon;

-- RLS policy sudah dibuat di 012; pastikan masih ada
drop policy if exists "bom_all_auth" on public.bom_batch;
create policy "bom_all_auth" on public.bom_batch
  for all to authenticated using (true) with check (true);

drop policy if exists "bomd_all_auth" on public.bom_batch_detail;
create policy "bomd_all_auth" on public.bom_batch_detail
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
