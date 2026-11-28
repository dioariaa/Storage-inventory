import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { formatDate, formatDateTime, formatNumber, today, daysAgo, getErrorMessage } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { History, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react"
import type { MutasiDashboard } from "@/types/database"
import { TRANSACTION_SOURCE_LABEL } from "@/types/database"
import { PageHeader } from "@/components/common/PageHeader"

export function RiwayatPage() {
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === "admin"
  const queryClient = useQueryClient()

  const [dateFrom, setDateFrom] = useState(() => daysAgo(30))
  const [dateTo, setDateTo] = useState(today)
  const [filterDivision, setFilterDivision] = useState<"all" | "bar" | "kitchen">("all")
  const [filterBahan, setFilterBahan] = useState("all")
  const [filterJenis, setFilterJenis] = useState("all")
  const [filterSumber, setFilterSumber] = useState("all")
  const [deleteTarget, setDeleteTarget] = useState<MutasiDashboard | null>(null)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const { data: mutasi, isLoading } = useQuery({
    queryKey: ["riwayat", dateFrom, dateTo, filterBahan, filterJenis, filterSumber],
    queryFn: () =>
      fetchAllRows<MutasiDashboard>((from, to) => {
        let q = supabase.from("v_mutasi_dashboard").select("*")
        if (dateFrom) q = q.gte("tgl_transaksi", dateFrom)
        if (dateTo) q = q.lte("tgl_transaksi", dateTo)
        if (filterBahan !== "all") q = q.eq("bahan_baku_id", filterBahan)
        if (filterJenis !== "all") q = q.eq("jenis", filterJenis)
        if (filterSumber !== "all") q = q.eq("sumber", filterSumber)

        return q
          .order("tgl_transaksi", { ascending: false })
          .order("waktu_pencatatan", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
      }),
  })

  const { data: bahanList } = useQuery({
    queryKey: ["bahan-baku-options-div"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bahan_baku")
        .select("id, nama, division")
        .order("nama")
      if (error) throw error
      return data as { id: string; nama: string; division: "bar" | "kitchen" }[]
    },
  })

  const bahanDivMap = useMemo(() => {
    const m = new Map<string, "bar" | "kitchen">()
    for (const b of bahanList ?? []) m.set(b.id, b.division)
    return m
  }, [bahanList])

  const filteredBahanOptions = useMemo(() => {
    if (!bahanList) return []
    if (filterDivision === "all") return bahanList
    return bahanList.filter((b) => b.division === filterDivision)
  }, [bahanList, filterDivision])

  const filteredMutasi = useMemo(() => {
    const list = mutasi ?? []
    if (filterDivision === "all") return list
    return list.filter((row) => bahanDivMap.get(row.bahan_baku_id) === filterDivision)
  }, [mutasi, filterDivision, bahanDivMap])

  const deleteMutation = useMutation({
    mutationFn: async (transaksiId: string) => {
      const rpcRes = await (supabase as any).rpc("hapus_transaksi", {
        p_transaksi_id: transaksiId,
      })

      if (rpcRes.error) {
        const msg = String(rpcRes.error.message ?? "")
        const missingFn =
          rpcRes.error.code === "PGRST202" ||
          rpcRes.error.code === "42883" ||
          msg.includes("hapus_transaksi")
        if (!missingFn) throw rpcRes.error

        // Fallback Admin langsung via RLS
        const { data: trx, error: trxErr } = await supabase
          .from("transaksi")
          .select("id, penjualan_id, produksi_id")
          .eq("id", transaksiId)
          .single()
        if (trxErr) throw trxErr

        if ((trx as any)?.penjualan_id) {
          const { error: pErr } = await supabase
            .from("penjualan")
            .delete()
            .eq("id", (trx as any).penjualan_id)
          if (pErr) throw pErr
        }

        if ((trx as any)?.produksi_id) {
          const { error: dErr } = await supabase
            .from("transaksi")
            .delete()
            .eq("produksi_id", (trx as any).produksi_id)
          if (dErr) throw dErr
        } else {
          const { error: dErr } = await supabase
            .from("transaksi")
            .delete()
            .eq("id", transaksiId)
          if (dErr) throw dErr
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["riwayat"] })
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["mutasi-menu"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      queryClient.invalidateQueries({ queryKey: ["rekap-mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["variance-details"] })
      setDeleteTarget(null)
      setFeedback({ type: "success", text: "Transaksi berhasil dihapus permanen dan saldo bahan baku telah disesuaikan." })
      setTimeout(() => setFeedback(null), 4000)
    },
    onError: (err: unknown) => {
      setDeleteTarget(null)
      setFeedback({ type: "error", text: `Gagal menghapus transaksi: ${getErrorMessage(err)}` })
    },
  })

  const colCount = isAdmin ? 11 : 10

  return (
    <div className="space-y-6">
      <PageHeader
        icon={History}
        title="Riwayat Transaksi"
        description="Penelusuran lengkap seluruh mutasi, barang masuk, dan barang keluar"
      />

      {feedback && (
        <div
          className={
            feedback.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm flex items-center gap-2"
              : "bg-destructive/10 text-destructive rounded-lg p-4 text-sm flex items-center gap-2"
          }
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">Divisi:</span>
            {(["all", "bar", "kitchen"] as const).map((div) => (
              <Button
                key={div}
                type="button"
                size="sm"
                variant={filterDivision === div ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => {
                  setFilterDivision(div)
                  setFilterBahan("all")
                }}
              >
                {div === "all" ? "Semua Divisi" : div === "bar" ? "Bar" : "Kitchen"}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dari Tanggal</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sampai Tanggal</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bahan Baku</Label>
              <Select value={filterBahan} onValueChange={setFilterBahan}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua bahan</SelectItem>
                  {filteredBahanOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Jenis</Label>
              <Select value={filterJenis} onValueChange={setFilterJenis}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  <SelectItem value="IN">IN (Masuk)</SelectItem>
                  <SelectItem value="OUT">OUT (Keluar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sumber</Label>
              <Select value={filterSumber} onValueChange={setFilterSumber}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Sumber</SelectItem>
                  <SelectItem value="MANUAL_IN">Manual IN</SelectItem>
                  <SelectItem value="MANUAL_OUT">Manual OUT</SelectItem>
                  <SelectItem value="PRODUKSI">Input Masak / Produksi</SelectItem>
                  <SelectItem value="POS_IMPORT">Import POS</SelectItem>
                  <SelectItem value="MANUAL_SALE">Penjualan Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabel */}
      <Card>
        <CardHeader className="py-4 border-b bg-muted/30">
          <CardTitle className="text-sm font-bold uppercase tracking-wider">
            Hasil ({isLoading ? "..." : filteredMutasi.length} baris mutasi)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden lg:block max-h-[600px] overflow-y-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 border-b">
                  <tr>
                    <th className="text-left px-2.5 py-3 font-medium text-muted-foreground whitespace-nowrap">Tgl</th>
                    <th className="text-left px-2.5 py-3 font-medium text-muted-foreground whitespace-nowrap">Waktu Catat</th>
                    <th className="text-left px-2.5 py-3 font-medium text-muted-foreground">Bahan Baku</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground">Jenis</th>
                    <th className="text-right px-2.5 py-3 font-medium text-muted-foreground">Qty</th>
                    <th className="text-right px-2.5 py-3 font-medium text-muted-foreground whitespace-nowrap">Saldo Sblm</th>
                    <th className="text-right px-2.5 py-3 font-medium text-muted-foreground whitespace-nowrap">Saldo Ssdh</th>
                    <th className="text-left px-2.5 py-3 font-medium text-muted-foreground">Sumber</th>
                    <th className="text-left px-2.5 py-3 font-medium text-muted-foreground">Catatan</th>
                    <th className="text-left px-2.5 py-3 font-medium text-muted-foreground">User</th>
                    {isAdmin && (
                      <th className="text-center px-2 py-3 font-medium text-muted-foreground sticky right-0 bg-muted/95">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: colCount }).map((_, j) => (
                            <td key={j} className="px-2.5 py-3">
                              <Skeleton className="h-4 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : filteredMutasi.length === 0
                    ? (
                      <tr>
                        <td colSpan={colCount} className="px-4 py-12 text-center text-muted-foreground">
                          Tidak ada transaksi ditemukan untuk filter ini.
                        </td>
                      </tr>
                    )
                    : filteredMutasi.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-2.5 py-2.5 whitespace-nowrap text-xs">{formatDate(row.tgl_transaksi)}</td>
                          <td className="px-2.5 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                            {formatDateTime(row.waktu_pencatatan)}
                          </td>
                          <td className="px-2.5 py-2.5 font-medium text-xs max-w-[180px] truncate" title={row.bahan_baku_nama}>
                            {row.bahan_baku_nama}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <Badge variant={row.jenis === "IN" ? "success" : "destructive"} className="h-5">
                              {row.jenis}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-medium tabular-nums whitespace-nowrap text-xs">
                            <span className={row.jenis === "IN" ? "text-green-700" : "text-red-600"}>
                              {row.jenis === "IN" ? "+" : "-"}{formatNumber(row.qty)} {row.satuan}
                            </span>
                          </td>
                          <td className="px-2.5 py-2.5 text-right text-muted-foreground tabular-nums whitespace-nowrap text-xs">
                            {formatNumber(row.saldo_sebelum)} {row.satuan}
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap text-xs">
                            {formatNumber(row.saldo_sesudah)} {row.satuan}
                          </td>
                          <td className="px-2.5 py-2.5 whitespace-nowrap">
                            <span className="text-xs text-muted-foreground font-medium">
                              {TRANSACTION_SOURCE_LABEL[row.sumber] ?? row.sumber}
                            </span>
                          </td>
                          <td className="px-2.5 py-2.5 text-muted-foreground text-xs max-w-[120px] truncate" title={row.catatan ?? ""}>
                            {row.catatan ?? (row.alasan_out ? `Alasan: ${row.alasan_out}` : "-")}
                          </td>
                          <td className="px-2.5 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                            {row.created_by_name ?? "-"}
                          </td>
                          {isAdmin && (
                            <td className="px-2 py-2 text-center sticky right-0 bg-card/95">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Hapus seluruh transaksi ini"
                                aria-label={`Hapus transaksi ${row.bahan_baku_nama}`}
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden max-h-[600px] overflow-y-auto divide-y divide-border">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))
              : filteredMutasi.length === 0
              ? (
                <div className="px-4 py-12 text-center text-muted-foreground">
                  Tidak ada transaksi ditemukan untuk filter ini.
                </div>
              )
              : filteredMutasi.map((row, idx) => {
                  const prevDate = filteredMutasi[idx - 1]?.tgl_transaksi
                  const showDateHeader = row.tgl_transaksi !== prevDate
                  return (
                    <div key={row.id}>
                      {showDateHeader && (
                        <div className="px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground sticky top-0 z-10">
                          {formatDate(row.tgl_transaksi)}
                        </div>
                      )}
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between min-h-[44px]">
                          <span className="font-medium text-sm">{row.bahan_baku_nama}</span>
                          <Badge variant={row.jenis === "IN" ? "success" : "destructive"} className="h-5">
                            {row.jenis}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between min-h-[44px]">
                          <span className="text-sm text-muted-foreground">Jumlah</span>
                          <span className={`text-sm font-medium tabular-nums ${row.jenis === "IN" ? "text-green-700" : "text-red-600"}`}>
                            {row.jenis === "IN" ? "+" : "-"}{formatNumber(row.qty)} {row.satuan}
                          </span>
                        </div>
                        <div className="flex items-center justify-between min-h-[44px]">
                          <span className="text-sm text-muted-foreground">Saldo</span>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatNumber(row.saldo_sesudah)} {row.satuan}
                          </span>
                        </div>
                        <div className="flex items-center justify-between min-h-[44px]">
                          <span className="text-sm text-muted-foreground">Sumber</span>
                          <Badge variant="secondary" className="h-5 text-xs">
                            {TRANSACTION_SOURCE_LABEL[row.sumber] ?? row.sumber}
                          </Badge>
                        </div>
                        {(row.catatan || row.alasan_out) && (
                          <div className="text-xs text-muted-foreground pt-1">
                            {row.catatan ?? `Alasan: ${row.alasan_out}`}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(row.waktu_pencatatan)} · {row.created_by_name ?? "-"}
                          </span>
                          {isAdmin && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Hapus
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
          </div>
        </CardContent>
      </Card>

      {/* Dialog Konfirmasi Hapus Permanen (Admin) */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Hapus Transaksi Permanen?
            </DialogTitle>
            <DialogDescription>
              Tindakan ini menghapus <b>seluruh batch transaksi</b> yang terkait dengan baris ini secara permanen dan langsung mengembalikan saldo bahan baku.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
              <p><b>Tanggal:</b> {formatDate(deleteTarget.tgl_transaksi)}</p>
              <p><b>Sumber:</b> {TRANSACTION_SOURCE_LABEL[deleteTarget.sumber] ?? deleteTarget.sumber}</p>
              <p><b>Item dipilih:</b> {deleteTarget.bahan_baku_nama} ({deleteTarget.jenis === "IN" ? "+" : "-"}{formatNumber(deleteTarget.qty)} {deleteTarget.satuan})</p>
              {deleteTarget.catatan && <p><b>Catatan:</b> {deleteTarget.catatan}</p>}
              {(deleteTarget.sumber === "POS_IMPORT" || deleteTarget.sumber === "MANUAL_SALE") && (
                <p className="text-amber-700 font-medium pt-1">
                  Catatan: Data penjualan terkait (termasuk semua bahan yang terpotong dalam nota POS ini) juga akan dihapus agar Anda bisa meng-import ulang bila salah.
                </p>
              )}
              {deleteTarget.sumber === "PRODUKSI" && (
                <p className="text-amber-700 font-medium pt-1">
                  Catatan: Kedua sisi Input Masak (bahan terpakai OUT dan hasil masak IN) akan dihapus bersamaan agar stok tetap seimbang.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.transaksi_id)}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
