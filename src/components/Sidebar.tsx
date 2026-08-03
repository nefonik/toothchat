import React, { useState } from 'react';
import { 
  Users, Plus, Hash, Volume2, ShieldCheck, 
  Settings, Mic, MicOff, Headphones, LogOut, Code, User, X
} from 'lucide-react';
import { UserProfile, ServerGroup, Channel } from '../types';
import { ToothIcon } from './ToothIcon';

interface SidebarProps {
  currentUser: UserProfile;
  servers: ServerGroup[];
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmUserId: string | null;
  friendsCount: number;
  onSelectServer: (serverId: string | null) => void;
  onSelectChannel: (channel: Channel) => void;
  onSelectDmUser: (userId: string) => void;
  onOpenFriendsTab: () => void;
  onOpenCreateServerModal: () => void;
  onOpenDocsModal: () => void;
  onOpenProfileModal: () => void;
  onLogout: () => void;
  onCloseMobileSidebar?: () => void;
  onOpenCreateChannelModal?: (serverId: string, type: 'text') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  servers,
  activeServerId,
  activeChannelId,
  activeDmUserId,
  friendsCount,
  onSelectServer,
  onSelectChannel,
  onSelectDmUser,
  onOpenFriendsTab,
  onOpenCreateServerModal,
  onOpenDocsModal,
  onOpenProfileModal,
  onLogout,
  onCloseMobileSidebar,
  onOpenCreateChannelModal,
}) => {
  const activeServer = servers.find(s => s.id === activeServerId);

  return (
    <div className="flex h-full bg-slate-950 border-r border-slate-800/80 text-slate-200 select-none">
      
      {/* Navigation Rail */}
      <div className="w-16 flex flex-col items-center py-3 space-y-3 bg-slate-950/90 border-r border-slate-800/50">
        
        {/* Main Toothchat DM Button */}
        <button
          onClick={() => {
            onSelectServer(null);
            onOpenFriendsTab();
          }}
          className={`relative p-3 rounded-2xl transition-all group ${
            activeServerId === null
              ? 'bg-violet-600 text-white rounded-xl shadow-lg shadow-violet-600/30'
              : 'bg-slate-900 hover:bg-violet-600/20 text-slate-300 hover:text-white rounded-2xl'
          }`}
          title="Toothchat - Wiadomości i Znajomi"
        >
          <ToothIcon className="w-6 h-6 text-violet-300 group-hover:text-white" />
          {activeServerId === null && (
            <span className="absolute -left-1 top-3 bottom-3 w-1 bg-white rounded-r-full" />
          )}
        </button>

        <div className="w-8 h-[1px] bg-slate-800/80 my-1" />

        {/* Server Icons List */}
        <div className="flex-1 space-y-2 overflow-y-auto w-full px-2 no-scrollbar">
          {servers.map(server => {
            const isActive = activeServerId === server.id;
            return (
              <button
                key={server.id}
                onClick={() => {
                  onSelectServer(server.id);
                  if (server.channels.length > 0) {
                    onSelectChannel(server.channels[0]);
                  }
                }}
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm transition-all group ${
                  isActive
                    ? 'bg-violet-600 text-white rounded-xl shadow-lg shadow-violet-600/30'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-2xl'
                }`}
                title={server.name}
              >
                {server.icon || server.name.substring(0, 2).toUpperCase()}
                {isActive && (
                  <span className="absolute -left-2 top-3 bottom-3 w-1 bg-white rounded-r-full" />
                )}
              </button>
            );
          })}

          <button
            onClick={onOpenCreateServerModal}
            className="w-12 h-12 rounded-2xl bg-slate-900 hover:bg-emerald-600/20 border border-dashed border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 flex items-center justify-center transition-all"
            title="Utwórz nową grupę"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Channels & DM Sidebar */}
      <div className="w-60 flex flex-col bg-slate-900/60 border-r border-slate-800/80">
        
        {/* Header */}
        <div className="h-14 px-4 border-b border-slate-800/80 flex items-center justify-between font-semibold text-white">
          {activeServer ? (
            <div className="flex items-center space-x-2 truncate">
              <span className="text-lg">{activeServer.icon || '🦷'}</span>
              <span className="truncate">{activeServer.name}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-violet-400 text-sm font-bold">
              <ToothIcon className="w-5 h-5 text-violet-400" />
              <span>Toothchat</span>
            </div>
          )}
          {onCloseMobileSidebar && (
            <button
              onClick={onCloseMobileSidebar}
              className="md:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Zamknij menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Channels / DM Navigation */}
        <div className="flex-1 p-2 space-y-4 overflow-y-auto">
          
          {/* DM MODE */}
          {activeServerId === null && (
            <div className="space-y-1">
              <button
                onClick={onOpenFriendsTab}
                className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-xs font-medium transition-all ${
                  activeDmUserId === null
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-violet-400" />
                  <span>Znajomi</span>
                </div>
                {friendsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-violet-600 text-white font-bold">
                    {friendsCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* SERVER MODE (TEXT CHANNELS) */}
          {activeServer && (
            <div>
              <div className="px-2 mb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Kanały Tekstowe</span>
                {onOpenCreateChannelModal && (
                  <button
                    onClick={() => onOpenCreateChannelModal(activeServer.id, 'text')}
                    className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    title="Dodaj kanał tekstowy"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {activeServer.channels
                  .filter(c => c.type === 'text' || !c.type)
                  .map(channel => {
                    const isActive = activeChannelId === channel.id;
                    return (
                      <button
                        key={channel.id}
                        onClick={() => onSelectChannel(channel)}
                        className={`w-full px-2.5 py-1.5 rounded-lg flex items-center space-x-2 text-xs transition-all ${
                          isActive
                            ? 'bg-slate-800 text-white font-medium shadow-sm'
                            : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                        }`}
                      >
                        <Hash className="w-4 h-4 text-slate-500" />
                        <span className="truncate">{channel.name}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

        </div>

        {/* FOOTER USER PROFILE BAR */}
        <div className="p-2.5 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between">
          <div 
            onClick={onOpenProfileModal}
            className="flex items-center space-x-2 cursor-pointer p-1 rounded-lg hover:bg-slate-800/60 transition-all flex-1 min-w-0 mr-2"
            title="Kliknij, aby edytować profil"
          >
            <div className="relative w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center font-bold text-violet-300 text-xs shrink-0">
              {currentUser.displayName.charAt(0).toUpperCase()}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
            </div>
            <div className="truncate min-w-0">
              <div className="text-xs font-semibold text-white truncate">{currentUser.displayName}</div>
              <div className="text-[10px] text-slate-500 font-mono truncate">{currentUser.userTag}</div>
            </div>
          </div>

          <div className="flex items-center space-x-1 text-slate-400">
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
              title="Wyloguj i usuń klucze z sesji"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
