import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"
import { id as localeId } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  if (!date) return "-"
  const d = typeof date === "string" ? parseISO(date) : date
  return format(d, "dd/MM/yyyy", { locale: localeId })
}

export function formatDateTime(date: string | Date): string {
  if (!date) return "-"
  const d = typeof date === "string" ? parseISO(date) : date
  return format(d, "dd/MM/yyyy HH:mm", { locale: localeId })
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "-"
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
