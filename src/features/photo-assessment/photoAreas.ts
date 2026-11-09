import type { BodySegmentId } from '@/constants/clinical';
import type { PhotoView } from '@/engines/photo-planimetry';
import type { PhotoAreaId } from '@/types/domain';

export interface PhotoArea {
  id: PhotoAreaId;
  label: string;
  segments: BodySegmentId[];
  views: PhotoView[];
  tips: string;
}

const LIMB_VIEWS: PhotoView[] = ['anterior', 'posterior', 'medial', 'lateral'];
const BODY_VIEWS: PhotoView[] = ['anterior', 'posterior', 'left-side', 'right-side'];

export const PHOTO_AREAS: PhotoArea[] = [
  { id: 'upper-limb-left', label: 'Left upper limb', segments: ['upper-arm-left', 'forearm-left', 'hand-left'], views: LIMB_VIEWS, tips: 'Arm slightly away from the body, palm forward for the front view. Include shoulder to fingertips.' },
  { id: 'upper-limb-right', label: 'Right upper limb', segments: ['upper-arm-right', 'forearm-right', 'hand-right'], views: LIMB_VIEWS, tips: 'Arm slightly away from the body, palm forward for the front view. Include shoulder to fingertips.' },
  { id: 'lower-limb-left', label: 'Left lower limb', segments: ['thigh-left', 'leg-left', 'foot-left'], views: LIMB_VIEWS, tips: 'Include groin/buttock crease to toes. Knee straight.' },
  { id: 'lower-limb-right', label: 'Right lower limb', segments: ['thigh-right', 'leg-right', 'foot-right'], views: LIMB_VIEWS, tips: 'Include groin/buttock crease to toes. Knee straight.' },
  { id: 'trunk', label: 'Trunk', segments: ['trunk', 'genitalia', 'buttock-left', 'buttock-right'], views: BODY_VIEWS, tips: 'Shoulders to groin / buttock crease. Arms raised away from the trunk for side views.' },
  { id: 'head-neck', label: 'Head & neck', segments: ['head', 'neck'], views: BODY_VIEWS, tips: 'Whole head and neck in frame; hair pulled back if possible.' },
];

export const AREA_MAP: Record<PhotoAreaId, PhotoArea> = Object.fromEntries(PHOTO_AREAS.map((a) => [a.id, a])) as Record<PhotoAreaId, PhotoArea>;

export const VIEW_LABEL: Record<PhotoView, string> = {
  anterior: 'Front (anterior)',
  posterior: 'Back (posterior)',
  medial: 'Inner side (medial)',
  lateral: 'Outer side (lateral)',
  'left-side': "Patient's left side",
  'right-side': "Patient's right side",
};

export const SEGMENT_COLORS: Partial<Record<BodySegmentId, string>> = {
  'upper-arm-left': '#38bdf8',
  'upper-arm-right': '#38bdf8',
  'forearm-left': '#a3e635',
  'forearm-right': '#a3e635',
  'hand-left': '#facc15',
  'hand-right': '#facc15',
  'thigh-left': '#38bdf8',
  'thigh-right': '#38bdf8',
  'leg-left': '#a3e635',
  'leg-right': '#a3e635',
  'foot-left': '#facc15',
  'foot-right': '#facc15',
  trunk: '#38bdf8',
  genitalia: '#facc15',
  'buttock-left': '#a3e635',
  'buttock-right': '#f472b6',
  head: '#38bdf8',
  neck: '#a3e635',
};

export const CAPTURE_TIPS = [
  'Camera perpendicular to the skin surface, at the same height as the area.',
  'The whole segment in frame, including its anatomical boundaries (e.g. shoulder, elbow, wrist).',
  'Even lighting, no flash glare; plain background if possible.',
  'Take every view of an area from a similar distance.',
  'Follow local policy for consent, dignity and clinical photography.',
];
