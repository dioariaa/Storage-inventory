import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { today, getErrorMessage } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Trash2, PackagePlus } from "lucide-react"
import { PageHeader } from "@/components/common/PageHeader"
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
      // 1. Gabungkan item duplikat dan ambil saldo fresh setiap bahan baku
      const qtyByBahan = new Map<string, number>()
      for (const item of data.items) {
        qtyByBahan.set(item.bahan_baku_id, (qtyByBahan.get(item.bahan_baku_id) ?? 0) + item.qty)
      }
      const uniqueIds = [...qtyByBahan.keys()]
      const saldoMap: Record<string, number> = {}
      for (const bahanId of uniqueIds) {
        const { data: saldo, error: saldoErr } = await supabase.rpc("get_saldo_bahan", {
          p_bahan_baku_id: bahanId,
        } as any)
        if (saldoErr) throw saldoErr
        saldoMap[bahanId] = Number(saldo ?? 0)
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

      // 3. Buat detail (running saldo akurat meski user memilih bahan sama 2x)
      const runningSaldo = { ...saldoMap }
      const details = data.items.map((item) => {
        const before = runningSaldo[item.bahan_baku_id]
        const after = before + item.qty
        runningSaldo[item.bahan_baku_id] = after
        return {
          transaksi_id: (trx as any).id,
          bahan_baku_id: item.bahan_baku_id,
          qty: item.qty,
          saldo_sebelum: before,
          saldo_sesudah: after,
        }
      })

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
      <PageHeader
        icon={PackagePlus}
        title="Barang Masuk (IN)"
        description="Catat penambahan stok bahan baku"
      />

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm">
          ✓ Transaksi barang masuk berhasil disimpan.
        </div>
      )}

      {mutation.error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          Gagal menyimpan: {getErrorMessage(mutation.error)}
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
              <div key={field.id} className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-end">
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
                <div className="w-full sm:w-36 space-y-1.5">
                  {index === 0 && <Label>Jumlah</Label>}
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      className="h-11"
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
                  className="text-destructive mb-0.5 self-end h-11 w-11 sm:h-10 sm:w-10"
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
              className="h-11 w-full sm:w-auto"
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

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={() => reset({ tgl_transaksi: today(), catatan: "", items: [{ bahan_baku_id: "", qty: 0 }] })}
          >
            Reset
          </Button>
          <Button type="submit" className="h-11 w-full sm:w-auto" disabled={mutation.isPending}>
            {mutation.isPending ? "Menyimpan..." : "Simpan Transaksi IN"}
          </Button>
        </div>
      </form>
    </div>
  )
}
