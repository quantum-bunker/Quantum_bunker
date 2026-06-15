import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Plus, LogIn, Trash2, ShieldCheck, Activity, Terminal, Sun, Moon, Menu } from 'lucide-react';
import { useRelay } from './useRelay';
import { useSession } from './useSession';
import { useMembership } from './useMembership';
import { useContacts } from './useContacts';
import { useIdentity } from './useIdentity';
import ChatRoom from './components/ChatRoom';
import MembershipPanel from './components/MembershipPanel';
import ContactBook from './components/ContactBook';
import IdentityPanel from './components/IdentityPanel';

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
  const [securityOptions, setSecurityOptions] = useState({
    blur: true,
    antiCapture: false
  });
  const [isFocused, setIsFocused] = useState(document.hasFocus());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createSessionName, setCreateSessionName] = useState('');

  const {
    sessionId, sessionName, peerId, isHost, expiresAt, timeLeft, isExpired, savedSessions,
    createSession: initSession, joinSession: connectSession, resetSession, destroySession
  } = useSession();

  const membership = useMembership();
  const contacts = useContacts();
  const identity = useIdentity();

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
    if (joinMatch) { setJoinId(joinMatch[1].trim()); window.history.replaceState({}, '', '/'); return; }
    const params = new URLSearchParams(window.location.search);
    const vault = params.get('vault');
    if (vault) { setJoinId(vault.trim()); window.history.replaceState({}, '', window.location.pathname); }
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
            <label className="flex items-center gap-1.5 cursor-pointer group" title="Enable Anti-Capture Mode (Disrupts cameras)">
              <input type="checkbox" checked={securityOptions.antiCapture} onChange={(e) => setSecurityOptions(prev => ({...prev, antiCapture: e.target.checked}))} className="accent-amber-500 w-3 h-3 cursor-pointer" />
              <span className="text-[10px] font-mono text-slate-500 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors uppercase">Anti-Capture</span>
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
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={securityOptions.antiCapture} onChange={(e) => setSecurityOptions(prev => ({...prev, antiCapture: e.target.checked}))} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 uppercase">Anti-Capture Mode</span>
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
              <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-12 lg:py-20 flex flex-col gap-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
                  <div className="lg:col-span-8 space-y-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse">
                      <ShieldCheck size={14} />Quantum Hardened Security_
                    </div>
                    <h1 className="text-6xl sm:text-8xl font-black tracking-tighter leading-[0.9] text-slate-900 dark:text-white">BUNKER <br /><span className="text-cyan-500 italic opacity-80">PROTOCOL.</span></h1>
                    <p className="text-slate-500 dark:text-slate-500 text-xl leading-relaxed max-w-xl font-mono italic">Stateless message routing. Ephemeral handshakes. <br /><span className="text-slate-400 dark:text-slate-600">No logs. No storage. No traces.</span></p>
                  </div>
                  <div className="lg:col-span-4 hidden lg:block pb-2">
                    <div className="flex flex-col gap-4 border-l-2 border-cyan-500/30 pl-6">
                      <div className="flex items-center gap-4"><Activity size={16} className="text-cyan-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Relay_Node: ACTIVE</span></div>
                      <div className="flex items-center gap-4"><ShieldCheck size={16} className="text-emerald-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Encryption: Noise_XX</span></div>
                      <div className="flex items-center gap-4"><Terminal size={16} className="text-amber-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Uptime: 99.998%</span></div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                  <div className="xl:col-span-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Init Vault */}
                      <div className="group p-8 glass-panel hover:border-cyan-500/50 transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl group-hover:bg-cyan-500/10 transition-colors" />
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400"><Plus size={24} /></div>
                          <div><h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Init_Vault</h3><p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Spawn unique relay hash</p></div>
                        </div>
                        <div className="space-y-4 relative z-10">
                          <input type="text" value={createSessionName} onChange={(e) => setCreateSessionName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} placeholder="VAULT_LABEL (OPTIONAL)" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                          <button onClick={handleCreate} disabled={isCreating} className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-white dark:text-cyan-400 border border-cyan-500/50 font-mono font-bold text-xs uppercase transition-all tracking-widest flex items-center justify-center gap-2">
                            {isCreating ? 'PROCESS_INIT...' : 'CREATE_BUNKER'}
                          </button>
                        </div>
                      </div>

                      {/* Enter Vault */}
                      <div className="group p-8 glass-panel hover:border-cyan-500/50 transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500/5 blur-3xl group-hover:bg-cyan-500/10 transition-colors" />
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-12 h-12 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-slate-400"><LogIn size={24} /></div>
                          <div><h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Enter_Vault</h3><p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Join via existing hash</p></div>
                        </div>
                        <div className="space-y-3 relative z-10">
                          <input type="text" value={joinId} onChange={(e) => setJoinId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) handleJoin(joinId); }} placeholder="VAULT_HASH_ID" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                          <div className="flex gap-2">
                            <input type="text" value={joinMsg} onChange={(e) => setJoinMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) handleJoin(joinId); }} placeholder="IDENT_TAG" className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                            <button onClick={() => handleJoin(joinId)} disabled={!joinId.trim()} className="bg-slate-900 dark:bg-white text-white dark:text-black font-mono font-bold text-[10px] uppercase px-6 hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all disabled:opacity-30">
                              {savedSessions.some(s => s.id === joinId.trim()) ? 'RECONNECT' : 'JOIN'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Feature cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { icon: ShieldCheck, title: 'Zero Storage', desc: 'No messages ever touch a disk. Pure volatile memory routing.' },
                        { icon: Lock, title: 'End-to-End', desc: 'Noise Protocol XX handshake ensures absolute privacy between peers.' },
                        { icon: Activity, title: 'Auto Decay', desc: 'Sessions self-destruct after inactivity. No traces left behind.' }
                      ].map((item, i) => (
                        <div key={i} className="p-5 border border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] space-y-3">
                          <item.icon size={18} className="text-cyan-500/50" />
                          <h4 className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">{item.title}</h4>
                          <p className="text-[10px] font-mono text-slate-500 leading-relaxed uppercase tracking-tighter">{item.desc}</p>
                        </div>
                      ))}
                    </div>

                    <IdentityPanel identity={identity} />

                    <MembershipPanel membership={membership} hostSessions={savedSessions.filter(s => s.role === 'host')} />

                    <ContactBook membership={membership} contacts={contacts} hostSessions={savedSessions.filter(s => s.role === 'host')} />
                  </div>

                  {/* Vault History */}
                  <div className="xl:col-span-4 space-y-6">
                    <div className="h-full flex flex-col p-8 glass-panel min-h-[400px]">
                      <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />Active_Vault_History
                      </h3>
                      <div className="flex-1 space-y-3 custom-scrollbar pr-2">
                        {savedSessions.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-4 opacity-40">
                            <Activity size={32} className="text-slate-400" />
                            <p className="text-[10px] font-mono text-slate-400 italic uppercase tracking-tighter">History_Buffer_Empty</p>
                          </div>
                        ) : savedSessions.map((session) => (
                          <div key={session.id} className="flex gap-2 w-full">
                            <button onClick={() => handleJoin(session.id)} className="flex-1 text-left p-4 border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group min-w-0">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate pr-2 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{session.name || session.id.substring(0, 8)}</span>
                                <span className={`text-[8px] font-mono px-2 py-0.5 rounded-sm ${session.role === 'host' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>{session.role.toUpperCase()}</span>
                              </div>
                              <div className="text-[9px] font-mono text-slate-500 flex items-center gap-2"><span className="opacity-50">HASH:</span><span className="text-cyan-600/70 dark:text-cyan-400/50 truncate">{session.id.substring(0, 12)}...</span></div>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="text-[8px] font-mono text-slate-400 flex items-center gap-1.5"><Activity size={8} />{new Date(session.lastJoined).toLocaleString()}</div>
                                <span className="text-[9px] font-mono font-bold text-cyan-600 dark:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase border border-cyan-500/30 px-2 py-0.5 bg-cyan-500/10">Reconnect</span>
                              </div>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); destroySession(session.id); }} title="Destroy Session" className="w-12 flex items-center justify-center border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 hover:border-red-500/30 hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all shrink-0">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-black/5 dark:border-white/5 text-[9px] font-mono text-slate-400 uppercase tracking-[0.2em]">
                  <div className="flex gap-8"><span>STATUS: ALL_SYSTEMS_GO</span><span className="hidden sm:inline">LATENCY: OPTIMAL</span></div>
                  <div className="flex gap-8"><span>LOAD: 0.0012%</span><span className="text-cyan-500/50">SECURE_TUNNEL_READY</span></div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex overflow-hidden">
              <ChatRoom sessionId={sessionId!} sessionName={sessionName} peerId={peerId!} isHost={isHost} expiresAt={expiresAt} timeLeft={timeLeft} isExpired={isExpired} securityOptions={securityOptions} reset={reset} identity={identity.identity} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

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
