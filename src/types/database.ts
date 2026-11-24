// Database type definitions matching Supabase schema

export type TransactionType = "IN" | "OUT"
export type TransactionSource = "MANUAL_IN" | "MANUAL_OUT" | "POS_IMPORT" | "MANUAL_SALE"
export type OutReason = "WASTE" | "EXPIRED" | "TESTING" | "OPERATIONAL" | "OTHER"
export type UserRole = "admin" | "staff"

// ---- Supabase DB interface ----
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, "created_at" | "updated_at">
        Update: Partial<Omit<Profile, "id">>
      }
      bahan_baku: {
        Row: BahanBaku
        Insert: Omit<BahanBaku, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<BahanBaku, "id">>
      }
      menu: {
        Row: Menu
        Insert: Omit<Menu, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Menu, "id">>
      }
      recipe: {
        Row: Recipe
        Insert: Omit<Recipe, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Recipe, "id">>
      }
      transaksi: {
        Row: Transaksi
        Insert: Omit<Transaksi, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Transaksi, "id">>
      }
      transaksi_detail: {
        Row: TransaksiDetail
        Insert: Omit<TransaksiDetail, "id" | "created_at">
        Update: Partial<Omit<TransaksiDetail, "id">>
      }
      penjualan: {
        Row: Penjualan
        Insert: Omit<Penjualan, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Penjualan, "id">>
      }
      penjualan_detail: {
        Row: PenjualanDetail
        Insert: Omit<PenjualanDetail, "id" | "created_at">
        Update: Partial<Omit<PenjualanDetail, "id">>
      }
    }
    Views: {
      v_saldo_bahan_baku: {
        Row: SaldoBahanBaku
      }
      v_mutasi_dashboard: {
        Row: MutasiDashboard
      }
    }
    Functions: {
      get_saldo_bahan: {
        Args: { p_bahan_baku_id: string }
        Returns: number
      }
      menu_recipe_lengkap: {
        Args: { p_menu_id: string }
        Returns: boolean
      }
    }
  }
}

// ---- Entity Types ----

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface BahanBaku {
  id: string
  nama: string
  satuan: string
  stok_awal: number
  minimum_stok: number | null
  is_active: boolean
  division: 'bar' | 'kitchen'
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Menu {
  id: string
  nama: string
  kategori: string | null
  harga: number | null
  is_active: boolean
  division: 'bar' | 'kitchen'
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Recipe {
  id: string
  menu_id: string
  bahan_baku_id: string
  qty: number
  created_at: string
  updated_at: string
  created_by: string | null
  // joined
  bahan_baku?: BahanBaku
  menu?: Menu
}

export interface Transaksi {
  id: string
  tgl_transaksi: string
  jenis: TransactionType
  sumber: TransactionSource
  alasan_out: OutReason | null
  catatan: string | null
  is_posted: boolean
  posted_at: string | null
  pos_import_ref: string | null
  penjualan_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface TransaksiDetail {
  id: string
  transaksi_id: string
  bahan_baku_id: string
  qty: number
  saldo_sebelum: number
  saldo_sesudah: number
  created_at: string
  // joined
  bahan_baku?: BahanBaku
}

export interface Penjualan {
  id: string
  tgl_penjualan: string
  metode: "POS_IMPORT" | "MANUAL"
  pos_filename: string | null
  catatan: string | null
  is_posted: boolean
  posted_at: string | null
  transaksi_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface PenjualanDetail {
  id: string
  penjualan_id: string
  menu_id: string
  qty_terjual: number
  created_at: string
  // joined
  menu?: Menu
}

// ---- View Types ----

export interface SaldoBahanBaku {
  id: string
  nama: string
  satuan: string
  stok_awal: number
  minimum_stok: number | null
  is_active: boolean
  division: 'bar' | 'kitchen'
  total_in: number
  total_out: number
  saldo_akhir: number
}

export interface MutasiDashboard {
  id: string
  tgl_transaksi: string
  waktu_pencatatan: string
  jenis: TransactionType
  sumber: TransactionSource
  alasan_out: OutReason | null
  catatan: string | null
  bahan_baku_id: string
  bahan_baku_nama: string
  satuan: string
  qty: number
  saldo_sebelum: number
  saldo_sesudah: number
  created_by_name: string | null
  transaksi_id: string
}

export interface MutasiMenu {
  penjualan_id: string
  tgl_transaksi: string
  menu_id: string
  menu_nama: string
  menu_kategori: string | null
  kategori: string | null
  qty_terjual: number
  harga_satuan: number | null
  total_nilai: number
  waktu_pencatatan: string
}

// ---- Form / UI helpers ----

export const OUT_REASON_LABEL: Record<OutReason, string> = {
  WASTE: "Waste / Bahan Rusak",
  EXPIRED: "Expired",
  TESTING: "Testing / Trial Menu",
  OPERATIONAL: "Pemakaian Operasional",
  OTHER: "Lainnya",
}

export const TRANSACTION_SOURCE_LABEL: Record<TransactionSource, string> = {
  MANUAL_IN: "Barang Masuk Manual",
  MANUAL_OUT: "Barang Keluar Manual",
  POS_IMPORT: "Import POS",
  MANUAL_SALE: "Input Penjualan Manual",
}
