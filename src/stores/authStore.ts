import { create } from "zustand"
import { persist } from "zustand/middleware"
import { supabase } from "@/lib/supabase"
import { queryClient } from "@/lib/queryClient"
import type { Profile } from "@/types/database"
import type { Session, User } from "@supabase/supabase-js"

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  fetchProfile: (userId: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName: string, role?: "admin" | "staff") => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      user: null,
      profile: null,
      loading: true,

      setSession: (session) => {
        set({ session, user: session?.user ?? null })
        if (session?.user) {
          get().fetchProfile(session.user.id)
        } else {
          set({ profile: null, loading: false })
        }
      },

      setProfile: (profile) => set({ profile }),

      fetchProfile: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single()
          if (!error && data) {
            set({ profile: data as Profile })
          }
        } catch (err) {
          console.error("Error fetching profile:", err)
        } finally {
          set({ loading: false })
        }
      },

      signIn: async (email, password) => {
        set({ loading: true })
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          set({ loading: false })
          return { error: error.message }
        }
        set({ session: data.session, user: data.user })
        if (data.user) {
          await get().fetchProfile(data.user.id)
        } else {
          set({ loading: false })
        }
        return { error: null }
      },

      signUp: async (email, password, fullName, role = "staff") => {
        set({ loading: true })
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role,
            },
          },
        })
        if (error) {
          set({ loading: false })
          return { error: error.message }
        }
        if (data.session) {
          set({ session: data.session, user: data.user })
          if (data.user) {
            await get().fetchProfile(data.user.id)
          }
        }
        set({ loading: false })
        return { error: null }
      },

      signOut: async () => {
        await supabase.auth.signOut()
        queryClient.clear()
        set({ session: null, user: null, profile: null, loading: false })
      },
    }),
    {
      name: "berlaris-auth",
      partialize: (state) => ({ profile: state.profile }),
    }
  )
)
