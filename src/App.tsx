import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "@/providers/AuthProvider"
import { PrivateRoute, AdminRoute } from "@/components/auth/PrivateRoute"
import { AppLayout } from "@/components/layout/AppLayout"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { BarangMasukPage } from "@/pages/BarangMasukPage"
import { BarangKeluarPage } from "@/pages/BarangKeluarPage"
import { BahanBakuPage } from "@/pages/BahanBakuPage"
import { MenuPage } from "@/pages/MenuPage"
import { RecipePage } from "@/pages/RecipePage"
import { RiwayatPage } from "@/pages/RiwayatPage"
import { RekapMutasiPage } from "@/pages/RekapMutasiPage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

export default function App() {
  return (
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
                <Route path="riwayat" element={<RiwayatPage />} />
                <Route path="rekap-mutasi" element={<RekapMutasiPage />} />

                {/* Admin-only routes */}
                <Route element={<AdminRoute />}>
                  <Route path="bahan-baku" element={<BahanBakuPage />} />
                  <Route path="menu" element={<MenuPage />} />
                  <Route path="recipe" element={<RecipePage />} />
                </Route>
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
