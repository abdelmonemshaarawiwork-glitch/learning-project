/** No-op replacement for `virtual:pwa-register/react` in the hosted preview (no service workers there). */
import { useState } from 'react';

export function useRegisterSW(_options?: unknown) {
  void _options;
  const offlineReady = useState(false);
  const needRefresh = useState(false);
  return { offlineReady, needRefresh, updateServiceWorker: async (_reload?: boolean) => undefined };
}
