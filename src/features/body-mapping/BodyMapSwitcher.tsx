import { Box, Square, TriangleAlert } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { ErrorBoundary } from '@/app/providers/ErrorBoundary';
import { Alert } from '@/components/ui/alert';
import { LoadingState } from '@/components/ui/states';
import { useSettings } from '@/hooks/useSettings';
import { detectWebGL } from '@/hooks/useWebGLSupport';
import { cn } from '@/utils/cn';
import { BodyMap2D, DepthLegend, type BodyMapProps } from './BodyMap2D';

const BodyViewer3D = lazy(() => import('./BodyViewer3D'));

/** 2D/3D body map with automatic 2D fallback when WebGL is unavailable or the 3D view fails. */
export function BodyMapSwitcher(props: BodyMapProps & { defaultMode?: '2d' | '3d' }) {
  const { settings } = useSettings();
  const webgl = detectWebGL();
  const [mode, setMode] = useState<'2d' | '3d'>(props.defaultMode ?? (settings.prefer2DMap || !webgl ? '2d' : '3d'));
  const [failed, setFailed] = useState(false);
  const effective = webgl && !failed ? mode : '2d';

  const fallback2D = (
    <>
      <Alert variant="warning" className="mb-3" icon={<TriangleAlert />}>
        The 3D viewer could not be started on this device. The 2D anatomical map below provides the same functionality.
      </Alert>
      <BodyMap2D {...props} />
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Body map view" className="inline-flex rounded-xl bg-muted p-1">
          {(['3d', '2d'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={effective === m}
              disabled={m === '3d' && (!webgl || failed)}
              onClick={() => setMode(m)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground disabled:opacity-50',
                effective === m && 'bg-card text-foreground shadow-sm',
              )}
            >
              {m === '3d' ? <Box className="size-4" /> : <Square className="size-4" />}
              {m === '3d' ? '3D model' : '2D map'}
            </button>
          ))}
        </div>
        <DepthLegend />
      </div>
      {!webgl && (
        <Alert variant="warning" data-testid="webgl-unavailable">
          WebGL is not available on this device or browser, so the 3D model is disabled. Use the 2D anatomical map.
        </Alert>
      )}
      {effective === '3d' ? (
        <ErrorBoundary context="3d viewer" fallback={fallback2D}>
          <Suspense fallback={<LoadingState label="Loading 3D viewer…" className="h-[360px]" />}>
            <ThreeDErrorCatcher onError={() => setFailed(true)}>
              <BodyViewer3D {...props} />
            </ThreeDErrorCatcher>
          </Suspense>
        </ErrorBoundary>
      ) : (
        <BodyMap2D {...props} />
      )}
    </div>
  );
}

function ThreeDErrorCatcher({ children, onError }: { children: React.ReactNode; onError: () => void }) {
  return (
    <ErrorBoundary context="3d viewer" fallback={<FallbackTrigger onError={onError} />}>
      {children}
    </ErrorBoundary>
  );
}

function FallbackTrigger({ onError }: { onError: () => void }) {
  // Switch the parent to 2D after the failed render.
  queueMicrotask(onError);
  return null;
}
