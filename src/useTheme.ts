import { useCallback, useEffect, useState } from 'react';

export type ThemeFamily = 'geeky' | 'halo';
export type ThemeMode = 'light' | 'dark';

export const THEME_FAMILIES: { id: ThemeFamily; label: string; hint: string }[] = [
  { id: 'geeky', label: 'Geeky', hint: 'Terminal · mono · neon' },
  { id: 'halo', label: 'Halo', hint: 'Soft · rounded · calm' },
];

const FAMILY_KEY = 'qb-theme-id';
const MODE_KEY = 'qb-theme';

function readFamily(): ThemeFamily {
  const saved = localStorage.getItem(FAMILY_KEY);
  return saved === 'halo' ? 'halo' : 'geeky';
}

function readMode(): ThemeMode {
  const saved = localStorage.getItem(MODE_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

// Owns the two independent theme axes (family + light/dark mode) and reflects
// them onto the document: data-theme drives the --qb-* token set, .dark drives
// light/dark surfaces. Persisted to localStorage so a reload restores both.
export function useTheme() {
  const [family, setFamilyState] = useState<ThemeFamily>(readFamily);
  const [mode, setModeState] = useState<ThemeMode>(readMode);

  useEffect(() => {
    localStorage.setItem(FAMILY_KEY, family);
    document.documentElement.dataset.theme = family;
    document.body.dataset.theme = family;
  }, [family]);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
    const isDark = mode === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
  }, [mode]);

  const setFamily = useCallback((next: ThemeFamily) => setFamilyState(next), []);
  const toggleMode = useCallback(
    () => setModeState(prev => (prev === 'light' ? 'dark' : 'light')),
    [],
  );

  return { family, mode, setFamily, toggleMode };
}
