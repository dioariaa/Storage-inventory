# AGENTS.md — Inventori Berlaris (INVENTORY-WEB)

Context and rules for AI agents working in `C:/Users/USER/OneDrive/Dokumen/INVENTORY-WEB`.

## Tech Stack
- React 19 + Vite + TypeScript + Tailwind CSS + Lucide + Zod + React Query.
- Supabase (PostgreSQL, RLS active).
- `xlsx-js-style` for Excel exports with styled cells. Do not revert to plain `xlsx`.

## Commands
- `npm install`
- `npm run dev -- --host 0.0.0.0` -> `http://127.0.0.1:5173`
- `npm run build` (must exit 0 after edits)

## Domain Rules
- **Bahan Baku**: `jenis` = `BAHAN_BAKU` | `BAHAN_PRODUKSI`. Do not delete items; set qty 0 / mark inactive.
- **BOM**: `bom_batch` + `bom_batch_detail` are recipe templates for processed items, not fixed rules.
- **Input Masak**: pick process material -> auto-fill from BOM -> kitchen edits real usage/result -> save via `catat_masak()` RPC. Bahan Terpakai IN, Hasil Masak OUT.
- **Recipe**: only active menus (`is_active`) appear in the set-recipe list.
- **Excel variance**: headers `IN MANUAL`, `OUT MANUAL`, `IN SISTEM`, `OUT SISTEM`, `SELISIH IN`, `SELISIH OUT`, `SELISIH STOK`. Colors: green `#C6EFCE` (0), light blue `#DDEBF7` (surplus), pink `#FFC7CE` (deficit).

## SQL Conventions
- RLS: `create policy "..." on public.<t> for all to authenticated using (true) with check (true);` (never `for authenticated`).
- After DDL/function changes: `notify pgrst, 'reload schema';`
- New tables need explicit GRANT if not covered by initial migration (see `014_grant_bom.sql`).
- `catat_masak(p_tanggal, p_bahan_in jsonb, p_bahan_out jsonb, p_catatan)` is atomic.

## Navigation (sidebar order)
Utama (Dashboard) / Transaksi (Barang Masuk, Barang Keluar, Input Masak, Riwayat) / Master Data (Bahan Baku, Atur BOM, Menu, Recipe) / Laporan (Rekap Mutasi, Cek Variance).

## Do Not
- Do not print or store Supabase keys.
- Do not add dependencies for trivial logic.
- Do not remove `notify pgrst` lines.
