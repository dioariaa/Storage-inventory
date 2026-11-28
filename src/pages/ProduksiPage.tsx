import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { CookingPot, Plus, Trash2, CheckCircle2, AlertTriangle, RefreshCw, Eye } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { today, formatNumber, getErrorMessage } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
  batch_id: string
  bahan_asal_id: string
  qty_asal: number
  satuan_asal: string
}

interface Row {
  key: string
  bahan_id: string
  qty: number
  satuan?: string
  asal?: boolean
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
const blankRow = (): Row => ({ key: genKey(), bahan_id: "", qty: 1 })

export function ProduksiPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [tanggal, setTanggal] = useState(today())
  const [catatan, setCatatan] = useState("")
  const [inRows, setInRows] = useState<Row[]>([blankRow()])
  const [outRows, setOutRows] = useState<Row[]>([blankRow()])
  const [selectedBatch, setSelectedBatch] = useState("")
  const [success, setSuccess] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)

  const { data: master, isLoading, error: loadError } = useQuery({
    queryKey: ["produksi-master"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      const [b, d, batch, sal] = await Promise.all([
        supabase.from("bahan_baku").select("id, nama, satuan, jenis").eq("is_active", true),
        supabase.from("bom_batch_detail").select("batch_id, bahan_asal_id, qty_asal, satuan_asal"),
        supabase.from("bom_batch").select("id, bahan_hasil_id, qty_hasil, satuan_hasil, catatan"),
        supabase.from("v_saldo_bahan_baku").select("id, saldo_akhir"),
      ])
      if (b.error) throw new Error(`bahan_baku: ${b.error.message}`)
      if (d.error) throw new Error(`bom_batch_detail: ${d.error.message}`)
      if (batch.error) throw new Error(`bom_batch: ${batch.error.message}`)
      if (sal.error) throw new Error(`v_saldo_bahan_baku: ${sal.error.message}`)
      return {
        bahan: new Map((b.data ?? []).map((x) => [x.id, x as Bahan])),
        allBahan: (b.data ?? []) as Bahan[],
        details: (d.data ?? []) as Detail[],
        batches: (batch.data ?? []) as Batch[],
        saldo: new Map((sal.data ?? []).map((x) => [x.id, Number(x.saldo_akhir ?? 0)])),
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

  const loadDariBom = (batchId: string) => {
    const b = (master?.batches ?? []).find((x) => x.id === batchId)
    if (!b) return
    setSelectedBatch(batchId)
    setPreview(null)
    const items = (master?.details ?? []).filter((d) => d.batch_id === batchId)
    setInRows(items.map((d) => ({
      key: genKey(),
      bahan_id: d.bahan_asal_id,
      qty: d.qty_asal,
      satuan: d.satuan_asal,
      asal: true,
    })))
    setOutRows([{ key: genKey(), bahan_id: b.bahan_hasil_id, qty: Number(b.qty_hasil ?? 0) }])
  }

  const isiUlangBom = () => { if (selectedBatch) loadDariBom(selectedBatch) }

  const updateIn = (key: string, patch: Partial<Row>) => {
    setPreview(null)
    setInRows((s) => s.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  const updateOut = (key: string, patch: Partial<Row>) => {
    setPreview(null)
    setOutRows((s) => s.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const valid = (rows: Row[]) => rows.length > 0 && rows.every((r) => r.bahan_id && Number(r.qty) > 0)

  const hitungPreview = () => {
    const saldoMap = master?.saldo ?? new Map<string, number>()
    const gabung = (rows: Row[]) => {
      const acc = new Map<string, PreviewRow>()
      rows.forEach((r) => {
        const nama = master?.bahan.get(r.bahan_id)?.nama ?? "?"
        const satuan = r.satuan || master?.bahan.get(r.bahan_id)?.satuan || ""
        const saldo = saldoMap.get(r.bahan_id) ?? 0
        const prev = acc.get(r.bahan_id)
        if (prev) {
          prev.qty += Number(r.qty)
        } else {
          acc.set(r.bahan_id, { bahan_id: r.bahan_id, nama, qty: Number(r.qty), satuan, saldo, sesudah: saldo, cukup: true })
        }
      })
      return [...acc.values()]
    }
    const out = gabung(inRows).map((r) => ({ ...r, sesudah: r.saldo - r.qty, cukup: r.saldo >= r.qty }))
    const inp = gabung(outRows).map((r) => ({ ...r, sesudah: r.saldo + r.qty, cukup: true }))
    setPreview({ out, in: inp })
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
      setInRows([blankRow()])
      setOutRows([blankRow()])
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  const errorMessage = loadError
    ? `Data BOM gagal dimuat. ${getErrorMessage(loadError)}`
    : mutation.error
      ? getErrorMessage(mutation.error)
      : ""

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={CookingPot}
        title="Input Masak"
        description="Pilih bahan proses: BOM otomatis terisi. Edit qty sesuai pemakaian nyata."
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
          <CardDescription>BOM otomatis mengisi bahan terpakai dan hasil di bawah.</CardDescription>
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
            <Button type="button" variant="ghost" size="sm" className="h-11 mt-2" onClick={isiUlangBom}>
              <RefreshCw className="h-4 w-4" /> Isi ulang dari BOM
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bahan Terpakai</CardTitle>
          <CardDescription>Otomatis terisi setelah pilih bahan proses. Edit qty/tambah bahan kalau pemakaian beda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {inRows.map((r) => (
              <div key={r.key} className="flex gap-2 rounded-lg border p-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-normal">Bahan</Label>
                  <SearchableSelect
                    value={r.bahan_id}
                    onChange={(v) => { updateIn(r.key, { bahan_id: v, satuan: master?.bahan.get(v)?.satuan }); setSelectedBatch("") }}
                    options={bahanOptions}
                    placeholder="Pilih bahan..."
                    className="h-11"
                  />
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs font-normal">Jumlah</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="h-11"
                    value={r.qty || ""}
                    onChange={(e) => updateIn(r.key, { qty: Number(e.target.value) || 0, asal: false })}
                  />
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
            ))}
          </div>
          <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={() => { setPreview(null); setInRows((s) => [...s, blankRow()]) }}>
            <Plus className="h-4 w-4" /> Tambah Bahan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hasil Masak</CardTitle>
          <CardDescription>Isi dari BOM. Bisa edit manual atau tambah hasil lain.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {outRows.map((r) => (
            <div key={r.key} className="flex gap-2 rounded-lg border p-2">
              <div className="flex-1 space-y-1">
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
              <div className="w-28 space-y-1">
                <Label className="text-xs font-normal">Jumlah</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  className="h-11"
                  value={r.qty || ""}
                  onChange={(e) => updateOut(r.key, { qty: Number(e.target.value) || 0 })}
                />
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
          ))}
          <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={() => { setPreview(null); setOutRows((s) => [...s, blankRow()]) }}>
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
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">*Konfirmasi menyimpan transaksi OUT + IN sekaligus.</p>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" onClick={() => setPreview(null)} className="w-full sm:w-auto">Tutup Preview</Button>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || preview.out.some((r) => !r.cukup)}
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
          onClick={() => { setSelectedBatch(""); setPreview(null); setInRows([blankRow()]); setOutRows([blankRow()]); setCatatan("") }}
        >
          Reset
        </Button>
        <Button
          type="button"
          className="h-11 w-full sm:w-auto"
          disabled={!valid(inRows) || !valid(outRows) || isLoading}
          onClick={hitungPreview}
        >
          <Eye className="h-4 w-4" /> Hitung & Preview Perubahan Stok
        </Button>
      </div>
    </div>
  )
}
