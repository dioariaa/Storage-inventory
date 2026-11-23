import { Navigate, Outlet } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"

export function PrivateRoute() {
  const { session, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Memuat...</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { session, profile, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Memuat...</div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (profile?.role !== "admin") return <Navigate to="/" replace />

  return <Outlet />
}
