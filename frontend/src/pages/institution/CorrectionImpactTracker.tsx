import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'

interface CorrectionItem {
  id: string
  batch_id: string
  row_number: number
  field_name: string
  error_rule: string
  raw_value: string | null
  simple_explanation: string
  suggested_correction: string | null
  confidence_score: number
  status: 'pending' | 'approved' | 'rejected' | 'revalidated'
  approved_by?: string | null
  approved_at?: string | null
  created_at: string
}

interface CorrectionTrackerSummary {
  batch_id: string
  institution_id: string
  total_issues: number
  pending_issues: number
  approved_issues: number
  rejected_issues: number
  revalidated_issues: number
  data_quality_score_before: number
  data_quality_score_after: number
  score_delta: number
  issue_counts_before: {
    duplicate_records: number
    missing_fields: number
    invalid_format: number
    rule_violation: number
  }
  issue_counts_after: {
    duplicate_records: number
    missing_fields: number
    invalid_format: number
    rule_violation: number
  }
}

interface CorrectionTrackerResponse {
  summary: CorrectionTrackerSummary
  items: CorrectionItem[]
}

interface AuditEntry {
  id: string
  batch_id: string
  item_id: string
  row_number: number
  field_name: string
  before_value: string | null
  after_value: string | null
  action: 'suggested' | 'approved' | 'rejected' | 'custom_edit' | 'revalidated'
  action_by: string
  timestamp: string
  notes?: string | null
}

