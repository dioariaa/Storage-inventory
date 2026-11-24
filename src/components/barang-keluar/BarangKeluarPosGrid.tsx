import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { today, formatNumber, formatRupiah, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Plus, Minus, Eye, Trash2, Coffee, ChefHat, LayoutGrid, PackageOpen, ShoppingBag, CalendarDays } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import type { Menu, SaldoBahanBaku, Recipe, BahanBaku } from "@/types/database"

export function BarangKeluarPosGrid() {
  const queryClient = useQueryClient()
  const { profile } = useAuthStore()
  const [tglPenjualan, setTglPenjualan] = useState(today())
  const [selectedDivision, setSelectedDivision] = useState<"bar" | "kitchen" | "all">("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [cart, setCart] = useState<Record<string, number>>({}) // menu_id -> qty
  const [preview, setPreview] = useState<any[] | null>(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: menuList, isLoading: loadingMenu } = useQuery({
    queryKey: ["menu-list"],
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

  const { data: allRecipes } = useQuery({
    queryKey: ["all-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipe").select("*, bahan_baku(*)")
      if (error) throw error
      return data as (Recipe & { bahan_baku: BahanBaku })[]
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

  const menuByDivision = (menuList ?? []).filter(
    (m) => selectedDivision === "all" || m.division === selectedDivision
  )

  const categories = Array.from(new Set(menuByDivision.map((m) => m.kategori).filter(Boolean))) as string[]
  const categoryCount = (cat: string) =>
    cat === "all"
      ? menuByDivision.length
      : menuByDivision.filter((m) => m.kategori === cat).length

  const filteredMenu = menuByDivision.filter((m) => {
    const matchCat = selectedCategory === "all" || m.kategori === selectedCategory
    const matchSearch = m.nama.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  const updateCart = (menuId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[menuId] ?? 0
      const next = current + delta
      if (next <= 0) {
        const copy = { ...prev }
        delete copy[menuId]
        return copy
      }
      return { ...prev, [menuId]: next }
    })
    setPreview(null)
  }

  const calculateConsumption = () => {
    if (!allRecipes || !saldoList) return []
    const consumptionMap: Record<string, { qty: number; bahan: BahanBaku }> = {}

    for (const [menuId, qtyTerjual] of Object.entries(cart)) {
      const recipes = allRecipes.filter((r) => r.menu_id === menuId)
      for (const r of recipes) {
        const totalReq = r.qty * qtyTerjual
        if (!consumptionMap[r.bahan_baku_id]) {
          consumptionMap[r.bahan_baku_id] = { qty: 0, bahan: r.bahan_baku }
        }
        consumptionMap[r.bahan_baku_id].qty += totalReq
      }
    }

    const rows: any[] = []
    for (const [bahanId, val] of Object.entries(consumptionMap)) {
      const saldo = saldoList.find((s) => s.id === bahanId)?.saldo_akhir ?? 0
      rows.push({
        bahan_baku_id: bahanId,
        bahan_baku_nama: val.bahan.nama,
        satuan: val.bahan.satuan,
        total_qty: val.qty,
        saldo_sebelum: saldo,
        cukup: saldo >= val.qty,
      })
    }
    return rows
  }

  const handlePreview = () => {
    setError(null)
    const rows = calculateConsumption()
    if (rows.length === 0) {
      setError("Belum ada menu yang dipilih atau menu tidak memiliki resep terdaftar.")
      return
    }
    setPreview(rows)
  }

  const postMutation = useMutation({
    mutationFn: async () => {
      const rows = preview ?? calculateConsumption()
      if (rows.some((r) => !r.cukup)) {
        throw new Error("Stok bahan baku tidak mencukupi untuk transaksi ini.")
      }

      const { data: penjualan, error: penError } = await supabase
        .from("penjualan")
        .insert({
          tgl_penjualan: tglPenjualan,
          metode: "MANUAL",
          catatan: "POS Grid Manual Sale",
          is_posted: true,
          created_by: profile?.id,
        })
        .select()
        .single()
      if (penError) throw penError

      const saleDetails = Object.entries(cart).map(([menuId, qty]) => ({
        penjualan_id: penjualan.id,
        menu_id: menuId,
        qty_terjual: qty,
      }))
      const { error: detError } = await supabase.from("penjualan_detail").insert(saleDetails)
      if (detError) throw detError

      const { data: trx, error: trxError } = await supabase
        .from("transaksi")
        .insert({
          tgl_transaksi: tglPenjualan,
          jenis: "OUT",
          sumber: "MANUAL_SALE",
          alasan_out: "OPERATIONAL",
          catatan: `Penjualan POS Grid Manual (${Object.keys(cart).length} item)`,
          is_posted: true,
          penjualan_id: penjualan.id,
          created_by: profile?.id,
        })
        .select()
        .single()
      if (trxError) throw trxError

      for (const row of rows) {
        const saldoSebelum = row.saldo_sebelum
        const saldoSesudah = saldoSebelum - row.total_qty
        const { error: tdError } = await supabase.from("transaksi_detail").insert({
          transaksi_id: trx.id,
          bahan_baku_id: row.bahan_baku_id,
          qty: row.total_qty,
          saldo_sebelum: saldoSebelum,
          saldo_sesudah: saldoSesudah,
        })
        if (tdError) throw tdError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["mutasi-menu"] })
      setSuccess(true)
      setCart({})
      setPreview(null)
    },
    onError: (err: any) => {
      setError(err.message)
    },
  })

  const cartItems = Object.entries(cart)
    .map(([menuId, qty]) => {
      const menu = menuList?.find((m) => m.id === menuId)
      if (!menu) return null
      return { menu, qty, subtotal: (menu.harga ?? 0) * qty }
    })
    .filter(Boolean) as { menu: Menu; qty: number; subtotal: number }[]

  const totalItemCount = cartItems.reduce((a, b) => a + b.qty, 0)
  const totalHarga = cartItems.reduce((a, b) => a + b.subtotal, 0)
  const totalKonsumsi = preview?.reduce((a, b) => a + Number(b.total_qty), 0) ?? 0

  const divisionTabs: { key: "all" | "bar" | "kitchen"; label: string; icon: any }[] = [
    { key: "all", label: "Semua Divisi", icon: LayoutGrid },
    { key: "bar", label: "Bar", icon: Coffee },
    { key: "kitchen", label: "Kitchen", icon: ChefHat },
  ]

  return (
    <div className="w-full overflow-x-auto" style={{ touchAction: "manipulation" }}>
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4 items-start w-full min-w-[1024px]">
            {/* ============ KATALOG MENU (kiri, ~70%) ============ */}
            <section className="min-w-0 space-y-4">

        {success && (
          <div
            className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-center justify-between gap-3"
            role="status"
          >
            <p className="text-sm font-semibold">Penjualan POS &amp; pemotongan stok berhasil dicatat dan diposting.</p>
            <Button size="sm" variant="outline" onClick={() => setSuccess(false)}>Tutup</Button>
          </div>
        )}

        {error && (
          <div
            className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Judul + search + tanggal */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-base">Menu POS</h2>
            <span className="text-xs text-muted-foreground">
              {filteredMenu.length} menu
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 w-full min-w-0">
              <Search
                className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Cari menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11"
                aria-label="Cari menu"
              />
            </div>
            <div className="relative w-full sm:w-44 shrink-0">
              <CalendarDays
                className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                type="date"
                aria-label="Tanggal penjualan"
                value={tglPenjualan}
                onChange={(e) => setTglPenjualan(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
          </div>

          {/* Filter divisi — tab horizontal */}
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter divisi">
            {divisionTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setSelectedDivision(tab.key); setSelectedCategory("all") }}
                className={cn(
                  "h-10 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap transition-colors border",
                  selectedDivision === tab.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
                )}
              >
                <tab.icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filter kategori — chip horizontal */}
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter kategori">
            <button
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "h-9 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
              )}
            >
              Semua Kategori ({categoryCount("all")})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "h-9 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
                )}
              >
                {cat} ({categoryCount(cat)})
              </button>
            ))}
          </div>
        </div>

        {/* Grid katalog — minmax supaya card tidak mengecil */}
        <div
          className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
          aria-busy={loadingMenu}
        >
          {loadingMenu ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card overflow-hidden">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))
          ) : filteredMenu.length === 0 ? (
            <div className="col-span-full py-16 text-center text-muted-foreground border-2 border-dashed rounded-xl">
              <PackageOpen className="h-10 w-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
              <p className="text-sm font-medium">Tidak ada menu yang cocok</p>
              <p className="text-xs mt-1">Ubah divisi, kategori, atau kata kunci pencarian.</p>
            </div>
          ) : (
            filteredMenu.map((m) => {
              const qtyInCart = cart[m.id] ?? 0
              return (
                <article
                  key={m.id}
                  onClick={() => updateCart(m.id, 1)}
                  className={cn(
                    "group relative flex flex-col rounded-xl border bg-card overflow-hidden cursor-pointer transition-all",
                    "hover:border-primary/50 hover:shadow-md active:scale-[0.98]",
                    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    qtyInCart > 0 ? "border-primary ring-2 ring-primary/20" : "border-border"
                  )}
                >
                  {qtyInCart > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground font-bold text-xs h-7 min-w-7 px-1.5 rounded-full flex items-center justify-center shadow"
                    >
                      {qtyInCart}
                    </span>
                  )}

                  {/* Placeholder gambar, aspect ratio konsisten */}
                  <div
                    className={cn(
                      "aspect-[4/3] w-full flex items-center justify-center relative",
                      m.division === "bar"
                        ? "bg-gradient-to-br from-amber-50 to-orange-100"
                        : "bg-gradient-to-br from-emerald-50 to-lime-100"
                    )}
                    aria-hidden="true"
                  >
                    {m.division === "bar" ? (
                      <Coffee className="h-10 w-10 text-amber-600/70" />
                    ) : (
                      <ChefHat className="h-10 w-10 text-emerald-600/70" />
                    )}
                    <Badge
                      variant="outline"
                      className="absolute bottom-2 left-2 bg-white/85 text-[10px] h-5 px-1.5"
                    >
                      {m.division === "bar" ? "Bar" : "Kitchen"}
                    </Badge>
                  </div>

                  {/* Konten: nama max 2 baris, harga, tombol + */}
                  <div className="p-3 flex flex-col flex-1">
                    <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2 min-h-[2.5rem]">
                      {m.nama}
                    </p>
                    <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-primary tabular-nums">
                        {formatRupiah(m.harga)}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        aria-label={`Tambah ${m.nama} ke pesanan`}
                        className="h-11 w-11 rounded-full shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateCart(m.id, 1)
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>

      {/* ============ RINCIAN PESANAN (kanan, 340px, sticky) ============ */}
      <aside className="order-panel w-full min-w-0 lg:sticky lg:top-4 rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-bold text-sm">
            <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Rincian Pesanan
          </span>
          <span className="sr-only" role="status" aria-atomic="true">
            {totalItemCount} porsi di keranjang
          </span>
          <Badge variant="secondary" aria-hidden="true">{totalItemCount} porsi</Badge>
        </div>

        <div className="p-4 space-y-3 max-h-[22rem] overflow-y-auto">
          {cartItems.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground text-xs">
              Belum ada pesanan.
              <br />
              Pilih menu di katalog.
            </div>
          ) : (
            cartItems.map(({ menu, qty, subtotal }) => (
              <div key={menu.id} className="border-b pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground leading-snug">{menu.nama}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {menu.kategori ?? "-"} · {menu.division === "bar" ? "Bar" : "Kitchen"}
                    </p>
                  </div>
                  <span className="font-bold text-sm tabular-nums shrink-0">{formatRupiah(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-10 w-10 rounded-full"
                      aria-label={`Kurangi ${menu.nama}`}
                      onClick={() => updateCart(menu.id, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-bold text-sm tabular-nums">{qty}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-10 w-10 rounded-full"
                      aria-label={`Tambah ${menu.nama}`}
                      onClick={() => updateCart(menu.id, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 rounded-full text-destructive hover:text-destructive"
                    aria-label={`Hapus ${menu.nama} dari keranjang`}
                    onClick={() => updateCart(menu.id, -qty)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold tabular-nums">{formatRupiah(totalHarga)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold">
            <span>Total</span>
            <span className="text-primary tabular-nums">{formatRupiah(totalHarga)}</span>
          </div>

          <Button
            type="button"
            onClick={handlePreview}
            disabled={cartItems.length === 0}
            className="w-full h-12 gap-2"
          >
            <Eye className="h-4 w-4" /> Hitung &amp; Preview Bahan Baku
          </Button>

          {preview && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Preview Konsumsi
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {preview.length} bahan · {formatNumber(totalKonsumsi)} total
                </span>
              </div>
              {preview.map((row) => (
                <div key={row.bahan_baku_id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate min-w-0 text-foreground">{row.bahan_baku_nama}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatNumber(row.total_qty)} {row.satuan}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      row.cukup ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    )}
                  >
                    {row.cukup ? "Cukup" : "Kurang"}
                  </span>
                </div>
              ))}
              <Button
                type="button"
                className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold"
                disabled={preview.some((r) => !r.cukup) || postMutation.isPending}
                onClick={() => postMutation.mutate()}
              >
                {postMutation.isPending ? "Memproses..." : "Konfirmasi & Post Transaksi"}
              </Button>
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  )
}
