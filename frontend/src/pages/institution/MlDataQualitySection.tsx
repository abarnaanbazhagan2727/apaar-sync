// Owner: APAAR-Sync / SIH 2026
// ML Data Quality Prediction and Validation Component
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { components } from '../../lib/api-types'
import ErrorAlert from '../../components/ErrorAlert'

type FeaturesInput = components['schemas']['DataQualityFeaturesInput']
type PredictionResponse = components['schemas']['DataQualityPredictionResponse']
type StudentInput = components['schemas']['StudentRecordQualityInput']
type StudentResponse = components['schemas']['StudentRecordQualityResponse']
type ModelStatus = components['schemas']['ModelStatusResponse']

const PRESETS: Record<string, { label: string; features: FeaturesInput; description: string }> = {
  clean: {
    label: 'Clean Record',
    features: {
      missing_fields: 0,
      duplicate_flag: 0,
      invalid_id_format: 0,
      invalid_age: 0,
      invalid_department: 0,
      invalid_marks: 0,
    },
    description: 'All 6 dimensions valid; standard verified record.',
  },
  missing_and_id: {
    label: 'Missing Fields & Malformed ID',
    features: {
      missing_fields: 2,
      duplicate_flag: 0,
      invalid_id_format: 1,
      invalid_age: 0,
      invalid_department: 0,
      invalid_marks: 0,
    },
    description: 'Sample input from Colab prototype model evaluation.',
  },
  duplicate_collision: {
    label: 'Duplicate Collision',
    features: {
      missing_fields: 1,
      duplicate_flag: 1,
      invalid_id_format: 0,
      invalid_age: 0,
      invalid_department: 0,
      invalid_marks: 0,
    },
    description: 'Cross-batch candidate collision with incomplete details.',
  },
  marks_and_age: {
    label: 'Marks & Age Anomaly',
    features: {
      missing_fields: 0,
      duplicate_flag: 0,
      invalid_id_format: 0,
      invalid_age: 1,
      invalid_department: 0,
      invalid_marks: 1,
    },
    description: 'Candidate age or qualifying percentage out of range.',
  },
}

