// Authentication store & utilities for APAAR-Sync
import { useSyncExternalStore } from 'react'
import { setIdentity, type Role } from './roles'

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: Role
  institution_id?: string | null
  institution_name?: string | null
  token: string
}

const AUTH_STORAGE_KEY = 'apaar_auth_user'

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

let currentUser: AuthUser | null = readStoredUser()
const authListeners = new Set<() => void>()

function notifyAuth() {
  authListeners.forEach((l) => l())
}

export function getAuthUser(): AuthUser | null {
  return currentUser
}

export function setAuthUser(user: AuthUser | null): void {
  currentUser = user
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
      // Synchronize role and institutionId with roles.ts
      setIdentity({
        role: user.role,
        institutionId: user.institution_id || undefined,
      })
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch {
    // localStorage might be unavailable
  }
  notifyAuth()
}

export function clearAuthUser(): void {
  setAuthUser(null)
}

export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(
    (listener) => {
      authListeners.add(listener)
      return () => authListeners.delete(listener)
    },
    getAuthUser,
    () => null
  )
}

export function isAuthenticated(): boolean {
  return currentUser !== null && Boolean(currentUser.token)
}
