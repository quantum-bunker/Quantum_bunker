import { getP2PIceConfig } from './ice-config';
import { isOfferer } from './webrtc-mesh';

// SDP/ICE signaling for a 1-on-1 audio/video call. Rides the same opaque
// SIGNALING envelope path as everything else (kind: 'call'); the relay never
// inspects it. `call` discriminates the control verbs (invite/accept/…) from
// the media-negotiation frames (sdp/ice) so one handler routes both.
export interface CallSignal {
  kind: 'call';
  call: 'invite' | 'accept' | 'decline' | 'cancel' | 'end' | 'busy' | 'sdp' | 'ice';
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export type CallConnectionState = 'connecting' | 'connected' | 'failed' | 'closed';

interface CallConnectionOptions {
  selfId: string;
  peerId: string;
  // Sends an sdp/ice negotiation frame to the remote peer.
  sendSignal: (signal: Omit<CallSignal, 'kind' | 'to'>) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onState: (state: CallConnectionState) => void;
}

// Cap the camera bitrate so a single call never tries to saturate the uplink —
// the browser still adapts downward under congestion, but without a ceiling it
// would chase resolution it cannot sustain, which is what makes calls stutter.
const MAX_VIDEO_BITRATE = 1_500_000;

// Wraps a single RTCPeerConnection carrying live media for one peer. Uses the
// perfect-negotiation pattern so either side can (re)negotiate — adding a track,
// toggling the camera — without glare. Roles are derived from the same
// lexicographic rule the data mesh uses, so the two layers never disagree.
export class CallConnection {
  private readonly pc: RTCPeerConnection;
  private readonly opts: CallConnectionOptions;
  private readonly polite: boolean;
  private readonly remoteStream = new MediaStream();
  private makingOffer = false;
  private ignoreOffer = false;
  private state: CallConnectionState = 'connecting';
  // Fallback: some browsers never transition connectionState to 'failed' when
  // ICE gives up. We fire our own timeout so the UI doesn't freeze on
  // 'connecting' indefinitely. 20 s is long enough for trickle-ICE to finish
  // across most network conditions while still feeling responsive to the user.
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: CallConnectionOptions) {
    this.opts = opts;
    // The data-mesh offerer is the impolite peer here; the other is polite and
    // yields on collision. Either assignment works as long as they differ.
    this.polite = !isOfferer(opts.selfId, opts.peerId);
    this.pc = new RTCPeerConnection(getP2PIceConfig());

    this.connectTimer = setTimeout(() => {
      if (this.state === 'connecting') this.setState('failed');
    }, 20_000);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.opts.sendSignal({ call: 'ice', candidate: candidate.toJSON() });
    };

    this.pc.ontrack = ({ track }) => {
      this.remoteStream.addTrack(track);
      this.opts.onRemoteStream(this.remoteStream);
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) this.opts.sendSignal({ call: 'sdp', sdp: this.pc.localDescription });
      } catch {
        // A failed offer is recovered by the next negotiationneeded or by ICE
        // restart; swallowing keeps a transient error from killing the call.
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'connected') this.setState('connected');
      else if (s === 'failed') this.setState('failed');
      else if (s === 'closed') this.setState('closed');
    };

    // iceconnectionstatechange fires faster than connectionstatechange in some
    // browsers and is the only signal we get when connectionState stays stuck.
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') this.setState('connected');
      else if (s === 'failed') this.setState('failed');
    };
  }

  // Publishes the local capture tracks. Adding them fires negotiationneeded,
  // which drives the offer/answer exchange. Camera senders are tuned for a
  // bounded, low-latency stream rather than maximum quality.
  addLocalStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      const sender = this.pc.addTrack(track, stream);
      if (track.kind === 'video') {
        track.contentHint = 'motion';
        void this.tuneVideoSender(sender);
      }
    }
  }

  private async tuneVideoSender(sender: RTCRtpSender): Promise<void> {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
      // Under congestion, drop resolution before frame rate — motion video
      // reads as far smoother at 360p/30 than 720p/12.
      params.degradationPreference = 'maintain-framerate';
      await sender.setParameters(params);
    } catch {
      // Encoding hints are best-effort; the call still works without them.
    }
  }

  async onSignal(signal: CallSignal): Promise<void> {
    try {
      if (signal.call === 'sdp' && signal.sdp) {
        const offerCollision = signal.sdp.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) return;
        await this.pc.setRemoteDescription(signal.sdp);
        if (signal.sdp.type === 'offer') {
          await this.pc.setLocalDescription();
          if (this.pc.localDescription) this.opts.sendSignal({ call: 'sdp', sdp: this.pc.localDescription });
        }
      } else if (signal.call === 'ice' && signal.candidate) {
        try {
          await this.pc.addIceCandidate(signal.candidate);
        } catch {
          if (!this.ignoreOffer) throw new Error('ICE_ADD_FAILED');
        }
      }
    } catch {
      this.setState('failed');
    }
  }

  private setState(next: CallConnectionState): void {
    if (this.state === next || this.state === 'closed') return;
    this.state = next;
    if (next !== 'connecting' && this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.opts.onState(next);
  }

  close(): void {
    this.setState('closed');
    for (const track of this.remoteStream.getTracks()) this.remoteStream.removeTrack(track);
    try {
      this.pc.getSenders().forEach(s => s.track?.stop());
      this.pc.close();
    } catch {
      // Already torn down.
    }
  }
}
