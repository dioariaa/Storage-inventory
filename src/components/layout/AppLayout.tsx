import { useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { Menu, LogOut } from "lucide-react"
import { Sidebar } from "./Sidebar"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/authStore"

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const { signOut } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    navigate("/login")
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="lg:hidden flex items-center gap-2 h-14 px-3 bg-white border-b border-border sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 -ml-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu navigasi"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <img src="/logo-square.jpg" alt="Logo Berlaris" className="h-7 w-7 rounded object-contain shrink-0" />
          <span className="text-sm font-bold text-primary truncate flex-1">Inventori Berlaris</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground hover:text-destructive"
            onClick={handleSignOut}
            aria-label="Keluar"
          >
            <LogOut className="h-5 w-5" />
          </Button>
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
