import * as XLSX from "xlsx-js-style"
import { toISO, findBahanMatch } from "@/lib/varianceCheck"
import type { BahanBaku } from "@/types/database"

export type PoDivision = "bar" | "kitchen" | "non_inventory"

export interface ParsedPoRow {
  rowKey: string
  tanggal: string
  rawNama: string
  vendor: string
  poTo: string
  division: PoDivision
  qtyOrder: number
  satuanOrder: string
  hargaSatuan: number
  totalHarga: number
  checklist: string
}

export interface PoParseResult {
  tanggal: string | null
  rows: ParsedPoRow[]
  error: string | null
}

function parseNumber(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0
  if (typeof v === "number") return Number.isNaN(v) ? 0 : v
  const raw = String(v).trim().replace(/^rp\.?\s*/i, "")
  if (!raw) return 0
  let normalized = raw
  if (raw.includes(",") && raw.includes(".")) {
    normalized =
      raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "")
  } else if (raw.includes(",")) {
    const parts = raw.split(",")
    normalized = parts.length === 2 && parts[1].length !== 3 ? raw.replace(",", ".") : raw.replace(/,/g, "")
  }
  const n = Number(normalized)
  return Number.isNaN(n) ? 0 : n
}

function classifyPoTo(raw: string): PoDivision {
  const up = raw.trim().toUpperCase()
  if (up === "BAR" || up.includes("BAR")) return "bar"
  if (up === "KITCHEN" || up.includes("KITCHEN") || up.includes("DAPUR")) return "kitchen"
  return "non_inventory"
}

export function parsePoExcelRows(rows: unknown[][]): PoParseResult {
  if (!rows || rows.length < 2) {
    return { tanggal: null, rows: [], error: "File kosong atau terlalu pendek." }
  }

  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim())

  // Cari baris header (REQUEST ORDER / NAMA BARANG / QTY ORDER / SATUAN)
  let headerIdx = -1
  let colDate = -1
  let colNama = -1
  let colVendor = -1
  let colHarga = -1
  let colPoTo = -1
  let colQty = -1
  let colSatuan = -1
  let colTotal = -1
  let colChecklist = -1

  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r] ?? []
    let nIdx = -1
    let qIdx = -1
    for (let c = 0; c < row.length; c++) {
      const up = str(row[c]).toUpperCase()
      if (!up) continue
      if (up.includes("NAMA BARANG") || up.includes("NAMA BAHAN") || up === "ITEM") nIdx = c
      if (up.includes("QTY") || up === "JUMLAH ORDER" || up === "ORDER") {
        if (qIdx === -1 && up !== "REQUEST ORDER") qIdx = c
      }
    }
    if (nIdx !== -1 && qIdx !== -1) {
      headerIdx = r
      colNama = nIdx
      colQty = qIdx
      for (let c = 0; c < row.length; c++) {
        const up = str(row[c]).toUpperCase()
        if (up.includes("REQUEST ORDER") || up === "TANGGAL" || up === "TGL") colDate = c
        else if (up.includes("VENDOR") || up.includes("SUPPLIER")) colVendor = c
        else if (up.includes("HARGA")) colHarga = c
        else if (up === "PO TO" || up.includes("DIVISI") || up.includes("TUJUAN")) colPoTo = c
        else if (up === "SATUAN" || up === "UNIT") colSatuan = c
        else if (up === "TOTAL") colTotal = c
        else if (up.includes("CHECKLIST") || up.includes("STATUS")) colChecklist = c
      }
      break
    }
  }

  if (headerIdx === -1) {
    return {
      tanggal: null,
      rows: [],
      error: "Header tidak dikenali. Pastikan file memiliki kolom NAMA BARANG dan QTY ORDER (format Request Order).",
    }
  }

  // Cari tanggal global dari baris header (mis. kolom kanan di baris 0: 2026-11-25)
  let detectedDate: string | null = null
  for (let c = 0; c < (rows[headerIdx]?.length ?? 0); c++) {
    const iso = toISO(rows[headerIdx][c])
    if (iso) {
      detectedDate = iso
      break
    }
  }

  const parsed: ParsedPoRow[] = []
  let currentDate = detectedDate ?? ""

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (colDate >= 0) {
      const rowIso = toISO(row[colDate])
      if (rowIso) {
        currentDate = rowIso
        if (!detectedDate) detectedDate = rowIso
      }
    }

    const rawNama = str(row[colNama])
    const qtyOrder = parseNumber(row[colQty])
    if (!rawNama || qtyOrder <= 0) continue

    const poTo = colPoTo >= 0 ? str(row[colPoTo]) : "BAR"
    const division = colPoTo >= 0 ? classifyPoTo(poTo) : "bar"

    parsed.push({
      rowKey: `${r}-${rawNama}`,
      tanggal: currentDate,
      rawNama,
      vendor: colVendor >= 0 ? str(row[colVendor]) : "",
      poTo: poTo || "-",
      division,
      qtyOrder,
      satuanOrder: colSatuan >= 0 ? str(row[colSatuan]).toUpperCase() : "",
      hargaSatuan: colHarga >= 0 ? parseNumber(row[colHarga]) : 0,
      totalHarga: colTotal >= 0 ? parseNumber(row[colTotal]) : 0,
      checklist: colChecklist >= 0 ? str(row[colChecklist]) : "",
    })
  }

  if (parsed.length === 0) {
    return { tanggal: detectedDate, rows: [], error: "Tidak ada baris barang dengan QTY ORDER > 0." }
  }

  return { tanggal: detectedDate, rows: parsed, error: null }
}

