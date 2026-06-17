import { useCallback, useEffect, useState } from 'react';

export type ThemeFamily = 'geeky' | 'halo' | 'classic';
export type ThemeMode = 'light' | 'dark';

export const THEME_FAMILIES: { id: ThemeFamily; label: string; hint: string }[] = [
  { id: 'geeky', label: 'Geeky', hint: 'Terminal · mono · neon' },
  { id: 'halo', label: 'Halo', hint: 'Soft · rounded · calm' },
  { id: 'classic', label: 'Classic', hint: 'Elegant · serif · timeless' },
];

const FAMILY_KEY = 'qb-theme-id';
const MODE_KEY = 'qb-theme';

// Private-browsing modes and storage-disabled contexts throw on access, so all
// reads/writes are guarded — theme is a preference, never worth crashing for.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable — the in-memory state still drives the UI this session
  }
}

function readFamily(): ThemeFamily {
  const saved = readStorage(FAMILY_KEY);
  return saved === 'halo' || saved === 'classic' ? saved : 'geeky';
}

function readMode(): ThemeMode {
  const saved = readStorage(MODE_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

// Owns the two independent theme axes (family + light/dark mode) and reflects
// them onto the document: data-theme drives the --qb-* token set, .dark drives
// light/dark surfaces. Persisted to localStorage so a reload restores both.
export function useTheme() {
  const [family, setFamilyState] = useState<ThemeFamily>(readFamily);
  const [mode, setModeState] = useState<ThemeMode>(readMode);

  useEffect(() => {
    writeStorage(FAMILY_KEY, family);
    document.documentElement.dataset.theme = family;
    document.body.dataset.theme = family;
  }, [family]);

  useEffect(() => {
    writeStorage(MODE_KEY, mode);
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
