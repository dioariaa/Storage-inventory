import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { CookingPot, Plus, Trash2, Pencil, Check, X, AlertTriangle, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { PageHeader } from "@/components/common/PageHeader"

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
  id: string
  batch_id: string
  bahan_asal_id: string
  qty_asal: number
  satuan_asal: string
}

interface FormDetail {
  key: string
  bahan_asal_id: string
  qty_asal: string
  satuan_asal: string
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
  const [satuanHasilBaru, setSatuanHasilBaru] = useState("GR")
  const [details, setDetails] = useState<FormDetail[]>([])

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["bom-admin"],
    queryFn: async () => {
      const [b, bh, dt] = await Promise.all([
        supabase.from("bom_batch").select("id, bahan_hasil_id, qty_hasil, satuan_hasil, catatan"),
        supabase.from("bahan_baku").select("id, nama, satuan, jenis").eq("is_active", true),
        supabase.from("bom_batch_detail").select("id, batch_id, bahan_asal_id, qty_asal, satuan_asal"),
      ])
      if (b.error) throw new Error(`bom_batch: ${b.error.message}`)
      if (bh.error) throw new Error(`bahan_baku: ${bh.error.message}`)
      if (dt.error) throw new Error(`bom_batch_detail: ${dt.error.message}`)
      return {
        batches: (b.data ?? []) as Batch[],
        bahan: new Map((bh.data ?? []).map((x) => [x.id, x as Bahan])),
        allBahan: (bh.data ?? []) as Bahan[],
        details: (dt.data ?? []) as Detail[],
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
    setSatuanHasilBaru("GR")
    setDetails([])
  }

  const edit = (batch: Batch) => {
    setEditingId(batch.id)
    setBahanHasil(batch.bahan_hasil_id)
    setQtyHasil(String(batch.qty_hasil ?? ""))
    setSatuanHasil(batch.satuan_hasil)
    setCatatan(batch.catatan ?? "")
    setNamaHasilBaru("")
    setDetails(
      (data?.details ?? [])
        .filter((d) => d.batch_id === batch.id)
        .map((d) => ({
          key: d.id,
          bahan_asal_id: d.bahan_asal_id,
          qty_asal: String(d.qty_asal),
          satuan_asal: d.satuan_asal,
        }))
    )
  }

  const simpan = useMutation({
    mutationFn: async () => {
      let hasilId = bahan_hasil_id
      if (namaHasilBaru.trim()) {
        const nama = namaHasilBaru.trim()
        const { data: existing } = await supabase.from("bahan_baku").select("id").ilike("nama", nama).maybeSingle()
        if (existing) {
          hasilId = existing.id
        } else {
          const { data: created, error: cErr } = await supabase.from("bahan_baku")
            .insert({ nama, satuan: satuanHasilBaru || "GR", division: "kitchen", jenis: "BAHAN_PRODUKSI", stok_awal: 0, minimum_stok: 0, is_active: true })
            .select("id").single()
          if (cErr) throw cErr
          hasilId = created.id
        }
      }
      if (!hasilId) throw new Error("Pilih atau ketik bahan hasil")
      if (details.length === 0 || details.some((d) => !d.bahan_asal_id || !(Number(d.qty_asal) > 0))) {
        throw new Error("Isi bahan asal dengan benar")
      }
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
      const { error } = await supabase.from("bom_batch_detail").insert(
        payload.map((p) => ({ ...p, batch_id: batchId }))
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-admin"] })
      queryClient.invalidateQueries({ queryKey: ["produksi-master"] })
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

  const errorMessage = loadError
    ? String(loadError)
    : simpan.error
      ? (simpan.error as any)?.message ?? String(simpan.error)
      : hapus.error
        ? (hapus.error as any)?.message ?? String(hapus.error)
        : ""

  const valid = (!!bahan_hasil_id || !!namaHasilBaru.trim()) && details.length > 0 && details.every((d) => d.bahan_asal_id && Number(d.qty_asal) > 0)

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        icon={CookingPot}
        title="Atur BOM Bahan Processed"
        description="Resep dasar untuk prefill Input Masak. Bisa diubah kapan saja."
      />

      {errorMessage && (
        <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{errorMessage}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Edit Batch" : "Batch Baru"}</CardTitle>
          <CardDescription>Satu batch = satu bahan hasil + daftar bahan asal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingId && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">Mengubah BOM: </span>
              <b>{data?.bahan.get(bahan_hasil_id)?.nama ?? "-"}</b>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3 p-3 rounded-lg border">
            <div className="space-y-1.5">
              <Label>Nama Bahan Proses Baru</Label>
              <Input className="h-11" placeholder="Ketik nama bahan proses baru" value={namaHasilBaru} onChange={(e) => { setNamaHasilBaru(e.target.value); if (e.target.value) setBahanHasil("") }} />
            </div>
            <div className="space-y-1.5">
              <Label>Satuan Hasil</Label>
              <Input className="h-11" value={satuanHasilBaru} onChange={(e) => setSatuanHasilBaru(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Qty Hasil</Label>
              <Input type="number" min="0" step="any" className="h-11" value={qty_hasil} onChange={(e) => setQtyHasil(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Satuan Hasil</Label>
              <Input className="h-11" value={satuan_hasil} onChange={(e) => setSatuanHasil(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Input className="h-11" placeholder="Misal: yield kartu wawancara" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
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
                onClick={() => setDetails((s) => [...s, { key: genKey(), bahan_asal_id: "", qty_asal: "", satuan_asal: "GR" }])}
              >
                <Plus className="h-4 w-4" /> Tambah Bahan
              </Button>
            </div>
            {details.map((d) => (
              <div key={d.key} className="grid grid-cols-[1fr_5rem_5rem_2.75rem] gap-2 rounded-lg border p-2 items-end">
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
                  <Input type="number" min="0" step="any" className="h-11" value={d.qty_asal} onChange={(e) => setDetails((s) => s.map((x) => x.key === d.key ? { ...x, qty_asal: e.target.value } : x))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-normal">Satuan</Label>
                  <Input className="h-11" value={d.satuan_asal} onChange={(e) => setDetails((s) => s.map((x) => x.key === d.key ? { ...x, satuan_asal: e.target.value } : x))} />
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
            const nama = data?.bahan.get(b.bahan_hasil_id)?.nama ?? b.bahan_hasil_id
            return (
              <Card key={b.id} className={cn(editingId === b.id && "border-primary")}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{nama}</p>
                      <p className="text-xs text-muted-foreground">
                        Hasil {b.qty_hasil ?? "-"} {b.satuan_hasil} · {items.length} bahan
                        {b.catatan ? ` · ${b.catatan}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => edit(b)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => hapus.mutate(b.id)} aria-label="Hapus">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {items.map((d) => `${data?.bahan.get(d.bahan_asal_id)?.nama ?? "?"} ${d.qty_asal} ${d.satuan_asal}`).join(" · ")}
                  </p>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
