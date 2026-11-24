import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Trash2, Sparkles, AlertCircle } from "lucide-react"
import type { BahanBaku } from "@/types/database"

interface RecipeItemState {
  isNewBahan: boolean
  bahanBakuId: string
  newBahanNama: string
  newBahanSatuan: string
  newBahanStokAwal: number
  newBahanMinStok: number | ""
  qty: number
}

interface TambahMenuWizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TambahMenuWizardModal({ open, onOpenChange }: TambahMenuWizardModalProps) {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  // Form states
  const [namaMenu, setNamaMenu] = useState("")
  const [kategori, setKategori] = useState("Kopi")
  const [customKategori, setCustomKategori] = useState("")
  const [items, setItems] = useState<RecipeItemState[]>([
    {
      isNewBahan: false,
      bahanBakuId: "",
      newBahanNama: "",
      newBahanSatuan: "Gram",
      newBahanStokAwal: 0,
      newBahanMinStok: "",
      qty: 1,
    },
  ])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState(false)

  // Fetch daftar bahan baku yang sudah ada
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

  const resetForm = () => {
    setNamaMenu("")
    setKategori("Kopi")
    setCustomKategori("")
    setItems([
      {
        isNewBahan: false,
        bahanBakuId: "",
        newBahanNama: "",
        newBahanSatuan: "Gram",
        newBahanStokAwal: 0,
        newBahanMinStok: "",
        qty: 1,
      },
    ])
    setErrorMsg(null)
    setSuccessMsg(false)
  }

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        isNewBahan: false,
        bahanBakuId: "",
        newBahanNama: "",
        newBahanSatuan: "Gram",
        newBahanStokAwal: 0,
        newBahanMinStok: "",
        qty: 1,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: keyof RecipeItemState, value: any) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // 1. Validasi
      if (!namaMenu.trim()) {
        throw new Error("Nama Menu wajib diisi.")
      }
      if (items.length === 0) {
        throw new Error("Minimal harus ada 1 bahan baku dalam resep menu.")
      }

      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.isNewBahan) {
          if (!it.newBahanNama.trim()) {
            throw new Error(`Nama Bahan Baru pada baris ke-${i + 1} belum diisi.`)
          }
          if (!it.newBahanSatuan.trim()) {
            throw new Error(`Satuan Bahan Baru pada baris ke-${i + 1} belum diisi.`)
          }
        } else {
          if (!it.bahanBakuId) {
            throw new Error(`Silakan pilih Bahan Baku pada baris ke-${i + 1} atau centang Buat Bahan Baru.`)
          }
        }
        if (!it.qty || it.qty <= 0) {
          throw new Error(`Takaran porsi (Qty) pada baris ke-${i + 1} harus lebih dari 0.`)
        }
      }

      const finalKategori = kategori === "Lainnya" ? customKategori.trim() : kategori

      // 2. Buat bahan baku baru jika ada
      const resolvedBahanIds: { bahanBakuId: string; qty: number }[] = []

      for (const it of items) {
        if (it.isNewBahan) {
          const { data: newBahan, error: newBahanErr } = await supabase
            .from("bahan_baku")
            .insert({
              nama: it.newBahanNama.trim(),
              satuan: it.newBahanSatuan.trim(),
              stok_awal: Number(it.newBahanStokAwal) || 0,
              minimum_stok: it.newBahanMinStok !== "" ? Number(it.newBahanMinStok) : null,
              division: "bar",
              is_active: true,
              created_by: profile?.id,
            } as any)
            .select()
            .single()

          if (newBahanErr) throw newBahanErr
          resolvedBahanIds.push({
            bahanBakuId: (newBahan as any).id,
            qty: it.qty,
          })
        } else {
          resolvedBahanIds.push({
            bahanBakuId: it.bahanBakuId,
            qty: it.qty,
          })
        }
      }

      // 3. Buat menu baru
      const { data: newMenu, error: menuErr } = await supabase
        .from("menu")
        .insert({
          nama: namaMenu.trim(),
          kategori: finalKategori || null,
          division: "bar",
          is_active: true,
          created_by: profile?.id,
        } as any)
        .select()
        .single()

      if (menuErr) throw menuErr
      const menuId = (newMenu as any).id

      // 4. Masukkan recipe komposisi
      const recipeRows = resolvedBahanIds.map((r) => ({
        menu_id: menuId,
        bahan_baku_id: r.bahanBakuId,
        qty: r.qty,
        created_by: profile?.id,
      }))

      const { error: recipeErr } = await supabase.from("recipe").insert(recipeRows as any)
      if (recipeErr) throw recipeErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-list"] })
      queryClient.invalidateQueries({ queryKey: ["bahan-baku-aktif"] })
      queryClient.invalidateQueries({ queryKey: ["bahan-baku-list"] })
      queryClient.invalidateQueries({ queryKey: ["recipes-all"] })
      queryClient.invalidateQueries({ queryKey: ["all-recipes"] })
      queryClient.invalidateQueries({ queryKey: ["recipe-count-per-menu"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })

      setSuccessMsg(true)
      setTimeout(() => {
        resetForm()
        onOpenChange(false)
      }, 1500)
    },
    onError: (err: any) => {
      setErrorMsg(err.message || String(err))
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Tambah Menu & Resep Terpadu
          </DialogTitle>
          <DialogDescription>
            Buat menu baru sekaligus tentukan bahan baku dan takaran porsinya dalam satu langkah. Anda juga bisa menambahkan bahan baku baru langsung di sini.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-green-100 text-green-800 text-sm p-3 rounded-md">
            ✓ Menu dan resep berhasil disimpan ke sistem!
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* SECTION 1: INFORMASI MENU */}
          <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
              1. Informasi Menu
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="namaMenu">Nama Menu *</Label>
                <Input
                  id="namaMenu"
                  placeholder="Contoh: Caramel Macchiato"
                  value={namaMenu}
                  onChange={(e) => setNamaMenu(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kategori">Kategori</Label>
                <select
                  id="kategori"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={kategori}
                  onChange={(e) => setKategori(e.target.value)}
                >
                  <option value="Kopi">Kopi</option>
                  <option value="Non-Kopi">Non-Kopi</option>
                  <option value="Tea">Tea / Teh</option>
                  <option value="Mocktail">Mocktail</option>
                  <option value="Lainnya">Kategori Lainnya...</option>
                </select>
              </div>

              {kategori === "Lainnya" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="customKategori">Nama Kategori Baru</Label>
                  <Input
                    id="customKategori"
                    placeholder="Contoh: Signature Drink"
                    value={customKategori}
                    onChange={(e) => setCustomKategori(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: KOMPOSISI BAHAN BAKU / RESEP */}
          <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                  2. Komposisi Resep (Bahan per 1 Porsi)
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tentukan bahan yang dibutuhkan untuk membuat 1 porsi menu ini.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => {
                const currentBahan = bahanList?.find((b) => b.id === item.bahanBakuId)
                const displaySatuan = item.isNewBahan ? item.newBahanSatuan : currentBahan?.satuan || "Satuan"

                return (
                  <div key={index} className="border bg-background rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Bahan #{index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-xs flex items-center gap-1.5 cursor-pointer text-primary">
                          <input
                            type="checkbox"
                            checked={item.isNewBahan}
                            onChange={(e) => handleItemChange(index, "isNewBahan", e.target.checked)}
                            className="rounded"
                          />
                          <span>+ Buat Bahan Baru</span>
                        </label>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {!item.isNewBahan ? (
                      // Pilih bahan yang sudah ada
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 space-y-1">
                          <Label className="text-xs">Pilih Bahan Baku *</Label>
                          <SearchableSelect
                            value={item.bahanBakuId}
                            onChange={(v) => handleItemChange(index, "bahanBakuId", v)}
                            options={(bahanList ?? []).map((b) => ({ id: b.id, label: b.nama, hint: b.satuan }))}
                            placeholder="-- Pilih bahan baku --"
                            emptyText="Bahan baku tidak ditemukan"
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Takaran (1 Porsi) *</Label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0.1"
                              step="any"
                              placeholder="0"
                              className="h-9"
                              value={item.qty || ""}
                              onChange={(e) => handleItemChange(index, "qty", parseFloat(e.target.value) || 0)}
                            />
                            <span className="text-xs text-muted-foreground w-12 truncate">
                              {displaySatuan}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Input bahan baku baru on-the-fly
                      <div className="space-y-3 bg-amber-50/50 p-3 rounded-md border border-amber-200">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-xs text-amber-900 font-medium">Nama Bahan Baru *</Label>
                            <Input
                              placeholder="Contoh: Caramel Sauce"
                              className="h-9 bg-white"
                              value={item.newBahanNama}
                              onChange={(e) => handleItemChange(index, "newBahanNama", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-amber-900 font-medium">Satuan *</Label>
                            <Input
                              placeholder="Gram, Ml, Pcs"
                              className="h-9 bg-white"
                              value={item.newBahanSatuan}
                              onChange={(e) => handleItemChange(index, "newBahanSatuan", e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Stok Awal Saat Ini</Label>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              className="h-9 bg-white"
                              value={item.newBahanStokAwal || ""}
                              onChange={(e) =>
                                handleItemChange(index, "newBahanStokAwal", parseFloat(e.target.value) || 0)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Batas Minimum Stok</Label>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Opsional"
                              className="h-9 bg-white"
                              value={item.newBahanMinStok === "" ? "" : item.newBahanMinStok}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "newBahanMinStok",
                                  e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-amber-900 font-medium">Takaran (1 Porsi) *</Label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min="0.1"
                                step="any"
                                placeholder="0"
                                className="h-9 bg-white"
                                value={item.qty || ""}
                                onChange={(e) => handleItemChange(index, "qty", parseFloat(e.target.value) || 0)}
                              />
                              <span className="text-xs text-muted-foreground w-12 truncate">
                                {item.newBahanSatuan || "Satuan"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Tambah Bahan Lain ke Resep
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || successMsg}
            onClick={() => mutation.mutate()}
            className="gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            {mutation.isPending ? "Menyimpan Menu & Resep..." : "Simpan Menu & Resep"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