export function readPoUploadFile(file: File): Promise<PoParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][]
        resolve(parsePoExcelRows(rows))
      } catch (err) {
        resolve({ tanggal: null, rows: [], error: (err as Error).message })
      }
    }
    reader.onerror = () => resolve({ tanggal: null, rows: [], error: "Gagal membaca file." })
    reader.readAsArrayBuffer(file)
  })
}

const PO_NAME_CLEANUPS: [RegExp, string][] = [
  [/\bhydro\s+coco\b/gi, "hydrococo"],
  [/\bsereh\s+bangkok\b/gi, "sereh"],
  [/\blemon\s+lokal\s+california\b/gi, "lemon"],
  [/\blemon\s+lokal\b/gi, "lemon"],
  [/\bbawang\s+putih\s+kulit\b/gi, "bawang putih"],
  [/\bcabe\s+keriting\s+merah\b/gi, "cabai merah keriting"],
  [/\bsingkong\s+kulit\s+merah\b/gi, "singkong"],
  [/\bminyak\s+goreng\b/gi, "minyak goreng"],
  [/\btuna\s+chunk\b/gi, "tuna chunk"],
]

export function matchPoItemToBahan(rawNama: string, division: PoDivision, allBahan: BahanBaku[]): BahanBaku | undefined {
  if (division === "non_inventory") return undefined
  const pool = allBahan.filter((b) => b.division === division && b.is_active)

  let cleaned = rawNama
  for (const [re, rep] of PO_NAME_CLEANUPS) {
    cleaned = cleaned.replace(re, rep)
  }
  // Hapus ukuran kemasan umum di nama PO (mis. 500ML, 1.8L, 160G, 5.7KG) untuk pencocokan nama
  const withoutPack = cleaned.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|g|gr|gram|kg|pcs|pc|oz)\b/gi, " ").replace(/\s+/g, " ").trim()

  return (
    findBahanMatch(rawNama, pool) ??
    findBahanMatch(cleaned, pool) ??
    findBahanMatch(withoutPack, pool)
  )
}

export interface UnitConversionResult {
  qtyConverted: number
  note: string
  needsReview: boolean
}

export function convertPoQty(
  qtyOrder: number,
  satuanOrderRaw: string,
  rawNama: string,
  dbSatuanRaw: string
): UnitConversionResult {
  const poUnit = satuanOrderRaw.trim().toUpperCase()
  const dbUnit = dbSatuanRaw.trim().toUpperCase()

  const isGr = (u: string) => u === "GR" || u === "GRAM" || u === "G"
  const isMl = (u: string) => u === "ML"
  const isKg = (u: string) => u === "KG" || u === "KILO" || u === "KILOGRAM"
  const isL = (u: string) => u === "L" || u === "LITER" || u === "LTR"

  // Sama persis atau ekuivalen
  if (
    poUnit === dbUnit ||
    (isGr(poUnit) && isGr(dbUnit)) ||
    (isMl(poUnit) && isMl(dbUnit)) ||
    ((poUnit === "PCS" || poUnit === "PC") && (dbUnit === "PCS" || dbUnit === "PC"))
  ) {
    return { qtyConverted: qtyOrder, note: `${qtyOrder} ${poUnit}`, needsReview: false }
  }

  // KG -> GR / ML
  if (isKg(poUnit) && (isGr(dbUnit) || isMl(dbUnit))) {
    const qty = Number((qtyOrder * 1000).toFixed(3))
    return { qtyConverted: qty, note: `${qtyOrder} KG × 1000`, needsReview: false }
  }

  // L -> ML / GR
  if (isL(poUnit) && (isMl(dbUnit) || isGr(dbUnit))) {
    const qty = Number((qtyOrder * 1000).toFixed(3))
    return { qtyConverted: qty, note: `${qtyOrder} L × 1000`, needsReview: false }
  }

  // PCS / PACK / BOTOL -> GR / ML jika di nama PO ada ukuran (mis. "HYDRO COCO 500ML", "MINYAK GORENG 1.8L")
  if ((poUnit === "PCS" || poUnit === "PC" || poUnit === "BOTOL" || poUnit === "PACK") && (isGr(dbUnit) || isMl(dbUnit))) {
    const mMl = rawNama.match(/(\d+(?:[.,]\d+)?)\s*(ml|gr|gram|g)\b/i)
    if (mMl) {
      const size = Number(mMl[1].replace(",", "."))
      const qty = Number((qtyOrder * size).toFixed(3))
      return { qtyConverted: qty, note: `${qtyOrder} ${poUnit} × ${size} ${mMl[2].toUpperCase()}`, needsReview: false }
    }
    const mL = rawNama.match(/(\d+(?:[.,]\d+)?)\s*(l|kg)\b/i)
    if (mL) {
      const size = Number(mL[1].replace(",", ".")) * 1000
      const qty = Number((qtyOrder * size).toFixed(3))
      return { qtyConverted: qty, note: `${qtyOrder} ${poUnit} × ${size} ${dbUnit}`, needsReview: false }
    }
  }

  // DUS -> BOTOL (umumnya air mineral 1 dus = 24 botol, tandai needsReview agar user cek!)
  if (poUnit === "DUS" && dbUnit === "BOTOL") {
    return {
      qtyConverted: qtyOrder * 24,
      note: `${qtyOrder} DUS × 24 (cek isi/dus)`,
      needsReview: true,
    }
  }

  // Satuan berbeda dan tidak otomatis terkonversi -> tandai needsReview
  return {
    qtyConverted: qtyOrder,
    note: `Cek satuan: ${poUnit || "?"} → ${dbUnit}`,
    needsReview: true,
  }
}
