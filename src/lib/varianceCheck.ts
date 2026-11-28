import * as XLSX from "xlsx-js-style";

const DATE_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EPS = 0.0001;

export type OpnameFormat = "rekap_mutasi" | "opname_bar";

export interface DateGroup {
  date: string; // yyyy-mm-dd
  saCol: number; // -1 jika tidak ada kolom S-A
  inCol: number;
  outCol: number;
  balCol: number;
}

export interface DateCell {
  date: string;
  mSa?: number;
  hasSa: boolean;
  mIn: number;
  mOut: number;
  mBal: number;
  hasBal: boolean;
  chain: number; // saldo running dari arus file tanpa anchor fisik
}

export interface FileRow {
  nama: string;
  stoc: number;
  cells: DateCell[];
}

export interface ParseResult {
  format: OpnameFormat | null;
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

function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function toISO(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 36526 && raw <= 73050) {
    // Excel serial date (epoch 1899-12-30)
    const utcMs = Math.round((raw - 25569) * 86400 * 1000);
    const dt = new Date(utcMs);
    const y = dt.getUTCFullYear();
    const mon = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    if (!isValidCalendarDate(y, mon, d)) return null;
    return `${y}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  const isoM = s.match(ISO_RE);
  if (isoM) {
    const y = Number(isoM[1]);
    const mon = Number(isoM[2]);
    const d = Number(isoM[3]);
    if (!isValidCalendarDate(y, mon, d)) return null;
    return s;
  }
  const m = s.match(DATE_RE);
  if (!m) return null;
  const d = Number(m[1]);
  const mon = Number(m[2]);
  const rawYear = Number(m[3]);
  const y = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (!isValidCalendarDate(y, mon, d)) return null;
  return `${y}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type ColKind = "sa" | "in" | "out" | "bal" | null;

function classifySubHeader(v: string): ColKind {
  if (!v) return null;
  if (v === "S-A" || v === "SA" || v === "S.A" || v === "STOK AWAL" || v === "SALDO AWAL") return "sa";
  if (v === "IN" || v.startsWith("IN ") || v === "MASUK") return "in";
  if (v === "OUT" || v.startsWith("OUT ") || v === "KELUAR") return "out";
  if (v === "BLC" || v.startsWith("BAL") || v === "SALDO" || v === "STOK") return "bal";
  return null;
}

export function parseOpnameRows(rows: unknown[][]): ParseResult {
  const result: FileRow[] = [];

  if (!rows || rows.length < 3) {
    return {
      format: null,
      groups: [],
      rows: result,
      error: "File terlalu pendek. Minimal ada 2 baris header dan 1 baris data.",
    };
  }

  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim().toUpperCase());

  // 1. Cari baris sub-header (baris yang memuat IN + OUT + Balance/BLC, dan opsional S-A)
  let subHeaderIdx = -1;
  const maxScan = Math.min(12, rows.length);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] ?? [];
    let hasIn = false;
    let hasOut = false;
    let hasBal = false;
    for (let c = 0; c < row.length; c++) {
      const k = classifySubHeader(str(row[c]));
      if (k === "in") hasIn = true;
      else if (k === "out") hasOut = true;
      else if (k === "bal") hasBal = true;
    }
    if (hasIn && hasOut && hasBal) {
      subHeaderIdx = r;
      break;
    }
  }

  if (subHeaderIdx < 1) {
    return {
      format: null,
      groups: [],
      rows: result,
      error: "Header kolom IN / OUT / Balance (atau S-A / IN / OUT / BLC) tidak ditemukan.",
    };
  }

  const dateRowIdx = subHeaderIdx - 1;
  const dateRow: unknown[] = rows[dateRowIdx] ?? [];
  const subRow: unknown[] = rows[subHeaderIdx] ?? [];

  // 2. Cari kolom nama barang & kolom STOC global (jika ada)
  let itemCol = -1;
  let stocCol = -1;

  for (let r = 0; r <= dateRowIdx; r++) {
    const row = rows[r] ?? [];
    row.forEach((h, i) => {
      const v = str(h);
      if (itemCol < 0 && (v.includes("ITEM") || v.includes("NAMA BARANG") || v === "NAMA")) itemCol = i;
      if (stocCol < 0 && (v === "STOC" || v.includes("SALDO AWAL") || v === "STOK" || v === "OPENING")) stocCol = i;
    });
  }
  // Fallback: jika baris sub-header memakai kolom 0 sebagai nama kategori (BEANS, SATUAN PRT, S-A, ...)
  if (itemCol < 0 && subRow.some((h) => str(h).includes("SATUAN"))) {
    itemCol = 0;
  }

  if (itemCol < 0) {
    return {
      format: null,
      groups: [],
      rows: result,
      error: "Kolom ITEM (PORSI) atau NAMA BARANG tidak ditemukan.",
    };
  }

  // 3. Segmentasikan blok kolom per tanggal dari baris sub-header
  interface RawBlock {
    startCol: number;
    endCol: number;
    saCol: number;
    inCol: number;
    outCol: number;
    balCol: number;
  }

  const blocks: RawBlock[] = [];
  let cur: RawBlock | null = null;

  for (let col = 0; col < subRow.length; col++) {
    const kind = classifySubHeader(str(subRow[col]));
    if (!kind) continue;

    const startsNewBlock =
      !cur ||
      (kind === "sa" && (cur.saCol >= 0 || cur.inCol >= 0 || cur.outCol >= 0 || cur.balCol >= 0)) ||
      (kind === "in" && cur.inCol >= 0) ||
      (kind === "out" && cur.outCol >= 0) ||
      (kind === "bal" && cur.balCol >= 0);

    if (startsNewBlock) {
      if (cur) blocks.push(cur);
      cur = { startCol: col, endCol: col, saCol: -1, inCol: -1, outCol: -1, balCol: -1 };
    }

    cur!.endCol = col;
    if (kind === "sa") cur!.saCol = col;
    else if (kind === "in") cur!.inCol = col;
    else if (kind === "out") cur!.outCol = col;
    else if (kind === "bal") cur!.balCol = col;
  }
  if (cur) blocks.push(cur);

  const completeBlocks = blocks.filter((b) => b.inCol >= 0 && b.outCol >= 0 && b.balCol >= 0);
  const isBarFormat = completeBlocks.some((b) => b.saCol >= 0);

  // Pasangkan tiap blok dengan tanggal di baris dateRow (hanya dalam rentang blok tersebut agar blok kosong tidak menimpa blok sebelumnya)
  const validGroups: DateGroup[] = [];
  const seenDates = new Set<string>();

  for (const b of completeBlocks) {
    let foundDate: string | null = null;
    for (let c = b.startCol; c <= b.endCol; c++) {
      const iso = toISO(dateRow[c]);
      if (iso) {
        foundDate = iso;
        break;
      }
    }
    if (!foundDate || seenDates.has(foundDate)) continue;
    seenDates.add(foundDate);
    validGroups.push({
      date: foundDate,
      saCol: b.saCol,
      inCol: b.inCol,
      outCol: b.outCol,
      balCol: b.balCol,
    });
  }

  validGroups.sort((a, b) => a.date.localeCompare(b.date));

  if (validGroups.length === 0) {
    return {
      format: isBarFormat ? "opname_bar" : null,
      groups: [],
      rows: result,
      error: isBarFormat
        ? "Tanggal pada baris TGL belum diisi. Isi tanggal (contoh: 28/11/2026) di baris TGL pada setiap blok S-A / IN / OUT / BLC."
        : "Grup tanggal tidak ditemukan. Pastikan format sesuai export Rekap Mutasi atau Form Opname Bar.",
    };
  }

  const hasValue = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== "";

  const num = (v: unknown): number => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    const raw = String(v).trim();
    if (!raw) return 0;
    let normalized = raw;
    if (raw.includes(",") && raw.includes(".")) {
      normalized =
        raw.lastIndexOf(",") > raw.lastIndexOf(".")
          ? raw.replace(/\./g, "").replace(",", ".")
          : raw.replace(/,/g, "");
    } else if (raw.includes(",")) {
      const parts = raw.split(",");
      normalized =
        parts.length === 2 && parts[1].length !== 3
          ? raw.replace(",", ".")
          : raw.replace(/,/g, "");
    }
    const n = Number(normalized);
    return isNaN(n) ? 0 : n;
  };

  const firstGroup = validGroups[0];
  const isRepeatedSubHeader = (row: unknown[]): boolean => {
    const inVal = classifySubHeader(str(row[firstGroup.inCol]));
    const outVal = classifySubHeader(str(row[firstGroup.outCol]));
    const balVal = classifySubHeader(str(row[firstGroup.balCol]));
    if (inVal === "in" && outVal === "out" && balVal === "bal") return true;
    const nextColStr = str(row[itemCol + 1]);
    if (nextColStr === "SATUAN PRT" || nextColStr === "SATUAN") return true;
    return false;
  };

  for (let r = subHeaderIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    if (isRepeatedSubHeader(row)) continue;

    const nama = String(row[itemCol] ?? "").trim();
    if (!nama) continue;

    let stoc = 0;
    if (stocCol >= 0) {
      stoc = num(row[stocCol]);
    } else {
      const firstSaGroup = validGroups.find((g) => g.saCol >= 0 && hasValue(row[g.saCol]));
      stoc = firstSaGroup ? num(row[firstSaGroup.saCol]) : 0;
    }

    const cells: DateCell[] = [];
    let chain = stoc;
    for (const g of validGroups) {
      const hasSa = g.saCol >= 0 && hasValue(row[g.saCol]);
      const mSa = hasSa ? num(row[g.saCol]) : undefined;
      const mIn = num(row[g.inCol]);
      const mOut = num(row[g.outCol]);
      const hasBal = hasValue(row[g.balCol]);
      const mBal = hasBal ? num(row[g.balCol]) : 0;
      chain += mIn - mOut;
      cells.push({ date: g.date, mSa, hasSa, mIn, mOut, mBal, hasBal, chain });
    }

    result.push({ nama, stoc, cells });
  }

  return {
    format: isBarFormat ? "opname_bar" : "rekap_mutasi",
    groups: validGroups,
    rows: result,
    error: null,
  };
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
        resolve({ format: null, groups: [], rows: [], error: (err as Error).message });
      }
    };
    reader.onerror = () => resolve({ format: null, groups: [], rows: [], error: "Gagal membaca file." });
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

    // kolom Balance/BLC dianggap hitung fisik jika terisi, arus file belum diedit sampai tanggal ini,
    // dan nilai Balance menyimpang dari rantai arus file
    const isCount =
      c.hasBal && !flowEditedUpTo.get(d) && Math.abs(c.mBal - c.chain) > EPS;

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

