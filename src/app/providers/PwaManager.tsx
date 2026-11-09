import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { logTechnicalError } from '@/utils/logger';

/** Registers the service worker; announces offline readiness and updates (never auto-reloads). */
export function PwaManager() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      logTechnicalError('service worker registration', error);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast.success('BurnMatrix is ready to work offline.');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (needRefresh) {
      toast('An update is available.', {
        description: 'Save your work, then reload to update.',
        duration: Infinity,
        action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
        onDismiss: () => setNeedRefresh(false),
      });
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
