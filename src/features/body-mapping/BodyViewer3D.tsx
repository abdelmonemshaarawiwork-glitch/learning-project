import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GLTFLoader } from 'three-stdlib';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ErrorBoundary } from '@/app/providers/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { BURN_DEPTH_MAP, segmentKey, segmentKeyLabel } from '@/constants/clinical';
import type { BurnDepth } from '@/types/domain';
import { cn } from '@/utils/cn';
import type { BodyMapProps } from './BodyMap2D';
import { buildMannequin, CAMERA_TARGET, CAMERA_VIEWS, surfaceFromNormal, type CameraView } from './model3d/mannequin';
import { forwardVector, loadManifest, type ManifestState, type ModelManifest } from './model3d/modelManifest';

const SKIN = new THREE.Color('#d6b6a2');
const SELECT = new THREE.Color('#2f7bf0');

function colorFor(depth: BurnDepth | undefined): THREE.Color {
  return depth ? new THREE.Color(BURN_DEPTH_MAP[depth].color) : SKIN;
}

/* ------------------------------------------------------------------ */
/* Camera control                                                      */
/* ------------------------------------------------------------------ */

function CameraRig({ view, nonce, controlsRef, onSettled }: { view: CameraView; nonce: number; controlsRef: React.RefObject<OrbitControlsImpl | null>; onSettled: (settled: boolean) => void }) {
  const { camera, invalidate } = useThree();
  const goal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    goal.current = new THREE.Vector3(...CAMERA_VIEWS[view].position);
    controlsRef.current?.target.set(...CAMERA_TARGET);
    onSettled(false);
    invalidate();
  }, [view, nonce, controlsRef, invalidate, onSettled]);
  useFrame(() => {
    if (!goal.current) return;
    camera.position.lerp(goal.current, 0.18);
    controlsRef.current?.update();
    if (camera.position.distanceTo(goal.current) < 0.005) {
      camera.position.copy(goal.current);
      goal.current = null;
      onSettled(true);
    }
    invalidate();
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Development mannequin                                               */
/* ------------------------------------------------------------------ */

interface MeshSelectionProps {
  depthBySegment: Map<string, BurnDepth>;
  selected: Set<string>;
  hover: string | null;
  setHover: (k: string | null) => void;
  onSelect?: (key: string) => void;
}

/**
 * Tap/click selection using native pointer events and our own raycast (independent of R3F's
 * event dispatch, which can drop a pointer-down arriving in the same frame as a hover re-render).
 * A tap is a pointer-down and pointer-up on the same region with ≤ 6 px movement (drags rotate/pan).
 */
function useTapSelection(root: THREE.Object3D | null, resolve: (hit: THREE.Intersection) => string | null, onSelect?: (key: string) => void) {
  const { gl, camera } = useThree();
  const resolveRef = useRef(resolve);
  const selectRef = useRef(onSelect);
  resolveRef.current = resolve;
  selectRef.current = onSelect;
  useEffect(() => {
    if (!root) return;
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pick = (ev: PointerEvent): string | null => {
      const rect = el.getBoundingClientRect();
      // A ray exactly along a mesh seam (e.g. the midline) can slip between triangles: retry with sub-pixel offsets.
      for (const [dx, dy] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]] as const) {
        const ndc = new THREE.Vector2(((ev.clientX + dx - rect.left) / rect.width) * 2 - 1, -((ev.clientY + dy - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(root, true)[0];
        if (hit) return resolveRef.current(hit);
      }
      return null;
    };
    let start: { x: number; y: number; key: string | null; id: number } | null = null;
    const down = (ev: PointerEvent) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      start = { x: ev.clientX, y: ev.clientY, key: pick(ev), id: ev.pointerId };
    };
    const up = (ev: PointerEvent) => {
      const s0 = start;
      start = null;
      if (!s0?.key || s0.id !== ev.pointerId || !selectRef.current) return;
      if (Math.hypot(ev.clientX - s0.x, ev.clientY - s0.y) > 6) return;
      const key = pick(ev);
      if (key === s0.key) selectRef.current(key);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [gl, camera, root]);
}

/** Rendered when the licensed asset throws while loading; switches the viewer to the development model. */
function ModelFailed({ onFail }: { onFail: () => void }) {
  useEffect(() => {
    onFail();
  }, [onFail]);
  return null;
}

function DevelopmentMannequin({ depthBySegment, selected, hover, setHover, onSelect, onReady }: MeshSelectionProps & { onReady?: () => void }) {
  const model = useMemo(() => buildMannequin(), []);
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  useEffect(
    () => () => {
      model.parts.forEach((p) => p.geometry.dispose());
      model.joints.dispose();
    },
    [model],
  );
  const [root, setRoot] = useState<THREE.Group | null>(null);
  useTapSelection(root, (hit) => (hit.object.name.includes(':') ? hit.object.name : null), onSelect);
  return (
    <group ref={setRoot}>
      <mesh geometry={model.joints} raycast={() => null}>
        <meshStandardMaterial color={SKIN} roughness={0.75} />
      </mesh>
      {model.parts.map((p) => {
        const depth = depthBySegment.get(p.key);
        const isSel = selected.has(p.key);
        return (
          <mesh
            key={p.key}
            geometry={p.geometry}
            name={p.key}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(p.key);
            }}
            onPointerOut={() => setHover(null)}
          >
            <meshStandardMaterial
              color={colorFor(depth)}
              roughness={depth ? 0.55 : 0.75}
              emissive={isSel ? SELECT : hover === p.key ? new THREE.Color('#ffffff') : new THREE.Color('#000000')}
              emissiveIntensity={isSel ? 0.45 : hover === p.key ? 0.12 : 0}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Licensed anatomical asset (glTF) — used only when a valid manifest exists */
/* ------------------------------------------------------------------ */

/**
 * The hosted preview cannot serve binary .glb files, so its build ships the model as a JS module
 * (`<file>.js`, default export = base64 bytes) that is parsed in the browser without any fetch.
 */
const embeddedModels = new Map<string, Promise<THREE.Group>>();
function loadEmbeddedModel(file: string): Promise<THREE.Group> {
  let p = embeddedModels.get(file);
  if (!p) {
    const url = new URL(`models/${file}.js`, document.baseURI).href;
    p = (import(/* @vite-ignore */ url) as Promise<{ default: string }>).then(
      (mod) =>
        new Promise<THREE.Group>((resolve, reject) => {
          const bin = atob(mod.default);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          new GLTFLoader().parse(bytes.buffer, '', (g) => resolve(g.scene), reject);
        }),
    );
    embeddedModels.set(file, p);
  }
  return p;
}

function useModelScene(url: string, file: string): THREE.Group {
  if (import.meta.env.VITE_TARGET === 'artifact') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return use(loadEmbeddedModel(file));
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useGLTF(url, false, false).scene; // no Draco or Meshopt: avoids CDN and WebAssembly (blocked by the CSP)
}

function LicensedModel({ url, manifest, depthBySegment, selected, hover, onSelect, setHover, onReady }: MeshSelectionProps & { url: string; manifest: ModelManifest; onReady: () => void }) {
  const source = useModelScene(url, manifest.file);
  const scene = useMemo(() => source.clone(true), [source]);
  const forward = forwardVector(manifest.forwardAxis);

  /** glTF loaders may de-duplicate names (e.g. "trunk__anterior_1"); resolve robustly. */
  const regionOf = (obj: THREE.Object3D) => {
    const candidates = [obj.name, obj.userData?.name as string | undefined, obj.name.replace(/_\d+$/, '')].filter(Boolean) as string[];
    for (const c of candidates) if (manifest.meshRegions[c]) return manifest.meshRegions[c];
    return undefined;
  };
  const keysOf = (obj: THREE.Object3D): string[] => {
    const map = regionOf(obj);
    if (!map) return [];
    return map.surface ? [segmentKey(map.segment, map.surface)] : [segmentKey(map.segment, 'anterior'), segmentKey(map.segment, 'posterior')];
  };

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Always start from the asset's original material so removed burns revert to skin.
      const original = (mesh.userData.originalMaterial ??= mesh.material) as THREE.MeshStandardMaterial;
      const keys = keysOf(mesh);
      if (!keys.length) {
        mesh.material = original;
        return;
      }
      const depths = keys.map((k) => depthBySegment.get(k)).filter((d): d is BurnDepth => !!d);
      const worst = depths.sort((a, b) => BURN_DEPTH_MAP[b].severity - BURN_DEPTH_MAP[a].severity)[0];
      const mat = original.clone();
      if (worst) {
        mat.color = colorFor(worst);
        mat.roughness = 0.55;
      }
      const isSel = keys.some((k) => selected.has(k));
      const isHover = hover !== null && keys.includes(hover);
      mat.emissive = isSel ? SELECT : isHover ? new THREE.Color('#ffffff') : new THREE.Color('#000000');
      mat.emissiveIntensity = isSel ? 0.45 : isHover ? 0.12 : 0;
      (mesh.material as THREE.Material).dispose?.();
      mesh.material = mat;
    });
  }, [scene, manifest, depthBySegment, selected, hover]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onReady();
  }, [scene, onReady]);

  const keyFromHit = (hit: { object: THREE.Object3D; face?: THREE.Face | null }): string | null => {
    const mesh = hit.object as THREE.Mesh;
    const map = regionOf(mesh);
    if (!map) return null;
    let surface = map.surface;
    if (!surface && hit.face) {
      const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
      surface = surfaceFromNormal(n, forward);
    }
    return segmentKey(map.segment, surface ?? 'anterior');
  };
  const keyFromEvent = (e: ThreeEvent<PointerEvent | MouseEvent>) => keyFromHit(e);
  useTapSelection(scene, (hit) => keyFromHit(hit), onSelect);

  return (
    <primitive
      object={scene}
      scale={manifest.scale}
      position={[0, manifest.offsetY, 0]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const k = keyFromEvent(e);
        if (k !== hover) setHover(k);
      }}
      onPointerLeave={() => setHover(null)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Viewer                                                              */
/* ------------------------------------------------------------------ */

export default function BodyViewer3D({ depthBySegment, selectedKeys = [], onSelectSegment, readOnly, className }: BodyMapProps) {
  const [view, setView] = useState<CameraView>('anterior');
  const [nonce, setNonce] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ManifestState>({ status: 'loading' });
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const [settled, setSettled] = useState(false);
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, []);

  const onSelect = readOnly ? undefined : onSelectSegment;
  const sharedProps = { depthBySegment, selected, hover, setHover, onSelect };
  const usingLicensed = manifest.status === 'ready';

  return (
    <div className={cn('relative w-full overflow-hidden rounded-xl border bg-gradient-to-b from-[#0e1a30] to-[#060c18]', className)} data-testid="body-viewer-3d" data-model-ready={ready ? 'true' : 'false'} data-camera-view={view} data-camera-settled={settled ? 'true' : 'false'}>
      {!usingLicensed && (
        <div className="flex items-start gap-2 border-b border-[#ffd99a]/20 bg-[#3a2508] px-3 py-2 text-xs text-[#ffd99a]" data-testid="dev-model-banner">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Development model</strong> — schematic mannequin, NOT anatomically accurate. A licensed anatomical model has not been installed.
            {manifest.status === 'invalid' && <> Model manifest rejected: {manifest.error}</>}
          </span>
        </div>
      )}
      {usingLicensed && (
        <div
          className={cn('flex items-start gap-2 border-b px-3 py-2 text-xs', manifest.manifest.anatomicallyReviewed ? 'border-white/10 bg-[#0b1730] text-white/75' : 'border-[#ffd99a]/20 bg-[#3a2508] text-[#ffd99a]')}
          data-testid="model-banner"
        >
          {!manifest.manifest.anatomicallyReviewed && <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
          <span>
            <strong>{manifest.manifest.name}</strong> ({manifest.manifest.license.name}).{' '}
            {manifest.manifest.anatomicallyReviewed
              ? 'Region boundaries reviewed.'
              : 'Region boundaries are approximate and have not been clinically reviewed — always check the selected region label.'}
          </span>
        </div>
      )}
      <div className="h-[min(68vh,560px)] min-h-[360px] w-full touch-none">
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ position: CAMERA_VIEWS.anterior.position, fov: 32, near: 0.05, far: 50 }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onPointerMissed={() => setHover(null)}
        >
          <hemisphereLight args={['#f4f7ff', '#3a3f4c', 1.1]} />
          <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
          <directionalLight position={[-3, 2.5, -2.5]} intensity={0.8} />
          <Suspense fallback={null}>
            {usingLicensed ? (
              <ErrorBoundary context="licensed 3D model" fallback={<ModelFailed onFail={() => setManifest({ status: 'invalid', error: 'the model file could not be loaded' })} />}>
                <LicensedModel url={manifest.url} manifest={manifest.manifest} {...sharedProps} onReady={markReady} />
              </ErrorBoundary>
            ) : (
              <DevelopmentMannequin {...sharedProps} onReady={markReady} />
            )}
          </Suspense>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} raycast={() => null}>
            <circleGeometry args={[0.7, 48]} />
            <meshBasicMaterial color="#1d2b47" transparent opacity={0.6} />
          </mesh>
          <OrbitControls
            ref={controlsRef}
            makeDefault
            target={CAMERA_TARGET}
            enableDamping
            dampingFactor={0.12}
            minDistance={1.1}
            maxDistance={6}
            enablePan
            screenSpacePanning
          />
          <CameraRig view={view} nonce={nonce} controlsRef={controlsRef} onSettled={setSettled} />
        </Canvas>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-3">
        {(Object.keys(CAMERA_VIEWS) as CameraView[]).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? 'default' : 'secondary'}
            onClick={() => {
              setSettled(false);
              setView(v);
              setNonce((n) => n + 1);
            }}
            aria-pressed={view === v}
          >
            {CAMERA_VIEWS[v].label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSettled(false);
            setView('anterior');
            setNonce((n) => n + 1);
          }}
          aria-label="Reset camera"
        >
          <RotateCcw /> Reset
        </Button>
        <span className="ml-auto max-w-[50%] truncate text-xs text-white/80" aria-live="polite">
          {hover ? segmentKeyLabel(hover) : 'Drag to rotate · pinch/scroll to zoom · right-drag/two fingers to pan'}
        </span>
      </div>
    </div>
  );
}
