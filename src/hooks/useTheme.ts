'use client';

import { useSyncExternalStore } from 'react';
import type { ThemePreference } from '@/utils/theme';

// Re-renders when data-theme / data-theme-pref on <html> change
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-pref'] });
  return () => observer.disconnect();
}

/** The theme in effect: 'light' or 'dark'. */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
    () => 'dark'
  );
}

/** The user's choice: 'light', 'dark' or 'system'. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    () => {
      const p = document.documentElement.dataset.themePref;
      return p === 'light' || p === 'dark' ? p : 'system';
    },
    () => 'system'
  );
}
