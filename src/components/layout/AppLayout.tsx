import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { Coffee, Menu } from "lucide-react"
import { Sidebar } from "./Sidebar"
import { Button } from "@/components/ui/button"

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Tutup drawer saat pindah halaman
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="lg:hidden flex items-center gap-3 h-14 px-3 bg-white border-b border-border sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 -ml-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu navigasi"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <Coffee className="h-5 w-5 text-primary shrink-0" />
          <span className="text-sm font-bold text-primary truncate">Inventori Berlaris</span>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-3 sm:p-4 md:p-6 w-full pb-20 lg:pb-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
