import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { History, Search, RotateCcw } from "lucide-react"
import type { MutasiDashboard } from "@/types/database"
import { TRANSACTION_SOURCE_LABEL } from "@/types/database"
import { today } from "@/lib/utils"
import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"

export function RiwayatPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(today)
  const [filterBahan, setFilterBahan] = useState("all")
  const [filterJenis, setFilterJenis] = useState("all")
  const [filterSumber, setFilterSumber] = useState("all")

  const { data: mutasi, isLoading } = useQuery({
    queryKey: ["riwayat", dateFrom, dateTo, filterBahan, filterJenis, filterSumber],
    queryFn: async () => {
      let q = supabase
        .from("v_mutasi_dashboard")
        .select("*")
        .gte("tgl_transaksi", dateFrom)
        .lte("tgl_transaksi", dateTo)
        .order("tgl_transaksi", { ascending: false })
        .order("waktu_pencatatan", { ascending: false })

      if (filterBahan !== "all") q = q.eq("bahan_baku_id", filterBahan)
      if (filterJenis !== "all") q = q.eq("jenis", filterJenis)
      if (filterSumber !== "all") q = q.eq("sumber", filterSumber)

      const { data, error } = await q
      if (error) throw error
      return data as MutasiDashboard[]
    },
  })

  const { data: bahanList } = useQuery({
    queryKey: ["bahan-baku-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bahan_baku").select("id, nama").order("nama")
      if (error) throw error
      return data as { id: string; nama: string }[]
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        icon={History}
        title="Riwayat Transaksi"
        description="Penelusuran lengkap seluruh mutasi, barang masuk, dan barang keluar"
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
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
                  {bahanList?.map((b) => (
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
            Hasil ({isLoading ? "..." : mutasi?.length ?? 0} transaksi)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tgl Transaksi</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Waktu Catat</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bahan Baku</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Jenis</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Sebelum</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Sesudah</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sumber</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Catatan</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 10 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : mutasi?.length === 0
                  ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        Tidak ada transaksi ditemukan untuk filter ini.
                      </td>
                    </tr>
                  )
                  : mutasi?.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{formatDate(row.tgl_transaksi)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                          {formatDateTime(row.waktu_pencatatan)}
                        </td>
                        <td className="px-4 py-3 font-medium">{row.bahan_baku_nama}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={row.jenis === "IN" ? "success" : "destructive"} className="h-5">
                            {row.jenis}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          <span className={row.jenis === "IN" ? "text-green-700" : "text-red-600"}>
                            {row.jenis === "IN" ? "+" : "-"}{formatNumber(row.qty)} {row.satuan}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-xs">
                          {formatNumber(row.saldo_sebelum)} {row.satuan}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {formatNumber(row.saldo_sesudah)} {row.satuan}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground font-medium">
                            {TRANSACTION_SOURCE_LABEL[row.sumber] ?? row.sumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[150px] truncate">
                          {row.catatan ?? (row.alasan_out ? `Alasan: ${row.alasan_out}` : "-")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {row.created_by_name ?? "-"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
