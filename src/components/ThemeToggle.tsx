'use client';

import { useThemePreference } from '@/hooks/useTheme';
import { setThemePreference, ThemePreference } from '@/utils/theme';

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'Auto',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

// Segmented Light / Dark / Auto switch. "Auto" follows the device setting.
export default function ThemeToggle() {
  const pref = useThemePreference();

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          aria-label={o.value === 'system' ? 'Auto (match device)' : o.label}
          title={o.value === 'system' ? 'Auto: match your device' : `${o.label} theme`}
          onClick={() => setThemePreference(o.value)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
