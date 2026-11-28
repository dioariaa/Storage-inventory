import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, isValid, parseISO, subDays } from "date-fns"
import { id as localeId } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  if (!date) return "-"
  const d = typeof date === "string" ? parseISO(date) : date
  if (!isValid(d)) return "-"
  return format(d, "dd/MM/yyyy", { locale: localeId })
}

export function formatDateTime(date: string | Date): string {
  if (!date) return "-"
  const d = typeof date === "string" ? parseISO(date) : date
  if (!isValid(d)) return "-"
  return format(d, "dd/MM/yyyy HH:mm", { locale: localeId })
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-"
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-"
  return "Rp" + new Intl.NumberFormat("id-ID").format(value)
}

export function today(): string {
  return format(new Date(), "yyyy-MM-dd")
}

export function daysAgo(days: number): string {
  return format(subDays(new Date(), days), "yyyy-MM-dd")
}

export function getErrorMessage(err: unknown): string {
  if (!err) return "Terjadi kesalahan."
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message
  if (typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message
  }
  return String(err)
}
