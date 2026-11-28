import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/queryClient"
import { AuthProvider } from "@/providers/AuthProvider"
import { ErrorBoundary } from "@/components/common/ErrorBoundary"
import { PrivateRoute, AdminRoute } from "@/components/auth/PrivateRoute"
import { AppLayout } from "@/components/layout/AppLayout"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { BarangMasukPage } from "@/pages/BarangMasukPage"
import { BarangKeluarPage } from "@/pages/BarangKeluarPage"
import { ProduksiPage } from "@/pages/ProduksiPage"
import { BomPage } from "@/pages/BomPage"
import { BahanBakuPage } from "@/pages/BahanBakuPage"
import { MenuPage } from "@/pages/MenuPage"
import { RecipePage } from "@/pages/RecipePage"
import { RiwayatPage } from "@/pages/RiwayatPage"
import { RekapMutasiPage } from "@/pages/RekapMutasiPage"
import { VariancePage } from "@/pages/VariancePage"

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected */}
              <Route element={<PrivateRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="barang-masuk" element={<BarangMasukPage />} />
                  <Route path="barang-keluar" element={<BarangKeluarPage />} />
                  <Route path="produksi" element={<ProduksiPage />} />
                  <Route path="riwayat" element={<RiwayatPage />} />

                  {/* Admin-only routes */}
                  <Route element={<AdminRoute />}>
                    <Route path="bahan-baku" element={<BahanBakuPage />} />
                    <Route path="bom" element={<BomPage />} />
                    <Route path="menu" element={<MenuPage />} />
                    <Route path="recipe" element={<RecipePage />} />
                    <Route path="rekap-mutasi" element={<RekapMutasiPage />} />
                    <Route path="variance" element={<VariancePage />} />
                  </Route>
                </Route>
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
