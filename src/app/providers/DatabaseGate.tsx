import { Database } from 'lucide-react';
import * as React from 'react';
import { initialiseDatabase, requestPersistentStorage } from '@/database/bootstrap';
import { Spinner } from '@/components/ui/states';
import { describeError, logTechnicalError } from '@/utils/logger';
import { useAssessmentDraft } from '@/stores/assessmentDraft';

interface DatabaseGateProps {
  children: React.ReactNode;
  /** IndexedDB database of the signed-in account. */
  dbName?: string;
  /** Called once the database is open (e.g. to record the sign-in in the audit log). */
  onOpened?: () => Promise<void> | void;
}

/** Opens IndexedDB (running migrations) before rendering the app. */
export function DatabaseGate({ children, dbName, onOpened }: DatabaseGateProps) {
  const [state, setState] = React.useState<{ status: 'loading' | 'ready' | 'error'; message?: string }>({ status: 'loading' });
  const loadDraft = useAssessmentDraft((s) => s.load);

  const init = React.useCallback(async () => {
    setState({ status: 'loading' });
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available in this browser (private mode may disable it).');
      await initialiseDatabase(dbName);
      await loadDraft();
      try {
        await onOpened?.();
      } catch (e) {
        logTechnicalError('database opened callback', e);
      }
      void requestPersistentStorage();
      setState({ status: 'ready' });
    } catch (e) {
      logTechnicalError('database init', e);
      setState({ status: 'error', message: describeError(e) });
    }
  }, [loadDraft, dbName, onOpened]);

  React.useEffect(() => {
    void init();
  }, [init]);

  if (state.status === 'ready') return <>{children}</>;
  if (state.status === 'loading')
    return (
      <div className="grid min-h-dvh place-items-center bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 text-sm">
          <Spinner /> Opening local database…
        </div>
      </div>
    );
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <div role="alert" className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <Database className="mx-auto size-8 text-danger" />
        <h1 className="mt-3 text-lg font-semibold">The local database could not be opened</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <ul className="mt-3 list-disc pl-5 text-left text-sm text-muted-foreground">
          <li>Close other BurnMatrix tabs or windows and try again.</li>
          <li>Private/incognito browsing may block local storage.</li>
          <li>Check that the device has free storage space.</li>
        </ul>
        <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => void init()}>
          Try again
        </button>
      </div>
    </div>
  );
}
