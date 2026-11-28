import { useState, useRef, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { today, formatNumber, getErrorMessage, cn } from "@/lib/utils"
import {
  readPoUploadFile,
  matchPoItemToBahan,
  convertPoQty,
  type ParsedPoRow,
} from "@/lib/importBarangMasuk"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Info } from "lucide-react"
import type { BahanBaku } from "@/types/database"

type FilterPoDiv = "bar" | "kitchen" | "all"

interface EditablePoRow extends ParsedPoRow {
  selected: boolean
  bahan_baku_id: string
  qtyMasuk: string
  note: string
  needsReview: boolean
}

export function BarangMasukImport() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState("")
  const [tanggal, setTanggal] = useState(today())
  const [catatan, setCatatan] = useState("")
  const [divFilter, setDivFilter] = useState<FilterPoDiv>("bar")
  const [rows, setRows] = useState<EditablePoRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const { data: bahanList } = useQuery({
    queryKey: ["bahan-baku-aktif"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bahan_baku")
        .select("*")
        .eq("is_active", true)
        .order("nama")
      if (error) throw error
      return data as BahanBaku[]
    },
  })

  const bahanMap = useMemo(() => {
    const m = new Map<string, BahanBaku>()
    for (const b of bahanList ?? []) m.set(b.id, b)
    return m
  }, [bahanList])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setParseError(null)
    setSuccessMsg(null)
    setFileName(file.name)

    const res = await readPoUploadFile(file)
    if (res.error) {
      setParseError(res.error)
      setRows([])
      return
    }

    if (res.tanggal) setTanggal(res.tanggal)
    setCatatan(`Import PO (${file.name})`)

    const list = bahanList ?? []
    const built: EditablePoRow[] = res.rows.map((r) => {
      const matched = matchPoItemToBahan(r.rawNama, r.division, list)
      if (matched) {
        const conv = convertPoQty(r.qtyOrder, r.satuanOrder, r.rawNama, matched.satuan)
        return {
          ...r,
          selected: r.division !== "non_inventory",
          bahan_baku_id: matched.id,
          qtyMasuk: String(conv.qtyConverted),
          note: conv.note,
          needsReview: conv.needsReview,
        }
      }
      return {
        ...r,
        selected: false,
        bahan_baku_id: "",
        qtyMasuk: String(r.qtyOrder),
        note: r.division === "non_inventory" ? "Diabaikan (Non-Inventori)" : "Belum cocok — pilih manual",
        needsReview: r.division !== "non_inventory",
      }
    })

    const hasBar = built.some((b) => b.division === "bar")
    const hasKitchen = built.some((b) => b.division === "kitchen")
    setDivFilter(hasBar ? "bar" : hasKitchen ? "kitchen" : "all")
    setRows(built)
  }

  const updateRow = (rowKey: string, patch: Partial<EditablePoRow>) => {
    setRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)))
  }

  const handleBahanChange = (row: EditablePoRow, newBahanId: string) => {
    const bahan = bahanMap.get(newBahanId)
    if (!bahan) {
      updateRow(row.rowKey, {
        bahan_baku_id: "",
        selected: false,
        note: "Belum cocok — pilih manual",
        needsReview: true,
      })
      return
    }
    const conv = convertPoQty(row.qtyOrder, row.satuanOrder, row.rawNama, bahan.satuan)
    updateRow(row.rowKey, {
      bahan_baku_id: newBahanId,
      selected: true,
      qtyMasuk: String(conv.qtyConverted),
      note: conv.note,
      needsReview: conv.needsReview,
    })
  }

  const inventoryRows = useMemo(() => rows.filter((r) => r.division !== "non_inventory"), [rows])
  const ignoredRows = useMemo(() => rows.filter((r) => r.division === "non_inventory"), [rows])

  const visibleRows = useMemo(() => {
    if (divFilter === "all") return inventoryRows
    return inventoryRows.filter((r) => r.division === divFilter)
  }, [inventoryRows, divFilter])

  const selectedValidRows = useMemo(
    () =>
      visibleRows.filter((r) => r.selected && r.bahan_baku_id && Number(r.qtyMasuk) > 0),
    [visibleRows]
  )

  const reviewCount = useMemo(
    () => visibleRows.filter((r) => r.selected && r.needsReview).length,
    [visibleRows]
  )

  const bahanOptions = useMemo(() => {
    const list = bahanList ?? []
    const filtered =
      divFilter === "all" ? list : list.filter((b) => b.division === divFilter)
    // Tetap sertakan semua bahan di bawah atau sesuai filter agar mudah dicari
    const pool = filtered.length > 0 ? filtered : list
    return pool.map((b) => ({
      id: b.id,
      label: b.nama,
      hint: `${b.satuan} · ${b.division === "bar" ? "Bar" : "Kitchen"}`,
    }))
  }, [bahanList, divFilter])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tanggal) throw new Error("Tanggal transaksi wajib diisi.")
      if (selectedValidRows.length === 0) {
        throw new Error("Pilih minimal satu barang dengan bahan baku dan qty > 0.")
      }

      const items = selectedValidRows.map((r) => ({
        bahan_baku_id: r.bahan_baku_id,
        qty: Number(r.qtyMasuk),
      }))

      // Coba RPC atomik 018 dulu; fallback ke insert standar bila belum dijalankan
      const rpcRes = await (supabase as any).rpc("catat_transaksi_manual", {
        p_tanggal: tanggal,
        p_jenis: "IN",
        p_alasan_out: null,
        p_catatan: catatan || `Import PO (${fileName})`,
        p_items: items,
      })

      if (rpcRes.error) {
        const msg = String(rpcRes.error.message ?? "")
        const missingFn =
          rpcRes.error.code === "PGRST202" ||
          rpcRes.error.code === "42883" ||
          msg.includes("catat_transaksi_manual")
        if (!missingFn) throw rpcRes.error

        // Fallback standar
        const qtyByBahan = new Map<string, number>()
        for (const it of items) {
          qtyByBahan.set(it.bahan_baku_id, (qtyByBahan.get(it.bahan_baku_id) ?? 0) + it.qty)
        }
        const saldoMap: Record<string, number> = {}
        for (const bahanId of qtyByBahan.keys()) {
          const { data: sData, error: sErr } = await supabase.rpc("get_saldo_bahan", {
            p_bahan_baku_id: bahanId,
          } as any)
          if (sErr) throw sErr
          saldoMap[bahanId] = Number(sData ?? 0)
        }

        const { data: trx, error: trxErr } = await supabase
          .from("transaksi")
          .insert({
            tgl_transaksi: tanggal,
            jenis: "IN",
            sumber: "MANUAL_IN",
            catatan: catatan || `Import PO (${fileName})`,
            is_posted: true,
            posted_at: new Date().toISOString(),
            created_by: profile?.id,
          } as any)
          .select("id")
          .single()
        if (trxErr) throw trxErr

        const running = { ...saldoMap }
        const details = items.map((it) => {
          const before = running[it.bahan_baku_id]
          const after = before + it.qty
          running[it.bahan_baku_id] = after
          return {
            transaksi_id: (trx as any).id,
            bahan_baku_id: it.bahan_baku_id,
            qty: it.qty,
            saldo_sebelum: before,
            saldo_sesudah: after,
          }
        })
        const { error: detErr } = await supabase.from("transaksi_detail").insert(details as any)
        if (detErr) throw detErr
      }

      return selectedValidRows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      queryClient.invalidateQueries({ queryKey: ["riwayat"] })
      queryClient.invalidateQueries({ queryKey: ["rekap-mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["variance-details"] })
      queryClient.invalidateQueries({ queryKey: ["produksi-master"] })
      setSuccessMsg(`Berhasil menyimpan ${count} item barang masuk dari PO pada tanggal ${tanggal}.`)
      setRows([])
      setFileName("")
    },
  })

  const barCount = inventoryRows.filter((r) => r.division === "bar").length
  const kitchenCount = inventoryRows.filter((r) => r.division === "kitchen").length

  return (
    <div className="space-y-5">
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {(parseError || mutation.error) && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{parseError ?? getErrorMessage(mutation.error)}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Upload Excel Request Order / PO Harian
          </CardTitle>
          <CardDescription>
            Unggah file Excel/CSV Request Order pembelian harian. Sistem otomatis memisahkan PO TO (Bar / Kitchen), mengabaikan Staff Meal &amp; Operasional, mencocokkan bahan baku, serta mengonversi satuan (KG→GR, L→ML, kemasan).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors bg-muted/10"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
            <p className="text-sm font-semibold text-foreground">
              {fileName ? fileName : "Klik untuk pilih file Excel / CSV Request Order"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Format yang didukung: .xlsx, .xls, .csv (kolom NAMA BARANG, PO TO, QTY ORDER, SATUAN)
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleUpload}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tanggal Barang Masuk</Label>
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan Transaksi</Label>
              <Input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Import PO harian..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Preview &amp; Konfirmasi Barang Masuk</CardTitle>
                <CardDescription>
                  Periksa pencocokan bahan baku dan jumlah konversi (baris berwarna kuning perlu dicek manual).
                </CardDescription>
              </div>
              <Badge variant="outline" className="self-start sm:self-center">
                {selectedValidRows.length} / {visibleRows.length} item siap disimpan
              </Badge>
            </div>

            {/* Filter PO TO */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={divFilter === "bar" ? "default" : "outline"}
                onClick={() => setDivFilter("bar")}
              >
                Bar ({barCount})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={divFilter === "kitchen" ? "default" : "outline"}
                onClick={() => setDivFilter("kitchen")}
              >
                Kitchen ({kitchenCount})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={divFilter === "all" ? "default" : "outline"}
                onClick={() => setDivFilter("all")}
              >
                Semua Inventori ({inventoryRows.length})
              </Button>
            </div>

            {ignoredRows.length > 0 && (
              <div className="text-xs bg-muted/40 border rounded-md p-2.5 text-muted-foreground flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <b>{ignoredRows.length} item non-inventori</b> ({Array.from(new Set(ignoredRows.map((r) => r.poTo))).join(", ")}) otomatis diabaikan:{" "}
                  {ignoredRows.map((r) => r.rawNama).join(", ")}
                </span>
              </div>
            )}

            {reviewCount > 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2.5 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Ada <b>{reviewCount} item terpilih</b> yang satuannya butuh dicek (mis. DUS → BOTOL atau satuan berbeda). Pastikan angka Qty Masuk sesuai stok fisik yang diterima.
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b text-xs">
                  <tr>
                    <th className="px-3 py-2.5 text-center w-10">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua"
                        checked={
                          visibleRows.length > 0 &&
                          visibleRows.every((r) => !r.bahan_baku_id || r.selected)
                        }
                        onChange={(e) => {
                          const checked = e.target.checked
                          const visKeys = new Set(visibleRows.map((v) => v.rowKey))
                          setRows((prev) =>
                            prev.map((r) =>
                              visKeys.has(r.rowKey) && r.bahan_baku_id
                                ? { ...r, selected: checked }
                                : r
                            )
                          )
                        }}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold">Item di PO</th>
                    <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Order PO</th>
                    <th className="px-3 py-2.5 text-left font-semibold min-w-[240px]">Cocokkan ke Bahan Baku</th>
                    <th className="px-3 py-2.5 text-left font-semibold min-w-[160px]">Qty Masuk (DB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                        Tidak ada item PO untuk divisi ini.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const bahan = row.bahan_baku_id ? bahanMap.get(row.bahan_baku_id) : undefined
                      return (
                        <tr
                          key={row.rowKey}
                          className={cn(
                            "align-top",
                            !row.bahan_baku_id
                              ? "bg-amber-50/40"
                              : row.needsReview && row.selected
                              ? "bg-amber-50/70"
                              : ""
                          )}
                        >
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={!row.bahan_baku_id}
                              onChange={(e) => updateRow(row.rowKey, { selected: e.target.checked })}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground leading-snug">{row.rawNama}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                {row.poTo}
                              </Badge>
                              {row.vendor && (
                                <span className="text-[11px] text-muted-foreground">{row.vendor}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-xs">
                            <span className="font-semibold">{formatNumber(row.qtyOrder)}</span>{" "}
                            <span className="text-muted-foreground">{row.satuanOrder || "-"}</span>
                          </td>
                          <td className="px-3 py-2">
                            <SearchableSelect
                              value={row.bahan_baku_id}
                              onChange={(val) => handleBahanChange(row, val)}
                              options={bahanOptions}
                              placeholder="Pilih bahan baku..."
                              emptyText="Tidak ditemukan"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                className="h-10 bg-white w-28"
                                value={row.qtyMasuk}
                                disabled={!row.bahan_baku_id}
                                onChange={(e) =>
                                  updateRow(row.rowKey, { qtyMasuk: e.target.value, needsReview: false })
                                }
                              />
                              <span className="text-xs font-medium text-muted-foreground shrink-0">
                                {bahan?.satuan ?? "-"}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "text-[11px] mt-1",
                                row.needsReview ? "text-amber-700 font-medium" : "text-muted-foreground"
                              )}
                            >
                              {row.note}
                            </p>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Hanya baris yang dicentang dan sudah dipetakan ke bahan baku yang akan disimpan.
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setRows([])
                    setFileName("")
                    setParseError(null)
                  }}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={selectedValidRows.length === 0 || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending
                    ? "Menyimpan..."
                    : `Simpan ${selectedValidRows.length} Item Masuk`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
