import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpDown, History, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { DateTimeInput } from '@/components/common/DateTimeInput';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { TIMELINE_EVENT_TYPES, TIMELINE_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { timelineRepo } from '@/database/repositories/records';
import { timelineTypeSchema } from '@/database/validation';
import { useFormatters } from '@/hooks/useFormatters';
import type { Patient, TimelineEvent, TimelineEventType } from '@/types/domain';
import { addHoursIso, isValidIso, nowIso } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { cn } from '@/utils/cn';

const eventFormSchema = z.object({
  eventType: timelineTypeSchema,
  dateTime: z.string().nullable().refine((v) => isValidIso(v), 'Enter the date and time.'),
  description: z.string().trim().min(1, 'Enter a description.').max(500),
  notes: z.string().max(10000),
});
type EventForm = z.infer<typeof eventFormSchema>;

const TYPE_TONE: Partial<Record<TimelineEventType, string>> = {
  admission: 'bg-primary',
  'initial-assessment': 'bg-[#d6334f]',
  'repeat-assessment': 'bg-[#f08a8a]',
  surgery: 'bg-[#8b5cf6]',
  debridement: 'bg-[#8b5cf6]',
  'antibiotic-start': 'bg-success',
  'antibiotic-modification': 'bg-success',
  'antibiotic-end': 'bg-success',
  discharge: 'bg-muted-foreground',
  transfer: 'bg-warning',
};

export default function TimelinePage() {
  const active = useActivePatient();
  return (
    <>
      <PageHeader title="Clinical timeline" description="Chronological record of clinical events. Admission and assessment events are added automatically." />
      <PatientContextBar {...active} />
      {active.patient && <TimelineWorkspace key={active.patient.id} patient={active.patient} />}
    </>
  );
}

function TimelineWorkspace({ patient }: { patient: Patient }) {
  const f = useFormatters();
  const events = useLiveQuery(() => db.timelineEvents.where('patientId').equals(patient.id).toArray(), [patient.id]);
  const [types, setTypes] = useState<string>('');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [desc, setDesc] = useState(false);
  const [editing, setEditing] = useState<TimelineEvent | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TimelineEvent | null>(null);

  const list = useMemo(() => {
    const toLimit = to ? addHoursIso(to, 1 / 3600) : null;
    return (events ?? [])
      .filter((e) => (!types || e.eventType === types) && (!from || e.dateTime >= from) && (!toLimit || e.dateTime < toLimit))
      .sort((a, b) => (desc ? b.dateTime.localeCompare(a.dateTime) : a.dateTime.localeCompare(b.dateTime)) || a.createdAt.localeCompare(b.createdAt));
  }, [events, types, from, to, desc]);

  if (!events) return <LoadingState />;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_1fr_1fr_auto_auto] lg:items-end">
          <Field label="Event type" htmlFor="tl-type">
            <Select id="tl-type" value={types} onChange={(e) => setTypes(e.target.value)}>
              <option value="">All event types</option>
              {TIMELINE_EVENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="tl-from">
            <DateTimeInput id="tl-from" value={from} onValueChange={setFrom} />
          </Field>
          <Field label="To" htmlFor="tl-to">
            <DateTimeInput id="tl-to" value={to} onValueChange={setTo} />
          </Field>
          <Button variant="outline" onClick={() => setDesc(!desc)} aria-label="Toggle sort order">
            <ArrowUpDown /> {desc ? 'Newest first' : 'Oldest first'}
          </Button>
          <Button onClick={() => setEditing('new')} data-testid="add-event">
            <Plus /> Add event
          </Button>
        </div>
      </Card>

      {list.length === 0 ? (
        <EmptyState icon={<History />} title="No events match the filters" />
      ) : (
        <Card className="p-4 sm:p-6">
          <ol className="relative ml-2 space-y-6 border-l-2 border-border pl-6" data-testid="timeline-list">
            {list.map((e) => (
              <li key={e.id} className="relative" data-testid="timeline-event">
                <span className={cn('absolute top-1 -left-[33px] size-4 rounded-full ring-4 ring-card', TYPE_TONE[e.eventType] ?? 'bg-muted-foreground')} />
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground tabular">{f.dateTime(e.dateTime)}</p>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {TIMELINE_LABEL[e.eventType]}
                      {e.system && <Badge>automatic</Badge>}
                    </p>
                    <p className="text-sm">{e.description}</p>
                    {e.notes && <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{e.notes}</p>}
                    {e.linkedRecordId && e.linkedRecordType === 'assessment' && (
                      <Link to={`/assessment/${e.linkedRecordId}`} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        <Link2 className="size-3.5" /> Open linked assessment
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label="Edit event" onClick={() => setEditing(e)}>
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Delete event" onClick={() => setDeleting(e)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {editing && <EventDialog patientId={patient.id} target={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this timeline event?"
        destructive
        confirmLabel="Delete event"
        description={deleting ? `"${TIMELINE_LABEL[deleting.eventType]}" at ${f.dateTime(deleting.dateTime)} will be removed from the timeline.${deleting.linkedRecordId ? ' The linked record itself is not deleted.' : ''}` : ''}
        onConfirm={async () => {
          if (deleting) await timelineRepo.remove(deleting.id);
          toast.success('Event deleted.');
        }}
      />
    </div>
  );
}

function EventDialog({ patientId, target, onClose }: { patientId: string; target: TimelineEvent | 'new'; onClose: () => void }) {
  const isNew = target === 'new';
  const form = useForm<EventForm>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: isNew
      ? { eventType: 'clinical-note', dateTime: nowIso(), description: '', notes: '' }
      : { eventType: target.eventType, dateTime: target.dateTime, description: target.description, notes: target.notes },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    try {
      if (isNew) await timelineRepo.add({ patientId, eventType: v.eventType, dateTime: v.dateTime!, description: v.description, notes: v.notes, linkedRecordId: null, linkedRecordType: null, system: false });
      else await timelineRepo.update(target.id, { eventType: v.eventType, dateTime: v.dateTime!, description: v.description, notes: v.notes });
      toast.success(isNew ? 'Event added.' : 'Event updated.');
      onClose();
    } catch (err) {
      toast.error('Could not save the event.', { description: describeError(err) });
    }
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={isNew ? 'Add timeline event' : 'Edit timeline event'}>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Event type" htmlFor="ev-type">
            <Select id="ev-type" {...form.register('eventType')}>
              {TIMELINE_EVENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date and time" htmlFor="ev-time" required error={e.dateTime?.message}>
            <Controller control={form.control} name="dateTime" render={({ field }) => <DateTimeInput id="ev-time" value={field.value} onValueChange={field.onChange} />} />
          </Field>
          <Field label="Description" htmlFor="ev-desc" required error={e.description?.message} className="sm:col-span-2">
            <Input id="ev-desc" aria-invalid={!!e.description} {...form.register('description')} />
          </Field>
          <Field label="Notes" htmlFor="ev-notes" className="sm:col-span-2">
            <Textarea id="ev-notes" {...form.register('notes')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="save-event">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
