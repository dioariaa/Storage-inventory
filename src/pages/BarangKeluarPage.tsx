import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { today, formatNumber, getErrorMessage } from "@/lib/utils"
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
import { PageHeader } from "@/components/common/PageHeader"

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
  const [divFilter, setDivFilter] = useState<"all" | "bar" | "kitchen">("all")
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

  const filteredBahan = (bahanList ?? []).filter(
    (b) => divFilter === "all" || b.division === divFilter
  )

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
      // Coba RPC atomik 018 dulu; fallback ke insert standar bila belum dijalankan
      const rpcRes = await (supabase as any).rpc("catat_transaksi_manual", {
        p_tanggal: data.tgl_transaksi,
        p_jenis: "OUT",
        p_alasan_out: data.alasan_out,
        p_catatan: data.catatan || null,
        p_items: data.items.map((i) => ({ bahan_baku_id: i.bahan_baku_id, qty: i.qty })),
      })

      if (rpcRes.error) {
        const msg = String(rpcRes.error.message ?? "")
        const missingFn =
          rpcRes.error.code === "PGRST202" ||
          rpcRes.error.code === "42883" ||
          msg.includes("catat_transaksi_manual")
        if (!missingFn) throw rpcRes.error

        // Agregasi total OUT per bahan dan validasi terhadap saldo fresh di DB
        const totalByBahan = new Map<string, number>()
        for (const item of data.items) {
          totalByBahan.set(item.bahan_baku_id, (totalByBahan.get(item.bahan_baku_id) ?? 0) + item.qty)
        }

        const freshSaldoMap: Record<string, number> = {}
        for (const [bahanId, totalQty] of totalByBahan.entries()) {
          const { data: freshSaldo, error: saldoErr } = await supabase.rpc("get_saldo_bahan", {
            p_bahan_baku_id: bahanId,
          } as any)
          if (saldoErr) throw saldoErr
          const saldo = Number(freshSaldo ?? 0)
          freshSaldoMap[bahanId] = saldo
          if (totalQty > saldo) {
            throw new Error(
              `OUT melebihi saldo. Total keluar "${bahanList?.find((b) => b.id === bahanId)?.nama}": ${formatNumber(totalQty)}, saldo tersedia: ${formatNumber(saldo)}`
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

        const runningSaldo = { ...freshSaldoMap }
        const details = data.items.map((item) => {
          const before = runningSaldo[item.bahan_baku_id]
          const after = before - item.qty
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] })
      queryClient.invalidateQueries({ queryKey: ["riwayat"] })
      queryClient.invalidateQueries({ queryKey: ["rekap-mutasi"] })
      queryClient.invalidateQueries({ queryKey: ["variance-details"] })
      setSuccess(true)
      reset({ tgl_transaksi: today(), alasan_out: "WASTE", catatan: "", items: [{ bahan_baku_id: "", qty: 0 }] })
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PackageMinus}
        title="Barang Keluar (OUT)"
        description="Catat pengurangan stok bahan baku"
      />

      {/* Mode selector */}
      <div className="grid grid-cols-2 sm:flex gap-2">
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          className="h-11"
          onClick={() => setMode("manual")}
        >
          OUT Manual
        </Button>
        <Button
          variant={mode === "penjualan" ? "default" : "outline"}
          className="h-11"
          onClick={() => setMode("penjualan")}
        >
          Dari Penjualan
        </Button>
      </div>

      {mode === "penjualan" ? (
        <>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <Button
              variant={subMode === "import" ? "default" : "outline"}
              className="h-11"
              onClick={() => setSubMode("import")}
            >
              Import POS (File)
            </Button>
            <Button
              variant={subMode === "grid" ? "default" : "outline"}
              className="h-11"
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
              Gagal: {getErrorMessage(mutation.error)}
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
              <CardHeader className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Daftar Bahan Keluar</CardTitle>
                    <CardDescription>Pastikan jumlah tidak melebihi saldo yang tersedia</CardDescription>
                  </div>
                  <div className="flex gap-1.5">
                    {(["all", "bar", "kitchen"] as const).map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={divFilter === d ? "default" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => setDivFilter(d)}
                      >
                        {d === "all" ? "Semua" : d === "bar" ? "Bar" : "Kitchen"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {fields.map((field, index) => {
                  const selectedId = watchedItems[index]?.bahan_baku_id
                  const saldo = getSaldo(selectedId)
                  const satuan = getSatuan(selectedId)
                  return (
                    <div key={field.id} className="space-y-1">
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-end">
                        <div className="flex-1 space-y-1.5">
                          {index === 0 && <Label>Bahan Baku</Label>}
                          <SearchableSelect
                            value={selectedId ?? ""}
                            onChange={(v) => setValue(`items.${index}.bahan_baku_id`, v, { shouldValidate: true })}
                            options={filteredBahan.map((b) => ({ id: b.id, label: b.nama, hint: b.satuan }))}
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
                              className="h-11"
                              {...register(`items.${index}.qty`)}
                            />
                            <span className="text-xs text-muted-foreground w-10 shrink-0">{satuan}</span>
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
