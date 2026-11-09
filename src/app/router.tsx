import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, createMemoryRouter, Link, useRouteError } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/ui/states';
import { ErrorBoundary } from './providers/ErrorBoundary';

function page(loader: () => Promise<{ default: ComponentType }>) {
  const C = lazy(loader);
  return (
    <ErrorBoundary context="route">
      <Suspense fallback={<LoadingState />}>
        <C />
      </Suspense>
    </ErrorBoundary>
  );
}

function RouteError() {
  const error = useRouteError() as Error | undefined;
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-6 text-center">
      <h1 className="text-lg font-semibold">Page could not be loaded</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error?.message ?? 'Unknown error'}</p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-primary underline">
        Back to dashboard
      </Link>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link to="/" className="mt-3 inline-block text-sm text-primary underline">
        Go to dashboard
      </Link>
    </div>
  );
}

const routes = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(() => import('@/features/dashboard/DashboardPage')) },
      { path: 'patients', element: page(() => import('@/features/patients/PatientsListPage')) },
      { path: 'patients/new', element: page(() => import('@/features/patients/PatientFormPage')) },
      { path: 'patients/:id', element: page(() => import('@/features/patients/PatientProfilePage')) },
      { path: 'patients/:id/edit', element: page(() => import('@/features/patients/PatientFormPage')) },
      { path: 'assessment', element: page(() => import('@/features/burn-assessment/AssessmentWorkflowPage')) },
      { path: 'assessment/photos', element: page(() => import('@/features/photo-assessment/PhotoAssessmentPage')) },
      { path: 'assessment/history', element: page(() => import('@/features/burn-assessment/AssessmentHistoryPage')) },
      { path: 'assessment/:id', element: page(() => import('@/features/burn-assessment/AssessmentDetailPage')) },
      { path: 'body-map', element: page(() => import('@/features/body-mapping/BodyMappingPage')) },
      { path: 'fluids', element: page(() => import('@/features/fluid-management/FluidManagementPage')) },
      { path: 'intake-output', element: page(() => import('@/features/intake-output/IntakeOutputPage')) },
      { path: 'intake-output/urine-output', element: page(() => import('@/features/urine-output/UrineOutputPage')) },
      { path: 'monitoring', element: page(() => import('@/features/clinical-monitoring/MonitoringPage')) },
      { path: 'timeline', element: page(() => import('@/features/timeline/TimelinePage')) },
      { path: 'reports', element: page(() => import('@/features/reports/ReportsPage')) },
      { path: 'settings', element: page(() => import('@/features/settings/SettingsPage')) },
      { path: '*', element: <NotFound /> },
    ],
  },
];

/** The hosted preview keeps navigation in memory (its frame cannot use URL paths). */
export const router = import.meta.env.VITE_TARGET === 'artifact' ? createMemoryRouter(routes) : createBrowserRouter(routes);
