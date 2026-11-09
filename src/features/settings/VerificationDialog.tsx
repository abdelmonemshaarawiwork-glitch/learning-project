import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { ATTESTATION_TEXT, type VerificationInput } from '@/database/repositories/references';
import { describeError } from '@/utils/logger';

/** Records a clinician's verification of a reference dataset or protocol. */
export function VerificationDialog({
  open,
  onOpenChange,
  title,
  summary,
  onVerify,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  summary: React.ReactNode;
  onVerify: (v: VerificationInput) => Promise<void>;
}) {
  const [verifiedBy, setBy] = useState('');
  const [role, setRole] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = verifiedBy.trim() && role.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date) && confirmed;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description="Verification enables this configuration for clinical calculations on this device." size="lg">
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">{summary}</div>
          <Alert variant="warning">
            Only verify after comparing <strong>every value</strong> with the cited primary source and your institutional policy. The application records a cryptographic hash of the
            verified content; any later change automatically invalidates the verification.
          </Alert>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Verified by (name)" htmlFor="v-by" required>
              <Input id="v-by" value={verifiedBy} onChange={(e) => setBy(e.target.value)} />
            </Field>
            <Field label="Role / qualification" htmlFor="v-role" required>
              <Input id="v-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Burns consultant" />
            </Field>
            <Field label="Date of verification" htmlFor="v-date" required>
              <Input id="v-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor="v-notes">
            <Textarea id="v-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. compared against hospital burns protocol v3, page 4" />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" data-testid="verify-attest" />
            <span>{ATTESTATION_TEXT}</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || busy}
            data-testid="verify-confirm"
            onClick={async () => {
              setBusy(true);
              try {
                await onVerify({ verifiedBy, role, verificationDate: date, notes, attestationConfirmed: confirmed });
                toast.success('Verification recorded.');
                onOpenChange(false);
              } catch (e) {
                toast.error('Verification failed.', { description: describeError(e) });
              } finally {
                setBusy(false);
              }
            }}
          >
            <ShieldCheck /> Record verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SourceList({ sources }: { sources: { citation: string; doi?: string; pmid?: string; note?: string }[] }) {
  if (!sources.length) return <p className="text-sm text-muted-foreground">No source recorded.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {sources.map((s) => (
        <li key={s.citation}>
          <p>{s.citation}</p>
          <p className="text-xs text-muted-foreground">
            {s.doi && <>DOI: {s.doi} </>}
            {s.pmid && <>· PMID: {s.pmid}</>}
          </p>
          {s.note && <p className="text-xs text-warning">{s.note}</p>}
        </li>
      ))}
    </ul>
  );
}
