import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSettings } from '@/hooks/useSettings';

/** Applies the theme preference to <html> and offers a quick toggle. */
export function useApplyTheme() {
  const { settings } = useSettings();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#050b16' : '#0b1730');
  }, [dark]);
  return dark;
}

export function ThemeToggle() {
  const { settings, update } = useSettings();
  const order = ['system', 'light', 'dark'] as const;
  const next = order[(order.indexOf(settings.theme) + 1) % order.length]!;
  const Icon = settings.theme === 'dark' ? Moon : settings.theme === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => void update('theme', next)}
      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={`Theme: ${settings.theme}. Switch to ${next}.`}
      title={`Theme: ${settings.theme}`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
