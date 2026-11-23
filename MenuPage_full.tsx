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
import { Plus, Pencil, UtensilsCrossed, Sparkles } from "lucide-react"
import type { Menu } from "@/types/database"
import { TambahMenuWizardModal } from "@/components/menu/TambahMenuWizardModal"

const schema = z.object({
  nama: z.string().min(1, "Nama wajib diisi"),
  kategori: z.string().optional(),
  is_active: z.boolean(),
})
type FormData = z.infer<typeof schema>

export function MenuPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editItem, setEditItem] = useState<Menu | null>(null)
  const [showOnlyActive, setShowOnlyActive] = useState(true)
  const [filterKategori, setFilterKategori] = useState("all")

  const { data: menuList, isLoading } = useQuery({
    queryKey: ["menu-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu").select("*").order("nama")
      if (error) throw error
      return data as Menu[]
    },
  })

  // Get unique categories
  const categories = Array.from(new Set(menuList?.map(m => m.kategori).filter(Boolean))) as string[]

  const filtered = menuList?.filter((m) => {
    const matchesSearch = m.nama.toLowerCase().includes(search.toLowerCase()) ||
      m.kategori?.toLowerCase().includes(search.toLowerCase())
    const matchesKategori = filterKategori === "all" || m.kategori === filterKategori
    const matchesActive = !showOnlyActive || m.is_active
    return matchesSearch && matchesKategori && matchesActive
  })

  // Identify duplicates by name
  const nameCounts = menuList?.reduce((acc, m) => {
    acc[m.nama.toLowerCase()] = (acc[m.nama.toLowerCase()] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const isAdmin = profile?.role === "admin"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            Menu
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Master daftar menu Divisi Bar</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Tambah Menu Saja
            </Button>
            <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-300" /> Tambah Menu & Resep
            </Button>
          </div>
        )}
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Cari menu atau kategori..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Nama Menu</th>
                  <th className="text-left px-4 py-3 font-medium">Kategori</th>
                  <th className="text-right px-4 py-3 font-medium">Harga</th>
                  <th className="text-center px-4 py-3 font-medium">Recipe</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  {isAdmin && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filtered?.map((m) => {
                      const rCount = recipeCount?.[m.id] ?? 0
                      return (
                        <tr key={m.id} className="border-b hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{m.nama}</td>
                          <td className="px-4 py-3 text-muted-foreground">{m.kategori ?? "-"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {m.harga ? `Rp${m.harga.toLocaleString("id-ID")}` : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {rCount > 0 ? (
                              <Badge variant="success">{rCount} bahan</Badge>
                            ) : (
                              <Badge variant="outline">Belum ada</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={m.is_active ? "success" : "secondary"}>
                              {m.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3 text-right">
                              <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Menu" : "Tambah Menu"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d as FormData))} className="space-y-4">
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
              <Label>Kategori (opsional)</Label>
              <Input {...register("kategori")} placeholder="Contoh: Kopi, Non-Kopi, Minuman" />
            </div>
            <div className="space-y-1.5">
              <Label>Harga</Label>
              <Input {...register("harga")} type="number" placeholder="Contoh: 35000" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active_menu" className="rounded" {...register("is_active")} />
              <Label htmlFor="is_active_menu">Menu aktif</Label>
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

      {/* Modal Wizard Menu & Resep */}
      <TambahMenuWizardModal open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}
