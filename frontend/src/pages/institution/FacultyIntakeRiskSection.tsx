import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface ProgrammeRisk {
  institution_id: string
  programme_code: string
  programme_name: string
  approved_intake: number
  reported_admissions: number
  available_faculty: number
  professors: number
  associate_professors: number
  assistant_professors: number
  calculated_sfr: number
  ai_cte_threshold_sfr: number
  required_faculty: number
  faculty_deficit: number
  risk_level: 'low' | 'moderate' | 'high' | 'critical'
  flagged_reasons: string[]
  suggested_action: string
  status: 'active_alert' | 'acknowledged' | 'intake_capped' | 'resolved'
  last_decision_by?: string | null
  last_decision_note?: string | null
}

interface IntakeRiskSummary {
  institution_id: string
  total_approved_intake: number
  total_reported_admissions: number
  total_faculty: number
  institution_sfr: number
  programmes_flagged: number
  high_risk_count: number
  programmes: ProgrammeRisk[]
}

interface SimulationResult {
  programme_code: string
  simulated_intake: number
  simulated_faculty: number
  resulting_sfr: number
  required_faculty: number
  faculty_deficit: number
  projected_risk_level: 'low' | 'moderate' | 'high' | 'critical'
  explanation: string
  compliant: boolean
}

export default function FacultyIntakeRiskSection({
  institutionId,
}: {
  institutionId?: string
  isReviewer?: boolean
}) {
  const queryClient = useQueryClient()
  const instId = institutionId || '10000000-0000-4000-8000-000000000003'

  // Simulator state
  const [selectedProg, setSelectedProg] = useState<string>('CSE')
  const [simIntake, setSimIntake] = useState<number>(120)
  const [simFaculty, setSimFaculty] = useState<number>(6)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  const [simLoading, setSimLoading] = useState<boolean>(false)

  // Decision Modal state
  const [decidingProg, setDecidingProg] = useState<ProgrammeRisk | null>(null)
  const [decisionAction, setDecisionAction] = useState<string>('acknowledge')
  const [decisionNote, setDecisionNote] = useState<string>('')
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const riskQuery = useQuery({
    queryKey: ['intake-risk', instId],
    queryFn: () => api<IntakeRiskSummary>(`/intake-risk/programmes?institution_id=${instId}`),
  })

  const decideMutation = useMutation({
    mutationFn: (payload: {
      programmeCode: string
      action: string
      notes: string
    }) =>
      api<ProgrammeRisk>(`/intake-risk/${payload.programmeCode}/decide?institution_id=${instId}`, {
        method: 'POST',
        body: JSON.stringify({
          action: payload.action,
          notes: payload.notes,
        }),
      }),
    onSuccess: (data) => {
      setActionSuccess(`Officer decision saved for ${data.programme_name}: [${data.status}].`)
      setDecidingProg(null)
      setDecisionNote('')
      queryClient.invalidateQueries({ queryKey: ['intake-risk', instId] })
      setTimeout(() => setActionSuccess(null), 5000)
    },
  })

  async function runSimulation() {
    setSimLoading(true)
    try {
      const res = await api<SimulationResult>(`/intake-risk/simulate?institution_id=${instId}`, {
        method: 'POST',
        body: JSON.stringify({
          programme_code: selectedProg,
          proposed_intake: Number(simIntake),
          proposed_faculty: Number(simFaculty),
        }),
      })
      setSimResult(res)
    } catch {
      // simulation fallback
    } finally {
      setSimLoading(false)
    }
  }

  const summary = riskQuery.data
  const programmes = summary?.programmes ?? []

  const riskBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300 font-bold'
      case 'high':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
      case 'moderate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-600"></span>
            SIH Innovation 2
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            Faculty-Linked Dynamic Intake Risk Alerts & Simulator
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Automated statutory threshold cross-check (Prototype AICTE SFR 20:1 & Cadre Ratio 1:2:6). Proactive alert review and What-If modeling.
          </p>
        </div>

        {/* Prototype Rule Disclaimer */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2 text-xs text-blue-900">
          <p className="font-semibold">Configurable Prototype Rules</p>
          <p className="text-[11px] text-blue-700">Demonstration thresholds only. Does not alter official gazetted intake automatically.</p>
        </div>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-800">
          <svg className="h-5 w-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Institutional SFR</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-black ${summary.institution_sfr > 20 ? 'text-amber-700' : 'text-slate-800'}`}>
                {summary.institution_sfr}:1
              </span>
              <span className="text-xs text-slate-500">Target &le; 20:1</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{summary.total_approved_intake} seats across {summary.total_faculty} faculty</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Programmes Flagged</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-red-700">{summary.programmes_flagged}</span>
              <span className="text-xs text-slate-500">of {programmes.length} total</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{summary.high_risk_count} requiring immediate recruitment or seat review</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cadre Distribution</p>
            <div className="mt-2 text-sm font-bold text-slate-800">
              Professors / Assoc / Asst
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Checked against standard 1:2:6 prototype cadre pyramid</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision Mandate</p>
            <div className="mt-2 text-sm font-bold text-teal-800">
              Officer Review Required
            </div>
            <p className="mt-1 text-[11px] text-slate-500">No automated seat reduction; authorized decisions only</p>
          </div>
        </div>
      )}

      {/* Programme Risk Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
            <tr>
              <th className="px-3.5 py-3">Programme</th>
              <th className="px-3.5 py-3">Intake / Admitted</th>
              <th className="px-3.5 py-3">Faculty Breakdown</th>
              <th className="px-3.5 py-3">Calculated SFR</th>
              <th className="px-3.5 py-3">Deficit</th>
              <th className="px-3.5 py-3">Risk Assessment</th>
              <th className="px-3.5 py-3 text-right">Review Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {programmes.map((p) => (
              <tr key={p.programme_code} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-3.5 py-3.5">
                  <p className="font-semibold text-slate-900">{p.programme_name}</p>
                  <p className="text-xs font-mono text-slate-500">{p.programme_code}</p>
                </td>

                <td className="px-3.5 py-3.5">
                  <span className="font-bold text-slate-800">{p.reported_admissions}</span>
                  <span className="text-slate-400"> / {p.approved_intake} seats</span>
                </td>

                <td className="px-3.5 py-3.5">
                  <p className="font-semibold text-slate-800">{p.available_faculty} total</p>
                  <p className="text-[11px] text-slate-500">
                    {p.professors} Prof · {p.associate_professors} Assoc · {p.assistant_professors} Asst
                  </p>
                </td>

                <td className="px-3.5 py-3.5">
                  <span className={`font-mono font-bold ${p.calculated_sfr > 20 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {p.calculated_sfr}:1
                  </span>
                  <span className="text-[10px] text-slate-400 block">AICTE rule: 20:1</span>
                </td>

                <td className="px-3.5 py-3.5 font-semibold">
                  {p.faculty_deficit > 0 ? (
                    <span className="text-red-600">-{p.faculty_deficit} faculty</span>
                  ) : (
                    <span className="text-emerald-700">Compliant</span>
                  )}
                </td>

                <td className="px-3.5 py-3.5 max-w-xs">
                  <span className={`inline-block rounded-md border px-2 py-0.5 text-xs ${riskBadge(p.risk_level)}`}>
                    {p.risk_level.toUpperCase()}
                  </span>
                  {p.flagged_reasons.length > 0 && (
                    <ul className="mt-1 list-disc pl-3 text-[11px] text-slate-600 space-y-0.5">
                      {p.flagged_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </td>

                <td className="px-3.5 py-3.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setDecidingProg(p)
                      setDecisionAction('acknowledge')
                      setDecisionNote(p.suggested_action || '')
                    }}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-teal-500"
                  >
                    Review Alert
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What-If Scenario Simulator */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
            &beta;
          </span>
          <h3 className="text-sm font-bold text-slate-900">
            Interactive What-If Scenario Simulator
          </h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Model how adding faculty or adjusting planned intake directly influences statutory compliance before submitting changes to AICTE.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Select Programme</label>
            <select
              value={selectedProg}
              onChange={(e) => setSelectedProg(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium"
            >
              {programmes.map((p) => (
                <option key={p.programme_code} value={p.programme_code}>
                  {p.programme_code} - {p.programme_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Simulated Intake: <span className="font-bold text-indigo-700">{simIntake}</span>
            </label>
            <input
              type="range"
              min="30"
              max="240"
              step="30"
              value={simIntake}
              onChange={(e) => setSimIntake(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Simulated Faculty: <span className="font-bold text-indigo-700">{simFaculty}</span>
            </label>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={simFaculty}
              onChange={(e) => setSimFaculty(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-600"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={runSimulation}
            disabled={simLoading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {simLoading ? 'Simulating…' : 'Run What-If Projection'}
          </button>

          {simResult && (
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-slate-500">Projected SFR:</span>{' '}
                <strong className={`font-mono font-bold ${simResult.resulting_sfr > 20 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {simResult.resulting_sfr}:1
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>{' '}
                <span className={`rounded px-2 py-0.5 font-bold ${riskBadge(simResult.projected_risk_level)}`}>
                  {simResult.projected_risk_level.toUpperCase()}
                </span>
              </div>
            </div>
          )}
        </div>

        {simResult && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <strong>Impact Assessment:</strong> {simResult.explanation}
          </div>
        )}
      </div>

      {/* Officer Decision Modal */}
      {decidingProg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Authorized Review: {decidingProg.programme_name}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Current SFR is {decidingProg.calculated_sfr}:1 (Deficit: {decidingProg.faculty_deficit} faculty).
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Decision Outcome</label>
                <select
                  value={decisionAction}
                  onChange={(e) => setDecisionAction(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                >
                  <option value="acknowledge">Acknowledge Alert & Initiate Faculty Recruitment</option>
                  <option value="propose_intake_reduction">Propose Voluntary Intake Reduction to AICTE</option>
                  <option value="cross_department_sharing">Request Cross-Department Faculty Allocation</option>
                  <option value="resolve">Confirm Compliance / Resolved</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600">Officer Action Note / Resolution Rationale</label>
                <textarea
                  rows={3}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="State the institutional action plan or timeline for recruitment…"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDecidingProg(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  decideMutation.mutate({
                    programmeCode: decidingProg.programme_code,
                    action: decisionAction,
                    notes: decisionNote,
                  })
                }
                disabled={decideMutation.isPending}
                className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
              >
                {decideMutation.isPending ? 'Saving…' : 'Record Official Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
