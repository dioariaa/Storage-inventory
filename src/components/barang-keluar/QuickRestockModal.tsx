import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { formatNumber, getErrorMessage } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, PackagePlus } from "lucide-react"

export interface ShortageItem {
  bahan_baku_id: string
  bahan_baku_nama: string
  satuan: string
  butuh: number
  saldo: number
}

interface QuickRestockModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tanggal: string
  shortages: ShortageItem[]
  defaultCatatan?: string
  onSuccess: () => void
}

export function QuickRestockModal({
  open,
  onOpenChange,
  tanggal,
  shortages,
  defaultCatatan: customDefaultCatatan,
  onSuccess,
}: QuickRestockModalProps) {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [catatan, setCatatan] = useState<string | null>(null)

  const defaultCatatan = customDefaultCatatan ?? `Barang masuk cepat untuk closing POS (${tanggal})`
  const effectiveCatatan = catatan ?? defaultCatatan

  const getQtyValue = (s: ShortageItem) => {
    if (qtys[s.bahan_baku_id] !== undefined) return qtys[s.bahan_baku_id]
    const kurang = Math.max(0, Number((s.butuh - s.saldo).toFixed(3)))
    return String(kurang > 0 ? kurang : 1)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQtys({})
      setCatatan(null)
    }
    onOpenChange(nextOpen)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const items = shortages
        .map((s) => ({
          bahan_baku_id: s.bahan_baku_id,
          qty: Number(getQtyValue(s)),
        }))
        .filter((x) => x.qty > 0)

      if (items.length === 0) throw new Error("Isi jumlah barang masuk minimal untuk satu bahan (> 0).")

      // Coba RPC atomik 018 dulu; fallback ke insert standar jika migrasi 018 belum dijalankan
      const rpcRes = await (supabase as any).rpc("catat_transaksi_manual", {
        p_tanggal: tanggal,
        p_jenis: "IN",
        p_alasan_out: null,
        p_catatan: effectiveCatatan || null,
        p_items: items,
      })

      if (rpcRes.error) {
        const msg = String(rpcRes.error.message ?? "")
        const missingFn = rpcRes.error.code === "PGRST202" || rpcRes.error.code === "42883" || msg.includes("catat_transaksi_manual")
        if (!missingFn) throw rpcRes.error

        // Fallback standar
        const saldoMap: Record<string, number> = {}
        for (const it of items) {
          const { data: sData, error: sErr } = await supabase.rpc("get_saldo_bahan", {
            p_bahan_baku_id: it.bahan_baku_id,
          } as any)
          if (sErr) throw sErr
          saldoMap[it.bahan_baku_id] = Number(sData ?? 0)
        }

        const { data: trx, error: trxErr } = await supabase
          .from("transaksi")
          .insert({
            tgl_transaksi: tanggal,
            jenis: "IN",
            sumber: "MANUAL_IN",
            catatan: effectiveCatatan || null,
            is_posted: true,
            posted_at: new Date().toISOString(),
            created_by: profile?.id,
          } as any)
          .select("id")
          .single()
        if (trxErr) throw trxErr

        const { error: detErr } = await supabase.from("transaksi_detail").insert(
          items.map((it) => ({
            transaksi_id: (trx as any).id,
            bahan_baku_id: it.bahan_baku_id,
            qty: it.qty,
            saldo_sebelum: saldoMap[it.bahan_baku_id],
            saldo_sesudah: saldoMap[it.bahan_baku_id] + it.qty,
          })) as any
        )
        if (detErr) throw detErr
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["saldo-bahan-baku"] }),
        queryClient.invalidateQueries({ queryKey: ["mutasi"] }),
        queryClient.invalidateQueries({ queryKey: ["riwayat"] }),
        queryClient.invalidateQueries({ queryKey: ["rekap-mutasi"] }),
        queryClient.invalidateQueries({ queryKey: ["variance-details"] }),
      ])
      setQtys({})
      setCatatan(null)
      onOpenChange(false)
      onSuccess()
    },
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            Input Barang Masuk Cepat
          </DialogTitle>
          <DialogDescription>
            Catat barang masuk untuk bahan yang stoknya kurang pada tanggal <b>{tanggal}</b>. Anda bisa mengisi sesuai jumlah belanja nyata (minimal sebesar kekurangannya).
          </DialogDescription>
        </DialogHeader>

        {mutation.error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{getErrorMessage(mutation.error)}</span>
          </div>
        )}

        <div className="space-y-3 py-1">
          {shortages.map((s) => {
            const kurang = Math.max(0, Number((s.butuh - s.saldo).toFixed(3)))
            return (
              <div key={s.bahan_baku_id} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{s.bahan_baku_nama}</p>
                    <p className="text-xs text-muted-foreground">
                      Saldo: {formatNumber(s.saldo)} · Butuh: {formatNumber(s.butuh)} ·{" "}
                      <span className="text-destructive font-semibold">
                        Kurang: {formatNumber(kurang)} {s.satuan}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Qty Masuk:</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="h-9 bg-white"
                    value={getQtyValue(s)}
                    onChange={(e) => setQtys((prev) => ({ ...prev, [s.bahan_baku_id]: e.target.value }))}
                  />
                  <span className="text-xs text-muted-foreground w-14 shrink-0">{s.satuan}</span>
                </div>
              </div>
            )
          })}

          <div className="space-y-1.5 pt-1">
            <Label className="text-xs">Catatan</Label>
            <Input
              value={effectiveCatatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Keterangan belanja / barang masuk..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Menyimpan..." : "Simpan Barang Masuk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
