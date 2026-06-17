import { useState } from 'react';
import {
  X, Rocket, Plus, Share2, Fingerprint, ShieldCheck, Video, Lock, ChevronRight,
} from 'lucide-react';

type Step = { label: string; detail: string };
type Section = {
  id: string;
  icon: typeof Rocket;
  title: string;
  blurb: string;
  steps: Step[];
  note?: string;
};

// Plain-language, in-app companion to the markdown guides in `usage/`. Content is
// written for end users, not developers — it deliberately avoids the protocol
// jargon used in the labels (IDENT_TAG, MEMBER_CODE, etc.) and explains the why.
const SECTIONS: Section[] = [
  {
    id: 'start',
    icon: Rocket,
    title: 'Quick Start',
    blurb: 'Two people, one private room, nothing stored anywhere. Here is the shortest path.',
    steps: [
      { label: 'Create a vault', detail: 'On the home screen, press CREATE_BUNKER. You are now the host of a private room.' },
      { label: 'Share the link', detail: 'In the chat sidebar, copy the share link or show the QR code. Send it to the person you want to talk to.' },
      { label: 'Approve them', detail: 'When they open the link and join, you get a join request. Approve it and you can chat.' },
      { label: 'It disappears', detail: 'The room self-destructs when the timer runs out, after 30 min of silence, or 5 min with nobody in it. Nothing is ever saved on a server.' },
    ],
    note: 'A "vault" is just a private chat room. The "hash" is its address. There are no accounts and no passwords to sign up.',
  },
  {
    id: 'create',
    icon: Plus,
    title: 'Create a Vault',
    blurb: 'Starting a room makes you its host — you control who gets in and you can destroy it at any time.',
    steps: [
      { label: 'Name it (optional)', detail: 'Type a label in the VAULT_LABEL field so you recognize it later in your history. You can leave it blank.' },
      { label: 'Press CREATE_BUNKER', detail: 'The room opens instantly. The sidebar shows the vault address, your identity, and a countdown timer.' },
      { label: 'You are the host', detail: 'Only you can approve or kick people and destroy the room. Host control cannot be handed to someone else.' },
    ],
    note: 'The room lives only in server memory. If the server restarts or the timer expires, it is gone for good — that is intentional.',
  },
  {
    id: 'invite',
    icon: Share2,
    title: 'Invite & Join',
    blurb: 'There are two ways to get someone in: a one-time share link (needs your approval), or a whitelist invite (auto-admits them).',
    steps: [
      { label: 'Share link — easiest', detail: 'From inside a room, copy the share link or QR from the Share Vault panel. Anyone with it can request to join; you approve each one.' },
      { label: 'Joining a room', detail: 'On the home screen, paste the vault address into Enter_Vault, add a display name, and press JOIN. Wait for the host to approve you.' },
      { label: 'Reconnecting', detail: 'Rooms you have joined appear in Vault History. Click one to rejoin — the button reads RECONNECT.' },
    ],
    note: 'A plain share link always needs host approval. To skip approval, use a Whitelist invite (next tab).',
  },
  {
    id: 'whitelist',
    icon: Fingerprint,
    title: 'Whitelist (auto-admit)',
    blurb: 'A whitelist invite pre-approves a specific person for a specific room, so they join instantly without you approving each time — even if you are offline.',
    steps: [
      { label: '1 — Member shares their code', detail: 'The person joining opens the Whitelist panel and copies their Member Code (their public key). They send it to you (the host) by any channel — it is not secret.' },
      { label: '2 — Host generates an invite', detail: 'You paste their Member Code into Issue_Invite, pick the target vault, and press Generate_Invite. Copy the token that appears.' },
      { label: '3 — Host sends the invite back', detail: 'Send that token to the member. It is safe to send openly — it is useless without their private key.' },
      { label: '4 — Member redeems it', detail: 'The member pastes the token into Redeem_Invite and presses Save_Membership. From now on they join that room automatically.' },
    ],
    note: 'Requires a long-term identity (Identity panel). With a burner key, the invite breaks next session because your key changes. Set a passphrase to keep a stable identity.',
  },
  {
    id: 'contacts',
    icon: ShieldCheck,
    title: 'Contacts & Verifying',
    blurb: 'Verifying confirms you are really talking to the right person and not an impostor in the middle. This is the strongest guarantee the app offers.',
    steps: [
      { label: 'Compare safety numbers', detail: 'In a room, open Verify Contacts in the sidebar. Each peer has a safety number. Read it to them over a phone call or in person and check it matches exactly.' },
      { label: 'Mark them verified', detail: 'If the numbers match, press Verify. A green shield appears. If they never match, do not trust the connection.' },
      { label: 'Pin contacts for next time', detail: 'Share your Trust Handshake link (Contacts panel) so others can pin your key, and pin theirs. Pinned keys are watched for changes.' },
      { label: 'Red key-change alert', detail: 'If a pinned contact’s key suddenly changes, a full-screen red warning blocks messaging. Confirm out-of-band before continuing, or clear the pin.' },
    ],
    note: 'The server could in theory swap keys during the handshake. Comparing safety numbers on a second channel is the only way to catch that.',
  },
  {
    id: 'media',
    icon: Video,
    title: 'Calls & Files',
    blurb: 'Send files and make voice or video calls — all end-to-end encrypted, with the server blind to the contents.',
    steps: [
      { label: 'Send a file', detail: 'Use the paperclip in the composer. Files up to 5 MB go through the relay; larger files (up to 256 MB) stream directly peer-to-peer.' },
      { label: 'Voice messages', detail: 'Hold the mic button in the composer to record an audio clip and send it.' },
      { label: 'Voice / video calls', detail: 'Calls work only when exactly one other person is in the room. Press the call button to ring them. Group calls are intentionally not offered.' },
      { label: 'Password-lock a file', detail: 'You can add a separate password layer to a file before sending. The recipient must enter that password to open it.' },
    ],
    note: 'If a direct peer-to-peer media link fails, the app tells you — it never secretly reroutes your call or large file through the relay.',
  },
  {
    id: 'security',
    icon: Lock,
    title: 'Security & Privacy',
    blurb: 'What protects you, and the controls you have.',
    steps: [
      { label: 'Nothing is stored', detail: 'The server never decrypts, logs, or saves your messages. It only forwards sealed envelopes between peers.' },
      { label: 'Messages disappear', detail: 'Messages vanish on their own a few minutes after they are read. Closing the room or letting it expire wipes everything.' },
      { label: 'Screen blackout', detail: 'The chat goes black the moment the window loses focus, so a glance away or a screenshot key hides the content.' },
      { label: 'Blur to reveal', detail: 'Turn on Blur (header) to keep messages blurred until you hover or tap them — handy in public.' },
      { label: 'Destroy on demand', detail: 'The host can press Destroy_Session at any time to tear the room down immediately for everyone.' },
    ],
    note: 'Use a long-term identity (passphrase-protected) if you want people to recognize you across sessions. Otherwise each session uses a throwaway key.',
  },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const section = SECTIONS.find(s => s.id === active) ?? SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="qb-panel w-full max-w-4xl h-[80vh] max-h-[640px] shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b qb-border shrink-0">
          <ShieldCheck size={18} className="qb-accent-text" />
          <h3 className="qb-title text-sm font-bold tracking-widest">Help &amp; Guide</h3>
          <span className="qb-muted text-[10px] hidden sm:inline ml-1" style={{ fontFamily: 'var(--qb-font)' }}>How everything works</span>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-900 dark:hover:text-white" aria-label="Close help">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          <nav className="w-44 sm:w-52 shrink-0 border-r qb-border p-2 space-y-1 overflow-y-auto custom-scrollbar">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const selected = s.id === active;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`w-full text-left px-3 py-2.5 qb-rounded-sm flex items-center gap-2.5 transition-colors ${selected ? 'qb-accent-soft-bg qb-accent-text' : 'hover:bg-black/5 dark:hover:bg-white/5 qb-text'}`}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="qb-title text-[11px] font-bold tracking-normal leading-tight">{s.title}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-2">
              <section.icon size={22} className="qb-accent-text" />
              <h4 className="qb-title text-lg font-black tracking-tight">{section.title}</h4>
            </div>
            <p className="qb-muted text-xs leading-relaxed mb-6" style={{ fontFamily: 'var(--qb-font)' }}>{section.blurb}</p>

            <ol className="space-y-4">
              {section.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="qb-accent-soft-bg qb-accent-text qb-rounded-sm w-6 h-6 shrink-0 flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                  <div className="space-y-0.5">
                    <p className="qb-title text-xs font-bold">{step.label}</p>
                    <p className="qb-muted text-[11px] leading-relaxed" style={{ fontFamily: 'var(--qb-font)' }}>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            {section.note && (
              <div className="mt-6 qb-panel-flat p-4 flex gap-3">
                <ChevronRight size={14} className="qb-accent-text shrink-0 mt-0.5" />
                <p className="qb-muted text-[11px] leading-relaxed" style={{ fontFamily: 'var(--qb-font)' }}>{section.note}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