export default function CorrectionImpactTracker({
  batchId,
  isOperator = true,
}: {
  batchId: string
  isOperator?: boolean
}) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'issues' | 'audit'>('issues')
  const [customEditingId, setCustomEditingId] = useState<string | null>(null)
  const [customValue, setCustomValue] = useState<string>('')
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const trackerQuery = useQuery({
    queryKey: ['correction-tracker', batchId],
    queryFn: () => api<CorrectionTrackerResponse>(`/batches/${batchId}/correction-tracker`),
    enabled: Boolean(batchId),
  })

  const auditQuery = useQuery({
    queryKey: ['correction-audit', batchId],
    queryFn: () => api<AuditEntry[]>(`/batches/${batchId}/correction-audit`),
    enabled: Boolean(batchId) && activeTab === 'audit',
  })

  const applyMutation = useMutation({
    mutationFn: (payload: {
      itemId: string
      action: 'approve' | 'reject' | 'custom'
      customValue?: string
      notes?: string
    }) =>
      api<{
        item: CorrectionItem
        summary: CorrectionTrackerSummary
        audit_entry: AuditEntry
      }>(`/batches/${batchId}/apply-correction`, {
        method: 'POST',
        body: JSON.stringify({
          item_id: payload.itemId,
          action: payload.action,
          custom_value: payload.customValue,
          notes: payload.notes,
        }),
      }),
    onSuccess: (data) => {
      setActionSuccess(
        `Row ${data.item.row_number} [${data.item.field_name}] updated to: ${data.item.raw_value || 'None'}. Record revalidated!`
      )
      setActionError(null)
      setCustomEditingId(null)
      queryClient.invalidateQueries({ queryKey: ['correction-tracker', batchId] })
      queryClient.invalidateQueries({ queryKey: ['correction-audit', batchId] })
      setTimeout(() => setActionSuccess(null), 6000)
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'detail' in err.body) {
        setActionError(String((err.body as { detail: string }).detail))
      } else {
        setActionError('Failed to apply correction.')
      }
    },
  })

  const summary = trackerQuery.data?.summary
  const items = trackerQuery.data?.items ?? []

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
            SIH Innovation 1
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            Student Record Correction Impact Tracker
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Explainable validation failure mitigation, safe AI suggested corrections, review approval, immediate revalidation & full audit trail.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('issues')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'issues'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Issues & Suggested Corrections ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'audit'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Immutable Audit Trail
          </button>
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

      {actionError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-800">
          <svg className="h-5 w-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span>{actionError}</span>
        </div>
      )}

      {/* Before and After Impact Metrics Card */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data Quality Score</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-800">{summary.data_quality_score_after}%</span>
              <span className="text-xs text-slate-400 line-through">was {summary.data_quality_score_before}%</span>
              {summary.score_delta > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  +{summary.score_delta}%
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Calculated deterministically from error weights</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unresolved Issues</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700">{summary.pending_issues}</span>
              <span className="text-xs text-slate-500">of {summary.total_issues} initial</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Missing fields, duplicates & syntax errors</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved & Revalidated</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{summary.revalidated_issues}</span>
              <span className="text-xs text-emerald-600 font-medium">Safe Corrections</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Explicitly verified by institution officer</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Policy Integrity</p>
            <div className="mt-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
              No Silent Edits
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Audit log captures every proposed and accepted value</p>
          </div>
        </div>
      )}

      {/* Issues Table */}
      {activeTab === 'issues' && (
        <div>
          {trackerQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">Analyzing batch errors and building suggested corrections…</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No validation issues found for this batch. All student records conform to statutory requirements.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Row & Field</th>
                    <th className="px-3.5 py-3">Rule & Simple Explanation</th>
                    <th className="px-3.5 py-3">Raw Value</th>
                    <th className="px-3.5 py-3">Suggested Safe Correction</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3 text-right">Officer Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const isPending = item.status === 'pending'
                    const isCustomEditing = customEditingId === item.id
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                          <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                            Row {item.row_number}
                          </span>
                          <span className="ml-1.5 font-semibold text-indigo-700">{item.field_name}</span>
                        </td>

                        <td className="max-w-xs px-3.5 py-3.5">
                          <span className="font-semibold text-slate-800">{item.error_rule}:</span>{' '}
                          <span className="text-slate-600">{item.simple_explanation}</span>
                        </td>

                        <td className="px-3.5 py-3.5 font-mono text-xs">
                          {item.raw_value ? (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 border border-red-100">
                              {item.raw_value}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">&lt;empty&gt;</span>
                          )}
                        </td>

                        <td className="px-3.5 py-3.5">
                          {isCustomEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={customValue}
                                onChange={(e) => setCustomValue(e.target.value)}
                                placeholder="Enter value"
                                className="rounded border border-indigo-400 px-2 py-1 text-xs outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  applyMutation.mutate({
                                    itemId: item.id,
                                    action: 'custom',
                                    customValue,
                                  })
                                }
                                className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setCustomEditingId(null)}
                                className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : item.suggested_correction ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-semibold rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 border border-emerald-200">
                                {item.suggested_correction}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                ({Math.round(item.confidence_score * 100)}% conf)
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-700 italic">Manual Officer Entry Required</span>
                          )}
                        </td>

                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          {item.status === 'revalidated' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                              ✓ Revalidated
                            </span>
                          )}
                          {item.status === 'rejected' && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              Rejected
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                              Pending Review
                            </span>
                          )}
                        </td>

                        <td className="px-3.5 py-3.5 text-right whitespace-nowrap">
                          {isPending && isOperator ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {item.suggested_correction && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    applyMutation.mutate({
                                      itemId: item.id,
                                      action: 'approve',
                                    })
                                  }
                                  disabled={applyMutation.isPending}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-500 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomEditingId(item.id)
                                  setCustomValue(item.suggested_correction || item.raw_value || '')
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  applyMutation.mutate({
                                    itemId: item.id,
                                    action: 'reject',
                                  })
                                }
                                disabled={applyMutation.isPending}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:text-red-600"
                              >
                                Dismiss
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {item.approved_by ? `By ${item.approved_by}` : 'Locked'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Trail Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 border border-slate-200">
            <p className="font-semibold text-slate-800">Cryptographically & Audit-Secured History</p>
            <p className="mt-0.5">
              Every correction must be authorized. No records are deleted or modified silently.
            </p>
          </div>

          {auditQuery.isLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading audit history…</div>
          ) : (auditQuery.data ?? []).length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">No correction actions logged yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Timestamp</th>
                    <th className="px-3.5 py-3">Officer</th>
                    <th className="px-3.5 py-3">Row & Field</th>
                    <th className="px-3.5 py-3">Action</th>
                    <th className="px-3.5 py-3">Before</th>
                    <th className="px-3.5 py-3">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(auditQuery.data ?? []).map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/70">
                      <td className="px-3.5 py-3 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3.5 py-3 font-medium text-slate-800">{entry.action_by}</td>
                      <td className="px-3.5 py-3">
                        Row {entry.row_number} · <strong className="text-indigo-700">{entry.field_name}</strong>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 font-bold uppercase text-[10px] text-indigo-700">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 font-mono text-slate-500">
                        {entry.before_value || '<empty>'}
                      </td>
                      <td className="px-3.5 py-3 font-mono font-semibold text-emerald-700">
                        {entry.after_value || '<empty>'}
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
