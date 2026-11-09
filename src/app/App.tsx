import { CircleAlert } from 'lucide-react';
import * as React from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { useApplyTheme } from '@/components/layout/ThemeToggle';
import { Spinner } from '@/components/ui/states';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { DatabaseGate } from './providers/DatabaseGate';
import { DisclaimerGate } from './providers/DisclaimerGate';
import { ErrorBoundary } from './providers/ErrorBoundary';
import { PwaManager } from './providers/PwaManager';
import { router } from './router';

function ThemedApp() {
  useApplyTheme();
  return (
    <>
      <DisclaimerGate>
        <RouterProvider router={router} />
      </DisclaimerGate>
      <PwaManager />
    </>
  );
}

/** Follows the `dark` class on <html> (set by the account theme or, before sign-in, the device). */
function useHtmlDark() {
  return React.useSyncExternalStore(
    (cb) => {
      const o = new MutationObserver(cb);
      o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => o.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

function AuthGate() {
  const { status, session, error, onDatabaseOpened } = useAuth();

  // When an account signs out (or another signs in), start the next session on the dashboard.
  const previousUser = React.useRef<string | null>(null);
  const userId = session?.userId ?? null;
  React.useEffect(() => {
    if (previousUser.current && previousUser.current !== userId) void router.navigate('/', { replace: true });
    previousUser.current = userId;
  }, [userId]);

  if (status === 'loading')
    return (
      <div className="grid min-h-dvh place-items-center bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 text-sm">
          <Spinner /> Starting…
        </div>
      </div>
    );
  if (status === 'error')
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-4">
        <div role="alert" className="max-w-md rounded-2xl border bg-card p-6 text-center">
          <CircleAlert className="mx-auto size-8 text-danger" />
          <h1 className="mt-3 text-lg font-semibold">Local storage is not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">Private or incognito browsing may block it. Open the app in a normal browser window.</p>
        </div>
      </div>
    );
  if (!session) return <AuthScreen />;
  return (
    <DatabaseGate key={session.userId} dbName={session.dbName} onOpened={onDatabaseOpened}>
      <ThemedApp />
    </DatabaseGate>
  );
}

export function App() {
  const dark = useHtmlDark();
  return (
    <ErrorBoundary context="app">
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
      <Toaster theme={dark ? 'dark' : 'light'} position="top-right" richColors closeButton />
    </ErrorBoundary>
  );
}
