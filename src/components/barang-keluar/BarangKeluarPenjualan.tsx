import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { read as xlsxRead, utils as xlsxUtils } from "xlsx-js-style"
import { supabase } from "@/lib/supabase"
import { today, formatNumber, getErrorMessage } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Upload, Eye, CheckCircle2, Utensils, AlertTriangle, Coffee, PackagePlus } from "lucide-react"
import { QuickRestockModal, type ShortageItem } from "./QuickRestockModal"
import type { Menu, SaldoBahanBaku, Recipe, BahanBaku } from "@/types/database"

interface SaleItem {
  menu_id: string
  menu_nama: string
  qty_terjual: number
  matched: boolean
  isKitchen?: boolean
}

interface ConsumptionRow {
  bahan_baku_id: string
  bahan_baku_nama: string
  satuan: string
  total_qty: number
  saldo_sebelum: number
  cukup: boolean
}

type Mode = "manual" | "pos"

// Common alias mapping to connect POS names with Master Menu Bar
const ALIAS_MAP: Record<string, string> = {
  "dark chocolate": "Dark Chocolate (Dingin)",
  "mineral water": "Mineral Water",
  "air mineral": "Mineral Water",
  "lemon tea": "Lemon Tea",
  "teh manis": "Teh Manis",
  "teh tawar": "Teh Tawar",
  "caffe latte": "Caffe latte (Dingin)",
  "butterscotch latte": "Butterscotch Latte (Dingin)",
  "lychee tea": "Lychee Tea",
  "wedang uwuh": "Wedang Uwuh",
  "berlaris palm sugar latte": "Berlaris Palm Sugar Latte (Dingin)",
  "cappuccino": "Cappuccino (Dingin)",
  "es timun serut": "Es Timun Serut",
  "jus jeruk": "Jus Jeruk",
  "jus stroberi": "Jus Stroberi",
  "jus strawberry": "Jus Stroberi",
  "lemon grass tea": "Lemon Grass Tea",
  "lemongrass tea": "Lemon Grass Tea",
  "long black": "Long Black",
  "matcha lattee": "Matcha Lattee (Dingin)",
  "matcha latte": "Matcha Lattee (Dingin)",
  "matcha milkshake": "Matcha Milkshake",
  "caramel macchiato": "CARAMEL MACCHIATO",
  "tamarind tea": "TAMARIND TEA",
  "tamarind ice tea": "TAMARIND TEA",
  "tubruk": "Kopi Tubruk",
  "chocolate hazelnut": "Coklat Hazelnut (Dingin)",
  "coklat hazelnut": "Coklat Hazelnut (Dingin)",
}

// Keywords identifying kitchen / food items to ignore automatically
const KITCHEN_KEYWORDS = [
  "nasi", "ayam", "bebek", "goreng", "mie", "bihun", "sayur", "lontong", "bubur",
  "burger", "pizza", "chips", "iga", "sandwich", "wings", "macaroni", "singkong",
  "pisang", "gado", "finger", "rice bowl", "breakfast", "steak", "bakar"
]

