import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import {
  CookingPot,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
  PackagePlus,
  RotateCcw,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { today, formatNumber, getErrorMessage, cn } from "@/lib/utils"
import { resolveUtamaIds, computeScaleFactor, roundQty, formatScaleFactor } from "@/lib/bomScaling"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { PageHeader } from "@/components/common/PageHeader"
import { QuickRestockModal, type ShortageItem } from "@/components/barang-keluar/QuickRestockModal"

interface Bahan {
  id: string
  nama: string
  satuan: string
  jenis: string
}
interface Batch {
  id: string
  bahan_hasil_id: string
  qty_hasil: number | null
  satuan_hasil: string
  catatan: string | null
}
interface Detail {
  batch_id: string
  bahan_asal_id: string
  qty_asal: number
  satuan_asal: string
  is_utama?: boolean
}

interface Row {
  key: string
  bahan_id: string
  qty: number
  satuan?: string
  isUtama: boolean
  bomQty?: number
  manualOverride?: boolean
}

interface OutRow {
  key: string
  bahan_id: string
  qty: number
  bomQty?: number
  manualOverride?: boolean
}

interface PreviewRow {
  bahan_id: string
  nama: string
  qty: number
  satuan: string
  saldo: number
  sesudah: number
  cukup: boolean
}
interface PreviewData {
  out: PreviewRow[]
  in: PreviewRow[]
}

const genKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const blankInRow = (isUtama = true): Row => ({ key: genKey(), bahan_id: "", qty: 1, isUtama })
const blankOutRow = (): OutRow => ({ key: genKey(), bahan_id: "", qty: 1 })

export function ProduksiPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [tanggal, setTanggal] = useState(today())
  const [catatan, setCatatan] = useState("")
  const [inRows, setInRows] = useState<Row[]>([blankInRow(true)])
  const [outRows, setOutRows] = useState<OutRow[]>([blankOutRow()])
  const [selectedBatch, setSelectedBatch] = useState("")
  const [batchMultiplier, setBatchMultiplier] = useState(1)
  const [pendukungOpen, setPendukungOpen] = useState(false)
  const [restockOpen, setRestockOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)

  const { data: master, isLoading, error: loadError } = useQuery({
    queryKey: ["produksi-master"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      const [b, batch, sal] = await Promise.all([
        supabase.from("bahan_baku").select("id, nama, satuan, jenis").eq("is_active", true),
        supabase.from("bom_batch").select("id, bahan_hasil_id, qty_hasil, satuan_hasil, catatan"),
        supabase.from("v_saldo_bahan_baku").select("id, saldo_akhir"),
      ])
      if (b.error) throw new Error(`bahan_baku: ${b.error.message}`)
      if (batch.error) throw new Error(`bom_batch: ${batch.error.message}`)
      if (sal.error) throw new Error(`v_saldo_bahan_baku: ${sal.error.message}`)

      // Muat is_utama jika migrasi 019 sudah ada; fallback otomatis jika belum
      let hasIsUtamaCol = true
      let detailsData: Detail[] = []
      const dRes = await supabase
        .from("bom_batch_detail")
        .select("batch_id, bahan_asal_id, qty_asal, satuan_asal, is_utama")
      if (dRes.error) {
        const msg = String(dRes.error.message ?? "")
        if (dRes.error.code === "42703" || msg.includes("is_utama")) {
          hasIsUtamaCol = false
          const dFallback = await supabase
            .from("bom_batch_detail")
            .select("batch_id, bahan_asal_id, qty_asal, satuan_asal")
          if (dFallback.error) throw new Error(`bom_batch_detail: ${dFallback.error.message}`)
          detailsData = (dFallback.data ?? []) as Detail[]
        } else {
          throw new Error(`bom_batch_detail: ${dRes.error.message}`)
        }
      } else {
        detailsData = (dRes.data ?? []) as Detail[]
      }

      return {
        bahan: new Map((b.data ?? []).map((x) => [x.id, x as Bahan])),
        allBahan: (b.data ?? []) as Bahan[],
        details: detailsData,
        batches: (batch.data ?? []) as Batch[],
        saldo: new Map((sal.data ?? []).map((x) => [x.id, Number(x.saldo_akhir ?? 0)])),
        hasIsUtamaCol,
      }
    },
  })

  const bahanOptions = useMemo(
    () => master?.allBahan.map((b) => ({
      id: b.id,
      label: b.nama,
      hint: `${b.satuan} · ${b.jenis}`,
    })) ?? [],
    [master]
  )

  const outBahanOptions = useMemo(
    () => (master?.allBahan ?? [])
      .filter((b) => b.jenis === "BAHAN_PRODUKSI")
      .map((b) => ({ id: b.id, label: b.nama, hint: b.satuan })),
    [master]
  )

  const utamaRows = useMemo(() => inRows.filter((r) => r.isUtama), [inRows])
  const pendukungRows = useMemo(() => inRows.filter((r) => !r.isUtama), [inRows])
  const hasBomPendukung = Boolean(selectedBatch && pendukungRows.length > 0)
  const isBatchStandarMode = Boolean(selectedBatch && utamaRows.length === 0 && pendukungRows.length > 0)

  const scaleFactor = useMemo(() => {
    if (!selectedBatch) return 1
    if (utamaRows.length === 0) return batchMultiplier
    return computeScaleFactor(utamaRows)
  }, [selectedBatch, utamaRows, batchMultiplier])

  const loadDariBom = (batchId: string) => {
    const b = (master?.batches ?? []).find((x) => x.id === batchId)
    if (!b) return
    setSelectedBatch(batchId)
    setBatchMultiplier(1)
    setPreview(null)
    setPendukungOpen(false)
    const items = (master?.details ?? []).filter((d) => d.batch_id === batchId)
    const utamaIds = resolveUtamaIds(items, master?.bahan ?? new Map(), master?.hasIsUtamaCol ?? false)
    const mapped: Row[] = items
      .map((d) => ({
        key: genKey(),
        bahan_id: d.bahan_asal_id,
        qty: Number(d.qty_asal),
        satuan: d.satuan_asal,
        isUtama: utamaIds.has(d.bahan_asal_id),
        bomQty: Number(d.qty_asal),
        manualOverride: false,
      }))
      .sort((a, bRow) => Number(bRow.isUtama) - Number(a.isUtama))
    setInRows(mapped.length > 0 ? mapped : [blankInRow(true)])
    const yieldQty = Number(b.qty_hasil ?? 0)
    setOutRows([
      {
        key: genKey(),
        bahan_id: b.bahan_hasil_id,
        qty: yieldQty,
        bomQty: yieldQty > 0 ? yieldQty : undefined,
        manualOverride: false,
      },
    ])
  }

  const isiUlangBom = () => {
    if (selectedBatch) loadDariBom(selectedBatch)
  }

  const handleBatchMultiplierChange = (nextMult: number) => {
    const safeMult = Number.isFinite(nextMult) && nextMult >= 0 ? nextMult : 0
    setPreview(null)
    setBatchMultiplier(safeMult)
    setInRows((prev) =>
      prev.map((r) =>
        !r.isUtama && !r.manualOverride && (r.bomQty ?? 0) > 0
          ? { ...r, qty: roundQty((r.bomQty as number) * safeMult) }
          : r
      )
    )
    setOutRows((prevOut) =>
      prevOut.map((o) =>
        !o.manualOverride && (o.bomQty ?? 0) > 0
          ? { ...o, qty: roundQty((o.bomQty as number) * safeMult) }
          : o
      )
    )
  }

  // Ubah qty bahan utama -> otomatis menskalakan bumbu & pendukung (dan estimasi yield bila belum diubah manual)
  const handleUtamaQtyChange = (key: string, nextQty: number) => {
    setPreview(null)
    const updatedUtama = inRows.map((r) => (r.key === key ? { ...r, qty: nextQty } : r))
    if (!selectedBatch) {
      setInRows(updatedUtama)
      return
    }
    const nextScale = computeScaleFactor(updatedUtama.filter((r) => r.isUtama))
    setInRows(
      updatedUtama.map((r) =>
        !r.isUtama && !r.manualOverride && (r.bomQty ?? 0) > 0
          ? { ...r, qty: roundQty((r.bomQty as number) * nextScale) }
          : r
      )
    )
    setOutRows((prevOut) =>
      prevOut.map((o) =>
        !o.manualOverride && (o.bomQty ?? 0) > 0
          ? { ...o, qty: roundQty((o.bomQty as number) * nextScale) }
          : o
      )
    )
  }

  const updateIn = (key: string, patch: Partial<Row>) => {
    setPreview(null)
    setInRows((s) => s.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const resetPendukungToAuto = (key: string) => {
    setPreview(null)
    setInRows((s) =>
      s.map((r) => {
        if (r.key !== key || !(r.bomQty && r.bomQty > 0)) return r
        return { ...r, manualOverride: false, qty: roundQty(r.bomQty * scaleFactor) }
      })
    )
  }

  const updateOut = (key: string, patch: Partial<OutRow>) => {
    setPreview(null)
    setOutRows((s) => s.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const valid = (rows: { bahan_id: string; qty: number }[]) =>
    rows.length > 0 && rows.every((r) => r.bahan_id && Number(r.qty) > 0)

  const buildPreview = (customSaldo?: Map<string, number>): PreviewData => {
    const saldoMap = customSaldo ?? master?.saldo ?? new Map<string, number>()
    const gabung = (rows: { bahan_id: string; qty: number; satuan?: string }[]) => {
      const acc = new Map<string, PreviewRow>()
      rows.forEach((r) => {
        const nama = master?.bahan.get(r.bahan_id)?.nama ?? "?"
        const satuan = r.satuan || master?.bahan.get(r.bahan_id)?.satuan || ""
        const saldo = saldoMap.get(r.bahan_id) ?? 0
        const prev = acc.get(r.bahan_id)
        if (prev) {
          prev.qty = roundQty(prev.qty + Number(r.qty))
        } else {
          acc.set(r.bahan_id, {
            bahan_id: r.bahan_id,
            nama,
            qty: roundQty(Number(r.qty)),
            satuan,
            saldo,
            sesudah: saldo,
            cukup: true,
          })
        }
      })
      return [...acc.values()]
    }
    const out = gabung(inRows).map((r) => ({
      ...r,
      sesudah: roundQty(r.saldo - r.qty),
      cukup: r.saldo >= r.qty,
    }))
    const inp = gabung(outRows).map((r) => ({
      ...r,
      sesudah: roundQty(r.saldo + r.qty),
      cukup: true,
    }))
    return { out, in: inp }
  }

  const hitungPreview = () => {
    setPreview(buildPreview())
  }

  const shortages: ShortageItem[] = (preview?.out ?? [])
    .filter((r) => !r.cukup)
    .map((r) => ({
      bahan_baku_id: r.bahan_id,
      bahan_baku_nama: r.nama,
      satuan: r.satuan,
      butuh: r.qty,
      saldo: r.saldo,
    }))

  const handleAfterRestock = async () => {
    const { data: freshSaldo } = await supabase.from("v_saldo_bahan_baku").select("id, saldo_akhir")
    if (freshSaldo) {
      const freshMap = new Map(freshSaldo.map((x: any) => [x.id as string, Number(x.saldo_akhir ?? 0)]))
      queryClient.setQueryData(["produksi-master"], (old: any) =>
        old ? { ...old, saldo: freshMap } : old
      )
      setPreview(buildPreview(freshMap))
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        p_tanggal: tanggal,
        p_bahan_in: inRows.map((r) => ({ id: r.bahan_id, qty: Number(r.qty) })),
        p_bahan_out: outRows.map((r) => ({ id: r.bahan_id, qty: Number(r.qty) })),
        p_catatan: catatan || null,
        p_created_by: profile?.id ?? null,
      }
      const { error } = await (supabase as any).rpc("catat_masak", payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produksi-master"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["riwayat"] })
      queryClient.invalidateQueries({ queryKey: ["rekap-mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["variance-details"] })
      setSuccess(true)
      setPreview(null)
      setCatatan("")
      setSelectedBatch("")
      setBatchMultiplier(1)
      setPendukungOpen(false)
      setInRows([blankInRow(true)])
      setOutRows([blankOutRow()])
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  const errorMessage = loadError
    ? `Data BOM gagal dimuat. ${getErrorMessage(loadError)}`
    : mutation.error
      ? getErrorMessage(mutation.error)
      : ""

  const getSatuan = (id: string, fallback?: string) => fallback || master?.bahan.get(id)?.satuan || ""

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={CookingPot}
        title="Input Masak"
        description="Pilih bahan proses lalu isi bahan utamanya saja — bumbu & pendukung otomatis menyesuaikan skala BOM."
      />

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Masak tercatat. Stok bahan terpotong, stok hasil bertambah.
        </div>
      )}
      {errorMessage && (
        <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{errorMessage}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tanggal Masak</Label>
            <Input type="date" className="h-11" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea rows={2} placeholder="Misal: masak siang, batch 2" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pilih Bahan Proses</CardTitle>
          <CardDescription>Pilih dari resep BOM agar bahan utama dan bumbu pendukung otomatis terisi.</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchableSelect
            value={selectedBatch}
            onChange={loadDariBom}
            options={(master?.batches ?? []).map((b) => ({
              id: b.id,
              label: master?.bahan.get(b.bahan_hasil_id)?.nama ?? b.bahan_hasil_id,
              hint: `yield ${b.qty_hasil ?? 0} ${b.satuan_hasil}`,
            }))}
            placeholder="Pilih bahan proses..."
            emptyText="Tidak ada BOM. Atur BOM dulu."
            className="h-11"
          />
          {selectedBatch && (
            <Button type="button" variant="ghost" size="sm" className="h-11 mt-2 gap-1.5" onClick={isiUlangBom}>
              <RefreshCw className="h-4 w-4" /> Isi ulang dari BOM
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {isBatchStandarMode
                  ? "Resep Batch Standar"
                  : hasBomPendukung
                    ? "Bahan Utama (Barang Besar)"
                    : "Bahan Terpakai"}
              </CardTitle>
              <CardDescription>
                {isBatchStandarMode
                  ? "Resep ini tidak memiliki bahan utama. Pilih jumlah batch (mis. 1× atau 2×) — seluruh bumbu otomatis mengikuti."
                  : hasBomPendukung
                    ? "Cukup isi jumlah bahan besar yang dimasak — bumbu & pendukung di bawah otomatis mengikuti proporsinya."
                    : "Otomatis terisi setelah pilih bahan proses. Edit qty/tambah bahan kalau pemakaian beda."}
              </CardDescription>
            </div>
            {selectedBatch && (
              <Badge
                variant={scaleFactor === 1 ? "secondary" : "default"}
                className="gap-1 text-xs h-6 px-2.5"
              >
                <Sparkles className="h-3 w-3" /> Skala: {formatScaleFactor(scaleFactor)} BOM
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pengali Batch untuk resep tanpa bahan utama (mis. Bumbu Hitam, Bumbu Kuning) */}
          {isBatchStandarMode && (
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold">Jumlah Batch Masak</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[0.5, 1, 1.5, 2, 3].map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={batchMultiplier === m ? "default" : "outline"}
                      className="h-8 px-2.5 text-xs"
                      onClick={() => handleBatchMultiplierChange(m)}
                    >
                      {formatScaleFactor(m)}
                    </Button>
                  ))}
                  <div className="flex items-center gap-1 ml-1">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Pengali batch kustom"
                      className="h-8 w-20 bg-white text-right text-xs font-semibold"
                      value={batchMultiplier || ""}
                      onChange={(e) => handleBatchMultiplierChange(Number(e.target.value) || 0)}
                    />
                    <span className="text-xs text-muted-foreground">batch</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Baris Bahan Utama */}
          {utamaRows.length > 0 && (
          <div className="space-y-2">
            {utamaRows.map((r) => {
              const sat = getSatuan(r.bahan_id, r.satuan)
              return (
                <div key={r.key} className="rounded-lg border p-2.5 space-y-1.5 bg-card">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1 min-w-0">
                      <Label className="text-xs font-normal">Bahan</Label>
                      <SearchableSelect
                        value={r.bahan_id}
                        onChange={(v) => {
                          updateIn(r.key, { bahan_id: v, satuan: master?.bahan.get(v)?.satuan, bomQty: undefined })
                          setSelectedBatch("")
                        }}
                        options={bahanOptions}
                        placeholder="Pilih bahan..."
                        className="h-11"
                      />
                    </div>
                    <div className="w-36 space-y-1">
                      <Label className="text-xs font-normal">Jumlah</Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="h-11 font-semibold"
                          value={r.qty || ""}
                          onChange={(e) => handleUtamaQtyChange(r.key, Number(e.target.value) || 0)}
                        />
                        {sat && <span className="text-xs text-muted-foreground shrink-0 w-10">{sat}</span>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 w-11 p-0"
                      disabled={inRows.length === 1}
                      onClick={() => { setPreview(null); setInRows((s) => s.filter((x) => x.key !== r.key)) }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {r.bomQty !== undefined && r.bomQty > 0 && (
                    <p className="text-[11px] text-muted-foreground pl-1">
                      Standar 1× BOM: <b>{formatNumber(r.bomQty)} {sat}</b>
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          )}

          {/* Panel Lipatan Bumbu & Pendukung (Otomatis Mengikuti Skala) */}
          {hasBomPendukung && (
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setPendukungOpen((o) => !o)}
                className="w-full px-3.5 py-3 flex items-center justify-between gap-2 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
                    <span>Bumbu &amp; Pendukung ({pendukungRows.length} item)</span>
                    <Badge variant="outline" className="text-[10px] h-5 bg-white">
                      Otomatis {formatScaleFactor(scaleFactor)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {pendukungRows
                      .slice(0, 5)
                      .map((r) => `${master?.bahan.get(r.bahan_id)?.nama ?? "?"} ${formatNumber(r.qty)} ${getSatuan(r.bahan_id, r.satuan)}`)
                      .join(", ")}
                    {pendukungRows.length > 5 ? `, +${pendukungRows.length - 5} lainnya` : ""}
                  </p>
                </div>
                <span className="text-xs font-medium text-primary shrink-0 inline-flex items-center gap-1">
                  {pendukungOpen ? (
                    <>Sembunyikan <ChevronUp className="h-4 w-4" /></>
                  ) : (
                    <>Lihat / Edit <ChevronDown className="h-4 w-4" /></>
                  )}
                </span>
              </button>

              {pendukungOpen && (
                <div className="border-t p-3 space-y-2 bg-background">
                  <p className="text-xs text-muted-foreground">
                    Jumlah di bawah mengikuti skala bahan utama secara otomatis. Edit manual hanya bila pemakaian nyata berbeda.
                  </p>
                  {pendukungRows.map((r) => {
                    const sat = getSatuan(r.bahan_id, r.satuan)
                    return (
                      <div
                        key={r.key}
                        className={cn(
                          "flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-md border p-2",
                          r.manualOverride && "border-amber-300 bg-amber-50/40"
                        )}
                      >
                        <div className="flex-1 min-w-[160px]">
                          <p className="text-sm font-medium leading-tight">
                            {master?.bahan.get(r.bahan_id)?.nama ?? "Pilih bahan"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {r.bomQty !== undefined && (
                              <span className="text-[11px] text-muted-foreground">
                                BOM: {formatNumber(r.bomQty)} {sat}
                              </span>
                            )}
                            {r.manualOverride && (
                              <Badge variant="warning" className="text-[10px] h-4 px-1">
                                diubah manual
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-9 w-24 bg-white text-right tabular-nums"
                            value={r.qty || ""}
                            onChange={(e) =>
                              updateIn(r.key, { qty: Number(e.target.value) || 0, manualOverride: true })
                            }
                          />
                          <span className="text-xs text-muted-foreground w-10 shrink-0">{sat}</span>
                          {r.manualOverride && r.bomQty !== undefined && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-primary"
                              title="Kembalikan mengikuti skala BOM"
                              onClick={() => resetPendukungToAuto(r.key)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive"
                            onClick={() => {
                              setPreview(null)
                              setInRows((s) => s.filter((x) => x.key !== r.key))
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={() => { setPreview(null); setInRows((s) => [...s, blankInRow(true)]) }}
          >
            <Plus className="h-4 w-4" /> Tambah Bahan Tambahan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hasil Masak</CardTitle>
          <CardDescription>
            Estimasi yield ikut menyesuaikan skala BOM — silakan edit sesuai berat/porsi nyata setelah masak.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {outRows.map((r) => {
            const sat = getSatuan(r.bahan_id)
            return (
              <div key={r.key} className="flex gap-2 rounded-lg border p-2 items-end">
                <div className="flex-1 space-y-1 min-w-0">
                  <Label className="text-xs font-normal">Bahan Hasil</Label>
                  <SearchableSelect
                    value={r.bahan_id}
                    onChange={(v) => {
                      const match = (master?.batches ?? []).find((b) => b.bahan_hasil_id === v)
                      const belumAdaInput = outRows.length === 1 && !inRows.some((x) => x.bahan_id)
                      if (match && belumAdaInput) loadDariBom(match.id)
                      else updateOut(r.key, { bahan_id: v })
                    }}
                    options={outBahanOptions}
                    placeholder="Pilih bahan jadi..."
                    className="h-11"
                  />
                </div>
                <div className="w-36 space-y-1">
                  <Label className="text-xs font-normal">Jumlah Hasil</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-11 font-semibold"
                      value={r.qty || ""}
                      onChange={(e) =>
                        updateOut(r.key, { qty: Number(e.target.value) || 0, manualOverride: true })
                      }
                    />
                    {sat && <span className="text-xs text-muted-foreground shrink-0 w-10">{sat}</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-11 p-0"
                  disabled={outRows.length === 1}
                  onClick={() => { setPreview(null); setOutRows((s) => s.filter((x) => x.key !== r.key)) }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={() => { setPreview(null); setOutRows((s) => [...s, blankOutRow()]) }}
          >
            <Plus className="h-4 w-4" /> Tambah Hasil
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card className="border-primary/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Hasil Perhitungan Input Masak</span>
              <Badge variant="outline">{preview.out.length} terpakai · {preview.in.length} hasil</Badge>
            </CardTitle>
            <CardDescription>Periksa perubahan stok sebelum konfirmasi. Stok berubah setelah tombol konfirmasi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-3 font-semibold">Bahan</th>
                    <th className="text-right py-2 px-3 font-semibold text-red-600">Terpakai (OUT)</th>
                    <th className="text-right py-2 px-3 font-semibold text-green-700">Hasil (IN)</th>
                    <th className="text-right py-2 px-3 font-semibold">Saldo</th>
                    <th className="text-right py-2 px-3 font-semibold">Sesudah</th>
                    <th className="text-center py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...preview.out.map((r) => ({ ...r, tipe: "OUT" })), ...preview.in.map((r) => ({ ...r, tipe: "IN" }))].map((r, i) => (
                    <tr key={`${r.tipe}-${r.bahan_id}-${i}`} className="border-b hover:bg-muted/20">
                      <td className="py-2.5 px-3 font-medium">{r.nama}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-red-600">
                        {r.tipe === "OUT" ? `-${formatNumber(r.qty)} ${r.satuan}` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-green-700">
                        {r.tipe === "IN" ? `+${formatNumber(r.qty)} ${r.satuan}` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{formatNumber(r.saldo)} {r.satuan}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">
                        <span className={r.sesudah < 0 ? "text-destructive font-bold" : ""}>{formatNumber(r.sesudah)} {r.satuan}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={r.cukup ? "text-green-700 text-xs font-semibold bg-green-100 px-2 py-0.5 rounded-full" : "text-red-700 text-xs font-semibold bg-red-100 px-2 py-0.5 rounded-full"}>
                          {r.cukup ? "✓ Mencukupi" : "✗ Stok Kurang"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {shortages.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-amber-900">
                  <b>{shortages.length} bahan/bumbu stoknya kurang</b> untuk menyimpan masak ini. Gunakan tombol di samping untuk input barang masuk cepat tanpa meninggalkan halaman ini.
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
              <p className="text-xs text-muted-foreground">*Konfirmasi menyimpan transaksi OUT + IN sekaligus.</p>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" onClick={() => setPreview(null)} className="w-full sm:w-auto">Tutup Preview</Button>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || shortages.length > 0}
                  className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white"
                >
                  {mutation.isPending ? "Menyimpan..." : "Konfirmasi & Simpan Masak"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={() => {
            setSelectedBatch("")
            setBatchMultiplier(1)
            setPreview(null)
            setPendukungOpen(false)
            setInRows([blankInRow(true)])
            setOutRows([blankOutRow()])
            setCatatan("")
          }}
        >
          Reset
        </Button>
        <Button
          type="button"
          className="h-11 w-full sm:w-auto"
          disabled={!valid(inRows) || !valid(outRows) || isLoading}
          onClick={hitungPreview}
        >
          <Eye className="h-4 w-4" /> Hitung &amp; Preview Perubahan Stok
        </Button>
      </div>

      <QuickRestockModal
        open={restockOpen}
        onOpenChange={setRestockOpen}
        tanggal={tanggal}
        shortages={shortages}
        defaultCatatan={`Barang masuk cepat untuk Input Masak (${tanggal})`}
        onSuccess={handleAfterRestock}
      />
    </div>
  )
}
