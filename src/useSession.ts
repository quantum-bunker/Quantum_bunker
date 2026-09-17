import { useState, useEffect, useCallback } from 'react';
import { CreateSessionResponse } from './shared/contracts/v1/session';
import { randomId } from './random';

export interface SavedSession {
  id: string;
  name: string;
  role: 'host' | 'user';
  lastJoined: number;
}

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem('qb-sessionId'));
  const [peerId, setPeerId] = useState<string | null>(() => sessionStorage.getItem('qb-peerId'));
  const [isHost, setIsHost] = useState(() => sessionStorage.getItem('qb-isHost') === 'true');
  const [expiresAt, setExpiresAt] = useState<number | null>(() => {
    const val = sessionStorage.getItem('qb-expiresAt');
    return val ? parseInt(val, 10) : null;
  });
  const [sessionName, setSessionName] = useState<string | null>(() => sessionStorage.getItem('qb-sessionName'));
  const [timeLeft, setTimeLeft] = useState<string>('--:--');
  const [isExpired, setIsExpired] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => {
    const saved = localStorage.getItem('qb-saved-sessions');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('qb-saved-sessions', JSON.stringify(savedSessions));
  }, [savedSessions]);

  useEffect(() => {
    if (sessionId) sessionStorage.setItem('qb-sessionId', sessionId);
    else sessionStorage.removeItem('qb-sessionId');
    
    if (peerId) sessionStorage.setItem('qb-peerId', peerId);
    else sessionStorage.removeItem('qb-peerId');

    if (sessionName) sessionStorage.setItem('qb-sessionName', sessionName);
    else sessionStorage.removeItem('qb-sessionName');

    sessionStorage.setItem('qb-isHost', isHost.toString());

    if (expiresAt) sessionStorage.setItem('qb-expiresAt', expiresAt.toString());
    else sessionStorage.removeItem('qb-expiresAt');
  }, [sessionId, peerId, sessionName, isHost, expiresAt]);

  const createSession = useCallback(async (name?: string, hostPublicKey?: string) => {
    try {
      const resp = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hostPublicKey }),
      });
      const data: CreateSessionResponse = await resp.json();
      // Host credentials are withheld only for an idempotent create, which the
      // ephemeral vault flow never performs — it always asks for a fresh id.
      if (!data.hostId || !data.hostRecoveryToken) {
        throw new Error('Relay withheld host credentials for a new vault');
      }
      setSessionId(data.sessionId);
      setSessionName(data.name || null);
      setExpiresAt(data.expiresAt);
      setPeerId(data.hostId);
      setIsHost(true);
      setIsExpired(false);
      
      // Save recovery token in localStorage
      localStorage.setItem(`qb-recovery-${data.sessionId}`, data.hostRecoveryToken);
      
      setSavedSessions(prev => {
        const filtered = prev.filter(s => s.id !== data.sessionId);
        return [{
          id: data.sessionId,
          name: data.name || data.sessionId.substring(0, 8),
          role: 'host',
          lastJoined: Date.now()
        }, ...filtered];
      });

      return data;
    } catch (err) {
      console.error('Failed to create session:', err);
      throw err;
    }
  }, []);

  const joinSession = useCallback(async (id: string) => {
    const trimmedId = id.trim();
    if (!trimmedId) return;
    try {
      const resp = await fetch(`/api/sessions/${trimmedId}`);
      if (!resp.ok) {
        setSavedSessions(prev => prev.filter(s => s.id !== trimmedId));
        throw new Error('Session not found');
      }
      const data = await resp.json();
      setSessionId(trimmedId);
      setSessionName(data.name || null);
      setExpiresAt(data.expiresAt);
      
      // Check for recovery token
      const recoveryToken = localStorage.getItem(`qb-recovery-${trimmedId}`);
      const isRecoveringHost = !!recoveryToken;

      // The recovery token re-binds host authority to whatever peerId we
      // present, so a fresh random id is always safe to use.
      const existingPeerId = sessionStorage.getItem('qb-sessionId') === trimmedId
        ? sessionStorage.getItem('qb-peerId')
        : null;
      const peerIdToUse = existingPeerId || `user-${randomId(6)}`;

      setPeerId(peerIdToUse);
      setIsHost(isRecoveringHost);
      setIsExpired(false);
      
      setSavedSessions(prev => {
        const filtered = prev.filter(s => s.id !== trimmedId);
        return [{
          id: trimmedId,
          name: data.name || trimmedId.substring(0, 8),
          role: isRecoveringHost ? 'host' : 'user',
          lastJoined: Date.now()
        }, ...filtered];
      });

      return { ...data, peerId: peerIdToUse, isRecoveringHost };
    } catch (err) {
      console.error('Failed to join session:', err);
      throw err;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const headers: Record<string, string> = {};
      const hostToken = localStorage.getItem(`qb-recovery-${sessionId}`);
      if (hostToken) headers['X-Host-Token'] = hostToken;
      const peerToken = sessionStorage.getItem(`qb-peer-token-${sessionId}`);
      if (peerToken && peerId) {
        headers['X-Peer-Token'] = peerToken;
        headers['X-Peer-Id'] = peerId;
      }
      const resp = await fetch(`/api/sessions/${sessionId}/refresh`, { method: 'POST', headers });
      if (!resp.ok) throw new Error('Refresh failed');
      const data = await resp.json();
      setExpiresAt(data.expiresAt);
      return data;
    } catch (err) {
      console.error('Failed to refresh session:', err);
    }
  }, [sessionId, peerId]);

  const resetSession = useCallback(() => {
    setSessionId(null);
    setSessionName(null);
    setPeerId(null);
    setIsHost(false);
    setExpiresAt(null);
    setIsExpired(false);
    setTimeLeft('--:--');
  }, []);

  const destroySession = useCallback(async (id?: string) => {
    const targetId = id || sessionId;
    if (!targetId) return;
    try {
      const token = localStorage.getItem(`qb-recovery-${targetId}`);
      setSavedSessions(prev => prev.filter(s => s.id !== targetId));
      await fetch(`/api/sessions/${targetId}`, { 
        method: 'DELETE',
        headers: token ? { 'X-Host-Token': token } : {}
      });
      localStorage.removeItem(`qb-recovery-${targetId}`);
    } catch (err) {
      console.error('Failed to destroy session:', err);
    }
    if (targetId === sessionId) {
      resetSession();
    }
  }, [sessionId, resetSession]);

  useEffect(() => {
    if (!expiresAt) return;
    
    const updateTimer = () => {
      const now = Date.now();
      const diff = expiresAt - now;
      if (diff <= 0) {
        setTimeLeft('EXPIRED');
        setIsExpired(true);
        return false;
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        setIsExpired(false);
        
        // Auto-refresh if less than 2 minutes left
        if (diff < 2 * 60 * 1000) {
          refreshSession();
        }
        return true;
      }
    };

    updateTimer();
    const interval = setInterval(() => {
      if (!updateTimer()) clearInterval(interval);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expiresAt, refreshSession]);

  return {
    sessionId,
    sessionName,
    peerId,
    isHost,
    expiresAt,
    timeLeft,
    isExpired,
    savedSessions,
    createSession,
    joinSession,
    refreshSession,
    resetSession,
    destroySession,
  };
}
