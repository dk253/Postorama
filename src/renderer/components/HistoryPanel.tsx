import React, { useState } from 'react';
import { useHistory, useRecipients } from '../hooks/useApi';
import Spinner from './shared/Spinner';
import EmptyState from './shared/EmptyState';
import { ClockIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow, parseISO } from 'date-fns';

export default function HistoryPanel(): React.ReactElement {
  const [recipientFilter, setRecipientFilter] = useState<string>('');
  const { data: recipients } = useRecipients();
  const { data: history, isLoading } = useHistory(recipientFilter || undefined, 100);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={20} style={{ color: 'var(--text-secondary)' } as React.CSSProperties} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <select
          value={recipientFilter}
          onChange={(e) => setRecipientFilter(e.target.value)}
          className="w-full rounded-md px-2 py-1 text-xs"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">All recipients</option>
          {recipients?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {!history || history.length === 0 ? (
          <EmptyState
            icon={<ClockIcon className="w-8 h-8" />}
            title="No sends yet"
            description="History will appear here after postcards are sent."
          />
        ) : (
          <div className="p-2 space-y-1">
            {history.map((row) => (
              <div
                key={row.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--bg-elevated)' }}
              >
                {/* Status indicator */}
                <div
                  className="status-dot mt-1.5"
                  style={{
                    background: row.status === 'sent' ? 'var(--success)' : 'var(--error)',
                  }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {row.recipient_id.replace(/_/g, ' ')}
                    </span>
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {formatDistanceToNow(parseISO(row.sent_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {row.status === 'failed' ? (
                      <span style={{ color: 'var(--error)' }}>{row.error_message ?? 'Failed'}</span>
                    ) : (
                      <>
                        {row.photo_filename_or_uuid}
                        {row.expected_delivery_date && (
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            {' '}
                            · est. {row.expected_delivery_date}
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>

                {/* Proof link */}
                {row.proof_url && (
                  <a
                    href={row.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 mt-1"
                    style={{ color: 'var(--accent)' }}
                    title="View proof"
                  >
                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
