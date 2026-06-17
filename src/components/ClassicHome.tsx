import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Hourglass, ArrowRight, Trash2, ChevronDown, KeyRound } from 'lucide-react';
import { useSession } from '../useSession';
import { useMembership } from '../useMembership';
import { useContacts } from '../useContacts';
import { useIdentity } from '../useIdentity';
import MembershipPanel from './MembershipPanel';
import ContactBook from './ContactBook';
import IdentityPanel from './IdentityPanel';

type SavedSession = ReturnType<typeof useSession>['savedSessions'][number];

const TRUST_POINTS = [
  { icon: ShieldCheck, label: 'Zero storage', detail: 'Nothing is written to disk — ever.' },
  { icon: Lock, label: 'End-to-end encrypted', detail: 'Only the people in the room can read it.' },
  { icon: Hourglass, label: 'Disappears on its own', detail: 'The room and its history simply vanish.' },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Classic landing: a calm, wide "liquid glass" entry — deliberately a different
// layout from the geeky/halo HomeView (no hashes, status readouts, or log
// chrome). Brand and action sit side-by-side inside one frosted panel over a
// slow-drifting warm gradient, so it fills the space instead of running down the
// middle. Functionality is identical; only the presentation differs.
export function ClassicHome({
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
  const [tab, setTab] = useState<'new' | 'join'>(joinId ? 'join' : 'new');
  const hostSessions = savedSessions.filter(s => s.role === 'host');
  const isReconnect = savedSessions.some(s => s.id === joinId.trim());

  return (
    <div className="relative min-h-full w-full flex items-center justify-center px-4 py-10 sm:py-14">
      <div className="qb-liquid-field" aria-hidden>
        <div className="qb-blob qb-blob-a" />
        <div className="qb-blob qb-blob-b" />
        <div className="qb-blob qb-blob-c" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-5xl flex flex-col gap-6"
      >
        {/* Hero — brand beside action, inside one liquid-glass frame */}
        <div className="qb-glass grid lg:grid-cols-[1.05fr_0.95fr] overflow-hidden">
          {/* Brand side */}
          <div className="relative p-8 sm:p-12 flex flex-col justify-between gap-10">
            <div className="space-y-5">
              <span className="qb-chip inline-flex items-center gap-2 px-3 py-1 text-[11px] font-semibold tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Private · ephemeral
              </span>
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.02]">
                <span className="qb-title block">Quantum</span>
                <span className="qb-sheen-text block italic">Bunker</span>
              </h1>
              <p className="qb-muted text-base sm:text-lg italic max-w-sm leading-relaxed">
                A private room for the people you invite — and no one else. It keeps nothing once you leave.
              </p>
            </div>

            <ul className="space-y-3.5">
              {TRUST_POINTS.map(({ icon: Icon, label, detail }) => (
                <li key={label} className="flex items-start gap-3">
                  <span className="qb-accent-soft-bg qb-accent-text shrink-0 w-9 h-9 qb-rounded-sm flex items-center justify-center">
                    <Icon size={17} />
                  </span>
                  <span className="leading-tight">
                    <span className="qb-title block text-sm font-bold">{label}</span>
                    <span className="qb-muted block text-xs italic">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action side */}
          <div className="relative p-6 sm:p-8 lg:p-10 border-t lg:border-t-0 lg:border-l qb-border flex flex-col justify-center" style={{ background: 'var(--qb-accent-soft)' }}>
            <div className="flex gap-1 p-1 qb-panel-flat mb-6">
              {(['new', 'join'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-sm font-bold tracking-wide qb-rounded-sm transition-all ${
                    tab === t ? 'qb-accent-bg shadow-sm' : 'qb-muted hover:qb-accent-text'
                  }`}
                >
                  {t === 'new' ? 'Start a room' : 'Join a room'}
                </button>
              ))}
            </div>

            {tab === 'new' ? (
              <div className="space-y-5">
                <label className="block space-y-2">
                  <span className="qb-title text-sm font-bold">Name your room</span>
                  <span className="qb-muted block text-xs italic">Optional — only your guests will see it.</span>
                  <input
                    type="text"
                    value={createSessionName}
                    onChange={(e) => onCreateSessionNameChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); }}
                    placeholder="e.g. Family, Project sync, Saturday plans"
                    className="qb-input w-full px-4 py-3 text-sm mt-1"
                  />
                </label>
                <button
                  onClick={onCreate}
                  disabled={isCreating}
                  className="qb-btn-accent w-full h-12 font-bold text-sm flex items-center justify-center gap-2"
                >
                  {isCreating ? 'Creating…' : <>Create room <ArrowRight size={16} /></>}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <label className="block space-y-2">
                  <span className="qb-title text-sm font-bold">Room code</span>
                  <input
                    type="text"
                    value={joinId}
                    onChange={(e) => onJoinIdChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) onJoin(joinId); }}
                    placeholder="Paste the code you were given"
                    className="qb-input w-full px-4 py-3 text-sm mt-1"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="qb-title text-sm font-bold">Your name</span>
                  <input
                    type="text"
                    value={joinMsg}
                    onChange={(e) => onJoinMsgChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) onJoin(joinId); }}
                    placeholder="How others will see you"
                    className="qb-input w-full px-4 py-3 text-sm mt-1"
                  />
                </label>
                <button
                  onClick={() => onJoin(joinId)}
                  disabled={!joinId.trim()}
                  className="qb-btn-accent w-full h-12 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  {isReconnect ? 'Reconnect' : 'Enter room'} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Rooms + access — balanced two-up row so the page fills width, not length */}
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {savedSessions.length > 0 && (
            <section className="qb-glass p-5 sm:p-6 space-y-3">
              <h2 className="qb-title text-sm font-bold px-1">Your rooms</h2>
              <div className="space-y-2">
                {savedSessions.map(session => (
                  <div key={session.id} className="flex items-stretch gap-2">
                    <button
                      onClick={() => onJoin(session.id)}
                      className="qb-panel-flat flex-1 min-w-0 flex items-center gap-3 text-left px-4 py-3 hover:qb-accent-border hover:qb-accent-soft-bg transition-all group"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${session.role === 'host' ? 'qb-accent-bg' : 'bg-slate-400'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="qb-title text-sm font-bold truncate block group-hover:qb-accent-text transition-colors">
                          {session.name || 'Untitled room'}
                        </span>
                        <span className="qb-muted text-xs">
                          {session.role === 'host' ? 'You host this' : 'You joined this'} · {relativeTime(session.lastJoined)}
                        </span>
                      </span>
                      <ArrowRight size={16} className="qb-muted opacity-0 group-hover:opacity-100 group-hover:qb-accent-text transition-all shrink-0" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDestroySession(session.id); }}
                      title="Remove room"
                      className="qb-panel-flat px-4 flex items-center justify-center text-slate-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500 transition-all shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Access control — quiet, collapsed by default */}
          <div className={`qb-glass ${savedSessions.length === 0 ? 'lg:col-span-2' : ''}`}>
            <button onClick={onToggleAdv} className="w-full flex items-center justify-between px-5 py-4 group">
              <span className="inline-flex items-center gap-3">
                <span className="qb-accent-soft-bg qb-accent-text shrink-0 w-9 h-9 qb-rounded-sm flex items-center justify-center">
                  <KeyRound size={16} />
                </span>
                <span className="text-left">
                  <span className="qb-title block text-sm font-bold">Access &amp; trusted contacts</span>
                  <span className="qb-muted block text-xs italic mt-0.5">Identity, whitelist and people you trust</span>
                </span>
              </span>
              <ChevronDown size={18} className={`qb-muted transition-transform ${advOpen ? 'rotate-180' : ''}`} />
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
      </motion.div>
    </div>
  );
}
