import * as React from 'react';
import { audit } from '@/database/repositories/audit';
import { closeDatabase } from '@/database/db';
import { useAssessmentDraft } from '@/stores/assessmentDraft';
import { useUiStore } from '@/stores/ui';
import { describeError, logTechnicalError } from '@/utils/logger';
import { clearSession, createSession, getAccount, loadSession, saveSession, signIn as signInAccount, signUp as signUpAccount, type PublicAccount, type Session, type SignUpInput } from './accounts';

type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  signIn: (email: string, password: string, keepSignedIn: boolean) => Promise<void>;
  signUp: (input: SignUpInput, keepSignedIn: boolean) => Promise<{ adoptedExistingData: boolean }>;
  signOut: () => Promise<void>;
  /** Updates the session after the profile was edited. */
  refreshProfile: (account: PublicAccount) => void;
  /** Ends the session without touching the (already deleted) database. */
  endSession: () => void;
  /** Called by the app once the account database is open: records a fresh sign-in in its audit log. */
  onDatabaseOpened: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Clears per-account UI state so nothing of the previous account is shown to the next one. */
function resetAccountState() {
  useUiStore.getState().setActivePatientId(null);
  useAssessmentDraft.getState().reset();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const pendingAudit = React.useRef<'sign-in' | 'sign-up' | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available in this browser (private mode may disable it).');
        const s = loadSession();
        const account = s ? await getAccount(s.userId) : null;
        if (cancelled) return;
        if (s && account && account.dbName === s.dbName) {
          setSession({ ...s, displayName: account.displayName, role: account.role, email: account.email });
          setStatus('signed-in');
        } else {
          if (s) clearSession();
          setStatus('signed-out');
        }
      } catch (e) {
        logTechnicalError('restore session', e);
        if (!cancelled) {
          setError(describeError(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const begin = React.useCallback((account: PublicAccount, keep: boolean, kind: 'sign-in' | 'sign-up') => {
    resetAccountState();
    pendingAudit.current = kind;
    setSession(createSession(account, keep));
    setStatus('signed-in');
  }, []);

  const signIn = React.useCallback(
    async (email: string, password: string, keep: boolean) => {
      begin(await signInAccount(email, password), keep, 'sign-in');
    },
    [begin],
  );

  const signUp = React.useCallback(
    async (input: SignUpInput, keep: boolean) => {
      const { account, adoptedExistingData } = await signUpAccount(input);
      begin(account, keep, 'sign-up');
      return { adoptedExistingData };
    },
    [begin],
  );

  const endSession = React.useCallback(() => {
    clearSession();
    resetAccountState();
    setSession(null);
    setStatus('signed-out');
  }, []);

  const signOut = React.useCallback(async () => {
    if (session) {
      try {
        await audit('sign-out', 'account', session.userId);
      } catch (e) {
        logTechnicalError('audit sign-out', e);
      }
    }
    closeDatabase();
    endSession();
  }, [session, endSession]);

  const refreshProfile = React.useCallback((a: PublicAccount) => {
    setSession((s) => {
      if (!s || s.userId !== a.id) return s;
      const next = { ...s, displayName: a.displayName, role: a.role };
      saveSession(next);
      return next;
    });
  }, []);

  const userId = session?.userId;
  const onDatabaseOpened = React.useCallback(async () => {
    const kind = pendingAudit.current;
    pendingAudit.current = null;
    if (kind && userId) await audit(kind, 'account', userId);
  }, [userId]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ status, session, error, signIn, signUp, signOut, refreshProfile, endSession, onDatabaseOpened }),
    [status, session, error, signIn, signUp, signOut, refreshProfile, endSession, onDatabaseOpened],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
