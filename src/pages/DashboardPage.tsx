import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { formatDate, formatNumber } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { MutasiDashboard, SaldoBahanBaku, MutasiMenu } from "@/types/database"
import { PackagePlus, PackageMinus, Archive, AlertTriangle, LayoutDashboard, Search } from "lucide-react"
import { today, cn } from "@/lib/utils"
import { PageHeader } from "@/components/common/PageHeader"

export function DashboardPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(today)
  const [viewMode, setViewMode] = useState<"bahan" | "menu">("bahan")
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch mutasi menu
  const { data: mutasiMenu, isLoading: loadingMenu } = useQuery({
    queryKey: ["mutasi-menu", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_mutasi_menu")
        .select("*")
        .gte("tgl_transaksi", dateFrom)
        .lte("tgl_transaksi", dateTo)
        .order("tgl_transaksi", { ascending: false })
      if (error) throw error
      return data as MutasiMenu[]
    },
  })

  // Fetch mutasi
  const { data: mutasi, isLoading: loadingMutasi } = useQuery({
    queryKey: ["mutasi", dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("v_mutasi_dashboard")
        .select("*")
        .gte("tgl_transaksi", dateFrom)
        .lte("tgl_transaksi", dateTo)
        .order("tgl_transaksi", { ascending: false })
        .order("waktu_pencatatan", { ascending: false })

      const { data, error } = await q
      if (error) throw error
      return data as MutasiDashboard[]
    },
  })

  // Fetch saldo bahan baku untuk ringkasan
  const { data: saldoList } = useQuery({
    queryKey: ["saldo-bahan-baku"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_saldo_bahan_baku")
        .select("*")
        .eq("is_active", true)
        .order("nama")
      if (error) throw error
      return data as SaldoBahanBaku[]
    },
  })

  // Fetch bahan baku list untuk filter
  const { data: bahanList } = useQuery({
    queryKey: ["bahan-baku-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bahan_baku")
        .select("id, nama")
        .eq("is_active", true)
        .order("nama")
      if (error) throw error
      return data as { id: string; nama: string }[]
    },
  })

  // Fetch menu divisions for mobile card badges (v_mutasi_menu lacks division)
  const { data: menuDivisions } = useQuery({
    queryKey: ["menu-divisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu")
        .select("id, division")
      if (error) throw error
      return data as { id: string; division: string }[]
    },
  })
  const divisionMap = new Map(menuDivisions?.map(m => [m.id, m.division] as [string, string]) ?? [])

  // Filter mutasi by search string
  const filteredMutasi = mutasi?.filter(m =>
    m.bahan_baku_nama.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredMutasiMenu = mutasiMenu?.filter(m =>
    m.menu_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.menu_kategori && m.menu_kategori.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Hitung ringkasan
  const totalIn = mutasi?.reduce((s, m) => s + (m.jenis === "IN" ? m.qty : 0), 0) ?? 0
  const totalOut = mutasi?.reduce((s, m) => s + (m.jenis === "OUT" ? m.qty : 0), 0) ?? 0
  const bahanMinimum = saldoList?.filter(
    (s) => s.minimum_stok !== null && s.saldo_akhir <= (s.minimum_stok ?? 0)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Monitoring stok, barang masuk, dan penggunaan bahan baku"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Bahan Aktif" value={saldoList?.length} unit="jenis" icon={Archive} />
        <StatCard title="Total IN" value={totalIn} unit="unit" icon={PackagePlus} color="green" />
        <StatCard title="Total OUT" value={totalOut} unit="unit" icon={PackageMinus} color="red" />
        <StatCard title="Stok Menipis" value={bahanMinimum?.length} unit="bahan" icon={AlertTriangle} color="amber" />
      </div>

      {/* Alert stok minimum */}
      {(bahanMinimum?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-800 font-bold mb-3">
            <AlertTriangle className="h-5 w-5" />
            STOK DI BAWAH MINIMUM
          </div>
          <div className="flex flex-wrap gap-2">
            {bahanMinimum?.map((b) => (
              <Badge key={b.id} variant="warning" className="px-3 py-1 text-xs">
                {b.nama}: {formatNumber(b.saldo_akhir)} {b.satuan}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left: Filter & Table */}
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={viewMode === "bahan" ? "Cari pergerakan bahan..." : "Cari menu terjual..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex bg-muted p-1 rounded-md shrink-0">
                  <button
                    onClick={() => { setViewMode("bahan"); setSearchQuery(""); }}
                    className={cn("px-3 py-1.5 text-xs font-semibold rounded transition-all", viewMode === "bahan" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    Mutasi Bahan
                  </button>
                  <button
                    onClick={() => { setViewMode("menu"); setSearchQuery(""); }}
                    className={cn("px-3 py-1.5 text-xs font-semibold rounded transition-all", viewMode === "menu" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    Mutasi Menu
                  </button>
                </div>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-10 text-xs sm:text-sm w-36"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-10 text-xs sm:text-sm w-36"
                />
              </div>
            </CardContent>
          </Card>

          {viewMode === "bahan" ? (
            <Card className="overflow-hidden">
              <CardHeader className="py-4 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider">Mutasi Bahan Baku</CardTitle>
                  <Badge variant="outline">{filteredMutasi?.length ?? 0} transaksi</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b">
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Tgl</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Bahan Baku</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Jumlah</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Saldo</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Sumber</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {loadingMutasi ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}><td colSpan={5} className="p-4"><Skeleton className="h-4 w-full" /></td></tr>
                        ))
                      ) : filteredMutasi?.length === 0 ? (
                        <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">Tidak ada transaksi ditemukan.</td></tr>
                      ) : (
                        filteredMutasi?.map((row) => (
                          <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.tgl_transaksi)}</td>
                            <td className="px-4 py-3 font-semibold text-foreground">{row.bahan_baku_nama}</td>
                            <td className="px-4 py-3 text-right font-medium">
                              {row.jenis === "IN" ? (
                                <span className="text-green-700">+{formatNumber(row.qty)} {row.satuan}</span>
                              ) : (
                                <span className="text-red-600">-{formatNumber(row.qty)} {row.satuan}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-bold tabular-nums">
                              {formatNumber(row.saldo_sesudah)} {row.satuan}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <SourceBadge source={row.sumber} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    </table>
                  </div>
                  {/* Mobile cards */}
                  <div className="lg:hidden divide-y divide-border">
                    {loadingMutasi ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="p-3"><Skeleton className="h-12 w-full" /></div>
                      ))
                    ) : filteredMutasi?.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">Tidak ada transaksi ditemukan.</div>
                    ) : (
                      filteredMutasi?.map((row) => (
                        <div key={row.id} className="p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={row.jenis === "IN" ? "success" : "secondary"} className="text-[10px] uppercase font-bold py-0 h-5">{row.jenis}</Badge>
                              <p className="text-sm font-semibold truncate">{row.bahan_baku_nama}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">{formatDate(row.tgl_transaksi)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={cn("text-sm font-bold", row.jenis === "IN" ? "text-green-700" : "text-red-600")}>
                              {row.jenis === "IN" ? "+" : "-"}{formatNumber(row.qty)} {row.satuan}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader className="py-4 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider">Mutasi Penjualan Menu</CardTitle>
                  <Badge variant="outline">{filteredMutasiMenu?.length ?? 0} item</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b">
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Tgl</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Menu</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Kategori</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Qty Terjual</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-[10px]">Total Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {loadingMenu ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}><td colSpan={5} className="p-4"><Skeleton className="h-4 w-full" /></td></tr>
                        ))
                      ) : filteredMutasiMenu?.length === 0 ? (
                        <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">Tidak ada penjualan menu ditemukan.</td></tr>
                      ) : (
                        filteredMutasiMenu?.map((row, idx) => (
                          <tr key={`${row.penjualan_id}-${row.menu_id}-${idx}`} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.tgl_transaksi)}</td>
                            <td className="px-4 py-3 font-semibold text-foreground">{row.menu_nama}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.kategori ?? "-"}</td>
                            <td className="px-4 py-3 text-right font-bold text-green-700">
                              {formatNumber(row.qty_terjual)} porsi
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                              Rp {formatNumber(row.total_nilai)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    </table>
                  </div>
                  {/* Mobile cards */}
                  <div className="lg:hidden divide-y divide-border">
                    {loadingMenu ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="p-3"><Skeleton className="h-12 w-full" /></div>
                      ))
                    ) : filteredMutasiMenu?.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">Tidak ada penjualan menu ditemukan.</div>
                    ) : (
                      filteredMutasiMenu?.map((row, idx) => (
                        <div key={`${row.penjualan_id}-${row.menu_id}-${idx}`} className="p-3">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <p className="text-sm font-semibold leading-tight">{row.menu_nama}</p>
                            <Badge variant="secondary" className="text-[10px] shrink-0 uppercase font-bold py-0 h-5">
                              {divisionMap.get(row.menu_id) ?? "..."}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-muted-foreground">{formatDate(row.tgl_transaksi)} • {row.kategori ?? "-"}</p>
                            <p className="text-sm font-bold text-green-700">{formatNumber(row.qty_terjual)} porsi</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Quick View Saldo */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="py-4 border-b bg-muted/30">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Saldo Aktual</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[640px] overflow-y-auto">
                <div className="divide-y">
                  {saldoList?.map((s) => (
                    <div key={s.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{s.nama}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{s.satuan}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-bold", s.minimum_stok !== null && s.saldo_akhir <= (s.minimum_stok ?? 0) ? "text-amber-600" : "text-foreground")}>
                          {formatNumber(s.saldo_akhir)}
                        </p>
                        {s.minimum_stok !== null && <p className="text-[10px] text-muted-foreground">Min: {formatNumber(s.minimum_stok)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, unit, icon: Icon, color = "gray" }: any) {
  const colors: any = {
    gray: { icon: "text-muted-foreground bg-gray-100", border: "border-l-gray-400" },
    green: { icon: "text-green-600 bg-green-100", border: "border-l-green-500" },
    red: { icon: "text-red-600 bg-red-100", border: "border-l-red-500" },
    amber: { icon: "text-amber-600 bg-amber-100", border: "border-l-amber-500" },
  }
  const c = colors[color] ?? colors.gray
  return (
    <Card className={cn("border-l-4", c.border)}>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("h-12 w-12 rounded-lg flex items-center justify-center shrink-0", c.icon)}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black">{value ?? "0"}</span>
            <span className="text-xs text-muted-foreground">{unit}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
    MANUAL_IN: { label: "IN", variant: "success" },
    MANUAL_OUT: { label: "OUT", variant: "secondary" },
    POS_IMPORT: { label: "POS", variant: "default" },
    MANUAL_SALE: { label: "SALE", variant: "warning" },
  }
  const info = map[source] ?? { label: source, variant: "secondary" }
  return <Badge variant={info.variant} className="text-[10px] uppercase font-bold py-0 h-5">{info.label}</Badge>
}

