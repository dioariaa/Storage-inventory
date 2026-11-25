import { useQuery } from "@tanstack/react-query"
import { useState, useMemo, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/common/PageHeader"
import { Scale, Upload, FileDown, CheckCircle2, TrendingDown, TrendingUp, CircleAlert } from "lucide-react"
import { read as xlsxRead, utils as xlsxUtils, writeFile as xlsxWriteFile } from "xlsx"
import type { BahanBaku } from "@/types/database"

interface VarianceRow {
  nama: string
  bahan?: BahanBaku
  sistem: number | null
  manual: number
  variance: number | null
  status: "ok" | "lebih" | "kurang" | "unknown"
}

const normalize = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/-/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

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

// "dd/MM/yyyy" -> "yyyy-MM-dd"
const toISO = (s: string) => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

export function VariancePage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [opnameDate, setOpnameDate] = useState("")
  const [parsed, setParsed] = useState<{ nama: string; manual: number }[]>([])

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
        .select("bahan_baku_id, qty, transaksi!inner(tgl_transaksi, jenis, is_posted)")
        .eq("transaksi.is_posted", true)
      if (error) throw error
      return data as any[]
    },
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const wb = xlsxRead(buf, { type: "array" })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: "" })

    const row0 = rows[0] ?? []
    const row1 = rows[1] ?? []

    const itemCol = row0.findIndex((c) => String(c).toUpperCase().includes("ITEM"))
    if (itemCol < 0) {
      alert("Kolom ITEM tidak ditemukan. Pastikan file format export Rekap Mutasi.")
      return
    }

    const balanceCols = row1
      .map((c, i) => (String(c).toLowerCase() === "balance" ? i : -1))
      .filter((i) => i >= 0)
    if (!balanceCols.length) {
      alert("Kolom Balance tidak ditemukan. Pastikan file format export Rekap Mutasi.")
      return
    }
    const lastBalCol = balanceCols[balanceCols.length - 1]

    // Tanggal opname = label tanggal grup terakhir di row0 (sel terisi pada/sebelum kolom balance)
    let dateCol = -1
    for (let i = lastBalCol; i >= 0; i--) {
      if (typeof row0[i] === "string" && /\d{1,2}\/\d{1,2}\/\d{4}/.test(row0[i])) {
        dateCol = i
        break
      }
    }
    const iso = dateCol >= 0 ? toISO(row0[dateCol]) : null
    if (iso) setOpnameDate(iso)

    const out: { nama: string; manual: number }[] = []
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r] ?? []
      const nama = String(row[itemCol] ?? "").trim()
      if (!nama) continue
      const manual = Number(row[lastBalCol]) || 0
      out.push({ nama, manual })
    }
    setParsed(out)
  }

  const varianceRows: VarianceRow[] = useMemo(() => {
    if (!parsed.length || !bahanList || !details) return []
    // Saldo sistem per bahan s/d tanggal opname
    const saldo = new Map<string, number>()
    bahanList.forEach((b) => saldo.set(b.id, b.stok_awal ?? 0))
    details.forEach((d) => {
      if (!opnameDate || d.transaksi.tgl_transaksi > opnameDate) return
      const cur = saldo.get(d.bahan_baku_id)
      if (cur === undefined) return
      saldo.set(d.bahan_baku_id, cur + (d.transaksi.jenis === "IN" ? d.qty : -d.qty))
    })
    return parsed.map((p) => {
      const bahan = findBahan(p.nama, bahanList)
      if (!bahan) return { nama: p.nama, manual: p.manual, sistem: null, variance: null, status: "unknown" as const }
      const sistem = saldo.get(bahan.id) ?? 0
      const variance = p.manual - sistem
      return {
        nama: p.nama,
        bahan,
        sistem,
        manual: p.manual,
        variance,
        status: variance === 0 ? ("ok" as const) : variance > 0 ? ("lebih" as const) : ("kurang" as const),
      }
    })
  }, [parsed, bahanList, details, opnameDate])

  const counts = useMemo(() => {
    const c = { ok: 0, lebih: 0, kurang: 0, unknown: 0 }
    varianceRows.forEach((r) => c[r.status]++)
    return c
  }, [varianceRows])

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""))

  const exportExcel = () => {
    const aoa: (string | number)[][] = [["NO", "ITEM", "SATUAN", "SISTEM", "MANUAL", "VARIANCE", "STATUS"]]
    varianceRows.forEach((r, i) => {
      aoa.push([
        i + 1,
        r.bahan?.nama ?? r.nama,
        r.bahan?.satuan ?? "",
        r.sistem ?? "",
        r.manual,
        r.variance ?? "",
        r.status === "ok" ? "OK" : r.status === "lebih" ? "LEBIH" : r.status === "kurang" ? "KURANG" : "TIDAK DIKENALI",
      ])
    })
    const ws = xlsxUtils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }]
    const wb = xlsxUtils.book_new()
    xlsxUtils.book_append_sheet(wb, ws, "variance")
    xlsxWriteFile(wb, `cek_variance${opnameDate ? `_${opnameDate}` : ""}.xlsx`)
  }

  const statusBadge = (r: VarianceRow) => {
    if (r.status === "unknown")
      return <Badge variant="outline" className="text-[10px] gap-1"><CircleAlert className="h-3 w-3" /> Tidak Dikenali</Badge>
    if (r.status === "ok")
      return <Badge className="text-[10px] gap-1 bg-emerald-600"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
    if (r.status === "lebih")
      return <Badge className="text-[10px] gap-1 bg-sky-600"><TrendingUp className="h-3 w-3" /> Lebih</Badge>
    return <Badge className="text-[10px] gap-1 bg-rose-600"><TrendingDown className="h-3 w-3" /> Kurang</Badge>
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={Scale} title="Cek Variance" description="Bandingkan stok sistem dengan hasil hitung fisik (stok opname)" />

      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={handleUpload}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Upload File Opname
            </Button>
            {fileName && (
              <>
                <span className="text-sm text-muted-foreground truncate">{fileName}</span>
                {opnameDate && <Badge variant="outline" className="text-[10px]">Tgl opname: {opnameDate}</Badge>}
              </>
            )}
            {varianceRows.length > 0 && (
              <Button variant="outline" onClick={exportExcel} className="gap-2 ml-auto">
                <FileDown className="h-4 w-4" /> Export Hasil
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Format file = export dari halaman Rekap Mutasi. Isi kolom <b>Balance</b> pada grup tanggal terakhir dengan hasil hitung fisik, lalu upload.
          </p>
          {varianceRows.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> OK: {counts.ok}</Badge>
              <Badge variant="outline" className="gap-1"><TrendingUp className="h-3 w-3 text-sky-600" /> Lebih: {counts.lebih}</Badge>
              <Badge variant="outline" className="gap-1"><TrendingDown className="h-3 w-3 text-rose-600" /> Kurang: {counts.kurang}</Badge>
              <Badge variant="outline" className="gap-1"><CircleAlert className="h-3 w-3" /> Tidak dikenali: {counts.unknown}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {varianceRows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-center font-medium">NO</th>
                    <th className="p-3 text-left font-medium">ITEM</th>
                    <th className="p-3 text-center font-medium">SATUAN</th>
                    <th className="p-3 text-center font-medium">SISTEM</th>
                    <th className="p-3 text-center font-medium">MANUAL</th>
                    <th className="p-3 text-center font-medium">VARIANCE</th>
                    <th className="p-3 text-center font-medium">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceRows.map((r, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-center text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 font-medium">
                        <span className="mr-2">{r.bahan?.nama ?? r.nama}</span>
                        {r.bahan && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {r.bahan.division === "kitchen" ? "Kitchen" : "Bar"}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-center text-muted-foreground">{r.bahan?.satuan ?? "-"}</td>
                      <td className="p-3 text-center tabular-nums">{r.sistem ?? "-"}</td>
                      <td className="p-3 text-center tabular-nums">{fmt(r.manual)}</td>
                      <td
                        className={
                          "p-3 text-center font-semibold tabular-nums " +
                          (r.variance === null
                            ? ""
                            : r.variance === 0
                              ? "text-emerald-600"
                              : r.variance > 0
                                ? "text-sky-600"
                                : "text-rose-600")
                        }
                      >
                        {r.variance === null ? "-" : r.variance > 0 ? `+${fmt(r.variance)}` : fmt(r.variance)}
                      </td>
                      <td className="p-3 text-center">{statusBadge(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}