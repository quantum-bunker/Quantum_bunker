import { useState } from 'react';
import { motion } from 'motion/react';
import { Globe, ShieldOff, Wrench, X } from 'lucide-react';
import { StunMode, StunSetting, loadStunSetting, parseStunUrls, saveStunSetting } from '../stun-settings';

const MODES: { id: StunMode; label: string; hint: string; icon: typeof Globe }[] = [
  { id: 'default', label: 'Public STUN', hint: 'Recommended. Works across networks.', icon: Globe },
  { id: 'custom', label: 'My own STUN', hint: 'Only the servers you list below.', icon: Wrench },
  { id: 'off', label: 'Off', hint: 'Same network only. Nothing is reflected.', icon: ShieldOff },
];

// Per-device STUN policy. A change only affects connections opened afterwards,
// because an RTCPeerConnection reads its ICE config once at construction — the
// panel says so rather than pretending the switch is live.
export function ConnectivitySettings({ onClose }: { onClose: () => void }) {
  const [setting, setSetting] = useState<StunSetting>(() => loadStunSetting());
  const [draft, setDraft] = useState(() => setting.urls.join('\n'));
  const [saved, setSaved] = useState(false);

  const commit = (next: StunSetting) => {
    setSetting(next);
    saveStunSetting(next);
    setSaved(true);
  };

  const pickMode = (mode: StunMode) => {
    if (mode === 'custom') {
      const urls = parseStunUrls(draft);
      commit({ mode: urls.length ? 'custom' : 'default', urls });
      return;
    }
    commit({ mode, urls: setting.urls });
  };

  const applyCustomUrls = () => {
    const urls = parseStunUrls(draft);
    commit(urls.length ? { mode: 'custom', urls } : { mode: 'default', urls: [] });
    setDraft(urls.join('\n'));
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
        className="qb-panel absolute right-0 mt-2 w-80 p-3 z-50 flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="qb-title text-xs font-bold tracking-normal">Direct connection</span>
            <span className="qb-muted text-[10px] leading-snug">
              A STUN server tells your device its own public address so peers can link
              directly. It sees an IP and a time — never messages, files, or calls.
            </span>
          </div>
          <button onClick={onClose} className="shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-slate-400" aria-label="Close connectivity settings">
            <X size={13} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {MODES.map(m => {
            const Icon = m.icon;
            const active = setting.mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => pickMode(m.id)}
                className={`w-full text-left px-3 py-2 qb-rounded-sm flex items-start gap-2 transition-colors ${active ? 'qb-accent-soft-bg qb-accent-text' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                <Icon size={13} className="mt-0.5 shrink-0" />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="qb-title text-[11px] font-bold tracking-normal">{m.label}{active ? ' ·' : ''}</span>
                  <span className="qb-muted text-[10px] leading-snug">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="qb-label text-[10px] font-bold" htmlFor="qb-stun-urls">Custom servers (one per line)</label>
          <textarea
            id="qb-stun-urls"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
            onBlur={applyCustomUrls}
            rows={2}
            spellCheck={false}
            placeholder="stun:stun.example.org:3478"
            className="w-full bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:border-[var(--qb-accent)] text-[10px] font-mono text-slate-700 dark:text-slate-300 px-2 py-1.5 resize-y"
          />
          <span className="qb-muted text-[9px] leading-snug">
            Only stun: and stuns: are accepted — turn: is refused, because media must
            never be routed through a relay.
          </span>
        </div>

        {setting.mode === 'off' && (
          <span className="text-[10px] leading-snug text-amber-600 dark:text-amber-400">
            With reflection off, large files and calls only reach peers on the same
            network. Everything else keeps working over the relay.
          </span>
        )}
        {saved && (
          <span className="qb-muted text-[9px]">Saved — applies to connections opened from now on.</span>
        )}
      </motion.div>
    </>
  );
}

export default ConnectivitySettings;
