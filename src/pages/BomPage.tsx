import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { CookingPot, Plus, Trash2, Pencil, Check, X, AlertTriangle, Search, Star } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cn, getErrorMessage } from "@/lib/utils"
import { resolveUtamaIds } from "@/lib/bomScaling"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { PageHeader } from "@/components/common/PageHeader"

interface Bahan {
  id: string
  nama: string
  satuan: string
  jenis: string
  division: "bar" | "kitchen"
}
interface Batch {
  id: string
  bahan_hasil_id: string
  qty_hasil: number | null
  satuan_hasil: string
  catatan: string | null
}
interface Detail {
  id: string
  batch_id: string
  bahan_asal_id: string
  qty_asal: number
  satuan_asal: string
  is_utama?: boolean
}

interface FormDetail {
  key: string
  bahan_asal_id: string
  qty_asal: string
  satuan_asal: string
  is_utama: boolean
}

const genKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function BomPage() {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [bahan_hasil_id, setBahanHasil] = useState("")
  const [qty_hasil, setQtyHasil] = useState("")
  const [satuan_hasil, setSatuanHasil] = useState("GR")
  const [catatan, setCatatan] = useState("")
  const [search, setSearch] = useState("")
  const [namaHasilBaru, setNamaHasilBaru] = useState("")
  const [divisionBaru, setDivisionBaru] = useState<"kitchen" | "bar">("kitchen")
  const [details, setDetails] = useState<FormDetail[]>([])

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["bom-admin"],
    queryFn: async () => {
      const [b, bh] = await Promise.all([
        supabase.from("bom_batch").select("id, bahan_hasil_id, qty_hasil, satuan_hasil, catatan"),
        supabase.from("bahan_baku").select("id, nama, satuan, jenis, division").eq("is_active", true),
      ])
      if (b.error) throw new Error(`bom_batch: ${b.error.message}`)
      if (bh.error) throw new Error(`bahan_baku: ${bh.error.message}`)

      // Coba muat kolom is_utama (migrasi 019); fallback aman jika migrasi belum dijalankan
      let hasIsUtamaCol = true
      let detailRows: Detail[] = []
      const dtWithUtama = await supabase
        .from("bom_batch_detail")
        .select("id, batch_id, bahan_asal_id, qty_asal, satuan_asal, is_utama")
      if (dtWithUtama.error) {
        const msg = String(dtWithUtama.error.message ?? "")
        if (dtWithUtama.error.code === "42703" || msg.includes("is_utama")) {
          hasIsUtamaCol = false
          const dtFallback = await supabase
            .from("bom_batch_detail")
            .select("id, batch_id, bahan_asal_id, qty_asal, satuan_asal")
          if (dtFallback.error) throw new Error(`bom_batch_detail: ${dtFallback.error.message}`)
          detailRows = (dtFallback.data ?? []) as Detail[]
        } else {
          throw new Error(`bom_batch_detail: ${dtWithUtama.error.message}`)
        }
      } else {
        detailRows = (dtWithUtama.data ?? []) as Detail[]
      }

      return {
        batches: (b.data ?? []) as Batch[],
        bahan: new Map((bh.data ?? []).map((x) => [x.id, x as Bahan])),
        allBahan: (bh.data ?? []) as Bahan[],
        details: detailRows,
        hasIsUtamaCol,
      }
    },
  })

  const batches = useMemo(
    () => [...(data?.batches ?? [])].sort((a, b) =>
      (data?.bahan.get(a.bahan_hasil_id)?.nama ?? "").localeCompare(
        data?.bahan.get(b.bahan_hasil_id)?.nama ?? ""
      )
    ),
    [data]
  )

  const existingHasilIds = useMemo(
    () => new Set((data?.batches ?? []).map((b) => b.bahan_hasil_id)),
    [data]
  )

  const existingProsesOptions = useMemo(
    () =>
      (data?.allBahan ?? [])
        .filter((b) => b.jenis === "BAHAN_PRODUKSI" && !existingHasilIds.has(b.id))
        .sort((a, b) => a.nama.localeCompare(b.nama))
        .map((b) => ({
          id: b.id,
          label: b.nama,
          hint: `${b.satuan} · ${b.division === "bar" ? "Bar" : "Kitchen"}`,
        })),
    [data, existingHasilIds]
  )

  const filteredBatches = useMemo(
    () => batches.filter((b) => {
      const nama = data?.bahan.get(b.bahan_hasil_id)?.nama ?? b.bahan_hasil_id
      const q = search.toLowerCase().trim()
      return !q || nama.toLowerCase().includes(q) || (b.catatan ?? "").toLowerCase().includes(q)
    }),
    [batches, data, search]
  )

  const asalOptions = useMemo(
    () => (data?.allBahan ?? []).map((b) => ({ id: b.id, label: b.nama, hint: b.satuan })),
    [data]
  )

  const reset = () => {
    setEditingId(null)
    setBahanHasil("")
    setQtyHasil("")
    setSatuanHasil("GR")
    setCatatan("")
    setNamaHasilBaru("")
    setDivisionBaru("kitchen")
    setDetails([])
  }

  const edit = (batch: Batch) => {
    setEditingId(batch.id)
    setBahanHasil(batch.bahan_hasil_id)
    setQtyHasil(String(batch.qty_hasil ?? ""))
    setSatuanHasil(batch.satuan_hasil)
    setCatatan(batch.catatan ?? "")
    setNamaHasilBaru("")
    const batchDetails = (data?.details ?? []).filter((d) => d.batch_id === batch.id)
    const utamaIds = resolveUtamaIds(batchDetails, data?.bahan ?? new Map(), data?.hasIsUtamaCol ?? false)
    setDetails(
      batchDetails
        .map((d) => ({
          key: d.id,
          bahan_asal_id: d.bahan_asal_id,
          qty_asal: String(d.qty_asal),
          satuan_asal: d.satuan_asal,
          is_utama: utamaIds.has(d.bahan_asal_id),
        }))
        .sort((a, b) => Number(b.is_utama) - Number(a.is_utama))
    )
  }

  const simpan = useMutation({
    mutationFn: async () => {
      if (details.length === 0 || details.some((d) => !d.bahan_asal_id || !(Number(d.qty_asal) > 0))) {
        throw new Error("Isi semua bahan asal dan jumlahnya (> 0).")
      }

      // Validasi tidak ada bahan asal duplikat SEBELUM mutasi DB
      const seenAsal = new Set<string>()
      for (const d of details) {
        if (seenAsal.has(d.bahan_asal_id)) {
          const namaAsal = data?.bahan.get(d.bahan_asal_id)?.nama ?? "bahan yang sama"
          throw new Error(`Bahan asal "${namaAsal}" dipilih lebih dari 1 kali.`)
        }
        seenAsal.add(d.bahan_asal_id)
      }

      let hasilId = bahan_hasil_id
      let createdNewBahan = false
      if (!editingId && namaHasilBaru.trim()) {
        const nama = namaHasilBaru.trim()
        const { data: existing } = await supabase.from("bahan_baku").select("id").ilike("nama", nama).maybeSingle()
        if (existing) {
          hasilId = existing.id
        } else {
          const { data: created, error: cErr } = await supabase.from("bahan_baku")
            .insert({
              nama,
              satuan: satuan_hasil || "GR",
              division: divisionBaru,
              jenis: "BAHAN_PRODUKSI",
              stok_awal: 0,
              minimum_stok: 0,
              is_active: true,
            })
            .select("id")
            .single()
          if (cErr) throw cErr
          hasilId = created.id
          createdNewBahan = true
        }
      }

      if (!hasilId) throw new Error("Pilih bahan proses yang sudah ada atau ketik nama bahan proses baru.")

      const header = {
        bahan_hasil_id: hasilId,
        qty_hasil: Number(qty_hasil) || null,
        satuan_hasil: satuan_hasil || "GR",
        catatan: catatan || null,
      }
      const payload = details.map((d) => ({
        bahan_asal_id: d.bahan_asal_id,
        qty_asal: Number(d.qty_asal),
        satuan_asal: d.satuan_asal || "GR",
        is_utama: d.is_utama,
      }))
      let batchId = editingId
      if (editingId) {
        const { error: hErr } = await supabase.from("bom_batch").update(header).eq("id", editingId)
        if (hErr) throw hErr
        const { error: dErr } = await supabase.from("bom_batch_detail").delete().eq("batch_id", editingId)
        if (dErr) throw dErr
      } else {
        const { data: row, error: hErr } = await supabase.from("bom_batch").insert(header).select("id").single()
        if (hErr) throw hErr
        batchId = row.id
      }
      if (!batchId) throw new Error("Gagal membuat batch")

      const rowsToInsert = data?.hasIsUtamaCol
        ? payload.map((p) => ({ ...p, batch_id: batchId }))
        : payload.map(({ is_utama: _ignored, ...rest }) => ({ ...rest, batch_id: batchId }))

      const { error } = await supabase.from("bom_batch_detail").insert(rowsToInsert as any)
      if (error) {
        const msg = String(error.message ?? "")
        if (error.code === "42703" || msg.includes("is_utama")) {
          const fallbackRows = payload.map(({ is_utama: _ignored, ...rest }) => ({ ...rest, batch_id: batchId }))
          const { error: fbErr } = await supabase.from("bom_batch_detail").insert(fallbackRows as any)
          if (fbErr) throw fbErr
        } else {
          throw error
        }
      }
      return createdNewBahan
    },
    onSuccess: (createdNewBahan) => {
      queryClient.invalidateQueries({ queryKey: ["bom-admin"] })
      queryClient.invalidateQueries({ queryKey: ["produksi-master"] })
      if (createdNewBahan) {
        queryClient.invalidateQueries({ queryKey: ["bahan-baku-aktif"] })
        queryClient.invalidateQueries({ queryKey: ["bahan-baku-options"] })
        queryClient.invalidateQueries({ queryKey: ["bahan-baku-options-div"] })
        queryClient.invalidateQueries({ queryKey: ["bahan-baku-aktif-full"] })
        queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      }
      reset()
    },
  })

  const hapus = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bom_batch").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-admin"] })
      queryClient.invalidateQueries({ queryKey: ["produksi-master"] })
      if (editingId) reset()
    },
  })

  const handleHapus = (b: Batch) => {
    const nama = data?.bahan.get(b.bahan_hasil_id)?.nama ?? "BOM ini"
    if (!confirm(`Hapus BOM untuk "${nama}"? Riwayat Input Masak yang sudah dicatat tidak akan terhapus.`)) return
    hapus.mutate(b.id)
  }

  const errorMessage = loadError
    ? getErrorMessage(loadError)
    : simpan.error
      ? getErrorMessage(simpan.error)
      : hapus.error
        ? getErrorMessage(hapus.error)
        : ""

  const valid =
    (!!bahan_hasil_id || !!namaHasilBaru.trim()) &&
    details.length > 0 &&
    details.every((d) => d.bahan_asal_id && Number(d.qty_asal) > 0)

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        icon={CookingPot}
        title="Atur BOM Bahan Processed"
        description="Tandai Bahan Utama (barang besar) agar bumbu & pendukung otomatis mengikuti skala saat Input Masak."
      />

      {errorMessage && (
        <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{errorMessage}</span>
        </div>
      )}

      {data && !data.hasIsUtamaCol && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Kolom <b>is_utama</b> belum aktif di database. Jalankan migrasi <code>019_bom_bahan_utama.sql</code> di Supabase SQL Editor agar penandaan Bahan Utama tersimpan permanen (sementara sistem memakai deteksi otomatis).
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Edit Batch" : "Batch Baru"}</CardTitle>
          <CardDescription>
            Opsional: tandai barang besar sebagai <b>Utama</b> agar bumbu mengikuti rasio beratnya. Biarkan semua <b>Pendukung</b> jika resepnya murni bumbu (seperti Bumbu Hitam / Bumbu Kuning).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingId ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">Mengubah BOM: </span>
              <b>{data?.bahan.get(bahan_hasil_id)?.nama ?? "-"}</b>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20">
              <div className="space-y-1.5">
                <Label>Pilih Bahan Proses (Sudah Ada)</Label>
                <SearchableSelect
                  value={bahan_hasil_id}
                  onChange={(v) => {
                    setBahanHasil(v)
                    if (v) {
                      setNamaHasilBaru("")
                      setSatuanHasil(data?.bahan.get(v)?.satuan ?? "GR")
                    }
                  }}
                  options={existingProsesOptions}
                  placeholder="Pilih bahan processed tanpa BOM..."
                  emptyText="Tidak ada bahan processed yang belum punya BOM"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Atau Buat Bahan Proses Baru</Label>
                <div className="flex gap-2">
                  <Input
                    className="h-11 flex-1 bg-white"
                    placeholder="Ketik nama bahan proses baru..."
                    value={namaHasilBaru}
                    onChange={(e) => {
                      setNamaHasilBaru(e.target.value)
                      if (e.target.value) setBahanHasil("")
                    }}
                  />
                  <select
                    aria-label="Divisi bahan baru"
                    className="h-11 rounded-md border border-input bg-white px-2.5 text-xs"
                    value={divisionBaru}
                    onChange={(e) => setDivisionBaru(e.target.value as "kitchen" | "bar")}
                  >
                    <option value="kitchen">Kitchen</option>
                    <option value="bar">Bar</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Qty Hasil (Yield)</Label>
              <Input
                type="number"
                min="0"
                step="any"
                className="h-11"
                placeholder="Misal: 1000"
                value={qty_hasil}
                onChange={(e) => setQtyHasil(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Satuan Hasil</Label>
              <Input
                className="h-11"
                placeholder="GR / ML / PORSI"
                value={satuan_hasil}
                onChange={(e) => setSatuanHasil(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Input
                className="h-11"
                placeholder="Misal: yield kartu resep"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Bahan Asal (BOM)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() =>
                  setDetails((s) => [
                    ...s,
                    {
                      key: genKey(),
                      bahan_asal_id: "",
                      qty_asal: "",
                      satuan_asal: "GR",
                      is_utama: false,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Tambah Bahan
              </Button>
            </div>
            {details.map((d) => (
              <div
                key={d.key}
                className={cn(
                  "grid grid-cols-1 sm:grid-cols-[1fr_5.5rem_4.5rem_auto_2.75rem] gap-2 rounded-lg border p-2 items-end",
                  d.is_utama && "border-amber-300 bg-amber-50/40"
                )}
              >
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs font-normal">Bahan</Label>
                  <SearchableSelect
                    value={d.bahan_asal_id}
                    onChange={(v) => setDetails((s) => s.map((x) => x.key === d.key
                      ? { ...x, bahan_asal_id: v, satuan_asal: data?.bahan.get(v)?.satuan ?? "GR" }
                      : x))}
                    options={asalOptions}
                    placeholder="Pilih bahan..."
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-normal">Qty</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="h-11 bg-white"
                    value={d.qty_asal}
                    onChange={(e) => setDetails((s) => s.map((x) => x.key === d.key ? { ...x, qty_asal: e.target.value } : x))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-normal">Satuan</Label>
                  <Input
                    className="h-11 bg-white"
                    value={d.satuan_asal}
                    onChange={(e) => setDetails((s) => s.map((x) => x.key === d.key ? { ...x, satuan_asal: e.target.value } : x))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-normal block">Peran</Label>
                  <Button
                    type="button"
                    variant={d.is_utama ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-11 w-full sm:w-28 gap-1 text-xs",
                      d.is_utama
                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                        : "text-muted-foreground"
                    )}
                    title={
                      d.is_utama
                        ? "Bahan Utama (diinput dapur saat Input Masak)"
                        : "Bumbu & Pendukung (otomatis mengikuti bahan utama)"
                    }
                    onClick={() =>
                      setDetails((s) =>
                        s.map((x) => (x.key === d.key ? { ...x, is_utama: !x.is_utama } : x))
                      )
                    }
                  >
                    <Star className={cn("h-3.5 w-3.5", d.is_utama && "fill-current")} />
                    {d.is_utama ? "Utama" : "Pendukung"}
                  </Button>
                </div>
                <Button type="button" variant="ghost" className="h-11 w-11 p-0" onClick={() => setDetails((s) => s.filter((x) => x.key !== d.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
            {editingId && (
              <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={reset}>
                <X className="h-4 w-4" /> Batal
              </Button>
            )}
            <Button type="button" className="h-11 w-full sm:w-auto" disabled={!valid || simpan.isPending} onClick={() => simpan.mutate()}>
              {simpan.isPending ? "Menyimpan..." : <><Check className="h-4 w-4" /> {editingId ? "Update BOM" : "Simpan BOM"}</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Daftar Batch ({filteredBatches.length})</h2>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari batch..."
              className="h-10 pl-9 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : filteredBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {batches.length === 0 ? "Belum ada BOM. Tambah batch baru." : "Tidak ada batch yang cocok."}
          </p>
        ) : (
          filteredBatches.map((b) => {
            const items = (data?.details ?? []).filter((d) => d.batch_id === b.id)
            const utamaIds = resolveUtamaIds(items, data?.bahan ?? new Map(), data?.hasIsUtamaCol ?? false)
            const utamaItems = items.filter((d) => utamaIds.has(d.bahan_asal_id))
            const pendukungItems = items.filter((d) => !utamaIds.has(d.bahan_asal_id))
            const nama = data?.bahan.get(b.bahan_hasil_id)?.nama ?? b.bahan_hasil_id
            return (
              <Card key={b.id} className={cn(editingId === b.id && "border-primary")}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{nama}</p>
                      <p className="text-xs text-muted-foreground">
                        Hasil {b.qty_hasil ?? "-"} {b.satuan_hasil} ·{" "}
                        {utamaItems.length > 0
                          ? `${utamaItems.length} utama · ${pendukungItems.length} pendukung`
                          : `Batch standar (${pendukungItems.length} bahan)`}
                        {b.catatan ? ` · ${b.catatan}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => edit(b)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleHapus(b)} aria-label="Hapus">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {utamaItems.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="warning" className="text-[10px] h-5 px-1.5 gap-1">
                        <Star className="h-2.5 w-2.5 fill-current" /> Utama
                      </Badge>
                      <span className="font-medium text-foreground">
                        {utamaItems
                          .map((d) => `${data?.bahan.get(d.bahan_asal_id)?.nama ?? "?"} ${d.qty_asal} ${d.satuan_asal}`)
                          .join(" · ")}
                      </span>
                    </div>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] h-5 px-2">
                      Resep Batch Standar (Tanpa Bahan Utama)
                    </Badge>
                  )}
                  {pendukungItems.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">
                        {utamaItems.length > 0 ? `Pendukung (${pendukungItems.length}):` : `Bahan (${pendukungItems.length}):`}
                      </span>{" "}
                      {pendukungItems
                        .map((d) => `${data?.bahan.get(d.bahan_asal_id)?.nama ?? "?"} ${d.qty_asal} ${d.satuan_asal}`)
                        .join(" · ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
