# SKILL.md — Inventori Berlaris Project Assistant

Use this when working in `C:/Users/USER/OneDrive/Dokumen/INVENTORY-WEB`.

## Quick Start
- Install: `npm install`
- Dev: `npm run dev -- --host 0.0.0.0` (access `http://127.0.0.1:5173`)
- Check: `npm run build` (must be exit 0 after edits)

## Project Rules
- **Tech**: React 19, Vite, TS, Tailwind, Supabase, `xlsx-js-style`.
- **RLS**: `create policy "..." on public.<t> for all to authenticated using (true) with check (true);`
- **Schema Cache**: Always append `notify pgrst, 'reload schema';` after SQL DDL/function changes.
- **Excel**: Variance export requires `xlsx-js-style` to color cells.
- **Master Data**: Use `bahan_baku.jenis` (`BAHAN_BAKU` | `BAHAN_PRODUKSI`).
- **Input Masak**: Pick process -> auto-fill BOM -> kitchen edits real usage -> `catat_masak()` RPC saves.
- **Recipe Page**: Only active menus (`is_active`) appear in "Set Recipe" list.
- **Sidebar**: Grouped Utama, Transaksi, Master Data, Laporan.

## Do Not
- Do not revert to `xlsx`.
- Do not remove `notify pgrst` from migrations.
- Do not add new dependencies for trivial logic.
- Do not expose or print Supabase keys.
