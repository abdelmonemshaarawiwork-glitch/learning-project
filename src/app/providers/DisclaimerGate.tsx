import { ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/input';
import { APP_NAME, CLINICAL_DISCLAIMER } from '@/constants/clinical';
import { useSettings } from '@/hooks/useSettings';
import { nowIso } from '@/utils/dates';

export const PRIVACY_POINTS = [
  'All patient data is stored only in this browser on this device (IndexedDB). Nothing is sent to any server, and there are no analytics or tracking scripts.',
  'Data is NOT synchronised between devices or browsers. Each account on this browser has its own separate records; signing in limits who can use the app here but does not encrypt anything.',
  'Data stored in IndexedDB is not encrypted by the application. Protect the device with a screen lock and an encrypted disk.',
  'Clearing browser data, uninstalling the app or resetting the device can permanently delete records. Export regular backups (Settings → Backup & restore).',
  'Clinical reference datasets and fluid protocols are shipped NOT CONFIGURED and must be verified by a qualified clinician before any calculation is enabled.',
];

export function DisclaimerGate({ children }: { children: React.ReactNode }) {
  const { settings, loaded, update } = useSettings();
  const [checked, setChecked] = React.useState(false);
  if (!loaded) return null;
  if (settings.disclaimerAcknowledgedAt) return <>{children}</>;
  return (
    <div className="grid min-h-dvh place-items-center bg-sidebar p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="disclaimer-title" className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent p-2 text-accent-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <h1 id="disclaimer-title" className="text-lg font-semibold">
              Welcome to {APP_NAME}
            </h1>
            <p className="text-sm text-muted-foreground">Please read before use</p>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-warning-soft p-3 text-sm font-medium text-warning">{CLINICAL_DISCLAIMER}</p>
        <h2 className="mt-4 text-sm font-semibold">Privacy &amp; local storage</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {PRIVACY_POINTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <label className="mt-5 flex items-start gap-2 text-sm">
          <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span>I understand that this is decision-support software, that outputs require review by a qualified healthcare professional, and how my data is stored.</span>
        </label>
        <Button className="mt-4 w-full" disabled={!checked} onClick={() => void update('disclaimerAcknowledgedAt', nowIso())}>
          I understand — continue
        </Button>
      </div>
    </div>
  );
}