export default function MlDataQualitySection() {
  const [activeTab, setActiveTab] = useState<'features' | 'record'>('features')

  // Direct Features State
  const [features, setFeatures] = useState<FeaturesInput>({
    missing_fields: 2,
    duplicate_flag: 0,
    invalid_id_format: 1,
    invalid_age: 0,
    invalid_department: 0,
    invalid_marks: 0,
  })

  // Simulated Student Record State
  const [studentForm, setStudentForm] = useState<StudentInput>({
    student_name: 'Priya Sundaram',
    apaar_id: '984512347890',
    apaar_opt_out: false,
    provisional_id: '',
    dob: '2006-08-14',
    programme_code: 'CSE',
    qualifying_exam_pct: 86.5,
    gender: 'female',
    category: 'general',
    seat_pool: 'regular',
    domicile_state: 'TN',
    is_duplicate: false,
  })

  // Fetch model metadata
  const modelInfoQuery = useQuery({
    queryKey: ['ml-model-info'],
    queryFn: () => api<ModelStatus>('/api/ml/model-info'),
  })

  // Mutation for 6-feature prediction
  const predictMutation = useMutation({
    mutationFn: (payload: FeaturesInput) =>
      api<PredictionResponse>('/api/ml/predict', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })

  // Mutation for record evaluation
  const recordMutation = useMutation({
    mutationFn: (payload: StudentInput) =>
      api<StudentResponse>('/api/ml/evaluate-record', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })

  const handlePredictFeatures = (e: React.FormEvent) => {
    e.preventDefault()
    predictMutation.mutate(features)
  }

  const handleEvaluateRecord = (e: React.FormEvent) => {
    e.preventDefault()
    recordMutation.mutate(studentForm)
  }

  const applyPreset = (key: keyof typeof PRESETS) => {
    setFeatures(PRESETS[key].features)
    predictMutation.mutate(PRESETS[key].features)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header Banner */}
      <div className="border-b border-slate-200 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold tracking-wider text-indigo-300 uppercase">
                SIH 2026 · Problem SIH26263
              </span>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                Random Forest Prototype
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
              APAAR-Sync ML Data Quality Predictor
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-300 sm:text-sm">
              Inference engine for admission data hygiene. Maps 6 dimensional indicators into an
              empirical data-quality risk score.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur-xs">
              <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                Model Architecture
              </p>
              <p className="font-mono text-xs font-semibold text-white">
                {modelInfoQuery.data?.model_type ?? 'RandomForest'}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur-xs">
              <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">Status</p>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-300">
                  {modelInfoQuery.data?.status === 'ready' ? 'Active' : 'Standby'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Prototype Disclaimer Notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <p>
            <span className="font-semibold text-amber-100">Prototype Disclaimer:</span> This model
            is trained on simulated student admissions data. Output scores reflect empirical
            data-quality risk within the demo dataset and do{' '}
            <strong className="underline">not</strong> represent verified fraud probabilities or
            official APAAR/DigiLocker verification.
          </p>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200 bg-slate-50 px-6">
        <button
          type="button"
          onClick={() => setActiveTab('features')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-semibold transition ${
            activeTab === 'features'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>1. Direct 6-Feature Predictor</span>
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">Model API</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('record')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-semibold transition ${
            activeTab === 'record'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>2. Student Record Validator & Predictor</span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
            Rules + ML
          </span>
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'features' ? (
          <div>
            {/* Quick preset selector */}
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Quick Test Presets
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(PRESETS).map(([key, item]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key as keyof typeof PRESETS)}
                    className="flex flex-col items-start rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xs transition hover:border-indigo-400 hover:bg-indigo-50/30"
                  >
                    <span className="text-xs font-bold text-slate-900">{item.label}</span>
                    <span className="mt-1 text-[11px] text-slate-500">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              {/* Feature Form Inputs */}
              <form onSubmit={handlePredictFeatures} className="space-y-4 lg:col-span-6">
                <h3 className="text-sm font-bold text-slate-900">
                  Six Model Feature Dimensions
                </h3>

                {/* missing_fields */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="missing_fields" className="text-xs font-bold text-slate-800">
                      missing_fields
                    </label>
                    <span className="font-mono text-xs font-bold text-indigo-600">
                      {features.missing_fields}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Count of mandatory admission columns left blank or unprovided
                  </p>
                  <input
                    id="missing_fields"
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={features.missing_fields}
                    onChange={(e) =>
                      setFeatures({ ...features, missing_fields: Number(e.target.value) })
                    }
                    className="mt-2 w-full accent-indigo-600"
                  />
                </div>

                {/* Toggle dimensions */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* duplicate_flag */}
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                      features.duplicate_flag === 1
                        ? 'border-indigo-400 bg-indigo-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">duplicate_flag</p>
                      <p className="text-[10px] text-slate-500">Intra-batch / cross-inst collision</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={features.duplicate_flag === 1}
                      onChange={(e) =>
                        setFeatures({ ...features, duplicate_flag: e.target.checked ? 1 : 0 })
                      }
                      className="h-4 w-4 rounded accent-indigo-600"
                    />
                  </label>

                  {/* invalid_id_format */}
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                      features.invalid_id_format === 1
                        ? 'border-indigo-400 bg-indigo-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">invalid_id_format</p>
                      <p className="text-[10px] text-slate-500">Malformed APAAR identifier</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={features.invalid_id_format === 1}
                      onChange={(e) =>
                        setFeatures({ ...features, invalid_id_format: e.target.checked ? 1 : 0 })
                      }
                      className="h-4 w-4 rounded accent-indigo-600"
                    />
                  </label>

                  {/* invalid_age */}
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                      features.invalid_age === 1
                        ? 'border-indigo-400 bg-indigo-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">invalid_age</p>
                      <p className="text-[10px] text-slate-500">Outside 15 - 60 years</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={features.invalid_age === 1}
                      onChange={(e) =>
                        setFeatures({ ...features, invalid_age: e.target.checked ? 1 : 0 })
                      }
                      className="h-4 w-4 rounded accent-indigo-600"
                    />
                  </label>

                  {/* invalid_department */}
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                      features.invalid_department === 1
                        ? 'border-indigo-400 bg-indigo-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">invalid_department</p>
                      <p className="text-[10px] text-slate-500">Unrecognized programme code</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={features.invalid_department === 1}
                      onChange={(e) =>
                        setFeatures({ ...features, invalid_department: e.target.checked ? 1 : 0 })
                      }
                      className="h-4 w-4 rounded accent-indigo-600"
                    />
                  </label>

                  {/* invalid_marks */}
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition sm:col-span-2 ${
                      features.invalid_marks === 1
                        ? 'border-indigo-400 bg-indigo-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">invalid_marks</p>
                      <p className="text-[10px] text-slate-500">
                        Percentage &lt; 0.00% or &gt; 100.00%
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={features.invalid_marks === 1}
                      onChange={(e) =>
                        setFeatures({ ...features, invalid_marks: e.target.checked ? 1 : 0 })
                      }
                      className="h-4 w-4 rounded accent-indigo-600"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={predictMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {predictMutation.isPending ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Evaluating through Model...</span>
                    </>
                  ) : (
                    <>
                      <span>Run ML Prediction (POST /api/ml/predict)</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </form>

              {/* Prediction Result Display */}
              <div className="lg:col-span-6">
                {predictMutation.isError && (
                  <div className="mb-4">
                    <ErrorAlert error={predictMutation.error} />
                  </div>
                )}

                {predictMutation.data ? (
                  <ResultCard data={predictMutation.data} />
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
                    <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <h4 className="mt-3 text-sm font-bold text-slate-800">
                      No Prediction Generated Yet
                    </h4>
                    <p className="mt-1 max-w-xs text-xs text-slate-500">
                      Adjust the six feature toggles on the left and click &ldquo;Run ML
                      Prediction&rdquo; or select a preset above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Full Student Record Input */
          <div>
            <form onSubmit={handleEvaluateRecord} className="space-y-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900">
                <p className="font-semibold">Interactive Record Validation Mode:</p>
                <p className="mt-0.5 text-blue-700">
                  Fill in realistic candidate fields. The platform deterministically validates
                  rules (format, range, required fields), automatically converts findings into the
                  6 model features, and passes them to the Random Forest model for inference.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* student_name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">Student Name</label>
                  <input
                    type="text"
                    value={studentForm.student_name ?? ''}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, student_name: e.target.value })
                    }
                    placeholder="e.g. Rahul Verma"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* apaar_id */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    APAAR ID (12 digits)
                  </label>
                  <input
                    type="text"
                    value={studentForm.apaar_id ?? ''}
                    onChange={(e) => setStudentForm({ ...studentForm, apaar_id: e.target.value })}
                    placeholder="e.g. 984512347890"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* dob */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">Date of Birth</label>
                  <input
                    type="date"
                    value={studentForm.dob ?? ''}
                    onChange={(e) => setStudentForm({ ...studentForm, dob: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* programme_code */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">Programme Code</label>
                  <input
                    type="text"
                    value={studentForm.programme_code ?? ''}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, programme_code: e.target.value })
                    }
                    placeholder="e.g. CSE, ECE, MECH"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 uppercase focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* qualifying_exam_pct */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    Qualifying Exam % Marks
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={studentForm.qualifying_exam_pct ?? ''}
                    onChange={(e) =>
                      setStudentForm({
                        ...studentForm,
                        qualifying_exam_pct: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="e.g. 85.5"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* duplicate toggle */}
                <div className="flex items-end">
                  <label className="flex h-[38px] w-full cursor-pointer items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
                    <span className="text-xs font-bold text-slate-700">Simulate Duplicate</span>
                    <input
                      type="checkbox"
                      checked={Boolean(studentForm.is_duplicate)}
                      onChange={(e) =>
                        setStudentForm({ ...studentForm, is_duplicate: e.target.checked })
                      }
                      className="h-4 w-4 rounded accent-indigo-600"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={recordMutation.isPending}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {recordMutation.isPending ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Validating & Running Model...</span>
                    </>
                  ) : (
                    <>
                      <span>Validate & Run Model (POST /api/ml/evaluate-record)</span>
                      <span>→</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStudentForm({
                      student_name: 'Ananya Sharma',
                      apaar_id: '999988887777',
                      apaar_opt_out: false,
                      dob: '2005-06-20',
                      programme_code: 'AI_ML',
                      qualifying_exam_pct: 91.2,
                      gender: 'female',
                      category: 'general',
                      seat_pool: 'regular',
                      domicile_state: 'KA',
                      is_duplicate: false,
                    })
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Load Valid Record
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStudentForm({
                      student_name: 'Vikram Rao',
                      apaar_id: '12345', // Malformed ID
                      apaar_opt_out: false,
                      dob: '1940-01-01', // Out of age
                      programme_code: 'INVALID_DEPT_XYZ',
                      qualifying_exam_pct: 125.0, // Invalid marks > 100
                      gender: 'male',
                      category: 'general',
                      seat_pool: 'regular',
                      domicile_state: 'DL',
                      is_duplicate: true,
                    })
                  }
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Load Multi-Anomaly Record
                </button>
              </div>
            </form>

            {recordMutation.isError && (
              <div className="mt-4">
                <ErrorAlert error={recordMutation.error} />
              </div>
            )}

            {recordMutation.data && (
              <div className="mt-8 space-y-6 border-t border-slate-200 pt-6">
                <h3 className="text-base font-bold text-slate-900">
                  Validation &amp; Model Output Breakdown
                </h3>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left: Deterministic findings */}
                  <div className="space-y-4 lg:col-span-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <h4 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                        Deterministic Findings ({recordMutation.data.deterministic_findings.length})
                      </h4>
                      {recordMutation.data.deterministic_findings.length === 0 ? (
                        <div className="mt-2 flex items-center gap-2 text-xs font-medium text-emerald-700">
                          <span className="text-emerald-500">✓</span> No deterministic validation
                          violations found.
                        </div>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {recordMutation.data.deterministic_findings.map((item, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                            >
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  item.severity === 'error'
                                    ? 'bg-red-100 text-red-800'
                                    : item.severity === 'warning'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-violet-100 text-violet-800'
                                }`}
                              >
                                {item.rule_code}
                              </span>
                              <span className="text-slate-700">{item.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Derived 6 features breakdown */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <h4 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                        Features Mapped for Model
                      </h4>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {Object.entries(recordMutation.data.features_derived).map(([k, v]) => (
                          <div
                            key={k}
                            className={`rounded-lg border p-2 text-center ${
                              Number(v) > 0
                                ? 'border-amber-300 bg-amber-50/50'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <p className="truncate text-[10px] text-slate-500">{k}</p>
                            <p
                              className={`text-sm font-bold ${
                                Number(v) > 0 ? 'text-amber-800' : 'text-slate-900'
                              }`}
                            >
                              {v}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: ML Prediction Card */}
                  <div className="lg:col-span-6">
                    <ResultCard data={recordMutation.data.prediction} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function ResultCard({ data }: { data: PredictionResponse }) {
  const isIssue = data.prediction === 1
  const scorePercent = Math.round(data.issue_probability * 100)

  return (
    <div
      className={`rounded-2xl border p-5 shadow-xs transition ${
        isIssue ? 'border-red-200 bg-red-50/30' : 'border-emerald-200 bg-emerald-50/30'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              isIssue ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${isIssue ? 'bg-red-500' : 'bg-emerald-500'}`}
            />
            {data.label}
          </span>
          <p className="mt-1 text-xs text-slate-500">{data.prototype_score_label}</p>
        </div>

        <div className="text-right">
          <span className="font-mono text-2xl font-extrabold text-slate-900 sm:text-3xl">
            {scorePercent}%
          </span>
          <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide">
            Issue Probability
          </span>
        </div>
      </div>

      {/* Progress Bar Visualizer */}
      <div className="mt-4">
        <div className="flex justify-between text-xs font-medium text-slate-600">
          <span>Clean Confidence: {Math.round(data.clean_probability * 100)}%</span>
          <span className={isIssue ? 'font-bold text-red-600' : 'font-bold text-emerald-600'}>
            Risk Score: {scorePercent}%
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full transition-all duration-500 ${
              isIssue ? 'bg-linear-to-r from-amber-500 to-red-600' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.max(scorePercent, 4)}%` }}
          />
        </div>
      </div>

      {/* Warnings & Diagnostics */}
      {data.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
          <p className="text-xs font-bold text-amber-900">Validation Warnings Generated:</p>
          <ul className="mt-1.5 space-y-1">
            {data.warnings.map((w, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-xs text-amber-800">
                <span className="text-amber-500">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Features Evaluated Summary */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5">
        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
          Six Dimensions Evaluated:
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {Object.entries(data.features_evaluated).map(([feat, val]) => (
            <div key={feat} className="flex items-center justify-between text-slate-600">
              <span className="font-mono text-[11px]">{feat}</span>
              <span
                className={`font-mono font-bold ${val > 0 ? 'text-amber-600' : 'text-slate-400'}`}
              >
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="mt-4 text-[10px] leading-relaxed text-slate-500 italic">
        * {data.disclaimer}
      </p>
    </div>
  )
}
