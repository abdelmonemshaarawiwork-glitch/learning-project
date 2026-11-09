import { LogOut, UserCog } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { cn } from '@/utils/cn';
import { useAuth } from './AuthProvider';

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? (parts.at(-1)![0] ?? '') : '')).toUpperCase();
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground', className)}>
      {initialsOf(name)}
    </span>
  );
}

/** Account button in the header: name, email, account settings and sign-out. */
export function UserMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session) return null;
  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${session.displayName}`}
        data-testid="user-menu"
        className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 hover:bg-muted sm:pr-3"
      >
        <Avatar name={session.displayName} />
        <span className="hidden max-w-[160px] truncate text-sm font-medium sm:block">{session.displayName}</span>
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border bg-card shadow-xl">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Avatar name={session.displayName} className="size-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{session.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{session.email}</p>
              {session.role && <p className="truncate text-xs text-muted-foreground">{session.role}</p>}
            </div>
          </div>
          <div className="p-1.5">
            <Link
              role="menuitem"
              to="/settings?tab=account"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-muted"
            >
              <UserCog className="size-4 text-muted-foreground" /> Account settings
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => void signOut()}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-danger hover:bg-danger-soft"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact account block for the mobile navigation drawer. */
export function DrawerAccount() {
  const { session, signOut } = useAuth();
  if (!session) return null;
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 px-1">
        <Avatar name={session.displayName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{session.displayName}</p>
          <p className="truncate text-xs text-sidebar-muted">{session.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-2 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground hover:bg-sidebar-active hover:text-white"
      >
        <LogOut className="size-[18px]" /> Sign out
      </button>
    </div>
  );
}
