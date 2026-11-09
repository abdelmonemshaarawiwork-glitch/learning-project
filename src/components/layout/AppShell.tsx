import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Flame, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, WifiOff, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useEffect } from 'react';
import { APP_NAME, CLINICAL_DISCLAIMER } from '@/constants/clinical';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { DrawerAccount, UserMenu } from '@/features/auth/UserMenu';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/utils/cn';
import { MOBILE_PRIMARY, NAV_ITEMS } from './nav';
import { ThemeToggle } from './ThemeToggle';

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#1d6ae5]/15 text-[#6aa2f7] ring-1 ring-[#6aa2f7]/25">
        <Flame className="size-5" aria-hidden />
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="text-[15px] font-bold tracking-wide text-white">{APP_NAME}</p>
          <p className="truncate text-[11px] text-sidebar-muted">Burn assessment &amp; ICU</p>
        </div>
      )}
    </div>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-active hover:text-white',
              isActive && 'bg-sidebar-active text-white shadow-[inset_3px_0_0_#4d8ff5]',
              collapsed && 'justify-center px-0',
            )
          }
        >
          <item.icon className="size-[18px] shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <span
      data-testid="offline-indicator"
      className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning"
      title="You are offline. BURN TOOL keeps working: all data is stored on this device."
    >
      <WifiOff className="size-3.5" aria-hidden />
      Offline
    </span>
  );
}

export function AppShell() {
  const { sidebarCollapsed: collapsedPref, setSidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useUiStore();
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1099px)');
  const sidebarCollapsed = collapsedPref ?? isTablet;
  const location = useLocation();
  const current = NAV_ITEMS.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)));

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  return (
    <div className="flex min-h-dvh w-full">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          'no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex',
          sidebarCollapsed ? 'w-[68px]' : 'w-[248px]',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-sidebar-border px-4', sidebarCollapsed && 'px-2 justify-center')}>
          <Brand collapsed={sidebarCollapsed} />
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          <NavList collapsed={sidebarCollapsed} />
        </div>
        <div className="border-t border-sidebar-border p-2.5">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-sidebar-muted hover:bg-sidebar-active hover:text-white',
              sidebarCollapsed && 'justify-center px-0',
            )}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!sidebarCollapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[300px] flex-col bg-sidebar shadow-2xl outline-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <Brand />
              <DialogPrimitive.Close className="rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-active" aria-label="Close navigation">
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 py-4">
              <NavList onNavigate={() => setMobileNavOpen(false)} />
            </div>
            <DrawerAccount />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur sm:h-16 sm:px-6">
          <button
            type="button"
            className="-ml-1 rounded-lg p-2 text-foreground hover:bg-muted md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <Flame className="size-5 text-primary" aria-hidden />
            <span className="font-bold tracking-wide">{APP_NAME}</span>
          </div>
          <p className="hidden truncate text-sm font-semibold md:block">{current?.label ?? APP_NAME}</p>
          <div className="ml-auto flex items-center gap-2">
            <OfflineBadge />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>

        <footer className="no-print hidden border-t px-6 py-3 text-[11px] leading-relaxed text-muted-foreground md:block">{CLINICAL_DISCLAIMER}</footer>

        {/* Mobile bottom navigation */}
        <nav
          aria-label="Quick navigation"
          className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {NAV_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.to)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground', isActive && 'text-primary')
              }
            >
              <item.icon className="size-5" aria-hidden />
              {item.short}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className="size-5" aria-hidden />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}
