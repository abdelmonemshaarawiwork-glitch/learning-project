import * as React from 'react';
import { Button } from './button';
import { Dialog, DialogContent, DialogFooter } from './dialog';
import { Input } from './input';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Bullet list of consequences shown to the user. */
  consequences?: React.ReactNode[];
  confirmLabel?: string;
  destructive?: boolean;
  /** When set, the user must type this text to enable the confirm button. */
  requireText?: string;
  onConfirm: () => void | Promise<void>;
}

/** Confirmation dialog that explains consequences; optionally requires typing a phrase. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel = 'Confirm',
  destructive = false,
  requireText,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);
  const blocked = requireText !== undefined && typed.trim() !== requireText;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent title={title} size="sm" role="alertdialog">
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
        {consequences && consequences.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {requireText !== undefined && (
          <div className="mt-4 space-y-1.5">
            <label htmlFor="confirm-text" className="text-sm">
              Type <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">{requireText}</span> to confirm
            </label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={blocked || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
