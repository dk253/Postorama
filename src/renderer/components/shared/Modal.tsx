import React from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function Modal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ModalProps): React.ReactElement {
  return (
    <Dialog open={open} onClose={onCancel} className="relative z-50">
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
      >
        <DialogPanel
          className="rounded-xl p-5 w-72 shadow-xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start gap-3 mb-4">
            {destructive && (
              <ExclamationTriangleIcon
                className="w-5 h-5 mt-0.5 flex-shrink-0"
                style={{ color: 'var(--warning)' }}
              />
            )}
            <div>
              <DialogTitle
                className="font-semibold text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                {title}
              </DialogTitle>
              {description && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {description}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={{
                background: destructive ? 'var(--error)' : 'var(--accent)',
                color: 'white',
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
