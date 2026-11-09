import { Activity, Eye, EyeOff, Flame, HardDrive, KeyRound, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Checkbox, Input } from '@/components/ui/input';
import { APP_NAME, APP_VERSION, CLINICAL_DISCLAIMER } from '@/constants/clinical';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';
import { describeError } from '@/utils/logger';
import { AuthError } from './accounts';
import { useAuth } from './AuthProvider';
import { PASSWORD_MIN_LENGTH, passwordProblem, passwordStrength } from './password';

type Mode = 'sign-in' | 'sign-up';

/** Before sign-in there are no saved preferences, so the screen follows the device theme. */
function useDeviceTheme() {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
}

const FEATURES = [
  { icon: Activity, text: 'TBSA assessment, 3D body mapping, fluids, intake/output and monitoring' },
  { icon: HardDrive, text: 'Each account keeps its own patients and records, stored only in this browser' },
  { icon: Lock, text: 'Passwords are kept only as salted PBKDF2 hashes, never as plain text' },
];

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        className="pr-10"
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

const STRENGTH = ['Too short', 'Fair', 'Good', 'Strong', 'Very strong'];
const STRENGTH_COLOR = ['bg-danger', 'bg-warning', 'bg-warning', 'bg-success', 'bg-success'];

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const s = password.length < PASSWORD_MIN_LENGTH ? 0 : Math.max(1, passwordStrength(password));
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full bg-muted', i < Math.max(1, s) && STRENGTH_COLOR[s])} />
        ))}
      </div>
      <span className="w-20 text-right text-xs text-muted-foreground">{STRENGTH[s]}</span>
    </div>
  );
}

export function AuthScreen() {
  useDeviceTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = React.useState<Mode>('sign-in');
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [keep, setKeep] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showForgot, setShowForgot] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setTouched(false);
    setPassword('');
    setConfirm('');
    setShowForgot(false);
  };

  const signUpProblem = mode === 'sign-up' ? (password ? passwordProblem(password, email.trim().toLowerCase()) : null) : null;
  const mismatch = mode === 'sign-up' && confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (mode === 'sign-up') {
      if (signUpProblem) return setError(signUpProblem);
      if (password !== confirm) return setError('The passwords do not match.');
    }
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        await signIn(email, password, keep);
      } else {
        const { adoptedExistingData } = await signUp({ displayName: name, email, password, role }, keep);
        toast.success('Account created.', {
          description: adoptedExistingData ? 'Records already saved in this browser were added to your account.' : 'Your account and its records are stored in this browser only.',
        });
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : describeError(err));
      setBusy(false);
    }
  }

  const heading = mode === 'sign-in' ? 'Sign in' : 'Create your account';
  return (
    <div data-testid="auth-screen" className="flex min-h-dvh bg-background text-foreground">
      {/* Brand panel (wide screens) */}
      <aside className="relative hidden w-[44%] max-w-[620px] flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full bg-[#1d6ae5]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 size-[380px] rounded-full bg-[#e5532d]/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-[#1d6ae5]/15 text-[#6aa2f7] ring-1 ring-[#6aa2f7]/25">
            <Flame className="size-6" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-wide text-white">{APP_NAME}</p>
            <p className="text-xs text-sidebar-muted">Burn assessment &amp; ICU management</p>
          </div>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-3xl leading-tight font-semibold text-balance text-white">Structured burn care documentation, at the bedside.</h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex gap-3 text-sm leading-relaxed">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-[#8db7f8] ring-1 ring-white/10">
                  <f.icon className="size-4" aria-hidden />
                </span>
                <span className="pt-1.5">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] leading-relaxed text-sidebar-muted">{CLINICAL_DISCLAIMER}</p>
      </aside>

      {/* Form */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Flame className="size-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="font-bold tracking-wide">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">Burn assessment &amp; ICU management</p>
          </div>
        </div>

        <div className="w-full max-w-[420px]">
          <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1">
            {(['sign-in', 'sign-up'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cn(
                  'h-9 rounded-lg text-sm font-medium text-muted-foreground transition-colors',
                  mode === m && 'bg-card text-foreground shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10',
                )}
              >
                {m === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'sign-in' ? 'Welcome back. Enter the email and password of your account on this browser.' : 'Your account and records are kept in this browser on this device.'}
          </p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4" noValidate aria-label={heading}>
            {mode === 'sign-up' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="auth-name" required className="sm:col-span-2">
                  <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} />
                </Field>
                <Field label="Role (optional)" htmlFor="auth-role" className="sm:col-span-2" hint="For example: Burns registrar, ICU nurse.">
                  <Input id="auth-role" value={role} onChange={(e) => setRole(e.target.value)} autoComplete="organization-title" maxLength={120} />
                </Field>
              </div>
            )}
            <Field label="Email" htmlFor="auth-email" required>
              <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={mode === 'sign-in' ? 'username' : 'email'} inputMode="email" required />
            </Field>
            <Field
              label="Password"
              htmlFor="auth-password"
              required
              hint={mode === 'sign-up' ? `At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers.` : undefined}
              error={mode === 'sign-up' && touched && signUpProblem ? signUpProblem : undefined}
            >
              <PasswordInput id="auth-password" value={password} onChange={setPassword} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} invalid={touched && !!signUpProblem} />
              {mode === 'sign-up' && <StrengthMeter password={password} />}
            </Field>
            {mode === 'sign-up' && (
              <Field label="Confirm password" htmlFor="auth-confirm" required error={mismatch ? 'The passwords do not match.' : undefined}>
                <PasswordInput id="auth-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={mismatch} />
              </Field>
            )}

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                Keep me signed in on this device
              </label>
              {mode === 'sign-in' && (
                <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setShowForgot((v) => !v)} aria-expanded={showForgot}>
                  Forgot password?
                </button>
              )}
            </div>
            {showForgot && (
              <Alert variant="info" title="No password reset is possible">
                Accounts exist only in this browser, so there is no email reset. If you have a backup file, create a new account and restore the backup in Settings → Backup &amp; restore.
              </Alert>
            )}
            {error && (
              <Alert variant="danger" role="alert" data-testid="auth-error">
                {error}
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="auth-submit">
              {mode === 'sign-in' ? <KeyRound /> : <UserPlus />}
              {busy ? (mode === 'sign-in' ? 'Signing in…' : 'Creating account…') : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'sign-in' ? 'New here? ' : 'Already have an account? '}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
              {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
            </button>
          </p>

          <div className="mt-8 flex gap-3 rounded-xl border bg-card p-3.5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              Nothing is sent to a server. An account created here works only in this browser on this device; to move records to another device, use a backup file. Sign-in limits who can open the app here, but the browser's stored data is not encrypted: protect the device with a screen lock.
            </p>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            {APP_NAME} v{APP_VERSION} · Decision support only
          </p>
        </div>
      </main>
    </div>
  );
}
