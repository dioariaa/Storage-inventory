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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Pencil, UtensilsCrossed, Sparkles, Search, AlertTriangle } from "lucide-react"
import { formatRupiah } from "@/lib/utils"
import type { Menu } from "@/types/database"
import { TambahMenuWizardModal } from "@/components/menu/TambahMenuWizardModal"
import { PageHeader } from "@/components/common/PageHeader"

const schema = z.object({
  nama: z.string().min(1, "Nama wajib diisi"),
  kategori: z.string().optional(),
  harga: z.coerce.number().min(0).optional(),
  is_active: z.boolean(),
  division: z.enum(["bar", "kitchen"]),
})
type FormData = z.infer<typeof schema>

export function MenuPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editItem, setEditItem] = useState<Menu | null>(null)
  const [search, setSearch] = useState("")
  const [filterKategori, setFilterKategori] = useState("all")
  const [filterDivision, setFilterDivision] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")

  const { data: menuList, isLoading } = useQuery({
    queryKey: ["menu-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu").select("*").order("nama")
      if (error) throw error
      return data as Menu[]
    },
  })

  // Recipe completeness per menu
  const { data: recipeCount } = useQuery({
    queryKey: ["recipe-count-per-menu"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipe").select("menu_id")
      if (error) throw error
      const map: Record<string, number> = {}
      ;(data as any[])?.forEach((r) => { map[r.menu_id] = (map[r.menu_id] ?? 0) + 1 })
      return map
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { is_active: true, harga: 0 },
  })

  const openCreate = () => {
    setEditItem(null)
    reset({ nama: "", kategori: "", harga: 0, is_active: true, division: "bar" })
    setOpen(true)
  }

  const openEdit = (item: Menu) => {
    setEditItem(item)
    reset({
      nama: item.nama,
      kategori: item.kategori ?? "",
      harga: item.harga ?? 0,
      is_active: item.is_active,
      division: item.division ?? "bar",
    })
    setOpen(true)
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nama: data.nama,
        kategori: data.kategori || null,
        harga: data.harga ? Number(data.harga) : null,
        is_active: data.is_active,
        division: data.division,
        created_by: profile?.id,
      }
      if (editItem) {
        const { error } = await supabase.from("menu").update(payload as any).eq("id", editItem.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("menu").insert(payload as any)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-list"] })
      queryClient.invalidateQueries({ queryKey: ["recipe-count-per-menu"] })
      setOpen(false)
    },
  })

  // Unique categories
  const categories = Array.from(new Set(menuList?.map((m) => m.kategori).filter(Boolean))) as string[]

  const filtered = menuList?.filter((m) => {
    const matchSearch = m.nama.toLowerCase().includes(search.toLowerCase()) ||
      (m.kategori?.toLowerCase() ?? "").includes(search.toLowerCase())
    const matchKat = filterKategori === "all" || m.kategori === filterKategori
    const matchDiv = filterDivision === "all" || m.division === filterDivision
    const matchStatus = filterStatus === "all" ||
      (filterStatus === "active" && m.is_active) ||
      (filterStatus === "inactive" && !m.is_active)
    return matchSearch && matchKat && matchDiv && matchStatus
  })

  // Detect duplicates by name
  const nameCounts = menuList?.reduce<Record<string, number>>((acc, m) => {
    const key = m.nama.toLowerCase()
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {}) ?? {}
  const duplicateCount = Object.values(nameCounts).filter((c) => c > 1).length

  const isAdmin = profile?.role === "admin"

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UtensilsCrossed}
        title="Master Menu"
        description="Pengelolaan daftar menu, harga, dan kaitan resep per porsi"
      >
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openCreate} className="h-9">
              <Plus className="h-4 w-4 mr-1.5" /> Tambah Menu Manual
            </Button>
            <Button onClick={() => setWizardOpen(true)} className="h-9 gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-300" /> Wizard Menu & Resep
            </Button>
          </div>
        )}
      </PageHeader>

      {duplicateCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Duplikasi Data Terdeteksi</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Terdapat {duplicateCount} nama menu yang muncul lebih dari 1 kali di database (case-sensitive).
              Disarankan merge via SQL editor Supabase.
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[160px]">
              <Select value={filterKategori} onValueChange={setFilterKategori}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px]">
              <Select value={filterDivision} onValueChange={setFilterDivision}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Divisi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Divisi</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px]">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground ml-1">{filtered?.length ?? 0} menu</p>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nama Menu</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kategori</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Divisi</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Harga</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Recipe</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      Tidak ada menu yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filtered?.map((m) => {
                    const rCount = recipeCount?.[m.id] ?? 0
                    const isDup = (nameCounts[m.nama.toLowerCase()] ?? 1) > 1
                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {m.nama}
                            {isDup && (
                              <Badge variant="warning" className="text-[10px] h-4 px-1.5">
                                duplikat
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {m.kategori ? <Badge variant="secondary">{m.kategori}</Badge> : "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={m.division === "bar" ? "default" : "outline"}>
                            {m.division === "bar" ? "Bar" : "Kitchen"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {formatRupiah(m.harga)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {rCount > 0 ? (
                            <Badge variant="success" className="gap-1">
                              {rCount} bahan
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Belum ada
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={m.is_active ? "success" : "secondary"}>
                            {m.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(m)}
                              aria-label={`Edit ${m.nama}`}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit / Create Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editItem ? `Edit Menu \u2013 ${editItem.nama}` : "Tambah Menu Baru"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            {mutation.error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {String(mutation.error)}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nama Menu</Label>
              <Input {...register("nama")} placeholder="Contoh: Americano" />
              {errors.nama && <p className="text-xs text-destructive">{errors.nama.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Input {...register("kategori")} placeholder="Contoh: Kopi, Mocktail, Non-Coffee" />
            </div>
            <div className="space-y-1.5">
              <Label>Harga (Rp)</Label>
              <Input type="number" step="any" {...register("harga")} placeholder="Contoh: 35000" />
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
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="is_active_menu"
                className="h-4 w-4 rounded border-input"
                {...register("is_active")}
              />
              <Label htmlFor="is_active_menu" className="font-normal cursor-pointer">
                Menu aktif (tampil di POS & resep)
              </Label>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Menyimpan..." : "Simpan Menu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TambahMenuWizardModal open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}
