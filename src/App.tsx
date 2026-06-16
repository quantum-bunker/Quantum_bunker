import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Sun, Moon, Menu } from 'lucide-react';
import { useSession } from './useSession';
import { useMembership } from './useMembership';
import { useContacts } from './useContacts';
import { useIdentity } from './useIdentity';
import ChatRoom from './components/ChatRoom';
import { HomeView } from './components/HomeView';
import { JoinLinkModal } from './components/JoinLinkModal';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('qb-theme');
    return (saved as 'light' | 'dark') || 'dark';
  });
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
    localStorage.setItem('qb-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [theme]);

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

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

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
    <div className={`h-screen w-full ${theme === 'dark' ? 'dark' : ''} bg-ui-bg dark:bg-brand-bg text-ui-text dark:text-slate-300 font-sans selection:bg-cyan-500/30 flex flex-col overflow-hidden`}>
      {(!isFocused && view === 'chat') && <div className="fixed inset-0 bg-black z-[99999] pointer-events-none flex items-center justify-center" />}

      <header className="h-16 border-b border-black/5 dark:border-white/10 flex items-center justify-between px-4 sm:px-6 bg-ui-elevated dark:bg-brand-elevated shrink-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={reset}>
          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-cyan-400" />
          </div>
          <span className="font-mono font-bold tracking-widest text-slate-900 dark:text-white uppercase sm:text-base text-[10px]">
            QUANTUM_BUNKER <span className="text-cyan-500 text-[10px] font-normal ml-2 opacity-70 hidden md:inline">v1.0.4-RELAY</span>
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="hidden md:flex items-center gap-4 border-r border-black/10 dark:border-white/10 pr-4 sm:pr-6">
            <label className="flex items-center gap-1.5 cursor-pointer group" title="Enable Message Blurring (Hover to reveal)">
              <input type="checkbox" checked={securityOptions.blur} onChange={(e) => setSecurityOptions(prev => ({...prev, blur: e.target.checked}))} className="accent-cyan-500 w-3 h-3 cursor-pointer" />
              <span className="text-[10px] font-mono text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors uppercase">Blur</span>
            </label>
          </div>
          <button onClick={toggleTheme} className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 transition-colors" title="Toggle theme">
            {theme === 'light' ? <Moon size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Sun size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono tracking-tighter uppercase hidden lg:block">Relay Node: AIS-DEFAULT</span>
          </div>
          {view === 'chat' && (
            <button onClick={handleDestroy} className="px-2 sm:px-4 py-1.5 border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 text-[10px] font-mono transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase flex items-center gap-2">
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
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="md:hidden border-b border-black/5 dark:border-white/10 bg-ui-elevated dark:bg-brand-elevated px-4 py-4 flex flex-col gap-4 overflow-hidden z-40">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-widest">Security Settings</span>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={securityOptions.blur} onChange={(e) => setSecurityOptions(prev => ({...prev, blur: e.target.checked}))} className="accent-cyan-500 w-4 h-4 cursor-pointer" />
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 uppercase">Message Blurring</span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto custom-scrollbar relative bg-ui-bg dark:bg-brand-bg">
              <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] dark:opacity-[0.05] pointer-events-none" />
              <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />
              <div className="scanline" />
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

      <footer className="h-8 border-t border-black/5 dark:border-white/10 bg-ui-elevated dark:bg-brand-elevated px-4 flex items-center justify-between text-[10px] font-mono shrink-0">
        <div className="flex gap-6">
          <span className="hidden sm:inline">ENCRYPTION: <span className="text-slate-900 dark:text-white uppercase">Noise_XX + DoubleRatchet</span></span>
          <span>TRANSPORT: <span className="text-slate-900 dark:text-white">WSS/1.1</span></span>
        </div>
        <div className="flex gap-4">
          <span className="text-slate-500 hidden md:inline uppercase tracking-tighter">Contract: v1.0.4</span>
          <span className="text-emerald-500 dark:text-emerald-500 flex items-center gap-1.5 uppercase font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Node_Stable</span>
        </div>
      </footer>
    </div>
  );
}
