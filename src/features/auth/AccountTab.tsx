import { KeyRound, LogOut, Trash2, UserRound } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DefinitionList } from '@/components/ui/stat';
import { closeDatabase } from '@/database/db';
import { useFormatters } from '@/hooks/useFormatters';
import { describeError } from '@/utils/logger';
import { AuthError, changePassword, deleteAccount, getAccount, updateProfile, type PublicAccount } from './accounts';
import { useAuth } from './AuthProvider';
import { PASSWORD_MIN_LENGTH, passwordProblem } from './password';

const message = (e: unknown) => (e instanceof AuthError ? e.message : describeError(e));

export function AccountTab() {
  const { session, refreshProfile, signOut } = useAuth();
  const f = useFormatters();
  const [account, setAccount] = React.useState<PublicAccount | null>(null);
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    if (!session) return;
    void getAccount(session.userId).then((a) => {
      setAccount(a);
      if (a) {
        setName(a.displayName);
        setRole(a.role);
      }
    });
  }, [session]);

  if (!session || !account) return null;
  const dirty = name.trim() !== account.displayName || role.trim() !== account.role;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4" /> Profile
          </CardTitle>
          <CardDescription>Your name is shown in the header. Records are not changed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                const a = await updateProfile(account.id, { displayName: name, role });
                setAccount(a);
                refreshProfile(a);
                toast.success('Profile saved.');
              } catch (err) {
                toast.error('Profile not saved.', { description: message(err) });
              } finally {
                setSaving(false);
              }
            }}
          >
            <Field label="Full name" htmlFor="acc-name" required>
              <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </Field>
            <Field label="Role" htmlFor="acc-role">
              <Input id="acc-role" value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!dirty || saving || !name.trim()}>
                Save profile
              </Button>
            </div>
          </form>
          <DefinitionList
            items={[
              { label: 'Email', value: account.email },
              { label: 'Account created', value: f.dateTime(account.createdAt) },
              { label: 'Last sign-in', value: account.lastLoginAt ? f.dateTime(account.lastLoginAt) : '—' },
              { label: 'Stored in', value: 'This browser on this device' },
            ]}
          />
        </CardContent>
      </Card>

      <ChangePasswordCard account={account} />

      <Card>
        <CardHeader>
          <CardTitle>About accounts on this device</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Each account has its own separate set of patients, records, settings and verified references.</li>
            <li>Accounts and records stay in this browser. Signing up on another device creates a different, empty account there. Use Backup &amp; restore to move records.</li>
            <li>There is no password reset, because nothing is stored outside this browser. Keep regular backups.</li>
            <li>Sign-in limits who can use the app here, but the stored data is not encrypted. Protect the device with a screen lock and an encrypted disk.</li>
          </ul>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </CardContent>
      </Card>

      <Card className="border-danger/30">
        <CardHeader>
          <CardTitle className="text-danger">Delete account</CardTitle>
          <CardDescription>Permanently removes this account and every patient and record in it from this browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive-outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete account…
          </Button>
        </CardContent>
      </Card>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} account={account} />
    </div>
  );
}

function ChangePasswordCard({ account }: { account: PublicAccount }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const problem = next ? passwordProblem(next, account.email) : null;
  const mismatch = confirm.length > 0 && confirm !== next;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Change password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (problem) return setError(problem);
            if (mismatch || next !== confirm) return setError('The new passwords do not match.');
            setBusy(true);
            try {
              await changePassword(account.id, current, next);
              setCurrent('');
              setNext('');
              setConfirm('');
              toast.success('Password changed.');
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Current password" htmlFor="acc-current" required>
            <Input id="acc-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="New password" htmlFor="acc-new" required hint={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers.`} error={problem ?? undefined}>
            <Input id="acc-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm new password" htmlFor="acc-confirm" required error={mismatch ? 'The new passwords do not match.' : undefined}>
            <Input id="acc-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          {error && <Alert variant="danger">{error}</Alert>}
          <Button type="submit" disabled={busy || !current || !next || !confirm}>
            {busy ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteAccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account: PublicAccount }) {
  const { endSession } = useAuth();
  const [password, setPassword] = React.useState('');
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) {
      setPassword('');
      setTyped('');
      setError(null);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent title="Delete this account?" size="sm" role="alertdialog">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>All patients, assessments, fluid, intake/output, monitoring and photo records of this account are deleted from this browser.</li>
          <li>Settings and verified references of this account are deleted.</li>
          <li>This cannot be undone. Export a backup first if you may need the records.</li>
        </ul>
        <div className="mt-4 space-y-3">
          <Field label="Password" htmlFor="del-password" required>
            <Input id="del-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={<>Type <strong>DELETE</strong> to confirm</>} htmlFor="del-typed" required>
            <Input id="del-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          {error && <Alert variant="danger">{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !password || typed.trim() !== 'DELETE'}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await deleteAccount(account.id, password, closeDatabase);
                toast.success('Account deleted.', { description: 'The account and its records were removed from this browser.' });
                endSession();
              } catch (err) {
                setError(message(err));
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
