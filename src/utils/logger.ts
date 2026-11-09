/**
 * Technical error logging that never includes patient data.
 * Only the error name, message and stack are logged; callers must not pass record contents.
 */
export function logTechnicalError(context: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  // eslint-disable-next-line no-console
  console.error(`[BURN TOOL] ${context}: ${err.name}: ${err.message}`, err.stack ?? '');
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') return 'The device storage is full. Free up space or export a backup and remove old records.';
    if (error.name === 'ConstraintError') return 'A record with the same identifier already exists.';
    if (error.name === 'DatabaseClosedError' || error.name === 'OpenFailedError')
      return 'The local database could not be opened. Close other BURN TOOL tabs and reload.';
    return error.message || error.name;
  }
  return String(error);
}
