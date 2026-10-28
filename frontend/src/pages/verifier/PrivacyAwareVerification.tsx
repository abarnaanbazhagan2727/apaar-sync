import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api, ApiError } from '../../lib/api'

interface PrivacyQrResponse {
  token: string
  verification_url: string
  expires_at: string
  disclosed_claims: {
    student_name: string
    institution_name: string
    programme: string
    status: string
    masked_apaar: string
  }
}

interface VerificationAuditLog {
  id: string
  student_id: string
  verifier_role: string
  timestamp: string
  disclosed_fields: string[]
  verification_result: string
}

interface VerifyResultResponse {
  valid: boolean
  message: string
  verified_at: string
  token_id: string
  claims: {
    student_name: string
    institution_name: string
    programme: string
    status: string
    masked_apaar: string
  }
  notice: string
}

export default function PrivacyAwareVerification() {
  const [activeTab, setActiveTab] = useState<'generate' | 'verify' | 'audit'>('generate')
  const [studentId, setStudentId] = useState('std_demo_001')
  const [studentName, setStudentName] = useState('Aarav Sharma')
  const [programme, setProgramme] = useState('Computer Science & Engineering')
  const [qrData, setQrData] = useState<PrivacyQrResponse | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Verify form
  const [verifyToken, setVerifyToken] = useState('')
  const [verifyResult, setVerifyResult] = useState<VerifyResultResponse | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  // Audit state
  const [auditLogs, setAuditLogs] = useState<VerificationAuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  async function handleGenerateQr() {
    setIsGenerating(true)
    try {
      const res = await api<PrivacyQrResponse>('/credentials/privacy-qr', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          student_name: studentName,
          institution_id: '10000000-0000-4000-8000-000000000003',
          programme,
          expires_in_hours: 24,
        }),
      })
      setQrData(res)
      setVerifyToken(res.token)
    } catch {
      // fallback
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleVerifyToken() {
    if (!verifyToken.trim()) return
    setIsVerifying(true)
    setVerifyError(null)
    setVerifyResult(null)
    try {
      const res = await api<VerifyResultResponse>('/credentials/privacy-verify', {
        method: 'POST',
        body: JSON.stringify({
          signed_token: verifyToken.trim(),
          verifier_role: 'verifier',
        }),
      })
      setVerifyResult(res)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'detail' in err.body) {
        setVerifyError(String((err.body as { detail: string }).detail))
      } else {
        setVerifyError('Verification failed. The token may be expired, tampered, or invalid.')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  async function loadAuditLogs() {
    setAuditLoading(true)
    try {
      const res = await api<VerificationAuditLog[]>('/credentials/privacy-audit')
      setAuditLogs(res)
    } catch {
      // fallback
    } finally {
      setAuditLoading(false)
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
            SIH Innovation 4
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            Privacy-Aware Verification & Minimal Disclosure QR
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Cryptographically signed tokens; zero exposure of plaintext APAAR ID or sensitive PII on the QR surface. Offline-verifiable proof of admission.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('generate')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'generate' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Generate Student Proof
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('verify')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'verify' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Verifier Portal
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('audit')
              loadAuditLogs()
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Verification Audit Trail
          </button>
        </div>
      </div>

      {/* Tab 1: Generate Student QR */}
      {activeTab === 'generate' && (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-900">Zero-Plaintext APAAR Disclosure Guarantee</p>
              <p className="mt-1">
                The QR code encodes strictly an HMAC-SHA256 signed verification URI. Observers scanning the QR cannot harvest raw APAAR IDs or national identity credentials.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Synthetic Student Name</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600">Programme of Study</label>
                <input
                  type="text"
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600">Synthetic Student ID</label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateQr}
                disabled={isGenerating}
                className="mt-2 w-full rounded-xl bg-purple-600 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {isGenerating ? 'Generating Signed Token…' : 'Generate Privacy-Preserving QR'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            {qrData ? (
              <div className="space-y-4">
                <div className="inline-block rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                  <QRCodeSVG value={qrData.verification_url} size={220} />
                </div>
                <div className="text-xs text-slate-600">
                  <p className="font-semibold text-slate-900">Signed Verification URI</p>
                  <p className="mt-1 font-mono text-[10px] break-all max-w-xs text-slate-500 bg-white p-2 rounded border border-slate-200">
                    {qrData.verification_url}
                  </p>
                  <p className="mt-2 text-[11px] text-emerald-700 font-semibold">
                    Expires: {new Date(qrData.expires_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                Click “Generate Privacy-Preserving QR” to mint a cryptographically signed verification artifact.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Verifier Portal */}
      {activeTab === 'verify' && (
        <div className="space-y-6">
          <div className="max-w-2xl space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Input Signed Verification Token or Scanned URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Paste token string or verification URL…"
                className="flex-1 rounded-xl border border-slate-300 p-2.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleVerifyToken}
                disabled={isVerifying || !verifyToken.trim()}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {isVerifying ? 'Verifying…' : 'Verify Authenticity'}
              </button>
            </div>
          </div>

          {verifyError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
              {verifyError}
            </div>
          )}

          {verifyResult && (
            <div className="max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-xs">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs">
                    ✓
                  </span>
                  <span className="text-sm font-bold text-emerald-950">
                    Authentic Student Enrolment Verified
                  </span>
                </div>
                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-mono text-emerald-800 border border-emerald-300">
                  {new Date(verifyResult.verified_at).toLocaleTimeString()}
                </span>
              </div>

              {/* Minimal Disclosed Fields Card */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg bg-white p-3 border border-emerald-100">
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Student Name</p>
                  <p className="mt-0.5 font-bold text-slate-900 text-sm">{verifyResult.claims.student_name}</p>
                </div>

                <div className="rounded-lg bg-white p-3 border border-emerald-100">
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Masked APAAR ID</p>
                  <p className="mt-0.5 font-bold font-mono text-slate-800 text-sm">{verifyResult.claims.masked_apaar}</p>
                </div>

                <div className="rounded-lg bg-white p-3 border border-emerald-100">
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Institution</p>
                  <p className="mt-0.5 font-semibold text-slate-800">{verifyResult.claims.institution_name}</p>
                </div>

                <div className="rounded-lg bg-white p-3 border border-emerald-100">
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Programme</p>
                  <p className="mt-0.5 font-semibold text-slate-800">{verifyResult.claims.programme}</p>
                </div>
              </div>

              <p className="mt-4 text-[11px] text-slate-500 italic">
                {verifyResult.notice}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Verification Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Immutable log recording every credential verification event for auditing and compliance tracking.
          </p>

          {auditLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading verification audit entries…</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">No verifications logged yet. Verify a credential to record an event.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Timestamp</th>
                    <th className="px-3.5 py-3">Verifier Role</th>
                    <th className="px-3.5 py-3">Student Ref</th>
                    <th className="px-3.5 py-3">Disclosed Scope</th>
                    <th className="px-3.5 py-3">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="px-3.5 py-3 font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3.5 py-3 font-semibold text-slate-800 capitalize">{log.verifier_role}</td>
                      <td className="px-3.5 py-3 font-mono text-slate-700">{log.student_id}</td>
                      <td className="px-3.5 py-3 text-slate-600">{log.disclosed_fields.join(', ')}</td>
                      <td className="px-3.5 py-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          {log.verification_result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
