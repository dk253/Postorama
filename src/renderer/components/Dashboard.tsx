import React, { useState } from 'react';
import { useRecipients } from '../hooks/useApi';
import RecipientCard from './RecipientCard';
import RecipientDetail from './RecipientDetail';
import Spinner from './shared/Spinner';
import EmptyState from './shared/EmptyState';
import { PhotoIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { ToastContainer, useToast } from './shared/Toast';
import type { RecipientStatus } from '../../shared/ipc-types';

export default function Dashboard(): React.ReactElement {
  const { data: recipients, isLoading, error, refetch } = useRecipients();
  const [selected, setSelected] = useState<RecipientStatus | null>(null);
  const { toasts, showToast, dismissToast } = useToast();
  const [search, setSearch] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={20} style={{ color: 'var(--text-secondary)' } as React.CSSProperties} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load recipients"
        description={String(error)}
        action={
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-md text-xs"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!recipients || recipients.length === 0) {
    return (
      <EmptyState
        icon={<PhotoIcon className="w-10 h-10" />}
        title="No recipients found"
        description={'Create a "Postorama" folder in Photos,\nthen add an album named after each recipient.'}
        action={
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-md text-xs"
            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
          >
            Refresh
          </button>
        }
      />
    );
  }

  const term = search.trim().toLowerCase();

  const sorted = [...recipients].sort((a, b) => {
    const sortKey = (name: string) => {
      const parts = name.split(' ');
      if (parts.length === 1) return name;
      const last = parts[parts.length - 1]!;
      const rest = parts.slice(0, -1).join(' ');
      return `${last} ${rest}`;
    };
    return sortKey(a.fullName).localeCompare(sortKey(b.fullName));
  });

  const filtered = term
    ? sorted.filter((r) => r.fullName.toLowerCase().includes(term))
    : sorted;

  return (
    <div className="relative h-full flex flex-col">
      {/* Search */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative">
          <MagnifyingGlassIcon
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter recipients…"
            className="w-full rounded-md pl-6 pr-3 py-1 text-xs"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {filtered.map((r) => (
            <RecipientCard key={r.id} recipient={r} onSelect={setSelected} showToast={showToast} />
          ))}
        </div>
      </div>

      {/* Detail slide-in */}
      {selected && (
        <RecipientDetail
          recipient={selected}
          onClose={() => setSelected(null)}
          showToast={showToast}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
