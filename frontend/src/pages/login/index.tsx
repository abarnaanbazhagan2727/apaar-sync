import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { setAuthUser } from '../../lib/auth'
import { ROLE_HOME, type Role } from '../../lib/roles'

interface LoginResponse {
  access_token: string
  token_type: string
  user: {
    id: string
    email: string
    full_name: string
    role: string
    institution_id?: string | null
    institution_name?: string | null
  }
}

interface DemoAccount {
  role: Role
  title: string
  email: string
  password: string
  description: string
  badgeColor: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'aicte_admin',
    title: 'AICTE Admin',
    email: 'admin@apaarsync.demo',
    password: 'Admin@123',
    description: 'Manages demo users, reviews state-wide overruns & full system audit logs.',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    role: 'institution_operator',
    title: 'Institution Officer',
    email: 'officer@apaarsync.demo',
    password: 'Officer@123',
    description: 'Uploads admission CSVs, reviews validation errors & executes correction workflows.',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  {
    role: 'auditor',
    title: 'Reviewer / Auditor',
    email: 'reviewer@apaarsync.demo',
    password: 'Reviewer@123',
    description: 'Read-only access to verify admissions, inspect immutable audit chain & radar.',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
  },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null)

  function fillDemoAccount(account: DemoAccount) {
    setEmail(account.email)
    setPassword(account.password)
    setErrorMessage(null)
    setCopiedAccount(account.email)
    setTimeout(() => setCopiedAccount(null), 2500)
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.')
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      // Store authenticated user session
      setAuthUser({
        id: res.user.id,
        email: res.user.email,
        full_name: res.user.full_name,
        role: res.user.role as Role,
        institution_id: res.user.institution_id,
        institution_name: res.user.institution_name,
        token: res.access_token,
      })

      // Redirect to role home dashboard
      const dest = ROLE_HOME[res.user.role as Role] || '/'
      navigate(dest, { replace: true })
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'detail' in err.body) {
        setErrorMessage(String((err.body as { detail: string }).detail))
      } else {
        setErrorMessage('Authentication failed. Please verify your credentials or server status.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto my-6 max-w-4xl px-4">
      {/* Top Banner / Disclaimer */}
      <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-xs">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-amber-950">SIH 2026 Evaluation Prototype Notice</p>
            <p className="mt-0.5 text-xs text-amber-800">
              This portal is configured with PBKDF2 cryptographic credential verification and synthetic seed identities.
              All data presented is prototype test data conforming to AICTE Problem Statement SIH26263.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Login Form */}
        <div className="lg:col-span-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                Secure Login Portal
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
                Sign in to APAAR-Sync
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                AICTE-Approved Institutional Student Verification
              </p>
            </div>

            {errorMessage && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">{errorMessage}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="email-input">
                  Institutional Email / Username
                </label>
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@institution.demo"
                  required
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="password-input">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticating credentials…
                  </span>
                ) : (
                  'Sign In to Dashboard'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Demo Accounts Helper */}
        <div className="lg:col-span-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">
                1-Click Demo Credentials
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Click “Fill demo account” below to test specific role access controls.
              </p>
            </div>

            <div className="space-y-3.5">
              {DEMO_ACCOUNTS.map((acc) => {
                const isSelected = copiedAccount === acc.email
                return (
                  <div
                    key={acc.role}
                    className="relative rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 transition-all hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${acc.badgeColor}`}>
                        {acc.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => fillDemoAccount(acc)}
                        className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs border border-slate-200 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        {isSelected ? '✓ Filled Form' : 'Fill demo account'}
                      </button>
                    </div>

                    <p className="mt-2 text-xs text-slate-600">
                      {acc.description}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
                      <span>Email: <strong className="text-slate-800">{acc.email}</strong></span>
                      <span>Password: <strong className="text-slate-800">{acc.password}</strong></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
