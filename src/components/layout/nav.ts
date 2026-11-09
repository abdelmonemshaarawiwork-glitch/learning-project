import {
  Activity,
  ArrowLeftRight,
  ClipboardList,
  Droplets,
  FileText,
  History,
  LayoutDashboard,
  PersonStanding,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { to: '/patients', label: 'Patients', short: 'Patients', icon: Users },
  { to: '/assessment', label: 'Burn Assessment', short: 'Assess', icon: ClipboardList },
  { to: '/body-map', label: '3D Body Mapping', short: 'Body map', icon: PersonStanding },
  { to: '/fluids', label: 'Fluid Management', short: 'Fluids', icon: Droplets },
  { to: '/intake-output', label: 'Intake & Output', short: 'I/O', icon: ArrowLeftRight },
  { to: '/monitoring', label: 'Clinical Monitoring', short: 'Monitor', icon: Activity },
  { to: '/timeline', label: 'Clinical Timeline', short: 'Timeline', icon: History },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];

/** Items shown in the mobile bottom bar; the rest are in the drawer. */
export const MOBILE_PRIMARY = ['/', '/patients', '/assessment', '/fluids'];
