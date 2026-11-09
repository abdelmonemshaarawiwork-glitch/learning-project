import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { CLINICAL_DISCLAIMER } from '@/constants/clinical';
import type { ConfigurationStatus } from '@/types/domain';
import { cn } from '@/utils/cn';

export function ConfigStatusBadge({ status, className }: { status: ConfigurationStatus; className?: string }) {
  if (status === 'verified')
    return (
      <Badge variant="success" className={className}>
        <ShieldCheck aria-hidden /> Verified
      </Badge>
    );
  if (status === 'retired')
    return (
      <Badge variant="neutral" className={className}>
        Retired
      </Badge>
    );
  return (
    <Badge variant="warning" className={cn('font-semibold tracking-wide', className)}>
      <ShieldAlert aria-hidden /> NOT CONFIGURED
    </Badge>
  );
}

export function DisclaimerNote({ className }: { className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>{CLINICAL_DISCLAIMER}</p>;
}

export function ConfigureLink({ to = '/settings?tab=references', children = 'Open clinical reference configuration' }: { to?: string; children?: React.ReactNode }) {
  return (
    <Link to={to} className="font-medium text-primary underline underline-offset-2">
      {children}
    </Link>
  );
}
