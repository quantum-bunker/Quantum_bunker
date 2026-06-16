import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Sun, Moon, Menu, Palette } from 'lucide-react';
import { useSession } from './useSession';
import { useMembership } from './useMembership';
import { useContacts } from './useContacts';
import { useIdentity } from './useIdentity';
import { useTheme, THEME_FAMILIES } from './useTheme';
import ChatRoom from './components/ChatRoom';
import { HomeView } from './components/HomeView';
import { ClassicHome } from './components/ClassicHome';
import { JoinLinkModal } from './components/JoinLinkModal';

export default function App() {
  const { family, mode, setFamily, toggleMode } = useTheme();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [view, setView] = useState<'home' | 'chat'>(() => {
    return sessionStorage.getItem('qb-sessionId') ? 'chat' : 'home';
  });
  const [isCreating, setIsCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const [securityOptions, setSecurityOptions] = useState<{ blur: boolean }>(() => ({
    blur: localStorage.getItem('qb-blur') !== 'false'
  }));
  const [isFocused, setIsFocused] = useState(document.hasFocus());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createSessionName, setCreateSessionName] = useState('');
  const [advOpen, setAdvOpen] = useState(false);
  const [linkJoin, setLinkJoin] = useState<string | null>(null);

  const {
    sessionId, sessionName, peerId, isHost, expiresAt, timeLeft, isExpired, savedSessions,
    createSession: initSession, joinSession: connectSession, resetSession, destroySession
  } = useSession();

  const membership = useMembership();
  const contacts = useContacts();
  const identity = useIdentity();

  useEffect(() => {
    localStorage.setItem('qb-blur', securityOptions.blur ? 'true' : 'false');
  }, [securityOptions.blur]);

  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.key === 'Meta' || e.key === 'PrintScreen') setIsFocused(false);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && e.key !== 'Meta' && e.key !== 'PrintScreen' && document.hasFocus()) setIsFocused(true);
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const joinMatch = window.location.pathname.match(/^\/join\/([^/]+)$/);
    if (joinMatch) {
      const id = joinMatch[1].trim();
      setJoinId(id);
      if (!sessionStorage.getItem('qb-sessionId')) setLinkJoin(id);
      window.history.replaceState({}, '', '/');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const vault = params.get('vault');
    if (vault) {
      const id = vault.trim();
      setJoinId(id);
      if (!sessionStorage.getItem('qb-sessionId')) setLinkJoin(id);
      window.history.replaceState({}, '', window.location.pathname);
    }
    // A trust handshake link pins the sender's key into the contact book. Trust
    // is purely client-side — nothing about this contact reaches the server.
    const trust = params.get('trust');
    if (trust) { contacts.pinFromTrustLink(trust); window.history.replaceState({}, '', window.location.pathname); }
  }, [contacts]);

  const handleCreate = async () => {
    setIsCreating(true);
    try { await initSession(createSessionName, membership.hostPublicKey); setView('chat'); }
    catch { alert('Failed to create session'); }
    finally { setIsCreating(false); }
  };

  const handleJoin = async (id: string) => {
    try { localStorage.setItem('qb-join-msg', joinMsg || 'Hello'); await connectSession(id); setView('chat'); }
    catch { alert('Vault not found or expired.'); }
  };

  const reset = () => { resetSession(); setView('home'); };
  const handleDestroy = () => { destroySession(); setView('home'); };

  return (
    <div className={`qb-app h-screen w-full ${mode === 'dark' ? 'dark' : ''} selection:bg-cyan-500/30 flex flex-col overflow-hidden`}>
      {(!isFocused && view === 'chat') && <div className="fixed inset-0 bg-black z-[99999] pointer-events-none flex items-center justify-center" />}

      <header className="qb-surface h-16 border-b flex items-center justify-between px-4 sm:px-6 shrink-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={reset}>
          <div className="w-6 h-6 sm:w-8 sm:h-8 qb-accent-soft-bg border qb-accent-border qb-rounded-sm flex items-center justify-center">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 qb-accent-bg qb-rounded-sm" />
          </div>
          <span className="qb-title font-bold tracking-widest sm:text-base text-[10px]">
            {family === 'classic' ? 'Quantum Bunker' : 'QUANTUM_BUNKER'}
            {family !== 'classic' && <span className="qb-accent-text text-[10px] font-normal ml-2 opacity-70 hidden md:inline">v1.0.4-RELAY</span>}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="hidden md:flex items-center gap-4 border-r qb-border pr-4 sm:pr-6">
            <label className="flex items-center gap-1.5 cursor-pointer group" title="Enable Message Blurring (Hover to reveal)">
              <input type="checkbox" checked={securityOptions.blur} onChange={(e) => setSecurityOptions(prev => ({...prev, blur: e.target.checked}))} className="accent-cyan-500 w-3 h-3 cursor-pointer" />
              <span className="qb-label text-[10px] group-hover:qb-accent-text transition-colors">Blur</span>
            </label>
          </div>
          <div className="relative">
            <button onClick={() => setThemeMenuOpen(o => !o)} className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 transition-colors flex items-center gap-1" title="Choose theme">
              <Palette size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
            <AnimatePresence>
              {themeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setThemeMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    className="qb-panel absolute right-0 mt-2 w-48 p-1.5 z-50"
                  >
                    {THEME_FAMILIES.map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setFamily(f.id); setThemeMenuOpen(false); }}
                        className={`w-full text-left px-3 py-2 qb-rounded-sm flex flex-col gap-0.5 transition-colors ${family === f.id ? 'qb-accent-soft-bg qb-accent-text' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                      >
                        <span className="qb-title text-xs font-bold tracking-normal">{f.label}{family === f.id ? ' ·' : ''}</span>
                        <span className="qb-muted text-[10px]">{f.hint}</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button onClick={toggleMode} className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 transition-colors" title="Toggle light/dark">
            {mode === 'light' ? <Moon size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Sun size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="qb-label text-[10px] hidden lg:block">{family === 'classic' ? 'Connected' : 'Relay Node: AIS-DEFAULT'}</span>
          </div>
          {view === 'chat' && (
            <button onClick={handleDestroy} className="qb-btn px-2 sm:px-4 py-1.5 text-[10px] hover:!text-red-500 hover:!border-red-500/40 hover:!bg-red-500/10 flex items-center gap-2 qb-label">
              <Trash2 size={12} /><span className="hidden sm:inline">Destroy_Session</span>
            </button>
          )}
          <button className="md:hidden p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu size={18} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="qb-surface md:hidden border-b px-4 py-4 flex flex-col gap-5 overflow-hidden z-40">
            <div className="flex flex-col gap-3">
              <span className="qb-label text-[10px] font-bold">Theme</span>
              <div className="flex gap-2">
                {THEME_FAMILIES.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFamily(f.id)}
                    className={`flex-1 px-3 py-2 qb-rounded-sm border text-xs font-bold transition-colors ${family === f.id ? 'qb-accent-bg border-transparent' : 'qb-border qb-text hover:qb-accent-text'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <span className="qb-label text-[10px] font-bold">Security Settings</span>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={securityOptions.blur} onChange={(e) => setSecurityOptions(prev => ({...prev, blur: e.target.checked}))} className="accent-cyan-500 w-4 h-4 cursor-pointer" />
                <span className="qb-text text-xs">Message Blurring</span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="qb-app flex-1 overflow-y-auto custom-scrollbar relative">
              <div className={`absolute inset-0 bg-grid-pattern opacity-[0.03] dark:opacity-[0.05] pointer-events-none ${family === 'geeky' ? '' : 'hidden'}`} />
              <div className="absolute top-0 left-0 w-full h-[500px] pointer-events-none" style={{ background: 'linear-gradient(to bottom, var(--qb-accent-soft), transparent)' }} />
              <div className="scanline" />
              {family === 'classic' ? (
                <ClassicHome
                  createSessionName={createSessionName}
                  onCreateSessionNameChange={setCreateSessionName}
                  onCreate={handleCreate}
                  isCreating={isCreating}
                  joinId={joinId}
                  onJoinIdChange={setJoinId}
                  joinMsg={joinMsg}
                  onJoinMsgChange={setJoinMsg}
                  onJoin={handleJoin}
                  savedSessions={savedSessions}
                  onDestroySession={destroySession}
                  advOpen={advOpen}
                  onToggleAdv={() => setAdvOpen(o => !o)}
                  identity={identity}
                  membership={membership}
                  contacts={contacts}
                />
              ) : (
                <HomeView
                  createSessionName={createSessionName}
                  onCreateSessionNameChange={setCreateSessionName}
                  onCreate={handleCreate}
                  isCreating={isCreating}
                  joinId={joinId}
                  onJoinIdChange={setJoinId}
                  joinMsg={joinMsg}
                  onJoinMsgChange={setJoinMsg}
                  onJoin={handleJoin}
                  savedSessions={savedSessions}
                  onDestroySession={destroySession}
                  advOpen={advOpen}
                  onToggleAdv={() => setAdvOpen(o => !o)}
                  identity={identity}
                  membership={membership}
                  contacts={contacts}
                />
              )}
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex overflow-hidden">
              <ChatRoom sessionId={sessionId!} sessionName={sessionName} peerId={peerId!} isHost={isHost} expiresAt={expiresAt} timeLeft={timeLeft} isExpired={isExpired} securityOptions={securityOptions} reset={reset} identity={identity.identity} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {linkJoin && view === 'home' && (
        <JoinLinkModal
          vaultId={linkJoin}
          joinMsg={joinMsg}
          isReconnect={savedSessions.some(s => s.id === linkJoin)}
          onJoinMsgChange={setJoinMsg}
          onClose={() => setLinkJoin(null)}
          onJoin={() => { setLinkJoin(null); handleJoin(linkJoin); }}
        />
      )}

      <footer className="qb-surface qb-label h-8 border-t px-4 flex items-center justify-between text-[10px] shrink-0">
        {family === 'classic' ? (
          <>
            <span className="italic">End-to-end encrypted · nothing is stored</span>
            <span className="text-emerald-500 dark:text-emerald-500 flex items-center gap-1.5 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Secure</span>
          </>
        ) : (
          <>
            <div className="flex gap-6">
              <span className="hidden sm:inline">ENCRYPTION: <span className="qb-title">Noise_XX + DoubleRatchet</span></span>
              <span>TRANSPORT: <span className="qb-title">WSS/1.1</span></span>
            </div>
            <div className="flex gap-4">
              <span className="hidden md:inline">Contract: v1.0.4</span>
              <span className="text-emerald-500 dark:text-emerald-500 flex items-center gap-1.5 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Node_Stable</span>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
