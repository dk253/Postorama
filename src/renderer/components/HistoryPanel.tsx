import React, { useState } from 'react';
import { useHistory } from '../hooks/useApi';
import Spinner from './shared/Spinner';
import EmptyState from './shared/EmptyState';
import { ClockIcon, ArrowTopRightOnSquareIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow, parseISO } from 'date-fns';

export default function HistoryPanel(): React.ReactElement {
  const [search, setSearch] = useState('');
  const { data: history, isLoading } = useHistory(undefined, 200);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={20} style={{ color: 'var(--text-secondary)' } as React.CSSProperties} />
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const filtered = term
    ? (history ?? []).filter((row) =>
        row.recipient_id.replace(/_/g, ' ').toLowerCase().includes(term),
      )
    : (history ?? []);

  return (
    <div className="flex flex-col h-full">
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
            placeholder="Filter by recipient…"
            className="w-full rounded-md pl-6 pr-3 py-1 text-xs"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ClockIcon className="w-8 h-8" />}
            title={term ? 'No matches' : 'No sends yet'}
            description={term ? `No history matching "${search}".` : 'History will appear here after postcards are sent.'}
          />
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((row) => (
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
