import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { useApplyTheme } from '@/components/layout/ThemeToggle';
import { DatabaseGate } from './providers/DatabaseGate';
import { DisclaimerGate } from './providers/DisclaimerGate';
import { ErrorBoundary } from './providers/ErrorBoundary';
import { PwaManager } from './providers/PwaManager';
import { router } from './router';

function ThemedApp() {
  const dark = useApplyTheme();
  return (
    <>
      <DisclaimerGate>
        <RouterProvider router={router} />
      </DisclaimerGate>
      <Toaster theme={dark ? 'dark' : 'light'} position="top-right" richColors closeButton />
      <PwaManager />
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary context="app">
      <DatabaseGate>
        <ThemedApp />
      </DatabaseGate>
    </ErrorBoundary>
  );
}
