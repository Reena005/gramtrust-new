import { Route, Routes, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { ProjectsPage } from '@/features/projects/projects-page';
import { ProjectDetailsPage } from '@/features/projects/project-details-page';
import { BlockchainVerificationPage } from '@/features/verification/blockchain-verification-page';
import { IntegrityReportPage } from '@/features/reports/integrity-report-page';
import { AdminPanelPage } from '@/features/admin/admin-panel-page';
import { LoginPage } from '@/features/auth/login-page';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { CitizenDashboard } from '@/features/dashboard/citizen-dashboard';
import { OfficialDashboard } from '@/features/dashboard/official-dashboard';
import { AdminDashboard } from '@/features/dashboard/admin-dashboard';
import { TamperLogsPage } from '@/features/admin/tamper-logs-page';
import { TendersPage } from '@/features/tenders/tenders-page';
import { TenderDetailsPage } from '@/features/tenders/tender-details-page';
import { GovernmentSourcesPage } from '@/features/sources/government-sources-page';
import { VendorsPage } from '@/features/vendors/vendors-page';
import { DocumentsPage } from '@/features/documents/documents-page';
import { useAuth } from '@/features/auth/auth-context';

/** Redirect logged-in users from / to their role-specific dashboard */
function RoleRedirect() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'ADMIN') {
    return <Navigate to="/admin-dashboard" replace />;
  }

  if (user?.role === 'OFFICIAL') {
    return <Navigate to="/official" replace />;
  }

  return <Navigate to="/citizen" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Root: redirect by role */}
      <Route path="/" element={<RoleRedirect />} />

      {/* Protected shell — ALL authenticated users */}
      <Route
        element={
          <ProtectedRoute
            roles={['CITIZEN', 'OFFICIAL', 'ADMIN', 'AUDITOR']}
          />
        }
      >
        <Route element={<AppShell />}>

          {/* Role-specific dashboards */}
          <Route path="/citizen" element={<CitizenDashboard />} />
          <Route path="/official" element={<OfficialDashboard />} />
          <Route path="/admin-dashboard" element={<AdminDashboard />} />

          {/* Common data pages — all roles */}
          <Route path="/projects" element={<ProjectsPage />} />
          <Route
            path="/projects/:projectId"
            element={<ProjectDetailsPage />}
          />
          <Route
            path="/verification"
            element={<BlockchainVerificationPage />}
          />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tamper-logs" element={<TamperLogsPage />} />

          {/* Document Integrity Verification Module — all roles */}
          <Route path="/documents" element={<DocumentsPage />} />

          {/* Tender & Vendor Transparency Module — all authenticated */}
          <Route path="/tenders" element={<TendersPage />} />
          <Route path="/tenders/:id" element={<TenderDetailsPage />} />
          <Route path="/vendors" element={<VendorsPage />} />

          {/* OFFICIAL + ADMIN + AUDITOR only */}
          <Route
            element={
              <ProtectedRoute
                roles={['OFFICIAL', 'ADMIN', 'AUDITOR']}
              />
            }
          >
            <Route
              path="/integrity-report"
              element={<IntegrityReportPage />}
            />
            <Route
              path="/sources"
              element={<GovernmentSourcesPage />}
            />
          </Route>

          {/* ADMIN only */}
          <Route
            element={<ProtectedRoute roles={['ADMIN']} />}
          >
            <Route path="/admin" element={<AdminPanelPage />} />
          </Route>

        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}