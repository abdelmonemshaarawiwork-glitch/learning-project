import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { BURN_DEPTHS, BURN_DEPTH_MAP } from '@/constants/clinical';
import type { BreakdownItem, CalculationIssue, TbsaTotals } from '@/engines/tbsa';
import { formatCompact } from '@/utils/rounding';

export function TbsaTotalsPanel({ totals, compact }: { totals: TbsaTotals; compact?: boolean }) {
  return (
    <div className="space-y-3" data-testid="tbsa-totals">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 rounded-xl bg-accent p-3 text-accent-foreground sm:col-span-1">
          <p className="text-xs font-semibold tracking-wide uppercase">TBSA (eligible)</p>
          <p className="tabular text-3xl font-bold" data-testid="tbsa-total">
            {formatCompact(totals.eligible, 1)}%
          </p>
          <p className="text-[11px] opacity-80">Partial + full thickness</p>
        </div>
        <div className={`rounded-xl p-3 ${totals.indeterminate > 0 ? 'bg-warning-soft text-warning' : 'bg-muted'}`}>
          <p className="text-xs font-semibold tracking-wide uppercase">Indeterminate</p>
          <p className="tabular text-xl font-semibold" data-testid="tbsa-indeterminate">
            {formatCompact(totals.indeterminate, 1)}%
          </p>
          <p className="text-[11px] opacity-80">Not included</p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Upper bound</p>
          <p className="tabular text-xl font-semibold">{formatCompact(totals.upperBound, 1)}%</p>
          <p className="text-[11px] text-muted-foreground">If indeterminate is eligible</p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Superficial</p>
          <p className="tabular text-xl font-semibold">{formatCompact(totals.superficial, 1)}%</p>
          <p className="text-[11px] text-muted-foreground">Excluded from TBSA</p>
        </div>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-2">
          {BURN_DEPTHS.map((d) => (
            <Badge key={d.id} variant="outline" className="gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: d.color }} />
              {d.short}: <span className="tabular">{formatCompact(totals.byDepth[d.id], 2)}%</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function IssuesPanel({ issues }: { issues: CalculationIssue[] }) {
  const relevant = issues;
  if (!relevant.length) return null;
  return (
    <div className="space-y-2" data-testid="tbsa-issues">
      {relevant.map((i, k) => (
        <Alert key={k} variant={i.severity === 'error' ? 'danger' : i.severity === 'warning' ? 'warning' : 'neutral'}>
          {i.message}
        </Alert>
      ))}
    </div>
  );
}

export function BreakdownTable({ items, method }: { items: BreakdownItem[]; method: 'regional' | 'palm' }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No regions recorded.</p>;
  return (
    <Table data-testid="breakdown-table">
      <THead>
        <TR>
          <TH>Region</TH>
          <TH>Depth</TH>
          <TH className="text-right">{method === 'palm' ? 'Palm-eq.' : 'Involved'}</TH>
          <TH className="text-right">{method === 'palm' ? '% / palm' : 'Region %'}</TH>
          <TH className="text-right">Contribution</TH>
          <TH>Counted</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((i) => (
          <TR key={i.entryId}>
            <TD>
              {i.label}
              {i.notes && <p className="text-xs text-muted-foreground">{i.notes}</p>}
            </TD>
            <TD>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="size-2.5 rounded-sm" style={{ background: BURN_DEPTH_MAP[i.depth].color }} />
                {BURN_DEPTH_MAP[i.depth].label}
              </span>
            </TD>
            <TD className="tabular text-right">{method === 'palm' ? formatCompact(i.palmEquivalents, 2) : `${formatCompact(i.involvementPercent, 2)}%`}</TD>
            <TD className="tabular text-right">{formatCompact(i.referencePercent, 3)}%</TD>
            <TD className="tabular text-right font-medium">{formatCompact(i.contributionRounded, 2)}%</TD>
            <TD>{i.eligible ? <Badge variant="success">Yes</Badge> : <Badge variant={i.depth === 'indeterminate' ? 'warning' : 'neutral'}>{i.depth === 'indeterminate' ? 'Flagged' : 'No'}</Badge>}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function CalculationSteps({ steps }: { steps: string[] }) {
  return (
    <details className="rounded-xl border bg-muted/40 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Calculation details</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 font-mono text-xs">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}
