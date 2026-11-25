import { useQuery } from "@tanstack/react-query"
import { Fragment, useState, useMemo, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/common/PageHeader"
import {
  Scale,
  Upload,
  FileDown,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  CircleAlert,
  ChevronDown,
} from "lucide-react"
import { utils as xlsxUtils, writeFile as xlsxWriteFile } from "xlsx"
import {
  readUploadFile,
  computeVariance,
  type DateGroup,
  type FileRow,
  type SysItem,
  type VarianceCalc,
} from "@/lib/varianceCheck"
import type { BahanBaku } from "@/types/database"

interface Ev {
  jenis: string
  qty: number
  sumber: string
  alasan_out: string | null
}

interface RowResult {
  fileRow: FileRow
  bahan?: BahanBaku
  calc: VarianceCalc
  events: Map<string, Ev[]>
  status: "ok" | "lebih" | "kurang" | "unknown"
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const tokenScore = (a: string, b: string) => {
  const ta = new Set(normalize(a).split(" "))
  const tb = new Set(normalize(b).split(" "))
  const inter = new Set([...ta].filter((x) => tb.has(x)))
  return inter.size / Math.min(ta.size, tb.size)
}

const findBahan = (nama: string, list: BahanBaku[]): BahanBaku | undefined => {
  const n = normalize(nama)
  let m = list.find((b) => normalize(b.nama) === n)
  if (m) return m
  m = list.find((b) => normalize(b.nama).includes(n) || n.includes(normalize(b.nama)))
  if (m) return m
  let best: BahanBaku | undefined
  let bestScore = 0
  for (const b of list) {
    const sc = tokenScore(nama, b.nama)
    if (sc > bestScore) {
      bestScore = sc
      best = b
    }
  }
  return bestScore >= 0.5 ? best : undefined
}

const fmtDate = (iso: string) => {
  const p = iso.split("-")
  return `${p[2]}/${p[1]}/${p[0]}`
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""))

export function VariancePage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([])
  const [fileRows, setFileRows] = useState<FileRow[]>([])
  const [checkDate, setCheckDate] = useState("")
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const { data: bahanList } = useQuery({
    queryKey: ["bahan-baku-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bahan_baku").select("*").eq("is_active", true).order("nama")
      if (error) throw error
      return data as BahanBaku[]
    },
  })

  const { data: details } = useQuery({
    queryKey: ["variance-details"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaksi_detail")
        .select("bahan_baku_id, qty, transaksi!inner(tgl_transaksi, jenis, sumber, alasan_out, is_posted)")
        .eq("transaksi.is_posted", true)
      if (error) throw error
      return data as any[]
    },
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const res = await readUploadFile(file)
    if (res.error) {
      alert(res.error)
      return
    }
    setDateGroups(res.groups)
    setFileRows(res.rows)
    setCheckDate(res.groups[res.groups.length - 1].date)
    setExpanded(new Set())
  }

  const sysItems = useMemo(() => {
    const m = new Map<string, SysItem>()
    bahanList?.forEach((b) => m.set(b.id, { stokAwal: b.stok_awal ?? 0, flows: new Map() }))
    details?.forEach((d) => {
      const it = m.get(d.bahan_baku_id)
      if (!it) return
      const t = d.transaksi
      const f = it.flows.get(t.tgl_transaksi) ?? { in: 0, out: 0 }
      if (t.jenis === "IN") f.in += d.qty
      else f.out += d.qty
      it.flows.set(t.tgl_transaksi, f)
    })
    return m
  }, [bahanList, details])

  const dates = useMemo(() => dateGroups.map((g) => g.date), [dateGroups])

  const eventsMap = useMemo(() => {
    const m = new Map<string, Map<string, Ev[]>>()
    details?.forEach((d) => {
      const t = d.transaksi
      let ev = m.get(d.bahan_baku_id)
      if (!ev) {
        ev = new Map()
        m.set(d.bahan_baku_id, ev)
      }
      let arr = ev.get(t.tgl_transaksi)
      if (!arr) {
        arr = []
        ev.set(t.tgl_transaksi, arr)
      }
      arr.push({ jenis: t.jenis, qty: d.qty, sumber: t.sumber, alasan_out: t.alasan_out })
    })
    return m
  }, [details])

  const rows: RowResult[] = useMemo(() => {
    if (!fileRows.length || !bahanList || !details) return []
    return fileRows.map((fr) => {
      const bahan = findBahan(fr.nama, bahanList)
      if (!bahan) {
        return {
          fileRow: fr,
          calc: { tl: [], manualBal: 0, sistemBal: 0, variance: 0, firstDiv: null, flowEdited: false },
          events: new Map(),
          status: "unknown" as const,
        }
      }
      const sys = sysItems.get(bahan.id)
      const calc = computeVariance(fr, dates, sys, checkDate)
      const status = calc.variance === 0 ? ("ok" as const) : calc.variance > 0 ? ("lebih" as const) : ("kurang" as const)
      return { fileRow: fr, bahan, calc, events: eventsMap.get(bahan.id) ?? new Map(), status }
    })
  }, [fileRows, bahanList, details, dates, sysItems, checkDate, eventsMap])

  const counts = useMemo(() => {
    const c = { ok: 0, lebih: 0, kurang: 0, unknown: 0 }
    rows.forEach((r) => c[r.status]++)
    return c
  }, [rows])

  const toggle = (idx: number) => {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(idx)) n.delete(idx)
      else n.add(idx)
      return n
    })
  }

  const exportExcel = () => {
    const wb = xlsxUtils.book_new()

    // Sheet 1: format rekap mutasi, 4 kolom per tanggal
    const h1: (string | number)[] = ["NO", "ITEM (PORSI)", "STOC"]
    const h2: (string | number)[] = ["", "", ""]
    dateGroups.forEach((g) => {
      h1.push(fmtDate(g.date), "", "", "", "", "", "")
      h2.push("IN MANUAL", "OUT MANUAL", "IN SISTEM", "OUT SISTEM", "SELISIH IN", "SELISIH OUT", "SELISIH STOK")
    })
    const aoa1: (string | number)[][] = [h1, h2]
    rows.forEach((r, i) => {
      const row: (string | number)[] = [i + 1, r.bahan?.nama ?? r.fileRow.nama, r.fileRow.stoc]
      r.calc.tl.forEach((t) => {
        row.push(t.mIn, t.mOut, t.sIn, t.sOut, t.mIn - t.sIn, t.mOut - t.sOut, t.varHari)
      })
      aoa1.push(row)
    })
    const ws1 = xlsxUtils.aoa_to_sheet(aoa1)
    const merges: any[] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    ]
    dateGroups.forEach((_, idx) => {
      const base = 3 + idx * 7
      merges.push({ s: { r: 0, c: base }, e: { r: 0, c: base + 6 } })
    })
    ws1["!merges"] = merges
    ws1["!cols"] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 10 },
      ...dateGroups.flatMap(() => Array(7).fill({ wch: 11 })),
    ]
    xlsxUtils.book_append_sheet(wb, ws1, "mutasi manual vs sistem")

    // Sheet 2: variance detail per tanggal
    const aoa2: (string | number)[][] = [
      [
        "NO",
        "ITEM",
        "SATUAN",
        "TANGGAL",
        "IN MANUAL",
        "OUT MANUAL",
        "IN SISTEM",
        "OUT SISTEM",
        "SELISIH IN",
        "SELISIH OUT",
        "SELISIH STOK",
        "SALDO MANUAL",
        "SALDO SISTEM",
        "VARIANCE",
      ],
    ]
    let no = 0
    rows.forEach((r) => {
      if (!r.bahan) return
      r.calc.tl.forEach((t) => {
        no++
        aoa2.push([
          no,
          r.bahan!.nama,
          r.bahan!.satuan,
          fmtDate(t.date),
          t.mIn,
          t.mOut,
          t.sIn,
          t.sOut,
          t.mIn - t.sIn,
          t.mOut - t.sOut,
          t.varHari,
          t.manualBal,
          t.sistemBal,
          t.varBal,
        ])
      })
    })
    const ws2 = xlsxUtils.aoa_to_sheet(aoa2)
    ws2["!cols"] = [
      { wch: 5 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    ]
    xlsxUtils.book_append_sheet(wb, ws2, "variance detail")

    // Sheet 3: ringkasan per item
    const aoa3: (string | number)[][] = [
      ["NO", "ITEM", "SATUAN", "TGL CEK", "SALDO MANUAL", "SALDO SISTEM", "VARIANCE", "TGL AWAL SELISIH", "STATUS"],
    ]
    rows.forEach((r, i) => {
      aoa3.push([
        i + 1,
        r.bahan?.nama ?? r.fileRow.nama,
        r.bahan?.satuan ?? "",
        checkDate ? fmtDate(checkDate) : "",
        r.calc.manualBal,
        r.calc.sistemBal,
        r.calc.variance,
        r.calc.firstDiv ? fmtDate(r.calc.firstDiv) : "",
        r.status === "ok" ? "OK" : r.status === "lebih" ? "LEBIH" : r.status === "kurang" ? "KURANG" : "TIDAK DIKENALI",
      ])
    })
    const ws3 = xlsxUtils.aoa_to_sheet(aoa3)
    ws3["!cols"] = [
      { wch: 5 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
    ]
    xlsxUtils.book_append_sheet(wb, ws3, "ringkasan")

    xlsxWriteFile(wb, `cek_variance${checkDate ? `_${checkDate}` : ""}.xlsx`)
  }

  const statusBadge = (r: RowResult) => {
    if (r.status === "unknown")
      return (
        <Badge variant="outline" className="text-[10px] gap-1">
          <CircleAlert className="h-3 w-3" /> Tidak Dikenali
        </Badge>
      )
    if (r.status === "ok")
      return (
        <Badge className="text-[10px] gap-1 bg-emerald-600">
          <CheckCircle2 className="h-3 w-3" /> OK
        </Badge>
      )
    if (r.status === "lebih")
      return (
        <Badge className="text-[10px] gap-1 bg-sky-600">
          <TrendingUp className="h-3 w-3" /> Lebih
        </Badge>
      )
    return (
      <Badge className="text-[10px] gap-1 bg-rose-600">
        <TrendingDown className="h-3 w-3" /> Kurang
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Scale}
        title="Cek Variance"
        description="Bandingkan arus & saldo manual (file opname) vs sistem, per tanggal sesuai rentang file"
      />

      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleUpload} />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Upload File Opname
            </Button>
            {fileName && <span className="text-sm text-muted-foreground truncate">{fileName}</span>}
            {rows.length > 0 && (
              <Button variant="outline" onClick={exportExcel} className="gap-2 ml-auto">
                <FileDown className="h-4 w-4" /> Export Hasil
              </Button>
            )}
          </div>

          {dateGroups.length > 0 && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5 w-44">
                <Label className="text-xs">Tanggal ringkasan</Label>
                <Select value={checkDate} onValueChange={setCheckDate}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dateGroups.map((g) => (
                      <SelectItem key={g.date} value={g.date}>
                        {fmtDate(g.date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground pb-2">
                Rentang cek:{" "}
                {dateGroups.length > 0
                  ? `${fmtDate(dateGroups[0].date)} – ${fmtDate(dateGroups[dateGroups.length - 1].date)}`
                  : "-"}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Format file = export dari halaman Rekap Mutasi. Isi kolom <b>Balance</b> dengan hitungan fisik, atau isi kolom{" "}
            <b>IN/OUT</b> sesuai arus fisik. Sistem membandingkan per tanggal dan menampilkan selisih.
          </p>

          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> OK: {counts.ok}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <TrendingUp className="h-3 w-3 text-sky-600" /> Lebih: {counts.lebih}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <TrendingDown className="h-3 w-3 text-rose-600" /> Kurang: {counts.kurang}
              </Badge>
              {counts.unknown > 0 && (
                <Badge variant="outline" className="gap-1">
                  <CircleAlert className="h-3 w-3" /> Tidak dikenali: {counts.unknown}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 w-11"></th>
                    <th className="p-3 text-center font-medium">NO</th>
                    <th className="p-3 text-left font-medium">ITEM</th>
                    <th className="p-3 text-center font-medium">SATUAN</th>
                    <th className="p-3 text-center font-medium">SALDO MANUAL</th>
                    <th className="p-3 text-center font-medium">SALDO SISTEM</th>
                    <th className="p-3 text-center font-medium">VARIANCE</th>
                    <th className="p-3 text-center font-medium">TGL AWAL SELISIH</th>
                    <th className="p-3 text-center font-medium">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const open = expanded.has(idx) && !!r.bahan
                    return (
                      <Fragment key={idx}>
                        <tr className={"border-b hover:bg-muted/30 " + (open ? "bg-muted/30" : "")}>
                          <td className="p-1 text-center">
                            {r.bahan && (
                              <button
                                onClick={() => toggle(idx)}
                                className="h-11 w-11 inline-flex items-center justify-center rounded-md hover:bg-muted"
                                aria-label="Detail per tanggal"
                              >
                                <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center text-muted-foreground">{idx + 1}</td>
                          <td className="p-3 font-medium">
                            <span className="mr-2">{r.bahan?.nama ?? r.fileRow.nama}</span>
                            {r.bahan && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {r.bahan.division === "kitchen" ? "Kitchen" : "Bar"}
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-center text-muted-foreground">{r.bahan?.satuan ?? "-"}</td>
                          <td className="p-3 text-center tabular-nums">{fmt(r.calc.manualBal)}</td>
                          <td className="p-3 text-center tabular-nums">{fmt(r.calc.sistemBal)}</td>
                          <td
                            className={
                              "p-3 text-center font-semibold tabular-nums " +
                              (r.calc.variance === 0
                                ? "text-emerald-600"
                                : r.calc.variance > 0
                                  ? "text-sky-600"
                                  : "text-rose-600")
                            }
                          >
                            {r.calc.variance > 0 ? `+${fmt(r.calc.variance)}` : fmt(r.calc.variance)}
                          </td>
                          <td className="p-3 text-center text-xs">{r.calc.firstDiv ? fmtDate(r.calc.firstDiv) : "-"}</td>
                          <td className="p-3 text-center">{statusBadge(r)}</td>
                        </tr>
                        {open && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={9} className="p-4">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="p-2 text-left" rowSpan={2}>Tanggal</th>
                                      <th className="p-2 text-center border-l" colSpan={2}>IN</th>
                                      <th className="p-2 text-center border-l" colSpan={2}>OUT</th>
                                      <th className="p-2 text-center border-l text-sky-600" colSpan={3}>Selisih</th>
                                      <th className="p-2 text-center border-l" colSpan={2}>Balance</th>
                                      <th className="p-2 text-right border-l" rowSpan={2}>Variance</th>
                                    </tr>
                                    <tr className="text-muted-foreground">
                                      <th className="p-2 text-right border-l">Sistem</th>
                                      <th className="p-2 text-right">Manual</th>
                                      <th className="p-2 text-right border-l">Sistem</th>
                                      <th className="p-2 text-right">Manual</th>
                                      <th className="p-2 text-right border-l">IN</th>
                                      <th className="p-2 text-right">OUT</th>
                                      <th className="p-2 text-right">STOK</th>
                                      <th className="p-2 text-right border-l">Sistem</th>
                                      <th className="p-2 text-right">Manual</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.calc.tl.map((t) => {
                                      const inDiff = t.sIn !== t.mIn
                                      const outDiff = t.sOut !== t.mOut
                                      const balDiff = t.varBal !== 0
                                      const sInDiff = t.mIn - t.sIn !== 0
                                      const sOutDiff = t.mOut - t.sOut !== 0
                                      const sStokDiff = t.varHari !== 0
                                      return (
                                        <tr key={t.date} className={t.isCount || balDiff ? "font-medium" : ""}>
                                          <td className="p-2 whitespace-nowrap">
                                            {fmtDate(t.date)}
                                            {t.isCount && (
                                              <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-violet-600">fisik</Badge>
                                            )}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums border-l " + (inDiff ? "text-rose-600 font-semibold" : "")}>
                                            {t.sIn > 0 ? fmt(t.sIn) : "-"}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums " + (inDiff ? "text-rose-600 font-semibold" : "")}>
                                            {t.mIn > 0 ? fmt(t.mIn) : "-"}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums border-l " + (outDiff ? "text-rose-600 font-semibold" : "")}>
                                            {t.sOut > 0 ? fmt(t.sOut) : "-"}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums " + (outDiff ? "text-rose-600 font-semibold" : "")}>
                                            {t.mOut > 0 ? fmt(t.mOut) : "-"}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums border-l " + (sInDiff ? "text-rose-600 font-semibold" : "")}>
                                            {t.mIn - t.sIn !== 0 ? (t.mIn - t.sIn > 0 ? `+${fmt(t.mIn - t.sIn)}` : fmt(t.mIn - t.sIn)) : "-"}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums " + (sOutDiff ? "text-rose-600 font-semibold" : "")}>
                                            {t.mOut - t.sOut !== 0 ? (t.mOut - t.sOut > 0 ? `+${fmt(t.mOut - t.sOut)}` : fmt(t.mOut - t.sOut)) : "-"}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums " + (sStokDiff ? "text-rose-600 font-semibold" : "")}>
                                            {t.varHari !== 0 ? (t.varHari > 0 ? `+${fmt(t.varHari)}` : fmt(t.varHari)) : "-"}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums border-l " + (balDiff ? "text-rose-600 font-semibold" : "")}>
                                            {fmt(t.sistemBal)}
                                          </td>
                                          <td className={"p-2 text-right tabular-nums " + (balDiff ? "text-rose-600 font-semibold" : "")}>
                                            {fmt(t.manualBal)}
                                          </td>
                                          <td
                                            className={
                                              "p-2 text-right tabular-nums border-l font-semibold " +
                                              (balDiff ? "text-rose-600" : "text-emerald-600")
                                            }
                                          >
                                            {t.varBal > 0 ? `+${fmt(t.varBal)}` : fmt(t.varBal)}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                <b>Sistem</b> = hitungan dari transaksi posted di database. <b>Manual</b> = angka di file opname (IN/OUT arus fisik, atau Balance = hitungan fisik). Merah = beda.
                              </p>
                              {r.calc.firstDiv && (
                                <div className="mt-3 text-xs space-y-1">
                                  <p className="font-medium">Transaksi sistem pada {fmtDate(r.calc.firstDiv)}:</p>
                                  {(r.events.get(r.calc.firstDiv) ?? []).length === 0 ? (
                                    <p className="text-muted-foreground">
                                      Tidak ada transaksi tercatat pada tanggal ini — selisih mungkin dari transaksi yang tidak tercatat.
                                    </p>
                                  ) : (
                                    <ul className="list-disc list-inside text-muted-foreground">
                                      {(r.events.get(r.calc.firstDiv) ?? []).map((e, i) => (
                                        <li key={i}>
                                          {e.jenis} {fmt(e.qty)} ({e.sumber}
                                          {e.alasan_out ? `, ${e.alasan_out}` : ""})
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {(() => {
                                    const target = Math.abs(r.calc.tl.find((t) => t.date === r.calc.firstDiv)?.varBal ?? 0)
                                    const cands: (Ev & { date: string })[] = []
                                    r.events.forEach((arr, d) => {
                                      if (d > r.calc.firstDiv!) return
                                      arr.forEach((e) => {
                                        if (Math.abs(e.qty - target) < 0.001) cands.push({ ...e, date: d })
                                      })
                                    })
                                    if (!cands.length || target === 0) return null
                                    return (
                                      <p className="text-muted-foreground">
                                        <span className="font-medium text-foreground">Kandidat penyebab</span> (qty sama dengan selisih{" "}
                                        {fmt(target)}):{" "}
                                        {cands
                                          .slice(0, 6)
                                          .map((e) => `${e.jenis} ${fmt(e.qty)} @ ${fmtDate(e.date)} (${e.sumber})`)
                                          .join("; ")}
                                      </p>
                                    )
                                  })()}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
