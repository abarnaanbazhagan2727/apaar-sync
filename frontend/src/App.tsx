import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AictePage from './pages/aicte'
import BlindMatchPage from './pages/blindmatch'
import HomePage from './pages/home'
import InstitutionPage from './pages/institution'
import LoginPage from './pages/login'
import MapPage from './pages/map'
import StudentPage from './pages/student'
import VerifierPage from './pages/verifier'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route
          path="institution/*"
          element={
            <ProtectedRoute allowedRoles={['institution_admin', 'institution_operator']}>
              <InstitutionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="aicte/*"
          element={
            <ProtectedRoute allowedRoles={['aicte_admin', 'auditor']}>
              <AictePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="blindmatch/*"
          element={
            <ProtectedRoute allowedRoles={['aicte_admin', 'auditor']}>
              <BlindMatchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="map"
          element={
            <ProtectedRoute allowedRoles={['aicte_admin', 'auditor']}>
              <MapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="student/*"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentPage />
            </ProtectedRoute>
          }
        />
        <Route path="verifier/*" element={<VerifierPage />} />
        <Route path="*" element={<p className="p-8 text-center text-slate-500">Page not found.</p>} />
      </Route>
    </Routes>
  )
}
