import React, { useState } from 'react';
import { useRecipients } from '../hooks/useApi';
import RecipientCard from './RecipientCard';
import RecipientDetail from './RecipientDetail';
import Spinner from './shared/Spinner';
import EmptyState from './shared/EmptyState';
import { PhotoIcon } from '@heroicons/react/24/outline';
import { ToastContainer, useToast } from './shared/Toast';
import type { RecipientStatus } from '../../shared/ipc-types';

export default function Dashboard(): React.ReactElement {
  const { data: recipients, isLoading, error, refetch } = useRecipients();
  const [selected, setSelected] = useState<RecipientStatus | null>(null);
  const { toasts, showToast, dismissToast } = useToast();

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

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        <div className="p-2">
          {recipients.map((r) => (
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
