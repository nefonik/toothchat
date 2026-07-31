import React, { useRef, useEffect } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, 
  Volume2, Shield, Users, Radio, Menu 
} from 'lucide-react';
import { VoiceParticipant } from '../types';

interface VoiceChannelAreaProps {
  channelName: string;
  participants: VoiceParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>; // userId -> MediaStream
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onLeaveVoiceChannel: () => void;
  onToggleMobileSidebar?: () => void;
}

export const VoiceChannelArea: React.FC<VoiceChannelAreaProps> = ({
  channelName,
  participants,
  localStream,
  remoteStreams,
  isMuted,
  isVideoOn,
  isScreenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onLeaveVoiceChannel,
  onToggleMobileSidebar,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Attach local stream to local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoOn, isScreenSharing]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100">
      
      {/* VOICE CHANNEL HEADER */}
      <div className="h-14 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center space-x-3 truncate">
          {onToggleMobileSidebar && (
            <button
              onClick={onToggleMobileSidebar}
              className="md:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              title="Otwórz menu"
            >
              <Menu className="w-5 h-5 text-violet-400" />
            </button>
          )}
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            <Volume2 className="w-5 h-5 animate-pulse" />
          </div>
          <div className="truncate">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2 truncate">
              <span className="truncate">🔊 {channelName}</span>
              <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 hidden sm:inline">
                WebRTC Mesh
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate hidden sm:block">
              Pojemny kanał głosowy/wideo z szyfrowaniem
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
          <Users className="w-4 h-4 text-emerald-400" />
          <span>{participants.length} Uczestników w pokoju</span>
        </div>
      </div>

      {/* PARTICIPANTS GRID */}
      <div className="flex-1 p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
        {participants.map((p) => {
          const isLocal = p.userId === 'self' || p.userId === localStream?.id;
          const remoteStream = remoteStreams.get(p.userId);

          return (
            <div
              key={p.userId}
              className="relative rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col items-center justify-center overflow-hidden min-h-[180px] shadow-xl group hover:border-emerald-500/40 transition-all"
            >
              {/* VIDEO STREAM CONTAINER */}
              {p.isVideoOn || (isLocal && (isVideoOn || isScreenSharing)) ? (
                <div className="absolute inset-0 bg-black flex items-center justify-center">
                  {isLocal ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    <RemoteVideoPlayer stream={remoteStream} />
                  )}
                </div>
              ) : (
                /* AVATAR & AUDIO PULSE */
                <div className="relative flex flex-col items-center space-y-3 z-10">
                  <div className={`relative w-20 h-20 rounded-full bg-violet-600/30 border-2 ${!p.isMuted ? 'border-emerald-500 shadow-lg shadow-emerald-500/30 animate-pulse' : 'border-slate-700'} flex items-center justify-center font-bold text-2xl text-violet-300`}>
                    {p.displayName.charAt(0).toUpperCase()}
                    {!p.isMuted && (
                      <span className="absolute -top-1 -right-1 p-1 rounded-full bg-emerald-500 text-slate-950">
                        <Radio className="w-3 h-3 animate-spin" />
                      </span>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{p.displayName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {p.isMuted ? 'Mute' : 'Mówi (Audio Stream Active)'}
                    </div>
                  </div>
                </div>
              )}

              {/* PARTICIPANT OVERLAY BADGES */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md text-xs font-semibold text-white border border-slate-800 truncate">
                  {p.displayName} {isLocal && '(Ty)'}
                </span>

                <div className="flex items-center space-x-1">
                  {p.isMuted && (
                    <span className="p-1.5 rounded-lg bg-red-500/80 text-white shadow">
                      <MicOff className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* CONTROLS BAR */}
      <div className="h-20 px-6 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-center space-x-4">
        
        {/* Toggle Mute */}
        <button
          onClick={onToggleMute}
          className={`p-3.5 rounded-2xl transition-all shadow-lg ${
            isMuted
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/25'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title={isMuted ? 'Włącz mikrofon' : 'Wycisz mikrofon'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Video */}
        <button
          onClick={onToggleVideo}
          className={`p-3.5 rounded-2xl transition-all shadow-lg ${
            isVideoOn
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title={isVideoOn ? 'Wyłącz kamerę' : 'Włącz kamerę'}
        >
          {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Screen Share */}
        <button
          onClick={onToggleScreenShare}
          className={`p-3.5 rounded-2xl transition-all shadow-lg ${
            isScreenSharing
              ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/25'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title="Udostępnij Ekran"
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* Leave Voice Channel */}
        <button
          onClick={onLeaveVoiceChannel}
          className="p-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all flex items-center space-x-2 font-medium text-xs px-5"
          title="Rozłącz się z kanałem"
        >
          <PhoneOff className="w-5 h-5" />
          <span>Opuść Kanał</span>
        </button>

      </div>

    </div>
  );
};

// Sub-component for remote media stream rendering
const RemoteVideoPlayer: React.FC<{ stream?: MediaStream }> = ({ stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className="text-slate-500 text-xs font-mono">Oczekiwanie na strumień wideo...</div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover rounded-2xl"
    />
  );
};
