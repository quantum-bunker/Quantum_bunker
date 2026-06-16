import { Lock, Plus, LogIn, Trash2, ShieldCheck, Activity, Terminal, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useSession } from '../useSession';
import { useMembership } from '../useMembership';
import { useContacts } from '../useContacts';
import { useIdentity } from '../useIdentity';
import MembershipPanel from './MembershipPanel';
import ContactBook from './ContactBook';
import IdentityPanel from './IdentityPanel';

type SavedSession = ReturnType<typeof useSession>['savedSessions'][number];

const FEATURE_CARDS = [
  { icon: ShieldCheck, title: 'Zero Storage', desc: 'No messages ever touch a disk. Pure volatile memory routing.' },
  { icon: Lock, title: 'End-to-End', desc: 'Noise Protocol XX handshake ensures absolute privacy between peers.' },
  { icon: Activity, title: 'Auto Decay', desc: 'Sessions self-destruct after inactivity. No traces left behind.' },
];

// Landing view: create/enter a vault, browse reconnect history, and (collapsed)
// access-control panels for identity, whitelist and trusted contacts.
export function HomeView({
  createSessionName, onCreateSessionNameChange, onCreate, isCreating,
  joinId, onJoinIdChange, joinMsg, onJoinMsgChange, onJoin,
  savedSessions, onDestroySession,
  advOpen, onToggleAdv,
  identity, membership, contacts,
}: {
  createSessionName: string;
  onCreateSessionNameChange: (value: string) => void;
  onCreate: () => void;
  isCreating: boolean;
  joinId: string;
  onJoinIdChange: (value: string) => void;
  joinMsg: string;
  onJoinMsgChange: (value: string) => void;
  onJoin: (id: string) => void;
  savedSessions: SavedSession[];
  onDestroySession: (id: string) => void;
  advOpen: boolean;
  onToggleAdv: () => void;
  identity: ReturnType<typeof useIdentity>;
  membership: ReturnType<typeof useMembership>;
  contacts: ReturnType<typeof useContacts>;
}) {
  const hostSessions = savedSessions.filter(s => s.role === 'host');
  return (
    <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-6 lg:py-8 flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="qb-chip inline-flex items-center gap-2 px-3 py-1 text-[9px] qb-label">
            <ShieldCheck size={12} />Quantum Hardened Security_
          </div>
          <h1 className="qb-title text-3xl sm:text-5xl font-black tracking-tighter leading-[0.95]">BUNKER <span className="qb-accent-text italic opacity-80">PROTOCOL.</span></h1>
          <p className="qb-muted text-sm sm:text-base italic" style={{ fontFamily: 'var(--qb-font)' }}>Stateless routing · Ephemeral handshakes · No logs, no storage, no traces.</p>
        </div>
        <div className="hidden md:flex flex-wrap items-center gap-x-6 gap-y-2 shrink-0">
          <div className="flex items-center gap-2"><Activity size={14} className="qb-accent-text" /><span className="qb-label text-[10px]">Relay: ACTIVE</span></div>
          <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-500" /><span className="qb-label text-[10px]">Noise_XX</span></div>
          <div className="flex items-center gap-2"><Terminal size={14} className="text-amber-500" /><span className="qb-label text-[10px]">Uptime 99.998%</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Init Vault */}
            <div className="group p-8 qb-panel hover:qb-accent-border transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 blur-3xl transition-colors" style={{ background: 'var(--qb-accent-soft)' }} />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 qb-accent-soft-bg border qb-accent-border qb-rounded-sm flex items-center justify-center qb-accent-text"><Plus size={24} /></div>
                <div><h3 className="qb-title text-base font-bold tracking-widest">Init_Vault</h3><p className="qb-muted text-[11px] mt-0.5" style={{ fontFamily: 'var(--qb-font)' }}>Spawn unique relay hash</p></div>
              </div>
              <div className="space-y-4 relative z-10">
                <input type="text" value={createSessionName} onChange={(e) => onCreateSessionNameChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); }} placeholder="VAULT_LABEL (OPTIONAL)" className="qb-input qb-accent-text w-full px-4 py-3 text-xs" />
                <button onClick={onCreate} disabled={isCreating} className="qb-btn-accent w-full h-12 font-bold text-xs tracking-widest flex items-center justify-center gap-2">
                  {isCreating ? 'PROCESS_INIT...' : 'CREATE_BUNKER'}
                </button>
              </div>
            </div>

            {/* Enter Vault */}
            <div className="group p-8 qb-panel hover:qb-accent-border transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500/5 blur-3xl group-hover:opacity-80 transition-colors" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 bg-black/5 dark:bg-white/5 border qb-border qb-rounded-sm flex items-center justify-center text-slate-400"><LogIn size={24} /></div>
                <div><h3 className="qb-title text-base font-bold tracking-widest">Enter_Vault</h3><p className="qb-muted text-[11px] mt-0.5" style={{ fontFamily: 'var(--qb-font)' }}>Join via existing hash</p></div>
              </div>
              <div className="space-y-3 relative z-10">
                <input type="text" value={joinId} onChange={(e) => onJoinIdChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) onJoin(joinId); }} placeholder="VAULT_HASH_ID" className="qb-input qb-accent-text w-full px-4 py-3 text-xs" />
                <div className="flex gap-2">
                  <input type="text" value={joinMsg} onChange={(e) => onJoinMsgChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) onJoin(joinId); }} placeholder="IDENT_TAG" className="qb-input qb-accent-text flex-1 px-4 py-3 text-xs" />
                  <button onClick={() => onJoin(joinId)} disabled={!joinId.trim()} className="qb-btn-accent font-bold text-[10px] px-6 disabled:opacity-30 qb-rounded-sm">
                    {savedSessions.some(s => s.id === joinId.trim()) ? 'RECONNECT' : 'JOIN'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURE_CARDS.map((item, i) => (
              <div key={i} className="qb-panel-flat p-5 space-y-3">
                <item.icon size={18} className="qb-accent-text opacity-60" />
                <h4 className="qb-title text-[11px] font-bold tracking-widest">{item.title}</h4>
                <p className="qb-muted text-[10px] leading-relaxed" style={{ fontFamily: 'var(--qb-font)' }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="qb-panel-flat">
            <button
              onClick={onToggleAdv}
              className="w-full flex items-center justify-between px-5 py-4 group"
            >
              <span className="flex items-center gap-3">
                <SlidersHorizontal size={16} className="qb-accent-text opacity-70" />
                <span className="text-left">
                  <span className="qb-title block text-xs font-bold tracking-widest">Access Control</span>
                  <span className="qb-label block text-[9px] mt-0.5">Identity · Whitelist · Trusted Contacts</span>
                </span>
              </span>
              <ChevronDown size={18} className={`text-slate-400 transition-transform ${advOpen ? 'rotate-180' : ''}`} />
            </button>
            {advOpen && (
              <div className="px-5 pb-5 space-y-8 border-t qb-border pt-5">
                <IdentityPanel identity={identity} />
                <MembershipPanel membership={membership} hostSessions={hostSessions} />
                <ContactBook membership={membership} contacts={contacts} hostSessions={hostSessions} />
              </div>
            )}
          </div>
        </div>

        {/* Vault History */}
        <div className="xl:col-span-4 space-y-6">
          <div className="h-full flex flex-col p-8 qb-panel min-h-[400px]">
            <h3 className="qb-label text-[10px] font-bold mb-6 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full qb-accent-bg animate-pulse" />Active_Vault_History
            </h3>
            <div className="flex-1 space-y-3 custom-scrollbar pr-2">
              {savedSessions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-4 opacity-40">
                  <Activity size={32} className="text-slate-400" />
                  <p className="qb-muted text-[10px] italic">History_Buffer_Empty</p>
                </div>
              ) : savedSessions.map((session) => (
                <div key={session.id} className="flex gap-2 w-full">
                  <button onClick={() => onJoin(session.id)} className="qb-panel-flat flex-1 text-left p-4 hover:qb-accent-border hover:qb-accent-soft-bg transition-all group min-w-0">
                    <div className="flex justify-between items-start mb-2">
                      <span className="qb-title text-xs font-bold truncate pr-2 group-hover:qb-accent-text transition-colors">{session.name || session.id.substring(0, 8)}</span>
                      <span className={`text-[8px] px-2 py-0.5 rounded-sm ${session.role === 'host' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`} style={{ fontFamily: 'var(--qb-font)' }}>{session.role.toUpperCase()}</span>
                    </div>
                    <div className="qb-muted text-[9px] flex items-center gap-2" style={{ fontFamily: 'var(--qb-font)' }}><span className="opacity-50">HASH:</span><span className="qb-accent-text opacity-70 truncate">{session.id.substring(0, 12)}...</span></div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="qb-muted text-[8px] flex items-center gap-1.5" style={{ fontFamily: 'var(--qb-font)' }}><Activity size={8} />{new Date(session.lastJoined).toLocaleString()}</div>
                      <span className="qb-chip text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5">Reconnect</span>
                    </div>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDestroySession(session.id); }} title="Destroy Session" className="qb-panel-flat w-12 flex items-center justify-center hover:border-red-500/30 hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="qb-label flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t qb-border text-[9px]">
        <div className="flex gap-8"><span>STATUS: ALL_SYSTEMS_GO</span><span className="hidden sm:inline">LATENCY: OPTIMAL</span></div>
        <div className="flex gap-8"><span>LOAD: 0.0012%</span><span className="qb-accent-text opacity-70">SECURE_TUNNEL_READY</span></div>
      </div>
    </div>
  );
}
