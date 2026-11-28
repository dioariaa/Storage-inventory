export interface BomDetailLike {
  bahan_asal_id: string
  qty_asal: number
  is_utama?: boolean
}

export interface BahanNameLike {
  id: string
  nama: string
}

// Kata kunci bumbu/pendukung yang jarang menjadi "bahan besar" jika belum ditandai manual
const PENDUKUNG_PATTERNS: RegExp[] = [
  /^air$/i,
  /\bgaram\b/i,
  /\bmicin\b/i,
  /\broyco\b/i,
  /\bknorr\b/i,
  /\blada\b/i,
  /\bgula\b/i,
  /\bminyak\b/i,
  /\bsalad oil\b/i,
  /\bsesame oil\b/i,
  /\bdaun\b/i,
  /\bkayu manis\b/i,
  /\bsereh\b/i,
  /\bkapo?laga\b/i,
  /\bpekak\b/i,
  /\bcengkeh\b/i,
  /\bketumbar\b/i,
  /\bkunyit bubuk\b/i,
  /\bkemiri\b/i,
  /\bjahe\b/i,
  /\bbay leave\b/i,
  /\bparsley\b/i,
  /\bterasi\b/i,
  /\bcuka\b/i,
  /\bbiji pala\b/i,
  /\bfermipan\b/i,
  /\bbawang putih\b/i,
  /\bbawang bombay\b/i,
  /\bseledri\b/i,
  /\bbumbu\b/i,
]

export function roundQty(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 1000) / 1000
}

/**
 * Tentukan set bahan_asal_id yang dianggap "Bahan Utama" untuk satu batch BOM.
 * - Jika kolom is_utama sudah aktif di DB (hasIsUtamaCol = true), pakai persis data DB
 *   (boleh kosong / 0 bahan utama untuk resep bumbu seperti Bumbu Hitam, Bumbu Kuning, dll.).
 * - Hanya jika migrasi 019 belum dijalankan (hasIsUtamaCol = false), gunakan heuristik sementara.
 */
export function resolveUtamaIds(
  items: BomDetailLike[],
  bahanMap: Map<string, BahanNameLike>,
  hasIsUtamaCol = true
): Set<string> {
  if (hasIsUtamaCol) {
    return new Set(items.filter((d) => d.is_utama === true).map((d) => d.bahan_asal_id))
  }

  const explicit = items.filter((d) => d.is_utama === true).map((d) => d.bahan_asal_id)
  if (explicit.length > 0) return new Set(explicit)

  if (items.length === 0) return new Set()
  if (items.length === 1) return new Set([items[0].bahan_asal_id])

  const nonPendukung = items.filter((d) => {
    const nama = (bahanMap.get(d.bahan_asal_id)?.nama ?? "").trim()
    return !PENDUKUNG_PATTERNS.some((re) => re.test(nama))
  })
  // Jika semua bahannya bumbu/pendukung, biarkan 0 bahan utama (mode Batch Standar)
  if (nonPendukung.length === 0) return new Set()

  const sorted = [...nonPendukung].sort((a, b) => Number(b.qty_asal) - Number(a.qty_asal))
  const top = sorted[0]
  const picked = [top.bahan_asal_id]
  if (
    sorted.length > 1 &&
    sorted[1].qty_asal > 0 &&
    top.qty_asal > 0 &&
    sorted[1].qty_asal >= top.qty_asal * 0.6
  ) {
    picked.push(sorted[1].bahan_asal_id)
  }
  return new Set(picked)
}

/**
 * Hitung faktor pengali (scale factor) dari bahan-bahan utama terhadap resep BOM dasarnya.
 * Contoh: BOM Dada Fillet 2000 GR, dapur input 4000 GR -> scale = 2.
 * Jika ada lebih dari 1 bahan utama, ambil rata-rata rasio dari bahan utama yang punya bomQty > 0.
 */
export function computeScaleFactor(
  utamaRows: { bomQty?: number; qty: number }[]
): number {
  const valid = utamaRows.filter((r) => (r.bomQty ?? 0) > 0)
  if (valid.length === 0) return 1
  const sumRatios = valid.reduce((acc, r) => acc + Math.max(0, Number(r.qty) || 0) / (r.bomQty as number), 0)
  return roundQty(sumRatios / valid.length)
}

export function formatScaleFactor(scale: number): string {
  const rounded = Math.round(scale * 100) / 100
  return `${rounded.toLocaleString("id-ID", { maximumFractionDigits: 2 })}×`
}