// ---- Smart Bahan Name Matcher (mendukung suffix kemasan @1000GR/@750ML & variasi ejaan) ----

export function canonicalizeBahanName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/@\s*[\d.,]+\s*[a-z]*/g, " ") // hapus kemasan: @1000GR, @750 ML, @2,5GR, @1KG, @100PCS
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bv\s+60\b/g, "v60")
    .replace(/\bblack\s+tea\b/g, "blacktea")
    .replace(/\bblue\s+citrus\b/g, "bluecitrus")
    .replace(/\bvan\s+houten\b/g, "vanhouten")
    .replace(/\bfresh\s+milk\b/g, "freshmilk")
    .replace(/\banis\s+star\b/g, "anistar")
    .replace(/\basem\s+jawa\b/g, "tamarind")
    .replace(/\basam\s+jawa\b/g, "tamarind")
    .replace(/\btamaribd\b/g, "tamarind")
    .replace(/\bskm\b/g, "susu kental manis")
    .replace(/\bsyrup\b/g, "sirup")
    .replace(/\bwhiped\b|\bwhiping\b|\bwhipped\b|\bwhipping\b/g, "whipping")
    .replace(/\bkapolaga\b/g, "kapulaga")
    .replace(/\bschweppss?\b|\bschweppes\b/g, "schweppes")
    .replace(/\bbotanical\s+water\b/g, "soda water")
    .replace(/\bpapper\b|\bpepper\b/g, "paper")
    .replace(/\btopping\b/g, "sauce")
    .replace(/\bbutterschotch\b/g, "butterscotch")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_TOKENS = new Set(["uht", "cair", "kering", "buah", "putih", "kaleng", "lump", "sugar"]);