export function BarangKeluarPenjualan() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [inputMode, setInputMode] = useState<Mode>("pos")
  const [tglPenjualan, setTglPenjualan] = useState(today())
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [kitchenItems, setKitchenItems] = useState<{ nama: string; qty: number }[]>([])
  const [preview, setPreview] = useState<ConsumptionRow[] | null>(null)
  const [posFilename, setPosFilename] = useState<string>("")
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [restockOpen, setRestockOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: menuList } = useQuery({
    queryKey: ["menu-list-aktif"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu")
        .select("*")
        .eq("is_active", true)
        .order("nama")
      if (error) throw error
      return data as Menu[]
    },
  })

  const { data: saldoList } = useQuery({
    queryKey: ["saldo-bahan-baku"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_saldo_bahan_baku").select("*")
      if (error) throw error
      return data as SaldoBahanBaku[]
    },
  })

  const { data: allRecipes } = useQuery({
    queryKey: ["all-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe")
        .select("*, bahan_baku(*)")
      if (error) throw error
      return data as (Recipe & { bahan_baku: BahanBaku })[]
    },
  })

  // Fuzzy matching helpers
  const normalize = (s: string) =>
    s.toLowerCase().replace(/&/g, " and ").replace(/-/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

  const getTokens = (s: string) => {
    const n = normalize(s)
    const tokens = n.split(" ").filter((w) => w.length > 0)
    // synonyms
    const has = (w: string) => tokens.includes(w)
    if (has("rice") && has("bowl")) {
      tokens.splice(tokens.indexOf("rice"), 1)
      tokens.splice(tokens.indexOf("bowl"), 1)
      tokens.push("nasi")
    }
    if (has("wings")) {
      tokens[tokens.indexOf("wings")] = "wing"
    }
    if (has("bihun") && has("goreng")) {
      // keep both
    }
    return tokens
  }

  const tokenScore = (a: string, b: string) => {
    const ta = new Set(getTokens(a))
    const tb = new Set(getTokens(b))
    const inter = new Set([...ta].filter((x) => tb.has(x)))
    return inter.size / Math.min(ta.size, tb.size)
  }

  const normalizeVariant = (v: string) => {
    const low = v.trim().toLowerCase()
    if (!low) return ""
    if (low === "hot" || low === "panas") return "Panas"
    if (low === "ice" || low === "iced" || low === "dingin") return "Dingin"
    return v.trim()
  }

  const findBestMenuMatch = (rawName: string, rawVariant = ""): Menu | undefined => {
    if (!menuList || menuList.length === 0) return undefined
    const vNorm = normalizeVariant(rawVariant)

    // 0. Jika ada kolom varian (mis. Panas/Dingin/Coklat/Vanilla/Strawberry), prioritaskan kecocokan exact dengan varian
    if (vNorm) {
      const candidates = [
        normalize(`${rawName} ${vNorm}`),
        normalize(`${rawName} (${vNorm})`),
        normalize(`${rawName} - ${vNorm}`),
      ]
      const exactWithVar = menuList.find((x) => candidates.includes(normalize(x.nama)))
      if (exactWithVar) return exactWithVar
    }

    const n = normalize(rawName)

    // 1. Exact
    let m = menuList.find((x) => normalize(x.nama) === n)
    if (m) return m

    // 2. ALIAS_MAP
    const aliasTarget = ALIAS_MAP[n]
    if (aliasTarget) {
      m = menuList.find((x) => normalize(x.nama) === normalize(aliasTarget))
      if (m) return m
    }

    // 3. Substring
    m = menuList.find((x) => normalize(x.nama).includes(n) || n.includes(normalize(x.nama)))
    if (m) return m

    // 4. Token overlap threshold
    let best: Menu | undefined
    let bestScore = 0
    for (const x of menuList) {
      const sc = tokenScore(rawName, x.nama)
      if (sc > bestScore) {
        bestScore = sc
        best = x
      }
    }
    if (best && bestScore >= 0.5) return best
    return undefined
  }
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setPosFilename(file.name)
    setError(null)
    setPreview(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result
        const workbook = xlsxRead(data, { type: "binary" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows: any[][] = xlsxUtils.sheet_to_json(sheet, { header: 1, defval: "" })

        if (!rawRows || rawRows.length === 0) {
          setError("File kosong atau tidak dapat dibaca.")
          return
        }

        // 1. Cek apakah ada tanggal laporan di baris awal (misal: "Report Generated At : 2026-11-21 16:48:25")
        for (let r = 0; r < Math.min(5, rawRows.length); r++) {
          const rowStr = rawRows[r].join(" ")
          const dateMatch = rowStr.match(/(\d{4}-\d{2}-\d{2})/)
          if (dateMatch) {
            setTglPenjualan(dateMatch[1])
            break
          }
        }

        // 2. Cari baris header (termasuk opsional kolom Varian / Option untuk Panas/Dingin/Rasa)
        let headerRowIdx = -1
        let colMenuIdx = -1
        let colVariantIdx = -1
        let colQtyIdx = -1

        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const row = rawRows[r].map((c) => String(c).trim().toLowerCase())
          let mIdx = -1
          let vIdx = -1
          let qIdx = -1
          for (let c = 0; c < row.length; c++) {
            const val = row[c]
            if (val.includes("judul") || val.includes("produk") || val.includes("menu") || val.includes("item") || val.includes("product") || val === "name") {
              if (mIdx === -1) mIdx = c
            }
            if (val.includes("varian") || val.includes("variant") || val.includes("option 1 value") || val === "opsi") {
              if (vIdx === -1) vIdx = c
            }
            if (val.includes("terjual") || val.includes("unit") || val.includes("qty") || val.includes("jumlah") || val.includes("quantity")) {
              if (qIdx === -1) qIdx = c
            }
          }
          if (mIdx !== -1 && qIdx !== -1) {
            headerRowIdx = r
            colMenuIdx = mIdx
            colVariantIdx = vIdx
            colQtyIdx = qIdx
            break
          }
        }

        if (headerRowIdx === -1) {
          setError("Format kolom tidak dikenali. Pastikan file memiliki kolom Nama Menu/Judul Produk dan Qty/Unit Terjual.")
          return
        }

        // 3. Baca data transaksi penjualan
        const barSales: SaleItem[] = []
        const kitchen: { nama: string; qty: number }[] = []
        const unrecognized: string[] = []

        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r]
          if (!row || row.length === 0) continue

          const rawMenuName = String(row[colMenuIdx] || "").trim()
          const rawVariant = colVariantIdx >= 0 ? String(row[colVariantIdx] || "").trim() : ""
          const rawQty = parseFloat(String(row[colQtyIdx]).replace(",", ".")) || 0

          if (!rawMenuName || rawQty <= 0) continue

          // Cari kecocokan di Master Menu (Bar & Kitchen) via fuzzy matching + varian
          const matchedMenu = findBestMenuMatch(rawMenuName, rawVariant)

          if (matchedMenu) {
            barSales.push({
              menu_id: matchedMenu.id,
              menu_nama: matchedMenu.nama,
              qty_terjual: rawQty,
              matched: true,
              isKitchen: matchedMenu.division === "kitchen",
            })
          } else {
            // Tidak ada di master menu — catat sebagai makanan/dapur bila cocok keyword
            const lowerName = rawMenuName.toLowerCase()
            const isKitchen = KITCHEN_KEYWORDS.some((k) => lowerName.includes(k))
            if (isKitchen) {
              kitchen.push({ nama: rawMenuName, qty: rawQty })
            } else {
              unrecognized.push(rawMenuName)
            }
          }
        }

        setSaleItems(barSales)
        setKitchenItems(kitchen)
        setUnmapped(unrecognized)
      } catch (err: any) {
        setError(`Gagal membaca file: ${err.message}`)
      }
    }
    reader.readAsBinaryString(file)
  }

  const calculateConsumption = (customSaldo?: SaldoBahanBaku[]): ConsumptionRow[] => {
    const activeSaldo = customSaldo ?? saldoList
    if (!allRecipes || !activeSaldo) return []

    const consumptionMap: Record<string, { qty: number; bahan: BahanBaku }> = {}

    for (const sale of saleItems) {
      if (!sale.menu_id || sale.qty_terjual <= 0) continue
      const recipes = allRecipes.filter((r) => r.menu_id === sale.menu_id)
      for (const r of recipes) {
        const total = r.qty * sale.qty_terjual
        if (consumptionMap[r.bahan_baku_id]) {
          consumptionMap[r.bahan_baku_id].qty += total
        } else {
          consumptionMap[r.bahan_baku_id] = { qty: total, bahan: r.bahan_baku }
        }
      }
    }

    return Object.entries(consumptionMap).map(([bahan_baku_id, { qty, bahan }]) => {
      const saldo = activeSaldo.find((s) => s.id === bahan_baku_id)?.saldo_akhir ?? 0
      return {
        bahan_baku_id,
        bahan_baku_nama: bahan?.nama || "Bahan Baku",
        satuan: bahan?.satuan || "Gram",
        total_qty: qty,
        saldo_sebelum: saldo,
        cukup: saldo >= qty,
      }
    }).sort((a, b) => a.bahan_baku_nama.localeCompare(b.bahan_baku_nama))
  }

  const menusWithoutRecipe = allRecipes
    ? Array.from(
        new Set(
          saleItems
            .filter((s) => s.menu_id && s.qty_terjual > 0 && !allRecipes.some((r) => r.menu_id === s.menu_id))
            .map((s) => s.menu_nama)
        )
      )
    : []

  const shortages: ShortageItem[] = (preview ?? [])
    .filter((p) => !p.cukup)
    .map((p) => ({
      bahan_baku_id: p.bahan_baku_id,
      bahan_baku_nama: p.bahan_baku_nama,
      satuan: p.satuan,
      butuh: p.total_qty,
      saldo: p.saldo_sebelum,
    }))

  const handleAfterRestock = async () => {
    setError(null)
    const { data } = await supabase.from("v_saldo_bahan_baku").select("*")
    if (data) {
      const fresh = data as SaldoBahanBaku[]
      queryClient.setQueryData(["saldo-bahan-baku"], fresh)
      setPreview(calculateConsumption(fresh))
    }
  }

  const handlePreview = () => {
    setError(null)
    const rows = calculateConsumption()
    if (rows.length === 0) {
      setError("Tidak ada konsumsi bahan yang dapat dihitung. Pastikan menu Bar yang diimport memiliki Recipe.")
      return
    }
    setPreview(rows)
  }

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Preview belum dihitung")
      const invalid = preview.filter((p) => !p.cukup)
      if (invalid.length > 0) {
        throw new Error(`Stok bahan berikut tidak mencukupi: ${invalid.map((i) => i.bahan_baku_nama).join(", ")}`)
      }

      const validSales = saleItems.filter((s) => s.menu_id && s.qty_terjual > 0)
      if (validSales.length === 0) throw new Error("Tidak ada menu terjual yang valid.")

      const totalQty = validSales.reduce((acc, s) => acc + s.qty_terjual, 0)
      const metode = inputMode === "pos" ? "POS_IMPORT" : "MANUAL"
      const posImportRef =
        inputMode === "pos" && posFilename
          ? `POS:${tglPenjualan}:${posFilename}:${totalQty}:${validSales.length}`
          : null
      const catatan = `Penjualan ${inputMode === "pos" ? `POS (${posFilename})` : "Manual"}: ${tglPenjualan}`

      // Coba RPC atomik 018 dulu (aman untuk Staff & Admin + anti double-import)
      const rpcRes = await (supabase as any).rpc("catat_penjualan", {
        p_tanggal: tglPenjualan,
        p_metode: metode,
        p_pos_filename: posFilename || null,
        p_pos_import_ref: posImportRef,
        p_catatan: catatan,
        p_items: validSales.map((s) => ({ menu_id: s.menu_id, qty: s.qty_terjual })),
      })

      if (rpcRes.error) {
        const msg = String(rpcRes.error.message ?? "")
        const missingFn =
          rpcRes.error.code === "PGRST202" ||
          rpcRes.error.code === "42883" ||
          msg.includes("catat_penjualan")
        if (!missingFn) throw rpcRes.error

        // Fallback standar bila migrasi 018 belum dijalankan
        if (posImportRef) {
          const { data: dup } = await supabase
            .from("transaksi")
            .select("id")
            .eq("pos_import_ref", posImportRef)
            .limit(1)
          if (dup && dup.length > 0) {
            throw new Error(
              `File POS ini sudah pernah di-import sebelumnya (${posImportRef}). Hapus transaksi lama di Riwayat jika ingin import ulang.`
            )
          }
        }

        const nowIso = new Date().toISOString()
        const { data: penj, error: penjErr } = await supabase
          .from("penjualan")
          .insert({
            tgl_penjualan: tglPenjualan,
            metode,
            pos_filename: posFilename || null,
            catatan,
            is_posted: true,
            posted_at: nowIso,
            created_by: profile?.id,
          } as any)
          .select()
          .single()
        if (penjErr) throw penjErr

        const penjId = (penj as any).id

        const penjDetails = validSales.map((s) => ({
          penjualan_id: penjId,
          menu_id: s.menu_id,
          qty_terjual: s.qty_terjual,
        }))
        const { error: pdErr } = await supabase.from("penjualan_detail").insert(penjDetails as any)
        if (pdErr) throw pdErr

        const { data: trx, error: trxErr } = await supabase
          .from("transaksi")
          .insert({
            tgl_transaksi: tglPenjualan,
            jenis: "OUT",
            sumber: inputMode === "pos" ? "POS_IMPORT" : "MANUAL_SALE",
            alasan_out: "OPERATIONAL",
            catatan,
            is_posted: true,
            posted_at: nowIso,
            pos_import_ref: posImportRef,
            penjualan_id: penjId,
            created_by: profile?.id,
          } as any)
          .select()
          .single()
        if (trxErr) throw trxErr

        const trxId = (trx as any).id

        const trxDetails = preview.map((row) => ({
          transaksi_id: trxId,
          bahan_baku_id: row.bahan_baku_id,
          qty: row.total_qty,
          saldo_sebelum: row.saldo_sebelum,
          saldo_sesudah: row.saldo_sebelum - row.total_qty,
        }))
        const { error: tdErr } = await supabase.from("transaksi_detail").insert(trxDetails as any)
        if (tdErr) throw tdErr

        // Best-effort link transaksi_id (bisa ditolak RLS untuk staff sebelum 018; tidak fatal)
        await supabase
          .from("penjualan")
          .update({ transaksi_id: trxId } as any)
          .eq("id", penjId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      queryClient.invalidateQueries({ queryKey: ["mutasi-menu"] })
      queryClient.invalidateQueries({ queryKey: ["riwayat"] })
      queryClient.invalidateQueries({ queryKey: ["rekap-mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["variance-details"] })
      setSuccess(true)
      setSaleItems([])
      setKitchenItems([])
      setPreview(null)
      setPosFilename("")
      setTimeout(() => setSuccess(false), 4000)
    },
    onError: (e: unknown) => setError(getErrorMessage(e)),
  })

  return (
    <div className="space-y-6">
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span>Transaksi penjualan berhasil diposting! Stok bahan baku telah otomatis dipotong.</span>
        </div>
      )}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input mode selector */}
      <div className="flex gap-2">
        <Button size="sm" variant={inputMode === "pos" ? "default" : "outline"} onClick={() => setInputMode("pos")}>
          <Upload className="h-4 w-4 mr-1.5" /> Import File POS
        </Button>
        <Button size="sm" variant={inputMode === "manual" ? "default" : "outline"} onClick={() => setInputMode("manual")}>
          Input Manual Menu
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coffee className="h-5 w-5 text-primary" />
            {inputMode === "pos" ? "Upload & Analisis Penjualan POS" : "Input Menu Terjual"}
          </CardTitle>
          <CardDescription>
            {inputMode === "pos"
              ? "Sistem secara cerdas membaca menu Bar, memfilter pesanan makanan/dapur, dan menghitung total pemakaian bahan baku."
              : "Masukkan jumlah menu yang terjual secara manual."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5 max-w-xs">
            <Label>Tanggal Penjualan</Label>
            <Input type="date" value={tglPenjualan} onChange={(e) => setTglPenjualan(e.target.value)} />
          </div>

          {inputMode === "pos" ? (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors bg-muted/10"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-sm font-semibold text-foreground">
                  {posFilename ? posFilename : "Klik untuk pilih file export POS (CSV / Excel)"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mendukung file export standar seperti Moka, iSeller, Pawoon, dll (.csv, .xlsx, .xls)
                </p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />

              {/* STATS HASIL IMPORT */}
              {(saleItems.length > 0 || kitchenItems.length > 0 || unmapped.length > 0) && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <p className="text-xs text-green-700 font-semibold">Menu Terdeteksi (Bar &amp; Kitchen)</p>
                      <p className="text-xl font-bold text-green-800">{saleItems.length} menu</p>
                      <p className="text-xs text-green-600 mt-0.5">
                        Total {saleItems.reduce((acc, s) => acc + s.qty_terjual, 0)} porsi terjual
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                        <Utensils className="h-3.5 w-3.5" /> Makanan di Luar Master Menu
                      </p>
                      <p className="text-xl font-bold text-slate-700">{kitchenItems.length} menu</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Tidak terdaftar, otomatis diabaikan</p>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                      <p className="text-xs text-amber-800 font-semibold">Tidak Dikenali</p>
                      <p className="text-xl font-bold text-amber-900">{unmapped.length} item</p>
                      <p className="text-xs text-amber-700 mt-0.5">Bukan menu yang terdaftar</p>
                    </div>
                  </div>

                  {/* TABEL MENU BAR YANG AKAN DIPROSES */}
                  {saleItems.length > 0 && (
                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold border-b">
                        Daftar Menu yang Akan Dihitung Konsumsi Bahan (Bar &amp; Kitchen):
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {saleItems.map((item, idx) => (
                              <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="py-2 px-3 font-medium">{item.menu_nama}</td>
                                <td className="py-2 px-3">
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.isKitchen ? "Kitchen" : "Bar"}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <Badge variant="outline">{item.qty_terjual} terjual</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DAFTAR MAKANAN YANG DIABAIKAN (COLLAPSIBLE / RINGKAS) */}
                  {kitchenItems.length > 0 && (
                    <div className="text-xs bg-muted/20 border rounded-md p-3 text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        Item Dapur / Makanan ({kitchenItems.length}) diabaikan dari inventori Berlaris:
                      </span>{" "}
                      {kitchenItems.map((k) => `${k.nama} (${k.qty})`).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* MANUAL INPUT MODE */
            <div className="space-y-3">
              <Label>Daftar Menu Terjual</Label>
              {saleItems.map((item, index) => (
                <div key={index} className="flex gap-3 items-center">
                  <div className="flex-1">
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={item.menu_id}
                      onChange={(e) => {
                        const updated = [...saleItems]
                        const menu = menuList?.find((m) => m.id === e.target.value)
                        updated[index] = {
                          ...updated[index],
                          menu_id: e.target.value,
                          menu_nama: menu?.nama ?? "",
                          matched: !!menu,
                        }
                        setSaleItems(updated)
                        setPreview(null)
                      }}
                    >
                      <option value="">-- Pilih Menu Bar --</option>
                      {menuList?.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min="1"
                      value={item.qty_terjual || ""}
                      onChange={(e) => {
                        const updated = [...saleItems]
                        updated[index] = { ...updated[index], qty_terjual: parseFloat(e.target.value) || 0 }
                        setSaleItems(updated)
                        setPreview(null)
                      }}
                      placeholder="Qty"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => setSaleItems(saleItems.filter((_, i) => i !== index))}
                    disabled={saleItems.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSaleItems([...saleItems, { menu_id: "", menu_nama: "", qty_terjual: 1, matched: false }])
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Tambah Baris Menu
              </Button>
            </div>
          )}

          {saleItems.length > 0 && (
            <div className="space-y-3 pt-2">
              {menusWithoutRecipe.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <b>{menusWithoutRecipe.length} menu belum memiliki resep</b> sehingga bahan bakunya tidak akan terpotong:{" "}
                    {menusWithoutRecipe.join(", ")}
                  </span>
                </div>
              )}
              <Button type="button" onClick={handlePreview} className="gap-2">
                <Eye className="h-4 w-4" /> Hitung &amp; Preview Pemotongan Bahan Baku
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HASIL PREVIEW KONSUMSI BAHAN BAKU */}
      {preview && (
        <Card className="border-primary/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Hasil Perhitungan Konsumsi Bahan Baku</span>
              <Badge variant="outline">{preview.length} jenis bahan baku keluar</Badge>
            </CardTitle>
            <CardDescription>
              Di bawah adalah total bahan baku yang akan dipotong dari saldo inventori Berlaris. Periksa saldo sebelum melakukan posting transaksi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-3 font-semibold">Nama Bahan Baku</th>
                    <th className="text-right py-2 px-3 font-semibold text-red-600">Total Pengurangan (OUT)</th>
                    <th className="text-right py-2 px-3 font-semibold">Saldo Saat Ini</th>
                    <th className="text-right py-2 px-3 font-semibold">Saldo Setelahnya</th>
                    <th className="text-center py-2 px-3 font-semibold">Status Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.bahan_baku_id} className="border-b hover:bg-muted/20">
                      <td className="py-2.5 px-3 font-medium">{row.bahan_baku_nama}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-red-600">
                        -{formatNumber(row.total_qty)} {row.satuan}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {formatNumber(row.saldo_sebelum)} {row.satuan}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold">
                        <span className={row.saldo_sebelum - row.total_qty < 0 ? "text-destructive font-bold" : ""}>
                          {formatNumber(row.saldo_sebelum - row.total_qty)} {row.satuan}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {row.cukup ? (
                          <span className="text-green-700 text-xs font-semibold bg-green-100 px-2 py-0.5 rounded-full">
                            ✓ Mencukupi
                          </span>
                        ) : (
                          <span className="text-red-700 text-xs font-semibold bg-red-100 px-2 py-0.5 rounded-full">
                            ✗ Stok Kurang
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {shortages.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-amber-900">
                  <b>{shortages.length} bahan baku stoknya kurang</b> untuk memposting penjualan ini. Jika belanja hari ini belum sempat dicatat, gunakan tombol di samping untuk input barang masuk cepat tanpa meninggalkan halaman ini.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => setRestockOpen(true)}
                >
                  <PackagePlus className="h-4 w-4" />
                  Input Barang Masuk Cepat ({shortages.length})
                </Button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                *Stok hanya akan berkurang di Dashboard setelah Anda menekan tombol Konfirmasi.
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" onClick={() => setPreview(null)} className="w-full sm:w-auto">
                  Tutup Preview
                </Button>
                <Button
                  onClick={() => postMutation.mutate()}
                  disabled={postMutation.isPending || shortages.length > 0}
                  className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white"
                >
                  {postMutation.isPending ? "Memposting Transaksi..." : "Konfirmasi & Potong Stok"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <QuickRestockModal
        open={restockOpen}
        onOpenChange={setRestockOpen}
        tanggal={tglPenjualan}
        shortages={shortages}
        onSuccess={handleAfterRestock}
      />
    </div>
  )
}
