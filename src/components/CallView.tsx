import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, PhoneIncoming, PhoneOutgoing, Loader2 } from 'lucide-react';
import { UseCall } from '../useCall';

interface CallViewProps {
  call: UseCall;
  displayName: (id: string) => string;
}

// Binds a MediaStream to a <video> via srcObject (streams cannot be passed as a
// src attribute). Local previews are muted to avoid an echo loop.
function VideoTile({ stream, muted, mirror, className }: { stream: MediaStream | null; muted: boolean; mirror?: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}

function ControlButton({ active, onClick, title, children, danger }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) {
  const base = 'flex items-center justify-center w-12 h-12 rounded-full border transition-colors';
  const cls = danger
    ? 'bg-red-500 border-red-400 text-white hover:bg-red-600'
    : active
      ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
      : 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30';
  return (
    <button onClick={onClick} title={title} className={`${base} ${cls}`}>{children}</button>
  );
}

function CallView({ call, displayName }: CallViewProps) {
  const { callState, remotePeerId, localStream, remoteStream, micOn, camOn, acceptCall, declineCall, endCall, toggleMic, toggleCam } = call;
  const name = remotePeerId ? displayName(remotePeerId) : 'peer';

  return (
    <AnimatePresence>
      {callState !== 'idle' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-sm flex flex-col"
        >
          {/* Incoming ring: no media captured yet, just accept/decline. */}
          {callState === 'ringing' ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center animate-pulse">
                  <PhoneIncoming size={32} className="text-cyan-400" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-400">Incoming video call</span>
                <span className="font-mono text-lg text-white">{name}</span>
              </div>
              <div className="flex items-center gap-6">
                <button onClick={declineCall} title="Decline" className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors">
                  <PhoneOff size={26} />
                </button>
                <button onClick={acceptCall} title="Accept" className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                  <Phone size={26} />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Stage: remote fills the frame once it arrives; before that, the
                  local preview is shown full-bleed with a status overlay. */}
              <div className="relative flex-1 min-h-0 overflow-hidden">
                {callState === 'active' && remoteStream ? (
                  <VideoTile stream={remoteStream} muted={false} className="absolute inset-0 w-full h-full object-cover bg-black" />
                ) : (
                  <VideoTile stream={localStream} muted mirror className="absolute inset-0 w-full h-full object-cover bg-black" />
                )}

                {callState !== 'active' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
                    {callState === 'calling' && <PhoneOutgoing size={28} className="text-cyan-400 animate-pulse" />}
                    {callState === 'connecting' && <Loader2 size={28} className="text-cyan-400 animate-spin" />}
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-400">
                      {callState === 'calling' ? `Calling ${name}…` : `Connecting to ${name}…`}
                    </span>
                  </div>
                )}

                {/* Local picture-in-picture once the remote is on stage. */}
                {callState === 'active' && remoteStream && (
                  <div className="absolute bottom-4 right-4 w-32 sm:w-44 aspect-video rounded-lg overflow-hidden border border-white/20 shadow-2xl bg-black">
                    {camOn
                      ? <VideoTile stream={localStream} muted mirror className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><VideoOff size={20} className="text-white/40" /></div>}
                  </div>
                )}

                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-white/80">{name}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="shrink-0 flex items-center justify-center gap-4 py-5 bg-black/60 border-t border-white/10">
                <ControlButton active={micOn} onClick={toggleMic} title={micOn ? 'Mute microphone' : 'Unmute microphone'}>
                  {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                </ControlButton>
                <ControlButton active={camOn} onClick={toggleCam} title={camOn ? 'Turn camera off' : 'Turn camera on'}>
                  {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                </ControlButton>
                <ControlButton danger onClick={endCall} title="End call">
                  <PhoneOff size={20} />
                </ControlButton>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CallView;
