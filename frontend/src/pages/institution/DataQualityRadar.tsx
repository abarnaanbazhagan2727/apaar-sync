import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface RadarData {
  institution_id: string
  institution_name: string
  overall_data_quality_score: number
  statutory_validation: {
    total_records_analyzed: number
    missing_field_count: number
    missing_field_rate: number
    duplicate_record_count: number
    duplicate_record_rate: number
    invalid_format_count: number
    invalid_format_rate: number
    rule_violation_count: number
    unresolved_issue_count: number
  }
  formula_weights: {
    base_score: number
    missing_field_weight: number
    duplicate_weight: number
    format_weight: number
    rule_violation_weight: number
    formula_explanation: string
  }
  department_error_breakdown: {
    department: string
    total_records: number
    error_count: number
    error_rate: number
    most_frequent_error: string
  }[]
  historical_upload_trends: {
    upload_batch: string
    timestamp: string
    records_count: number
    error_count: number
    quality_score: number
  }[]
  ml_anomaly_prototype: {
    model_name: string
    disclaimer: string
    is_statutory_ground_truth: boolean
    anomalous_records_flagged: number
    average_anomaly_score: number
    feature_importance: Record<string, number>
  }
}

export default function DataQualityRadar({
  institutionId,
}: {
  institutionId?: string
}) {
  const instId = institutionId || '10000000-0000-4000-8000-000000000003'
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'trends' | 'ml_vs_rules'>('overview')

  const radarQuery = useQuery({
    queryKey: ['institution-radar', instId],
    queryFn: () => api<RadarData>(`/api/ml/institution-radar/${instId}`),
  })

  const data = radarQuery.data
  const statutory = data?.statutory_validation
  const formula = data?.formula_weights
  const mlProto = data?.ml_anomaly_prototype

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
            SIH Innovation 3
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            Explainable Data Quality & Risk Radar
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Transparent mathematical metrics, departmental recurring error heatmaps, multi-upload trends, and strict separation between deterministic rules & ML predictions.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'overview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Deterministic Radar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('departments')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'departments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Department Breakdown
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trends')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'trends' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload Progression
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ml_vs_rules')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'ml_vs_rules' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rules vs Prototype ML
          </button>
        </div>
      </div>

      {radarQuery.isLoading && (
        <div className="py-8 text-center text-sm text-slate-500">Loading data quality indicators…</div>
      )}

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && data && (
        <div className="space-y-5">
          {/* Main KPI Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Overall Quality</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900">{data.overall_data_quality_score}%</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Deterministic composite index</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Missing Field Rate</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800">{statutory?.missing_field_rate}%</span>
                <span className="text-xs text-slate-400">({statutory?.missing_field_count} fields)</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Mandatory AICTE fields empty</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Duplicate Rate</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-700">{statutory?.duplicate_record_rate}%</span>
                <span className="text-xs text-slate-400">({statutory?.duplicate_record_count} records)</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Repeated APAAR or Aadhaar vault keys</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Format Violations</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800">{statutory?.invalid_format_count}</span>
                <span className="text-xs text-slate-400">({statutory?.invalid_format_rate}%)</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Invalid 12-digit APAAR or dates</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unresolved Issues</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-red-700">{statutory?.unresolved_issue_count}</span>
                <span className="text-xs text-slate-400">awaiting fix</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Actionable in Correction Tracker</p>
            </div>
          </div>

          {/* Transparent Formula Card */}
          {formula && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Documented Mathematical Scoring Formula
                </h4>
              </div>
              <div className="mt-2 rounded-lg bg-white p-3 font-mono text-xs text-slate-700 border border-slate-200">
                Score = {formula.base_score} - ({formula.duplicate_weight} &times; DuplicateRate) - ({formula.rule_violation_weight} &times; RuleViolationRate) - ({formula.missing_field_weight} &times; MissingRate) - ({formula.format_weight} &times; FormatRate)
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {formula.formula_explanation}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Department Error Breakdown */}
      {activeTab === 'departments' && data && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Identifies systemic data entry weaknesses by department to focus institutional training and pre-upload sanitization.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-3">Department</th>
                  <th className="px-3.5 py-3 text-right">Records Uploaded</th>
                  <th className="px-3.5 py-3 text-right">Detected Errors</th>
                  <th className="px-3.5 py-3 text-right">Error Rate</th>
                  <th className="px-3.5 py-3">Most Frequent Issue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.department_error_breakdown.map((dept) => (
                  <tr key={dept.department} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-3 font-semibold text-slate-900">{dept.department}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">{dept.total_records}</td>
                    <td className="px-3.5 py-3 text-right font-bold text-red-600 tabular-nums">{dept.error_count}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${dept.error_rate > 10 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                        {dept.error_rate}%
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-slate-600 font-mono">
                      {dept.most_frequent_error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Upload Progression */}
      {activeTab === 'trends' && data && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Longitudinal progress tracking demonstrating data sanitization effectiveness over successive upload batches.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-3">Batch Reference</th>
                  <th className="px-3.5 py-3">Timestamp</th>
                  <th className="px-3.5 py-3 text-right">Rows</th>
                  <th className="px-3.5 py-3 text-right">Errors</th>
                  <th className="px-3.5 py-3 text-right">Quality Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.historical_upload_trends.map((trend) => (
                  <tr key={trend.upload_batch} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-3 font-mono font-medium text-slate-800">{trend.upload_batch}</td>
                    <td className="px-3.5 py-3 text-slate-500">{new Date(trend.timestamp).toLocaleString()}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">{trend.records_count}</td>
                    <td className="px-3.5 py-3 text-right font-semibold text-slate-700 tabular-nums">{trend.error_count}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">
                      <span className="font-mono text-sm font-black text-indigo-700">
                        {trend.quality_score}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Rules vs Prototype ML */}
      {activeTab === 'ml_vs_rules' && mlProto && (
        <div className="space-y-5">
          {/* Disclaimer Banner */}
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
            <div className="flex items-start gap-2.5">
              <svg className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-bold">{mlProto.disclaimer}</p>
                <p className="mt-1 text-amber-800">
                  Deterministic statutory rules represent statutory non-compliance. Machine learning models (e.g., Random Forest) are experimental heuristics and must not be used as official verified fraud probabilities.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Deterministic Rules */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
                <h4 className="text-sm font-bold text-slate-900">Deterministic Statutory Validation</h4>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Rule-based checks executed against published AICTE norms.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-700">
                <li className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span>APAAR Format (12 digits Luhn check)</span>
                  <strong className="text-emerald-700">Deterministic</strong>
                </li>
                <li className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span>Intake Capacity Ceiling</span>
                  <strong className="text-emerald-700">Deterministic</strong>
                </li>
                <li className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span>Duplicate Cross-Institution Match</span>
                  <strong className="text-emerald-700">Deterministic</strong>
                </li>
                <li className="flex justify-between">
                  <span>Statutory Authority</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-800">Legal Standard</span>
                </li>
              </ul>
            </div>

            {/* Right: Prototype Random Forest ML */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-5 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-indigo-600"></span>
                <h4 className="text-sm font-bold text-slate-900">
                  {mlProto.model_name}
                </h4>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Statistical pattern anomaly detector trained on synthetic institutional clusters.
              </p>
              <div className="mt-4 space-y-2 text-xs text-slate-700">
                <div className="flex justify-between border-b border-indigo-100 pb-1.5">
                  <span>Simulated Anomalies Flagged</span>
                  <strong className="text-indigo-900">{mlProto.anomalous_records_flagged} records</strong>
                </div>
                <div className="flex justify-between border-b border-indigo-100 pb-1.5">
                  <span>Mean Prototype Anomaly Score</span>
                  <strong className="text-indigo-900">{mlProto.average_anomaly_score} / 1.0</strong>
                </div>
                <div className="pt-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">Feature Importances (Trained Weights):</p>
                  <div className="mt-2 space-y-1">
                    {Object.entries(mlProto.feature_importance).map(([feature, weight]) => (
                      <div key={feature} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-600">{feature}</span>
                        <span className="font-semibold text-indigo-700">{Math.round(weight * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
