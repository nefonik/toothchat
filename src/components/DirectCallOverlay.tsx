import React, { useRef, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, PhoneCall, Volume2 } from 'lucide-react';

interface IncomingCallData {
  callerId: string;
  callerName: string;
  callerTag: string;
  callType: 'audio' | 'video';
}

interface DirectCallOverlayProps {
  incomingCall: IncomingCallData | null;
  activeCallPeerName: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  onAcceptCall: () => void;
  onDeclineCall: () => void;
  onHangupCall: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
}

export const DirectCallOverlay: React.FC<DirectCallOverlayProps> = ({
  incomingCall,
  activeCallPeerName,
  localStream,
  remoteStream,
  isMuted,
  isVideoOn,
  isScreenSharing,
  onAcceptCall,
  onDeclineCall,
  onHangupCall,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoOn, isScreenSharing]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // 1. INCOMING CALL MODAL (Ringing)
  if (incomingCall) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-violet-500/40 p-6 text-center space-y-6 shadow-2xl shadow-violet-600/20">
          
          {/* Ringing Animation */}
          <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-violet-600/30 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-violet-600 border-2 border-violet-400 flex items-center justify-center font-bold text-2xl text-white shadow-xl">
              {incomingCall.callerName.charAt(0).toUpperCase()}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">{incomingCall.callerName}</h3>
            <p className="text-xs text-violet-400 font-mono mt-0.5">{incomingCall.callerTag}</p>
            <p className="text-xs text-slate-400 mt-2 flex items-center justify-center space-x-1">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
              <span>Połączenie przychodzące ({incomingCall.callType === 'video' ? 'Wideo P2P' : 'Głosowe P2P'})</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <button
              onClick={onDeclineCall}
              className="py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-red-600/30 transition-all"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Odrzuć</span>
            </button>
            <button
              onClick={onAcceptCall}
              className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/30 transition-all animate-pulse"
            >
              <Phone className="w-4 h-4" />
              <span>Odbierz</span>
            </button>
          </div>

        </div>
      </div>
    );
  }

  // 2. ACTIVE 1-ON-1 CALL OVERLAY
  if (activeCallPeerName) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
        
        {/* Header */}
        <div className="h-14 px-6 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-xs">
              P2P
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <span>Rozmowa z {activeCallPeerName}</span>
                <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                  WebRTC P2P Direct
                </span>
              </h3>
            </div>
          </div>
        </div>

        {/* Video Area */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          
          {/* Remote Main Video or Audio Avatar */}
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <div className="w-28 h-28 rounded-full bg-violet-600/30 border-4 border-violet-500/50 flex items-center justify-center font-bold text-4xl text-violet-300 animate-pulse">
                {activeCallPeerName.charAt(0).toUpperCase()}
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">{activeCallPeerName}</div>
                <div className="text-xs text-emerald-400 font-mono">Trwa rozmowa głosowa P2P...</div>
              </div>
            </div>
          )}

          {/* Local PIP Video */}
          <div className="absolute bottom-6 right-6 w-48 h-36 rounded-2xl bg-slate-900 border-2 border-slate-700 shadow-2xl overflow-hidden z-20">
            {localStream && (isVideoOn || isScreenSharing) ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs font-mono">
                <span>Moja Kamera Wył.</span>
              </div>
            )}
          </div>

        </div>

        {/* Controls */}
        <div className="h-20 px-6 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-center space-x-4">
          <button
            onClick={onToggleMute}
            className={`p-3.5 rounded-2xl transition-all shadow-lg ${
              isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={onToggleVideo}
            className={`p-3.5 rounded-2xl transition-all shadow-lg ${
              isVideoOn ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200'
            }`}
          >
            {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          <button
            onClick={onToggleScreenShare}
            className={`p-3.5 rounded-2xl transition-all shadow-lg ${
              isScreenSharing ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-200'
            }`}
          >
            <Monitor className="w-5 h-5" />
          </button>

          <button
            onClick={onHangupCall}
            className="p-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all flex items-center space-x-2 font-medium text-xs px-5"
          >
            <PhoneOff className="w-5 h-5" />
            <span>Zakończ Połączenie</span>
          </button>
        </div>

      </div>
    );
  }

  return null;
};
