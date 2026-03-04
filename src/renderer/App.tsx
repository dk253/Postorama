import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import MessageLibraryWindow from './components/MessageLibraryWindow';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';

type Tab = 'dashboard' | 'history';

function isMessagesWindow(): boolean {
  return new URLSearchParams(window.location.search).get('window') === 'messages';
}

export default function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const queryClient = useQueryClient();

  // Refresh all queries when popover is shown
  useEffect(() => {
    const off = window.api.on('popover:shown', () => {
      queryClient.invalidateQueries();
    });
    return off as () => void;
  }, [queryClient]);

  // Refresh on scheduler tick
  useEffect(() => {
    const off = window.api.on('scheduler:tick', () => {
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    });
    return off as () => void;
  }, [queryClient]);

  if (isMessagesWindow()) {
    return <MessageLibraryWindow />;
  }

  return (
    <div className="flex flex-col h-full select-none" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={
          {
            borderBottom: '1px solid var(--border)',
            WebkitAppRegion: 'drag',
          } as React.CSSProperties
        }
      >
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Postorama
        </span>
        <button
          onClick={() => setShowSettings(true)}
          className="p-1 rounded-md transition-colors"
          style={
            {
              color: 'var(--text-secondary)',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties
          }
        >
          <Cog6ToothIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 px-3 pt-2 pb-1 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {(['dashboard', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize"
            style={{
              background: tab === t ? 'var(--bg-card)' : 'transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {t === 'dashboard' ? 'Recipients' : 'History'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'history' && <HistoryPanel />}
      </div>

      {/* Settings overlay */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
