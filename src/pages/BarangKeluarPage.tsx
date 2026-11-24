import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { today, formatNumber } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Trash2, PackageMinus } from "lucide-react"
import type { BahanBaku, OutReason, SaldoBahanBaku } from "@/types/database"
import { OUT_REASON_LABEL } from "@/types/database"
import { BarangKeluarPenjualan } from "@/components/barang-keluar/BarangKeluarPenjualan"
import { BarangKeluarPosGrid } from "@/components/barang-keluar/BarangKeluarPosGrid"

type Mode = "manual" | "penjualan"
type SubMode = "import" | "grid"

const schema = z.object({
  tgl_transaksi: z.string().min(1),
  alasan_out: z.enum(["WASTE", "EXPIRED", "TESTING", "OPERATIONAL", "OTHER"] as [OutReason, ...OutReason[]]),
  catatan: z.string().optional(),
  items: z
    .array(
      z.object({
        bahan_baku_id: z.string().min(1, "Pilih bahan baku"),
        qty: z.coerce.number().positive("Jumlah > 0"),
      })
    )
    .min(1),
})

type FormData = z.infer<typeof schema>

export function BarangKeluarPage() {
  const [mode, setMode] = useState<Mode>("manual")
  const [subMode, setSubMode] = useState<SubMode>("grid")
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

  const { data: saldoList } = useQuery({
    queryKey: ["saldo-bahan-baku"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_saldo_bahan_baku").select("*")
      if (error) throw error
      return data as SaldoBahanBaku[]
    },
  })

  const getSaldo = (id: string) => saldoList?.find((s) => s.id === id)?.saldo_akhir ?? 0
  const getSatuan = (id: string) => bahanList?.find((b) => b.id === id)?.satuan ?? ""

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      tgl_transaksi: today(),
      alasan_out: "WASTE",
      catatan: "",
      items: [{ bahan_baku_id: "", qty: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "items" })
  const watchedItems = watch("items")

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Validasi saldo tidak negatif
      for (const item of data.items) {
        const saldo = getSaldo(item.bahan_baku_id)
        if (item.qty > saldo) {
          throw new Error(
            `OUT melebihi saldo. Saldo "${bahanList?.find(b => b.id === item.bahan_baku_id)?.nama}": ${formatNumber(saldo)}`
          )
        }
      }

      const { data: trx, error: trxErr } = await supabase
        .from("transaksi")
        .insert({
          tgl_transaksi: data.tgl_transaksi,
          jenis: "OUT",
          sumber: "MANUAL_OUT",
          alasan_out: data.alasan_out,
          catatan: data.catatan || null,
          is_posted: true,
          posted_at: new Date().toISOString(),
          created_by: profile?.id,
        } as any)
        .select()
        .single()

      if (trxErr) throw trxErr

      const details = data.items.map((item) => {
        const saldo = getSaldo(item.bahan_baku_id)
        return {
          transaksi_id: (trx as any).id,
          bahan_baku_id: item.bahan_baku_id,
          qty: item.qty,
          saldo_sebelum: saldo,
          saldo_sesudah: saldo - item.qty,
        }
      })

      const { error: detErr } = await supabase.from("transaksi_detail").insert(details as any)
      if (detErr) throw detErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      setSuccess(true)
      reset({ tgl_transaksi: today(), alasan_out: "WASTE", catatan: "", items: [{ bahan_baku_id: "", qty: 0 }] })
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageMinus className="h-6 w-6 text-red-500" />
          Barang Keluar (OUT)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Catat pengurangan stok bahan baku</p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          onClick={() => setMode("manual")}
        >
          OUT Manual
        </Button>
        <Button
          variant={mode === "penjualan" ? "default" : "outline"}
          onClick={() => setMode("penjualan")}
        >
          Dari Penjualan
        </Button>
      </div>

      {mode === "penjualan" ? (
        <>
          <div className="flex gap-2">
            <Button
              variant={subMode === "import" ? "default" : "outline"}
              onClick={() => setSubMode("import")}
            >
              Import POS (File)
            </Button>
            <Button
              variant={subMode === "grid" ? "default" : "outline"}
              onClick={() => setSubMode("grid")}
            >
              POS Grid (Manual)
            </Button>
          </div>
          {subMode === "grid" ? <BarangKeluarPosGrid /> : <BarangKeluarPenjualan />}
        </>
      ) : (
        <div className="max-w-2xl space-y-6">
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm">
              ✓ Transaksi barang keluar berhasil disimpan.
            </div>
          )}
          {mutation.error && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
              Gagal: {String(mutation.error)}
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
                </div>
                <div className="space-y-1.5">
                  <Label>Alasan Keluar</Label>
                  <Select
                    value={watch("alasan_out")}
                    onValueChange={(v) => setValue("alasan_out", v as OutReason)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(OUT_REASON_LABEL) as [OutReason, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Catatan (opsional)</Label>
                  <Textarea placeholder="Keterangan tambahan..." {...register("catatan")} rows={2} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daftar Bahan Keluar</CardTitle>
                <CardDescription>Pastikan jumlah tidak melebihi saldo yang tersedia</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {fields.map((field, index) => {
                  const selectedId = watchedItems[index]?.bahan_baku_id
                  const saldo = getSaldo(selectedId)
                  const satuan = getSatuan(selectedId)
                  return (
                    <div key={field.id} className="space-y-1">
                      <div className="flex gap-3 items-end">
                        <div className="flex-1 space-y-1.5">
                          {index === 0 && <Label>Bahan Baku</Label>}
                          <SearchableSelect
                            value={selectedId ?? ""}
                            onChange={(v) => setValue(`items.${index}.bahan_baku_id`, v)}
                            options={(bahanList ?? []).map((b) => ({ id: b.id, label: b.nama, hint: b.satuan }))}
                            placeholder="Pilih bahan baku..."
                            emptyText="Bahan baku tidak ditemukan"
                          />
                        </div>
                        <div className="w-36 space-y-1.5">
                          {index === 0 && <Label>Jumlah</Label>}
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              {...register(`items.${index}.qty`)}
                            />
                            <span className="text-xs text-muted-foreground w-10 shrink-0">{satuan}</span>
                          </div>
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
                      {selectedId && (
                        <p className="text-xs text-muted-foreground pl-1">
                          Saldo tersedia: <strong>{formatNumber(saldo)} {satuan}</strong>
                        </p>
                      )}
                    </div>
                  )
                })}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ bahan_baku_id: "", qty: 0 })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Bahan
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => reset({ tgl_transaksi: today(), alasan_out: "WASTE", catatan: "", items: [{ bahan_baku_id: "", qty: 0 }] })}
              >
                Reset
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Menyimpan..." : "Simpan Transaksi OUT"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
