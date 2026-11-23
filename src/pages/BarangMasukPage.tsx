import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { today } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Trash2, PackagePlus } from "lucide-react"
import type { BahanBaku } from "@/types/database"

const schema = z.object({
  tgl_transaksi: z.string().min(1, "Tanggal wajib diisi"),
  catatan: z.string().optional(),
  items: z
    .array(
      z.object({
        bahan_baku_id: z.string().min(1, "Bahan baku wajib dipilih"),
        qty: z.coerce.number().positive("Jumlah harus lebih dari 0"),
      })
    )
    .min(1, "Minimal satu bahan baku"),
})

type FormData = z.infer<typeof schema>

export function BarangMasukPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [success, setSuccess] = useState(false)

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
    defaultValues: {
      tgl_transaksi: today(),
      catatan: "",
      items: [{ bahan_baku_id: "", qty: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "items" })

  const getSatuan = (id: string) => bahanList?.find((b) => b.id === id)?.satuan ?? ""

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      // 1. Ambil saldo setiap bahan baku
      const saldoMap: Record<string, number> = {}
      for (const item of data.items) {
        const { data: saldo } = await supabase.rpc("get_saldo_bahan", {
          p_bahan_baku_id: item.bahan_baku_id,
        } as any)
        saldoMap[item.bahan_baku_id] = Number(saldo ?? 0)
      }

      // 2. Buat transaksi header
      const { data: trx, error: trxErr } = await supabase
        .from("transaksi")
        .insert({
          tgl_transaksi: data.tgl_transaksi,
          jenis: "IN",
          sumber: "MANUAL_IN",
          catatan: data.catatan || null,
          is_posted: true,
          posted_at: new Date().toISOString(),
          created_by: profile?.id,
        } as any)
        .select()
        .single()

      if (trxErr) throw trxErr

      // 3. Buat detail
      const details = data.items.map((item) => ({
        transaksi_id: (trx as any).id,
        bahan_baku_id: item.bahan_baku_id,
        qty: item.qty,
        saldo_sebelum: saldoMap[item.bahan_baku_id],
        saldo_sesudah: saldoMap[item.bahan_baku_id] + item.qty,
      }))

      const { error: detErr } = await supabase.from("transaksi_detail").insert(details as any)
      if (detErr) throw detErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      setSuccess(true)
      reset({ tgl_transaksi: today(), catatan: "", items: [{ bahan_baku_id: "", qty: 0 }] })
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  const watchedItems = watch("items")

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-green-600" />
          Barang Masuk (IN)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Catat penambahan stok bahan baku</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm">
          ✓ Transaksi barang masuk berhasil disimpan.
        </div>
      )}

      {mutation.error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          Gagal menyimpan: {String(mutation.error)}
        </div>
      )}

      <form onSubmit={handleSubmit((d) => mutation.mutate(d as FormData))} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Transaksi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tanggal Transaksi</Label>
              <Input type="date" {...register("tgl_transaksi")} />
              {errors.tgl_transaksi && (
                <p className="text-xs text-destructive">{errors.tgl_transaksi.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Textarea placeholder="Keterangan tambahan..." {...register("catatan")} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daftar Bahan Masuk</CardTitle>
            <CardDescription>Tambahkan satu atau lebih bahan baku</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  {index === 0 && <Label>Bahan Baku</Label>}
                  <SearchableSelect
                    value={watchedItems[index]?.bahan_baku_id ?? ""}
                    onChange={(v) => setValue(`items.${index}.bahan_baku_id`, v)}
                    options={(bahanList ?? []).map((b) => ({ id: b.id, label: b.nama, hint: b.satuan }))}
                    placeholder="Pilih bahan baku..."
                    emptyText="Bahan baku tidak ditemukan"
                  />
                  {errors.items?.[index]?.bahan_baku_id && (
                    <p className="text-xs text-destructive">{errors.items[index]?.bahan_baku_id?.message}</p>
                  )}
                </div>
                <div className="w-36 space-y-1.5">
                  {index === 0 && <Label>Jumlah</Label>}
                  <div className="flex items-center gap-1">
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
                  {errors.items?.[index]?.qty && (
                    <p className="text-xs text-destructive">{errors.items[index]?.qty?.message}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive mb-0.5"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ bahan_baku_id: "", qty: 0 })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Tambah Bahan
            </Button>
            {errors.items?.root && (
              <p className="text-xs text-destructive">{errors.items.root.message}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => reset({ tgl_transaksi: today(), catatan: "", items: [{ bahan_baku_id: "", qty: 0 }] })}
          >
            Reset
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Menyimpan..." : "Simpan Transaksi IN"}
          </Button>
        </div>
      </form>
    </div>
  )
}
