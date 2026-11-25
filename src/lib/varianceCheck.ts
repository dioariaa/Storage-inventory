import * as XLSX from "xlsx";

const DATE_RE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/;
const EPS = 0.0001;

export interface DateGroup {
  date: string; // yyyy-mm-dd
  inCol: number;
  outCol: number;
  balCol: number;
}

export interface DateCell {
  date: string;
  mIn: number;
  mOut: number;
  mBal: number;
  chain: number; // saldo running dari arus file tanpa anchor fisik
}

export interface FileRow {
  nama: string;
  stoc: number;
  cells: DateCell[];
}

export interface ParseResult {
  groups: DateGroup[];
  rows: FileRow[];
  error: string | null;
}

export interface SysFlow {
  in: number;
  out: number;
}

export interface SysItem {
  stokAwal: number;
  flows: Map<string, SysFlow>;
}

export interface TL {
  date: string;
  mIn: number;
  mOut: number;
  mBal: number;
  sIn: number;
  sOut: number;
  manualBal: number;
  sistemBal: number;
  varHari: number;
  varBal: number;
  isCount: boolean;
}

export interface VarianceCalc {
  tl: TL[];
  manualBal: number;
  sistemBal: number;
  variance: number;
  firstDiv: string | null;
  flowEdited: boolean;
}

export function toISO(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  const m = s.match(DATE_RE);
  if (!m) return null;
  const d = Number(m[1]).toString().padStart(2, "0");
  const mon = Number(m[2]).toString().padStart(2, "0");
  const y = m[3];
  if (Number(y) < 2000 || Number(y) > 2100) return null;
  return `${y}-${mon}-${d}`;
}

export function parseOpnameRows(rows: unknown[][]): ParseResult {
  const groups: DateGroup[] = [];
  const result: FileRow[] = [];

  if (!rows || rows.length < 3) {
    return { groups, rows: result, error: "File terlalu pendek. Minimal ada 2 baris header dan 1 baris data." };
  }

  const header1: unknown[] = rows[0];
  const header2: unknown[] = rows[1] || [];

  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim().toUpperCase());

  let itemCol = -1;
  let stocCol = -1;

  header1.forEach((h, i) => {
    const v = str(h);
    if (v.includes("ITEM")) itemCol = i;
    if (v === "STOC" || v.includes("SALDO AWAL") || v === "STOK" || v === "OPENING") stocCol = i;
  });

  if (itemCol < 0) {
    return { groups, rows: result, error: "Kolom ITEM (PORSI) tidak ditemukan." };
  }

  // pasangkan grup tanggal dari sub-header baris kedua
  // label tanggal di baris pertama; IN/OUT/Balance di baris kedua di bawahnya
  const dateAt = (col: number): string | null => {
    for (let i = col; i >= 0; i--) {
      const iso = toISO(header1[i]);
      if (iso) return iso;
    }
    return null;
  };

  header2.forEach((h, col) => {
    const v = str(h);
    if (!v || v === "NO" || v.includes("ITEM") || v === "STOC") return;
    const date = dateAt(col);
    if (!date) return;
    let g = groups.find((x) => x.date === date);
    if (!g) {
      g = { date, inCol: -1, outCol: -1, balCol: -1 };
      groups.push(g);
    }
    if (v.startsWith("IN") || v === "MASUK") g.inCol = col;
    else if (v.startsWith("OUT") || v === "KELUAR") g.outCol = col;
    else if (v.startsWith("BAL") || v === "SALDO" || v === "STOK") g.balCol = col;
  });

  // hanya terima grup yang lengkap ketiganya
  const validGroups = groups
    .filter((g) => g.inCol >= 0 && g.outCol >= 0 && g.balCol >= 0)
    .sort((a, b) => a.balCol - b.balCol);

  if (validGroups.length === 0) {
    return { groups, rows: result, error: "Grup tanggal tidak ditemukan. Pastikan file format export Rekap Mutasi." };
  }

  const num = (v: unknown): number => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    const n = Number(String(v).replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const nama = String(row[itemCol] ?? "").trim();
    if (!nama) continue;
    const stoc = stocCol >= 0 ? num(row[stocCol]) : 0;

    const cells: DateCell[] = [];
    let chain = stoc;
    for (const g of validGroups) {
      const mIn = num(row[g.inCol]);
      const mOut = num(row[g.outCol]);
      const mBal = num(row[g.balCol]);
      chain += mIn - mOut;
      cells.push({ date: g.date, mIn, mOut, mBal, chain });
    }

    result.push({ nama, stoc, cells });
  }

  return { groups: validGroups, rows: result, error: null };
}

export function readUploadFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
        resolve(parseOpnameRows(rows));
      } catch (err) {
        resolve({ groups: [], rows: [], error: (err as Error).message });
      }
    };
    reader.onerror = () => resolve({ groups: [], rows: [], error: "Gagal membaca file." });
    reader.readAsArrayBuffer(file);
  });
}

export function computeVariance(
  fr: FileRow,
  dates: string[],
  sys: SysItem | undefined,
  atDate?: string
): VarianceCalc {
  const cellMap = new Map(fr.cells.map((c) => [c.date, c]));
  const sysFlow = (d: string): SysFlow => sys?.flows.get(d) ?? { in: 0, out: 0 };

  // saldo awal sistem sebelum tanggal pertama range
  let opening = sys?.stokAwal ?? 0;
  if (sys) {
    sys.flows.forEach((f, d) => {
      if (d < dates[0]) opening += f.in - f.out;
    });
  }

  // deteksi apakah arus file sudah diedit (dibanding sistem), kumulatif per tanggal
  let diffUpTo = false;
  const flowEditedUpTo = new Map<string, boolean>();
  dates.forEach((d) => {
    const c = cellMap.get(d);
    const s = sysFlow(d);
    const diff =
      !!c &&
      (Math.abs(c.mIn - s.in) > EPS || Math.abs(c.mOut - s.out) > EPS);
    diffUpTo = diffUpTo || diff;
    flowEditedUpTo.set(d, diffUpTo);
  });

  const tl: TL[] = [];
  let manualBal = fr.stoc;
  let cumSys = 0;

  dates.forEach((d) => {
    const c = cellMap.get(d);
    if (!c) return;
    const s = sysFlow(d);
    const netM = c.mIn - c.mOut;
    const netS = s.in - s.out;

    // kolom Balance dianggap hitung fisik jika arus file belum diedit sampai tanggal ini
    // dan nilai Balance menyimpang dari rantai arus file
    const isCount =
      !flowEditedUpTo.get(d) && Math.abs(c.mBal - c.chain) > EPS;

    manualBal = isCount ? c.mBal : manualBal + netM;
    cumSys += netS;
    const sistemBal = opening + cumSys;

    tl.push({
      date: d,
      mIn: c.mIn,
      mOut: c.mOut,
      mBal: c.mBal,
      sIn: s.in,
      sOut: s.out,
      manualBal,
      sistemBal,
      varHari: netM - netS,
      varBal: manualBal - sistemBal,
      isCount,
    });
  });

  const last = tl[tl.length - 1];
  const target = tl.find((t) => t.date === atDate) ?? last;
  const firstDiv = tl.find((t) => Math.abs(t.varBal) > EPS)?.date ?? null;

  return {
    tl,
    manualBal: target?.manualBal ?? 0,
    sistemBal: target?.sistemBal ?? 0,
    variance: target?.varBal ?? 0,
    firstDiv,
    flowEdited: !!tl.find((t) => flowEditedUpTo.get(t.date)),
  };
}
