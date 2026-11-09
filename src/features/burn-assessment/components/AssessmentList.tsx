import { ClipboardList, GitCompare } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { METHOD_LABEL } from '@/constants/clinical';
import { useFormatters } from '@/hooks/useFormatters';
import type { Assessment } from '@/types/domain';

export function AssessmentList({ assessments, patientId }: { assessments: Assessment[]; patientId: string }) {
  const f = useFormatters();
  if (assessments.length === 0)
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No assessments recorded"
        action={
          <Link className="text-sm font-medium text-primary underline" to={`/assessment?patient=${patientId}`}>
            Start a burn assessment
          </Link>
        }
      />
    );
  return (
    <div className="space-y-2">
      {assessments.filter((a) => !a.supersededById).length >= 2 && (
        <Link to={`/assessment/history?patient=${patientId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <GitCompare className="size-4" /> Compare assessments
        </Link>
      )}
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Method</TH>
            <TH>TBSA</TH>
            <TH>Indeterminate</TH>
            <TH>Reference</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {assessments.map((a) => (
            <TR key={a.id}>
              <TD className="whitespace-nowrap">
                <Link to={`/assessment/${a.id}`} className="font-medium text-primary hover:underline">
                  {f.dateTime(a.assessmentDate)}
                </Link>
              </TD>
              <TD>{METHOD_LABEL[a.method]}</TD>
              <TD className="tabular font-semibold">{f.tbsa(a.tbsaTotal)}</TD>
              <TD className="tabular">{a.tbsaIndeterminate > 0 ? <Badge variant="warning">{f.tbsa(a.tbsaIndeterminate)}</Badge> : '—'}</TD>
              <TD className="text-xs text-muted-foreground">
                {a.referenceName ?? (a.method === 'palm' ? 'Clinician-entered palm %' : '—')}
                {a.referenceVersion ? ` v${a.referenceVersion}` : ''}
              </TD>
              <TD>
                {a.supersededById ? <Badge>Superseded</Badge> : <Badge variant="primary">{a.kind === 'initial' ? 'Initial' : 'Repeat'}</Badge>}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
