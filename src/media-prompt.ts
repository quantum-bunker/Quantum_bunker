// Tracks whether a camera/microphone permission prompt is on screen.
//
// Exists to resolve a direct conflict between two features: App's focus
// blackout covers the app whenever the window loses focus (a privacy feature,
// always on in chat), and a getUserMedia prompt takes focus away. The result was
// that granting camera access blanked the screen. The blackout stays — this
// just suppresses it for the brief window around the prompt.
//
// A module-level signal rather than a prop: the blackout lives in App and the
// prompt is raised deep inside useCall, with ChatRoom and useRelay in between.

import { useEffect, useState } from 'react';

// The prompt itself is dismissed before the window regains focus, so the
// suppression outlives the await by a moment to cover the handover.
const SETTLE_GRACE_MS = 2000;

let active = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(value: boolean) => void>();

function notify(): void {
  const value = isMediaPromptActive();
  for (const listener of listeners) listener(value);
}

export function isMediaPromptActive(): boolean {
  return active > 0 || releaseTimer !== null;
}

export function beginMediaPrompt(): void {
  active += 1;
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  notify();
}

export function endMediaPrompt(): void {
  active = Math.max(0, active - 1);
  if (active > 0) return;
  if (releaseTimer !== null) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    notify();
  }, SETTLE_GRACE_MS);
  notify();
}

export function subscribeMediaPrompt(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useMediaPrompt(): boolean {
  const [value, setValue] = useState(isMediaPromptActive);
  useEffect(() => subscribeMediaPrompt(setValue), []);
  return value;
}
