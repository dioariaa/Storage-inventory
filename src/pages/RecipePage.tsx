import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Trash2, BookOpen, Pencil, Sparkles, Search } from "lucide-react"
import { formatNumber, getErrorMessage } from "@/lib/utils"
import type { Menu, BahanBaku, Recipe } from "@/types/database"
import { TambahMenuWizardModal } from "@/components/menu/TambahMenuWizardModal"

const schema = z.object({
  menu_id: z.string().min(1, "Pilih menu"),
  items: z.array(
    z.object({
      bahan_baku_id: z.string().min(1, "Pilih bahan baku"),
      qty: z.coerce.number().positive("Qty > 0"),
    })
  ).min(1),
})
type FormData = z.infer<typeof schema>

interface RecipeWithBahan extends Recipe {
  bahan_baku: BahanBaku
}

export function RecipePage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null)
  const [search, setSearch] = useState("")
  const [filterMenuId, setFilterMenuId] = useState("all")
  const [filterDivision, setFilterDivision] = useState("all")
  const [filterKategori, setFilterKategori] = useState("all")

  const { data: menuList } = useQuery({
    queryKey: ["menu-list-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu").select("*").order("nama")
      if (error) throw error
      return data as Menu[]
    },
  })

  const { data: bahanList } = useQuery({
    queryKey: ["bahan-baku-aktif"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bahan_baku").select("*").eq("is_active", true).order("nama")
      if (error) throw error
      return data as BahanBaku[]
    },
  })

  const { data: recipes, isLoading } = useQuery({
    queryKey: ["recipes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe")
        .select("*, bahan_baku(*), menu(*)")
        .order("menu_id")
      if (error) throw error
      return data as (RecipeWithBahan & { menu: Menu })[]
    },
    staleTime: 0, // Selalu ambil data fresh saat masuk halaman
    refetchOnMount: true,
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { menu_id: "", items: [{ bahan_baku_id: "", qty: 0 }] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "items" })
  const watchedItems = watch("items")
  const watchedMenuId = watch("menu_id")

  const openEditMenu = (menu: Menu) => {
    setSelectedMenu(menu)
    const existing = recipes?.filter((r) => r.menu_id === menu.id) ?? []
    reset({
      menu_id: menu.id,
      items: existing.length > 0
        ? existing.map((r) => ({ bahan_baku_id: r.bahan_baku_id, qty: r.qty }))
        : [{ bahan_baku_id: "", qty: 0 }],
    })
    setOpen(true)
  }

  const openCreate = () => {
    setSelectedMenu(null)
    reset({ menu_id: "", items: [{ bahan_baku_id: "", qty: 0 }] })
    setOpen(true)
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Delete existing recipes for this menu first
      const { error: delErr } = await supabase.from("recipe").delete().eq("menu_id", data.menu_id)
      if (delErr) throw delErr

      // Insert new
      const toInsert = data.items.map((item) => ({
        menu_id: data.menu_id,
        bahan_baku_id: item.bahan_baku_id,
        qty: item.qty,
        created_by: profile?.id,
      }))

      const { error: insErr } = await supabase.from("recipe").insert(toInsert as any)
      if (insErr) throw insErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes-all"] })
      queryClient.invalidateQueries({ queryKey: ["recipes-usage-by-bahan"] })
      queryClient.invalidateQueries({ queryKey: ["all-recipes"] })
      queryClient.invalidateQueries({ queryKey: ["recipe-count-per-menu"] })
      setOpen(false)
    },
  })

  const getSatuan = (id: string) => bahanList?.find((b) => b.id === id)?.satuan ?? ""

  // Kategori unik dari menu list
  const categories = Array.from(new Set(menuList?.map((m) => m.kategori).filter(Boolean))) as string[]

  const filteredMenuList = menuList?.filter((m) => {
    const matchDiv = filterDivision === "all" || m.division === filterDivision
    const matchKat = filterKategori === "all" || m.kategori === filterKategori
    return matchDiv && matchKat
  })

  // Filter: menu terpilih + divisi + kategori + pencarian nama menu
  const filteredRecipes = recipes?.filter((r) => {
    if (!r.menu) return false
    const matchMenu = filterMenuId === "all" || r.menu_id === filterMenuId
    const matchDiv = filterDivision === "all" || r.menu.division === filterDivision
    const matchKat = filterKategori === "all" || r.menu.kategori === filterKategori
    const q = search.trim().toLowerCase()
    const matchSearch = q === "" || r.menu.nama.toLowerCase().includes(q)
    return matchMenu && matchDiv && matchKat && matchSearch
  })

  // Menu yang belum punya recipe (untuk Set Recipe Menu)
  const menuTanpaRecipe = menuList?.filter(
    (m) => m.is_active && !(recipes?.some((r) => r.menu_id === m.id))
  )

  // Group recipes by menu
  const grouped = filteredRecipes?.reduce<Record<string, (RecipeWithBahan & { menu: Menu })[]>>(
    (acc, r) => {
      acc[r.menu_id] = acc[r.menu_id] ?? []
      acc[r.menu_id].push(r)
      return acc
    },
    {}
  )

  const isAdmin = profile?.role === "admin"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Recipe
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Komposisi bahan baku per menu</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreate} disabled={!menuTanpaRecipe?.length}>
              <Plus className="h-4 w-4 mr-1" /> Set Recipe ({menuTanpaRecipe?.length ?? 0} menu)
            </Button>
            <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-300" /> Tambah Menu & Resep
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Cari nama menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
            aria-label="Cari menu pada recipe"
          />
        </div>
        <div className="w-full sm:w-44 shrink-0">
          <Select
            value={filterDivision}
            onValueChange={(v) => { setFilterDivision(v); setFilterKategori("all"); setFilterMenuId("all") }}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Divisi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Divisi</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="kitchen">Kitchen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48 shrink-0">
          <Select
            value={filterKategori}
            onValueChange={(v) => { setFilterKategori(v); setFilterMenuId("all") }}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-64 shrink-0">
          <Select value={filterMenuId} onValueChange={setFilterMenuId}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Semua Menu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Menu</SelectItem>
              {filteredMenuList?.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="self-center text-xs text-muted-foreground whitespace-nowrap">
          {Object.keys(grouped ?? {}).length} menu punya recipe
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped ?? {}).map(([menuId, items]) => {
            const menu = items[0].menu
            return (
              <Card key={menuId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{menu.nama}</CardTitle>
                      {menu.kategori && (
                        <Badge variant="secondary">{menu.kategori}</Badge>
                      )}
                      <Badge variant={menu.is_active ? "success" : "outline"}>
                        {menu.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => openEditMenu(menu)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit Recipe
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="overflow-x-auto">
                    <table className="text-sm w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left pb-2 font-medium text-muted-foreground">Bahan</th>
                        <th className="text-right pb-2 font-medium text-muted-foreground">Qty / Porsi</th>
                        <th className="text-left pb-2 font-medium text-muted-foreground pl-2">Satuan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-1.5">{r.bahan_baku?.nama ?? "-"}</td>
                          <td className="py-1.5 text-right font-medium">{formatNumber(r.qty)}</td>
                          <td className="py-1.5 pl-2 text-muted-foreground">{r.bahan_baku?.satuan ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {Object.keys(grouped ?? {}).length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Belum ada recipe. Klik "Set Recipe" untuk menambahkan.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modal Form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedMenu ? `Edit Recipe – ${selectedMenu.nama}` : "Set Recipe Menu"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d as FormData))} className="space-y-4">
            {mutation.error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {getErrorMessage(mutation.error)}
              </div>
            )}

            {selectedMenu ? (
              <div className="text-sm font-medium mb-4">Edit Recipe: {selectedMenu.nama}</div>
            ) : (
              <div className="space-y-1.5">
                <Label>Menu (Yang belum punya recipe)</Label>
                <SearchableSelect
                  value={watchedMenuId}
                  onChange={(v) => setValue("menu_id", v)}
                  options={(menuTanpaRecipe ?? []).map((m) => ({
                    id: m.id,
                    label: m.nama,
                    hint: m.kategori ?? m.division,
                  }))}
                  placeholder="Pilih menu..."
                  emptyText="Semua menu sudah punya recipe"
                />
                {errors.menu_id && <p className="text-xs text-destructive">{errors.menu_id.message}</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label>Bahan Baku per Porsi</Label>
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <SearchableSelect
                      value={watchedItems[index]?.bahan_baku_id ?? ""}
                      onChange={(v) => setValue(`items.${index}.bahan_baku_id`, v)}
                      options={(bahanList ?? []).map((b) => ({ id: b.id, label: b.nama, hint: b.satuan }))}
                      placeholder="Pilih bahan..."
                      emptyText="Bahan tidak ditemukan"
                    />
                  </div>
                  <div className="flex items-center gap-1 w-32">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      {...register(`items.${index}.qty`)}
                    />
                    <span className="text-xs text-muted-foreground w-10 shrink-0">
                      {getSatuan(watchedItems[index]?.bahan_baku_id)}
                    </span>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="text-destructive"
                    onClick={() => remove(index)} disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm"
                onClick={() => append({ bahan_baku_id: "", qty: 0 })}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Bahan
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Menyimpan..." : "Simpan Recipe"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Wizard Menu & Resep */}
      <TambahMenuWizardModal open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}