export function findBahanMatch<T extends { nama: string }>(rawName: string, list: T[]): T | undefined {
  const cn = canonicalizeBahanName(rawName);
  if (!cn) return undefined;

  // 1. Exact canonical match
  const exact = list.find((b) => canonicalizeBahanName(b.nama) === cn);
  if (exact) return exact;

  const toTokens = (s: string) =>
    canonicalizeBahanName(s)
      .split(" ")
      .filter((t) => t.length > 0);

  const aTokens = toTokens(rawName);
  const aSet = new Set(aTokens);
  const aSig = new Set(aTokens.filter((t) => !STOP_TOKENS.has(t)));

  // 2. Exact token-set match (mengabaikan urutan kata, mis. "POWDER DENALI AVOCADO" == "DENALI POWDER AVOCADO")
  const sameSet = list.find((b) => {
    const bSet = new Set(toTokens(b.nama));
    if (bSet.size !== aSet.size) return false;
    return [...aSet].every((t) => bSet.has(t));
  });
  if (sameSet) return sameSet;

  // 3. Best token F1 / significant-token score
  let best: T | undefined;
  let bestScore = 0;

  for (const b of list) {
    const bTokens = toTokens(b.nama);
    if (bTokens.length === 0) continue;
    const bSet = new Set(bTokens);
    const bSig = new Set(bTokens.filter((t) => !STOP_TOKENS.has(t)));

    let inter = 0;
    for (const t of aSet) if (bSet.has(t)) inter++;

    let sigInter = 0;
    for (const t of aSig) if (bSig.has(t)) sigInter++;

    if (inter === 0) continue;

    // Dice/F1 coefficient lebih aman dari overlap/min (mencegah "AIR" cocok sembarangan)
    const f1All = (2 * inter) / (aSet.size + bSet.size);
    const f1Sig = aSig.size > 0 && bSig.size > 0 ? (2 * sigInter) / (aSig.size + bSig.size) : 0;
    const minLen = Math.min(aSig.size || aSet.size, bSig.size || bSet.size);
    const containment = minLen > 0 ? sigInter / minLen : 0;

    // Bonus bila seluruh token signifikan dari yang lebih pendek ada di lawannya (mis. "CHAMOMILE TEA" -> "LIPTON CHAMOMILE TEA")
    let score = Math.max(f1All, f1Sig);
    if (containment === 1 && (sigInter >= 2 || (sigInter === 1 && Math.abs((aSig.size || 1) - (bSig.size || 1)) <= 1))) {
      score = Math.max(score, 0.75 + 0.2 * f1Sig);
    }

    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }

  return bestScore >= 0.65 ? best : undefined;
}
