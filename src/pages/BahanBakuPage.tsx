import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plus, Pencil, Boxes, Search } from "lucide-react"
import { formatNumber, today, cn } from "@/lib/utils"
import type { BahanBaku, SaldoBahanBaku } from "@/types/database"
import { PageHeader } from "@/components/common/PageHeader"

const schema = z.object({
  nama: z.string().min(1, "Nama wajib diisi"),
  satuan: z.string().min(1, "Satuan wajib diisi"),
  stok_awal: z.coerce.number().min(0),
  minimum_stok: z.coerce.number().min(0).optional(),
  is_active: z.boolean(),
  division: z.enum(["bar", "kitchen"]),
})
type FormData = z.infer<typeof schema>

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums", className)}>{value}</p>
    </div>
  )
}

export function BahanBakuPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editItem, setEditItem] = useState<BahanBaku | null>(null)
  const [search, setSearch] = useState("")
  const [divisionFilter, setDivisionFilter] = useState<"all" | "bar" | "kitchen">("all")
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(today)
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all")
  const [sortBy, setSortBy] = useState<"nama" | "usage_desc" | "usage_asc">("nama")
  const [openUsage, setOpenUsage] = useState<string | null>(null)
  const [openUsageMobile, setOpenUsageMobile] = useState<string | null>(null)

  const { data: recipes, isLoading: loadingRecipes } = useQuery({
    queryKey: ["recipes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe")
        .select("bahan_baku_id, menu_id, menu(nama, division)")
      if (error) throw error
      return data as unknown as {
        bahan_baku_id: string
        menu_id: string
        menu: { nama: string; division: string } | null
      }[]
    },
  })

  const { data: saldoList, isLoading } = useQuery({
    queryKey: ["saldo-bahan-baku", dateFrom, dateTo],
    queryFn: async () => {
      // 1. Get Mutasi Range
      const { data: mutasi, error: mutasiError } = await supabase
        .rpc("get_mutasi_bahan_range", { p_date_from: dateFrom, p_date_to: dateTo })
      if (mutasiError) throw mutasiError

      // 2. Get All Materials
      const { data: bahan, error: bahanError } = await supabase
        .from("bahan_baku")
        .select("*")
        .order("nama")
      if (bahanError) throw bahanError

      // 3. Map together
      const map = new Map(mutasi.map((m: any) => [m.bahan_baku_id, m]))
      return bahan.map((b) => {
        const m: any = map.get(b.id) || { total_in: 0, total_out: 0 }
        return {
          ...b,
          total_in: m.total_in ?? 0,
          total_out: m.total_out ?? 0,
          saldo_akhir: b.stok_awal + (m.total_in ?? 0) - (m.total_out ?? 0)
        }
      }) as SaldoBahanBaku[]
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { is_active: true, stok_awal: 0 },
  })

  const openCreate = () => {
    setEditItem(null)
    reset({ nama: "", satuan: "", stok_awal: 0, minimum_stok: undefined, is_active: true, division: "bar" })
    setOpen(true)
  }

  const openEdit = (item: SaldoBahanBaku) => {
    setEditItem(item as unknown as BahanBaku)
    reset({
      nama: item.nama,
      satuan: item.satuan,
      stok_awal: item.stok_awal,
      minimum_stok: item.minimum_stok ?? undefined,
      is_active: item.is_active,
      division: item.division ?? "bar",
    })
    setOpen(true)
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nama: data.nama,
        satuan: data.satuan,
        stok_awal: data.stok_awal,
        minimum_stok: data.minimum_stok ?? null,
        is_active: data.is_active,
        division: data.division,
        created_by: profile?.id,
      }
      if (editItem) {
        const { error } = await supabase.from("bahan_baku").update(payload as any).eq("id", editItem.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("bahan_baku").insert(payload as any)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      queryClient.invalidateQueries({ queryKey: ["bahan-baku-aktif"] })
      queryClient.invalidateQueries({ queryKey: ["bahan-baku-list"] })
      setOpen(false)
    },
  })

  // Peta pemakaian: bahan_baku_id -> list menu yang memakainya
  const usageMap = (recipes ?? []).reduce<Record<string, { nama: string; division: string }[]>>(
    (acc, r) => {
      if (!r.menu) return acc
      acc[r.bahan_baku_id] = acc[r.bahan_baku_id] ?? []
      if (!acc[r.bahan_baku_id].some((m) => m.nama === r.menu!.nama)) {
        acc[r.bahan_baku_id].push(r.menu)
      }
      return acc
    },
    {}
  )

  const filtered = saldoList?.filter((b) => {
    const matchSearch = b.nama.toLowerCase().includes(search.toLowerCase())
    const matchDiv = divisionFilter === "all" || b.division === divisionFilter
    const usage = usageMap[b.id]?.length ?? 0
    const matchUsage =
      usageFilter === "all" ||
      (usageFilter === "used" && usage > 0) ||
      (usageFilter === "unused" && usage === 0)
    return matchSearch && matchDiv && matchUsage
  })

  const sorted = [...(filtered ?? [])].sort((a, b) => {
    if (sortBy === "usage_desc") {
      return (usageMap[b.id]?.length ?? 0) - (usageMap[a.id]?.length ?? 0)
    }
    if (sortBy === "usage_asc") {
      return (usageMap[a.id]?.length ?? 0) - (usageMap[b.id]?.length ?? 0)
    }
    return a.nama.localeCompare(b.nama)
  })

  const isAdmin = profile?.role === "admin"

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Boxes}
        title="Master Bahan Baku"
        description="Pengelolaan daftar bahan baku dan monitoring saldo stok"
      >
        {isAdmin && (
          <Button onClick={openCreate} className="h-9">
            <Plus className="h-4 w-4 mr-1.5" /> Tambah Bahan
          </Button>
        )}
      </PageHeader>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama bahan atau satuan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={usageFilter}
              onChange={(e) => setUsageFilter(e.target.value as any)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filter pemakaian"
            >
              <option value="all">Semua Pemakaian</option>
              <option value="used">Dipakai di menu</option>
              <option value="unused">Belum dipakai</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Urutkan"
            >
              <option value="nama">Urut: Nama</option>
              <option value="usage_desc">Urut: Paling Banyak Dipakai</option>
              <option value="usage_asc">Urut: Paling Sedikit Dipakai</option>
            </select>
            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value as any)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Semua Divisi</option>
              <option value="bar">Bar</option>
              <option value="kitchen">Kitchen</option>
            </select>
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
          <p className="text-xs text-muted-foreground">{filtered?.length ?? 0} bahan</p>
        </CardContent>
      </Card>

      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nama Bahan</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Dipakai di Menu</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Satuan</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stok Awal</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total IN</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total OUT</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Min Stok</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : sorted.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                          Tidak ada bahan baku yang cocok dengan pencarian.
                        </td>
                      </tr>
                    )                    : sorted.map((b) => {
                        const menus = usageMap[b.id] ?? []
                        return (
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{b.nama}</td>
                        <td className="px-4 py-3 text-center">
                          {menus.length === 0 ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            <Popover
                              open={openUsage === b.id}
                              onOpenChange={(v) => setOpenUsage(v ? b.id : null)}
                            >
                              <PopoverTrigger asChild>
                                <button className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20">
                                  {menus.length} menu
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3 space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                  Menu yang memakai {b.nama}
                                </p>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {menus.map((m, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between text-xs rounded px-2 py-1 bg-muted/40"
                                    >
                                      <span className="truncate">{m.nama}</span>
                                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                                        {m.division === "bar" ? "Bar" : "Kitchen"}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{b.satuan}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatNumber(b.stok_awal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700">+{formatNumber(b.total_in)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">-{formatNumber(b.total_out)}</td>
                        <td className="px-4 py-3 text-right font-bold">
                          <span className={b.minimum_stok !== null && b.saldo_akhir <= (b.minimum_stok ?? 0) ? "text-amber-600" : ""}>
                            {formatNumber(b.saldo_akhir)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {b.minimum_stok !== null ? formatNumber(b.minimum_stok) : "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={b.is_active ? "success" : "secondary"}>
                            {b.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(b)}
                              aria-label={`Edit ${b.nama}`}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
              </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Card List */}
      <div className="lg:hidden space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-3 sm:p-4 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <Skeleton key={j} className="h-14 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          : sorted.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Tidak ada bahan baku yang cocok dengan pencarian.
                </CardContent>
              </Card>
            )
            : sorted.map((b) => {
                const menus = usageMap[b.id] ?? []
                const lowStock =
                  b.minimum_stok !== null && b.saldo_akhir <= (b.minimum_stok ?? 0)
                return (
                  <Card key={b.id}>
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium leading-tight break-words">{b.nama}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{b.satuan}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={b.division === "bar" ? "default" : "secondary"}>
                            {b.division === "bar" ? "Bar" : "Kitchen"}
                          </Badge>
                          <Badge variant={b.is_active ? "success" : "secondary"}>
                            {b.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {menus.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Belum dipakai di menu</span>
                        ) : (
                          <Popover
                            open={openUsageMobile === b.id}
                            onOpenChange={(v) => setOpenUsageMobile(v ? b.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button className="inline-flex h-11 items-center gap-1 rounded-full bg-primary/10 px-4 text-xs font-semibold text-primary hover:bg-primary/20">
                                {menus.length} menu
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3 space-y-2">
                              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                Menu yang memakai {b.nama}
                              </p>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {menus.map((m, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-xs"
                                  >
                                    <span className="truncate">{m.nama}</span>
                                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                      {m.division === "bar" ? "Bar" : "Kitchen"}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        {b.minimum_stok !== null && (
                          <span className="text-xs text-muted-foreground">
                            Min stok: {formatNumber(b.minimum_stok)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Stat label="Stok Awal" value={formatNumber(b.stok_awal)} />
                        <Stat label="Total IN" value={`+${formatNumber(b.total_in)}`} className="text-green-700" />
                        <Stat label="Total OUT" value={`-${formatNumber(b.total_out)}`} className="text-red-600" />
                        <Stat
                          label="Saldo Akhir"
                          value={formatNumber(b.saldo_akhir)}
                          className={lowStock ? "text-amber-600" : ""}
                        />
                      </div>

                      {isAdmin && (
                        <Button
                          variant="outline"
                          className="h-11 w-full"
                          onClick={() => openEdit(b)}
                          aria-label={`Edit ${b.nama}`}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
      </div>

      {/* Modal Form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Bahan Baku" : "Tambah Bahan Baku"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d as FormData))} className="space-y-4">
            {mutation.error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {String(mutation.error)}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nama Bahan</Label>
              <Input {...register("nama")} placeholder="Contoh: House Blend Premio" />
              {errors.nama && <p className="text-xs text-destructive">{errors.nama.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Satuan</Label>
              <Input {...register("satuan")} placeholder="Contoh: Gram, Ml, Pcs" />
              {errors.satuan && <p className="text-xs text-destructive">{errors.satuan.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Stok Awal</Label>
                <Input type="number" min="0" step="any" {...register("stok_awal")} />
                {!editItem && <p className="text-xs text-muted-foreground">Saldo awal implementasi</p>}
                {editItem && <p className="text-xs text-amber-600">Hati-hati: mengubah stok awal mempengaruhi saldo</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Minimum Stok (opsional)</Label>
                <Input type="number" min="0" step="any" {...register("minimum_stok")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Divisi</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register("division")}
              >
                <option value="bar">Bar</option>
                <option value="kitchen">Kitchen</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                className="rounded"
                {...register("is_active")}
              />
              <Label htmlFor="is_active">Bahan aktif</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
