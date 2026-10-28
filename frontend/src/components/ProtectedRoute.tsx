import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { type Role } from '../lib/roles'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: readonly Role[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const user = useAuthUser()
  const location = useLocation()

  if (!user || !user.token) {
    // Redirect unauthenticated users to /login and preserve destination
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // If user's role is not allowed, show unauthorized warning
    return (
      <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-bold text-red-950">Unauthorized Access</h1>
        <p className="mt-2 text-sm text-red-700">
          Your active role (<span className="font-semibold">{user.role}</span>) does not have permission to access this module.
        </p>
        <p className="mt-1 text-xs text-red-600">
          Permitted roles: {allowedRoles.join(', ')}
        </p>
      </div>
    )
  }

  return <>{children}</>
}
