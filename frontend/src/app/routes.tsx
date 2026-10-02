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

/**
 * Redirect logged-in users from / to their role-specific dashboard
 */
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
      {/* =========================================================
          PUBLIC ROUTES
         ========================================================= */}

      <Route path="/login" element={<LoginPage />} />

      {/* Root: redirect by role */}
      <Route path="/" element={<RoleRedirect />} />


      {/* =========================================================
          PROTECTED ROUTES
          ALL AUTHENTICATED USERS
         ========================================================= */}

      <Route
        element={
          <ProtectedRoute
            roles={['CITIZEN', 'OFFICIAL', 'ADMIN', 'AUDITOR']}
          />
        }
      >
        <Route element={<AppShell />}>

          {/* =====================================================
              ROLE-SPECIFIC DASHBOARDS
             ===================================================== */}

          <Route
            path="/citizen"
            element={<CitizenDashboard />}
          />

          <Route
            path="/official"
            element={<OfficialDashboard />}
          />

          <Route
            path="/admin-dashboard"
            element={<AdminDashboard />}
          />


          {/* =====================================================
              COMMON DATA PAGES
              ALL AUTHENTICATED USERS
             ===================================================== */}

          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          <Route
            path="/projects"
            element={<ProjectsPage />}
          />

          <Route
            path="/projects/:projectId"
            element={<ProjectDetailsPage />}
          />

          <Route
            path="/verification"
            element={<BlockchainVerificationPage />}
          />

          <Route
            path="/tamper-logs"
            element={<TamperLogsPage />}
          />

          <Route
            path="/documents"
            element={<DocumentsPage />}
          />

          <Route
            path="/tenders"
            element={<TendersPage />}
          />

          <Route
            path="/tenders/:id"
            element={<TenderDetailsPage />}
          />

          <Route
            path="/vendors"
            element={<VendorsPage />}
          />


          {/* =====================================================
              INTEGRITY REPORT
              MOVED HERE SO IT CAN RENDER FOR ANY AUTHENTICATED
              USER INSTEAD OF BEING BLOCKED BY A SECOND
              ProtectedRoute
             ===================================================== */}

          <Route
            path="/integrity-report"
            element={<IntegrityReportPage />}
          />


          {/* =====================================================
              GOVERNMENT SOURCES
              OFFICIAL + ADMIN + AUDITOR
             ===================================================== */}

          <Route
            element={
              <ProtectedRoute
                roles={['OFFICIAL', 'ADMIN', 'AUDITOR']}
              />
            }
          >
            <Route
              path="/sources"
              element={<GovernmentSourcesPage />}
            />
          </Route>


          {/* =====================================================
              ADMIN ONLY
             ===================================================== */}

          <Route
            element={
              <ProtectedRoute
                roles={['ADMIN']}
              />
            }
          >
            <Route
              path="/admin"
              element={<AdminPanelPage />}
            />
          </Route>

        </Route>
      </Route>


      {/* =========================================================
          CATCH-ALL
         ========================================================= */}

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}