import { NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  PackagePlus,
  PackageMinus,
  Boxes,
  UtensilsCrossed,
  BookOpen,
  History,
  LogOut,
  Coffee,
  Menu,
  Sparkles,
  X,
} from "lucide-react"
import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TambahMenuWizardModal } from "@/components/menu/TambahMenuWizardModal"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/barang-masuk", icon: PackagePlus, label: "Barang Masuk" },
  { to: "/barang-keluar", icon: PackageMinus, label: "Barang Keluar" },
  { to: "/bahan-baku", icon: Boxes, label: "Bahan Baku", adminOnly: true },
  { to: "/menu", icon: UtensilsCrossed, label: "Menu", adminOnly: true },
  { to: "/recipe", icon: BookOpen, label: "Recipe", adminOnly: true },
  { to: "/riwayat", icon: History, label: "Riwayat" },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open, onClose }: SidebarProps = {}) {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate("/login")
  }

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || profile?.role === "admin"
  )

  return (
    <>
      {/* Overlay mobile */}
      {open !== undefined && (
        <div
          aria-hidden="true"
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "flex flex-col h-screen bg-white border-r border-border z-50 transition-transform duration-300",
          "fixed top-0 left-0 w-64",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0 lg:z-auto",
          collapsed ? "lg:w-16" : "lg:w-56"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b">
          <Coffee className="h-6 w-6 text-primary shrink-0" />
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-primary leading-tight">Berlaris</p>
              <p className="text-xs text-muted-foreground leading-tight">Inventory Bar</p>
            </div>
          )}
          {open !== undefined && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden h-11 w-11"
              onClick={onClose}
              aria-label="Tutup menu navigasi"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0 h-7 w-7 hidden lg:flex"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Ciutkan sidebar"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Quick Action Wizard (Admin Only) */}
      {profile?.role === "admin" && (
        <div className="px-2 pb-3">
          <Button
            variant="default"
            size={collapsed ? "icon" : "sm"}
            className="w-full justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            onClick={() => setWizardOpen(true)}
            title="Tambah Menu & Resep Terpadu"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="text-xs font-semibold">+ Menu & Resep</span>}
          </Button>
        </div>
      )}

      {/* User info + logout */}
      <div className="px-3 py-4 border-t">
        {!collapsed && (
          <div className="mb-3 px-1">
            <p className="text-xs font-semibold truncate">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className="w-full text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2">Keluar</span>}
        </Button>
      </div>

        {/* Modal Wizard Menu & Resep */}
        <TambahMenuWizardModal open={wizardOpen} onOpenChange={setWizardOpen} />
      </aside>
    </>
  )
}
