# AI Context: Inventori Berlaris (INVENTORY-WEB)

This guide helps AI agents understand and maintain the Berlaris Kopi & Resto inventory system.

## Core Architecture
- **Vite/React 19**: Modern React with TypeScript.
- **Supabase**: Backend-as-a-Service. RLS is mandatory.
- **xlsx-js-style**: Crucial for Excel reports. Standard `xlsx` will break styles.

## Key Logic
1. **Production (Input Masak)**:
   - Uses BOM (Bill of Materials) as a template.
   - Real kitchen usage is recorded via `catat_masak()` RPC.
   - `BAHAN_PRODUKSI` (processed items) are generated from `BAHAN_BAKU` (raw materials).
2. **Master Data**:
   - `BahanBaku` table has a `jenis` field (`BAHAN_BAKU` | `BAHAN_PRODUKSI`).
   - Filters in UI must respect these types.
3. **Excel Styles**:
   - Background colors: Green (`#C6EFCE`), Light Blue (`#DDEBF7`), Pink (`#FFC7CE`).
   - Merged headers for daily variance.

## Navigation Structure
- **Utama**: Dashboard
- **Transaksi**: Barang Masuk, Barang Keluar, Input Masak, Riwayat
- **Master Data**: Bahan Baku, Atur BOM, Menu, Recipe (Admin Only)
- **Laporan**: Rekap Mutasi, Cek Variance (Admin Only)

## Important SQL Habits
- Always `notify pgrst, 'reload schema';` after DDL.
- RLS: `for all to authenticated`.
- Use the `015_input_masak.sql` patterns for atomic transactions.
