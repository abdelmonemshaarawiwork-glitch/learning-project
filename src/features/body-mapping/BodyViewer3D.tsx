import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
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

function CameraRig({ view, nonce, controlsRef }: { view: CameraView; nonce: number; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera, invalidate } = useThree();
  const goal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    goal.current = new THREE.Vector3(...CAMERA_VIEWS[view].position);
    controlsRef.current?.target.set(...CAMERA_TARGET);
    invalidate();
  }, [view, nonce, controlsRef, invalidate]);
  useFrame(() => {
    if (!goal.current) return;
    camera.position.lerp(goal.current, 0.18);
    controlsRef.current?.update();
    if (camera.position.distanceTo(goal.current) < 0.005) {
      camera.position.copy(goal.current);
      goal.current = null;
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

function clickHandler(onSelect: ((k: string) => void) | undefined, key: () => string | null) {
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // a drag (rotate/pan), not a tap
    const k = key();
    if (k) onSelect?.(k);
  };
}

function DevelopmentMannequin({ depthBySegment, selected, hover, setHover, onSelect }: MeshSelectionProps) {
  const model = useMemo(() => buildMannequin(), []);
  useEffect(
    () => () => {
      model.parts.forEach((p) => p.geometry.dispose());
      model.joints.dispose();
    },
    [model],
  );
  return (
    <group>
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
            onClick={clickHandler(onSelect, () => p.key)}
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

function LicensedModel({ url, manifest, depthBySegment, selected, onSelect, setHover }: MeshSelectionProps & { url: string; manifest: ModelManifest }) {
  const gltf = useGLTF(url, false);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const forward = forwardVector(manifest.forwardAxis);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const map = manifest.meshRegions[mesh.name];
      if (!map) return;
      const keys = map.surface ? [segmentKey(map.segment, map.surface)] : [segmentKey(map.segment, 'anterior'), segmentKey(map.segment, 'posterior')];
      const depths = keys.map((k) => depthBySegment.get(k)).filter((d): d is BurnDepth => !!d);
      const worst = depths.sort((a, b) => BURN_DEPTH_MAP[b].severity - BURN_DEPTH_MAP[a].severity)[0];
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (worst) mat.color = colorFor(worst);
      mat.emissive = keys.some((k) => selected.has(k)) ? SELECT : new THREE.Color('#000');
      mat.emissiveIntensity = 0.4;
      mesh.material = mat;
    });
  }, [scene, manifest, depthBySegment, selected]);

  return (
    <primitive
      object={scene}
      scale={manifest.scale}
      position={[0, manifest.offsetY, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > 6) return;
        const mesh = e.object as THREE.Mesh;
        const map = manifest.meshRegions[mesh.name];
        if (!map) return;
        let surface = map.surface;
        if (!surface && e.face) {
          const n = e.face.normal.clone().transformDirection(mesh.matrixWorld);
          surface = surfaceFromNormal(n, forward);
        }
        onSelect?.(segmentKey(map.segment, surface ?? 'anterior'));
      }}
      onPointerOut={() => setHover(null)}
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
    <div className={cn('relative w-full overflow-hidden rounded-xl border bg-gradient-to-b from-[#0e1a30] to-[#060c18]', className)} data-testid="body-viewer-3d">
      {!usingLicensed && (
        <div className="flex items-start gap-2 border-b border-[#ffd99a]/20 bg-[#3a2508] px-3 py-2 text-xs text-[#ffd99a]" data-testid="dev-model-banner">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Development model</strong> — schematic mannequin, NOT anatomically accurate. A licensed anatomical model has not been installed.
            {manifest.status === 'invalid' && <> Model manifest rejected: {manifest.error}</>}
          </span>
        </div>
      )}
      {usingLicensed && !manifest.manifest.anatomicallyReviewed && (
        <div className="border-b border-[#ffd99a]/20 bg-[#3a2508] px-3 py-2 text-xs text-[#ffd99a]">
          {manifest.manifest.name} v{manifest.manifest.version}: anatomical accuracy not yet reviewed.
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
              <LicensedModel url={manifest.url} manifest={manifest.manifest} {...sharedProps} />
            ) : (
              <DevelopmentMannequin {...sharedProps} />
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
          <CameraRig view={view} nonce={nonce} controlsRef={controlsRef} />
        </Canvas>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-3">
        {(Object.keys(CAMERA_VIEWS) as CameraView[]).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? 'default' : 'secondary'}
            onClick={() => {
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
