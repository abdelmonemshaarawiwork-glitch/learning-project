import * as React from 'react';
import { Input } from '@/components/ui/input';
import { fromLocalInputValue, toLocalInputValue } from '@/utils/dates';

/** datetime-local input bound to an ISO (UTC) value. */
export const DateTimeInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: string | null; onValueChange: (iso: string | null) => void }
>(({ value, onValueChange, ...props }, ref) => (
  <Input ref={ref} type="datetime-local" value={toLocalInputValue(value)} onChange={(e) => onValueChange(fromLocalInputValue(e.target.value))} {...props} />
));
DateTimeInput.displayName = 'DateTimeInput';
