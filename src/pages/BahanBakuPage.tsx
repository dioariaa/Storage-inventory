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
import { Plus, Pencil, Boxes, Search } from "lucide-react"
import { formatNumber, today } from "@/lib/utils"
import type { BahanBaku, SaldoBahanBaku } from "@/types/database"
import { PageHeader } from "@/components/common/PageHeader"

const schema = z.object({
  nama: z.string().min(1, "Nama wajib diisi"),
  satuan: z.string().min(1, "Satuan wajib diisi"),
  stok_awal: z.coerce.number().min(0),
  minimum_stok: z.coerce.number().min(0).optional(),
  is_active: z.boolean(),
})
type FormData = z.infer<typeof schema>

export function BahanBakuPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editItem, setEditItem] = useState<BahanBaku | null>(null)
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(today)

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
    reset({ nama: "", satuan: "", stok_awal: 0, minimum_stok: undefined, is_active: true })
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

  const filtered = saldoList?.filter((b) =>
    b.nama.toLowerCase().includes(search.toLowerCase())
  )

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
          <div className="flex items-center gap-2">
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

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nama Bahan</th>
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
                  : filtered?.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                          Tidak ada bahan baku yang cocok dengan pencarian.
                        </td>
                      </tr>
                    ) : filtered?.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{b.nama}</td>
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
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
