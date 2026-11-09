/**
 * Asset integration architecture for a licensed anatomical 3D model.
 *
 * To integrate a verified model, place the binary glTF at `public/models/<file>.glb` and a
 * `public/models/manifest.json` that validates against `modelManifestSchema` below. Until a valid
 * manifest with complete licence information exists, the viewer uses the clearly-labelled
 * development mannequin. See public/models/README.md.
 */
import { z } from 'zod';
import { BODY_SEGMENTS } from '@/constants/clinical';

const segmentIds = BODY_SEGMENTS.map((s) => s.id) as [string, ...string[]];

export const modelManifestSchema = z.object({
  /** File name inside /models/. Only .glb/.gltf are supported. */
  file: z.string().regex(/^[\w.-]+\.(glb|gltf)$/, 'file must be a .glb or .gltf file name inside /models/'),
  name: z.string().min(1),
  version: z.string().min(1),
  license: z.object({
    name: z.string().min(1, 'licence name is required'),
    url: z.string().optional(),
    attribution: z.string().min(1, 'attribution is required'),
    /** Confirmation that redistribution inside this application is permitted. */
    redistributionPermitted: z.literal(true),
  }),
  /** True only when anatomical accuracy has been reviewed by a qualified person. */
  anatomicallyReviewed: z.boolean(),
  reviewNotes: z.string().default(''),
  /** Forward (anterior) direction of the model in its own space. */
  forwardAxis: z.enum(['+z', '-z', '+x', '-x']).default('+z'),
  /** Uniform scale applied so the model is ~1.75 units tall. */
  scale: z.number().positive().default(1),
  /** Vertical offset applied after scaling so the feet rest at y = 0. */
  offsetY: z.number().default(0),
  /**
   * Mesh-name → body segment mapping. If `surface` is omitted the anterior/posterior surface is
   * derived from the clicked face normal relative to `forwardAxis`.
   */
  meshRegions: z
    .record(z.string(), z.object({ segment: z.enum(segmentIds), surface: z.enum(['anterior', 'posterior']).optional() }))
    .refine((m) => Object.keys(m).length > 0, 'meshRegions must map at least one mesh'),
});

export type ModelManifest = z.infer<typeof modelManifestSchema>;

export type ManifestState =
  | { status: 'loading' }
  | { status: 'absent' }
  | { status: 'invalid'; error: string }
  | { status: 'ready'; manifest: ModelManifest; url: string };

export function parseManifest(json: unknown): { ok: true; manifest: ModelManifest } | { ok: false; error: string } {
  const r = modelManifestSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, manifest: r.data };
}

export function forwardVector(axis: ModelManifest['forwardAxis']): { x: number; y: number; z: number } {
  switch (axis) {
    case '-z':
      return { x: 0, y: 0, z: -1 };
    case '+x':
      return { x: 1, y: 0, z: 0 };
    case '-x':
      return { x: -1, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 1 };
  }
}

export async function loadManifest(base = import.meta.env.BASE_URL ?? '/'): Promise<ManifestState> {
  try {
    const res = await fetch(`${base}models/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return { status: 'absent' };
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return { status: 'absent' }; // SPA fallback returned index.html
    const parsed = parseManifest(await res.json());
    if (!parsed.ok) return { status: 'invalid', error: parsed.error };
    return { status: 'ready', manifest: parsed.manifest, url: `${base}models/${parsed.manifest.file}` };
  } catch {
    return { status: 'absent' };
  }
}
