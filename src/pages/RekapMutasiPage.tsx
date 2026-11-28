import { useQuery } from "@tanstack/react-query"
import { useState, useMemo, useEffect, useRef, Fragment } from "react"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/common/PageHeader"
import * as XLSX from "xlsx-js-style"
import { FileDown, Calendar } from "lucide-react"
import { today, daysAgo } from "@/lib/utils"

interface CellMutasi {
  in: number
  out: number
}

interface RowMutasi {
  id: string
  nama: string
  satuan: string
  division: string
  saldoAwal: number
  saldoAkhir: number
  cells: Record<string, CellMutasi>
}

export function RekapMutasiPage() {
  const [dateFrom, setDateFrom] = useState(() => daysAgo(7))
  const [dateTo, setDateTo] = useState(today)
  const [division, setDivision] = useState("all")

  const { data: rows, isLoading } = useQuery({
    queryKey: ["rekap-mutasi", dateFrom, dateTo, division],
    enabled: Boolean(dateFrom && dateTo),
    queryFn: async (): Promise<RowMutasi[]> => {
      let bq = supabase
        .from("bahan_baku")
        .select("id, nama, satuan, stok_awal, division")
        .eq("is_active", true)
        .order("nama")
      if (division !== "all") bq = bq.eq("division", division)

      const [bahanRes, allDetails] = await Promise.all([
        bq,
        fetchAllRows<any>((from, to) =>
          supabase
            .from("transaksi_detail")
            .select("id, bahan_baku_id, qty, transaksi!inner(tgl_transaksi, jenis, is_posted)")
            .eq("transaksi.is_posted", true)
            .lte("transaksi.tgl_transaksi", dateTo)
            .order("id", { ascending: true })
            .range(from, to)
        ),
      ])
      if (bahanRes.error) throw bahanRes.error

      const result: RowMutasi[] = (bahanRes.data ?? []).map((b: any) => ({
        id: b.id,
        nama: b.nama,
        satuan: b.satuan ?? "",
        division: b.division ?? "bar",
        saldoAwal: Number(b.stok_awal ?? 0),
        saldoAkhir: 0,
        cells: {},
      }))
      const byId = new Map(result.map((r) => [r.id, r]))

      allDetails.forEach((d: any) => {
        const row = byId.get(d.bahan_baku_id)
        if (!row) return
        const tgl = d.transaksi.tgl_transaksi
        const qty = Number(d.qty ?? 0)
        const isIn = d.transaksi.jenis === "IN"
        if (tgl < dateFrom) {
          row.saldoAwal += isIn ? qty : -qty
        } else if (tgl <= dateTo) {
          const c = (row.cells[tgl] ??= { in: 0, out: 0 })
          if (isIn) c.in += qty
          else c.out += qty
        }
      })

      result.forEach((r) => {
        r.saldoAkhir = r.saldoAwal
        for (const c of Object.values(r.cells)) r.saldoAkhir += c.in - c.out
      })

      return result
    },
  })

  const dates = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return []
    const arr: string[] = []
    const start = new Date(`${dateFrom}T00:00:00Z`)
    const end = new Date(`${dateTo}T00:00:00Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
    const maxDays = 366
    for (let d = new Date(start); d <= end && arr.length < maxDays; d.setUTCDate(d.getUTCDate() + 1)) {
      arr.push(d.toISOString().split("T")[0])
    }
    return arr
  }, [dateFrom, dateTo])

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""))
  const fmtDate = (iso: string) => {
    const p = iso.split("-")
    return `${p[2]}/${p[1]}/${p[0]}`
  }

  // Dual scrollbar: sinkron atas <-> bawah
  const topScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const [spacerW, setSpacerW] = useState(1)
  useEffect(() => {
    const el = bottomScrollRef.current
    if (el) setSpacerW(el.scrollWidth)
  }, [rows, dates, isLoading])

  const exportExcel = () => {
    const aoa: (string | number)[][] = []

    // Row 1: NO, ITEM (PORSI), STOC, then date groups
    const row1: (string | number)[] = ["NO", "ITEM (PORSI)", "STOC"]
    const row2: (string | number)[] = ["", "", ""]
    dates.forEach((d) => {
      row1.push(fmtDate(d), "", "")
      row2.push("IN", "OUT", "Balance")
    })
    aoa.push(row1, row2)

    // Data rows
    ;(rows ?? []).forEach((r, idx) => {
      let running = r.saldoAwal
      const dataRow: (string | number)[] = [idx + 1, r.nama, r.saldoAwal]
      dates.forEach((d) => {
        const c = r.cells[d]
        const inn = c?.in ?? 0
        const out = c?.out ?? 0
        running = running + inn - out
        dataRow.push(inn > 0 ? fmt(inn) : "", out > 0 ? fmt(out) : "", fmt(running))
      })
      aoa.push(dataRow)
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // NO
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // ITEM (PORSI)
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // STOC
    ]
    dates.forEach((_, i) => {
      const start = 3 + i * 3
      merges.push({ s: { r: 0, c: start }, e: { r: 0, c: start + 2 } })
    })
    ws["!merges"] = merges
    ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 10 }, ...dates.flatMap(() => [{ wch: 8 }, { wch: 8 }, { wch: 10 }])]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "stok_opname")
    XLSX.writeFile(wb, `rekap_mutasi_${dateFrom}_${dateTo}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={Calendar} title="Rekap Mutasi Bahan" description="Matriks IN/OUT dan saldo bahan per tanggal" />

      <Card>
        <CardContent className="p-4 sm:p-5 flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Dari</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sampai</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5 w-40">
            <Label className="text-xs">Divisi</Label>
            <Select value={division} onValueChange={setDivision}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="kitchen">Kitchen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportExcel} className="ml-auto gap-2">
            <FileDown className="h-4 w-4" /> Export Excel / CSV
          </Button>
        </CardContent>
      </Card>

      {/* Scrollbar horizontal di atas (desktop) */}
      <div className="hidden lg:block overflow-x-auto" ref={topScrollRef}
        onScroll={(e) => { if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = e.currentTarget.scrollLeft }}
        aria-hidden="true"
      >
        <div style={{ width: spacerW, height: 1 }} />
      </div>

      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <div
            ref={bottomScrollRef}
            className="overflow-x-auto"
            onScroll={(e) => { if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th rowSpan={2} className="p-3 text-center font-medium border-r">NO</th>
                  <th rowSpan={2} className="p-3 text-left font-medium border-r">ITEM (PORSI)</th>
                  <th rowSpan={2} className="p-3 text-center font-medium border-r">STOC</th>
                  {dates.map((d) => (
                    <th key={d} colSpan={3} className="p-2 text-center font-medium border-r">
                      {fmtDate(d)}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-muted/50">
                  {dates.map((d) => (
                    <Fragment key={d}>
                      <th className="p-2 text-center text-[10px] font-medium uppercase text-muted-foreground">IN</th>
                      <th className="p-2 text-center text-[10px] font-medium uppercase text-muted-foreground">OUT</th>
                      <th className="p-2 text-center text-[10px] font-medium uppercase text-muted-foreground border-r">Balance</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={3 + dates.length * 3} className="text-center py-8 text-muted-foreground">
                      Memuat data...
                    </td>
                  </tr>
                ) : !rows?.length ? (
                  <tr>
                    <td colSpan={3 + dates.length * 3} className="text-center py-8 text-muted-foreground">
                      Tidak ada bahan baku pada filter ini.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    let running = r.saldoAwal
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-center text-muted-foreground border-r">{idx + 1}</td>
                        <td className="p-3 font-medium border-r whitespace-nowrap">
                          <span className="mr-2">{r.nama}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {r.division === "kitchen" ? "Kitchen" : "Bar"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center tabular-nums text-muted-foreground border-r">
                          {fmt(r.saldoAwal)} <span className="text-[10px]">{r.satuan}</span>
                        </td>
                        {dates.map((d) => {
                          const c = r.cells[d]
                          const inn = c?.in ?? 0
                          const out = c?.out ?? 0
                          running = running + inn - out
                          return (
                            <Fragment key={d}>
                              <td className="p-2 text-center tabular-nums text-emerald-600">
                                {inn > 0 ? `+${fmt(inn)}` : "-"}
                              </td>
                              <td className="p-2 text-center tabular-nums text-rose-600">
                                {out > 0 ? `-${fmt(out)}` : "-"}
                              </td>
                              <td className="p-2 text-center tabular-nums font-semibold border-r">{fmt(running)}</td>
                            </Fragment>
                          )
                        })}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="lg:hidden space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground p-4">Memuat data...</p>}
        {!isLoading && !rows?.length && (
          <p className="text-sm text-muted-foreground p-4">Tidak ada bahan baku pada filter ini.</p>
        )}
        {rows?.map((r, idx) => {
          let running = r.saldoAwal
          return (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">
                    <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                    {r.nama}
                  </p>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {r.division === "kitchen" ? "Kitchen" : "Bar"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  STOC: <b className="text-foreground">{fmt(r.saldoAwal)}</b> {r.satuan}
                </div>
                <div className="space-y-1.5">
                  {dates.map((d) => {
                    const c = r.cells[d]
                    const inn = c?.in ?? 0
                    const out = c?.out ?? 0
                    running = running + inn - out
                    if (inn === 0 && out === 0) return null
                    return (
                      <div key={d} className="text-xs bg-muted/40 rounded-md px-3 py-2 space-y-1">
                        <div className="font-medium text-muted-foreground">{fmtDate(d)}</div>
                        <div className="flex justify-between tabular-nums">
                          <span className="text-emerald-600">IN +{fmt(inn)}</span>
                          <span className="text-rose-600">OUT -{fmt(out)}</span>
                          <span className="font-semibold">Bal {fmt(running)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between text-sm pt-1 border-t">
                  <span className="text-muted-foreground">
                    Awal: <b>{fmt(r.saldoAwal)}</b>
                  </span>
                  <span className="text-muted-foreground">
                    Akhir: <b>{fmt(running)}</b> {r.satuan}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}