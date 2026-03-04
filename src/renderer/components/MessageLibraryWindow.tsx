import React, { useState } from 'react';
import { useMessages, useSaveMessages } from '../hooks/useApi';
import Spinner from './shared/Spinner';
import type { Message } from '../../shared/ipc-types';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

const MESSAGE_TYPES = ['', 'warm', 'cheerful', 'reflective', 'humorous', 'seasonal', 'quote'];

export default function MessageLibraryWindow(): React.ReactElement {
  const { data: messages, isLoading } = useMessages();
  const saveMessages = useSaveMessages();
  const [selected, setSelected] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = (messages ?? []).filter((m) => !typeFilter || (m.type ?? '') === typeFilter);

  const handleSelect = (idx: number, msg: Message) => {
    setSelected(idx);
    setEditText(msg.text);
    setEditType(msg.type ?? '');
  };

  const handleSaveMessage = async () => {
    if (selected === null || !messages) return;
    setSaving(true);
    const updated = messages.map((m, i) =>
      i === selected ? { ...m, text: editText, type: editType || undefined } : m,
    );
    try {
      await saveMessages.mutateAsync({ messages: updated });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!messages) return;
    const newMsg: Message = { text: 'New message', type: 'warm' };
    const updated = [...messages, newMsg];
    await saveMessages.mutateAsync({ messages: updated });
    setSelected(updated.length - 1);
    setEditText(newMsg.text);
    setEditType(newMsg.type ?? '');
  };

  const handleDelete = async (idx: number) => {
    if (!messages) return;
    const updated = messages.filter((_, i) => i !== idx);
    await saveMessages.mutateAsync({ messages: updated });
    if (selected === idx) setSelected(null);
  };

  const handleExport = () => {
    if (!messages) return;
    const json = JSON.stringify(messages, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'messages.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <div
        className="flex flex-col w-56 flex-shrink-0"
        style={{ borderRight: '1px solid var(--border)' }}
      >
        {/* Type filter */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full rounded-md px-2 py-1.5 text-xs"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">All types</option>
            {MESSAGE_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((msg, _i) => {
            const realIdx = (messages ?? []).indexOf(msg);
            return (
              <button
                key={realIdx}
                onClick={() => handleSelect(realIdx, msg)}
                className="w-full text-left px-3 py-2.5 text-xs transition-colors"
                style={{
                  background: selected === realIdx ? 'var(--bg-card)' : 'transparent',
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div className="truncate">{msg.text.slice(0, 60)}</div>
                {msg.type && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {msg.type}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="p-2 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleAdd}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <PlusIcon className="w-3 h-3" /> Add
          </button>
          <button
            onClick={handleExport}
            className="flex-1 py-1.5 rounded text-xs"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Export
          </button>
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 flex flex-col p-4 gap-3">
        {selected !== null && messages?.[selected] ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Edit Message
              </p>
              <button
                onClick={() => handleDelete(selected)}
                className="p-1.5 rounded"
                style={{ color: 'var(--error)' }}
                title="Delete"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Type
              </label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full rounded-md px-3 py-1.5 text-xs"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {MESSAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t || '(none)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 flex flex-col">
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Text
              </label>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="flex-1 rounded-md px-3 py-2 text-sm resize-none"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  minHeight: 200,
                }}
              />
            </div>

            <button
              onClick={handleSaveMessage}
              disabled={saving}
              className="py-2 rounded-md text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {saving ? 'Saving…' : 'Save Message'}
            </button>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Select a message to edit
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
