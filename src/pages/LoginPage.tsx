import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Coffee } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, signUp } = useAuthStore()
  const [isRegister, setIsRegister] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    if (isRegister) {
      if (!fullName.trim()) {
        setError("Nama lengkap wajib diisi.")
        setLoading(false)
        return
      }
      const { error: signUpError } = await signUp(email, password, fullName, "staff")
      if (signUpError) {
        setError(signUpError)
      } else {
        // Coba sign in langsung jika auto-confirm aktif
        const { error: signInError } = await signIn(email, password)
        if (signInError) {
          setSuccessMsg("Pendaftaran berhasil! Silakan masuk dengan akun Anda.")
          setIsRegister(false)
        } else {
          navigate("/")
        }
      }
    } else {
      const { error: signInError } = await signIn(email, password)
      if (signInError) {
        setError(signInError)
      } else {
        navigate("/")
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="bg-primary/10 p-3 rounded-full">
              <Coffee className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Berlaris Kopi & Resto</CardTitle>
          <CardDescription>
            {isRegister ? "Daftar Akun Pengguna Baru" : "Sistem Inventory Divisi Bar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-100 text-green-800 text-sm p-3 rounded-md">
                {successMsg}
              </div>
            )}

            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nama Lengkap</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Contoh: Barista Budi"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nama@berlaris.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? isRegister
                  ? "Mendaftar..."
                  : "Masuk..."
                : isRegister
                ? "Daftar Akun"
                : "Masuk"}
            </Button>

            <div className="text-center pt-2">
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  setIsRegister(!isRegister)
                  setError(null)
                  setSuccessMsg(null)
                }}
              >
                {isRegister
                  ? "Sudah punya akun? Masuk di sini"
                  : "Belum punya akun? Daftar akun baru di sini"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
