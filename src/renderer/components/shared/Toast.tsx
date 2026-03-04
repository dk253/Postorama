import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircleIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/solid';

export type ToastType = 'success' | 'error';

interface ToastProps {
  type: ToastType;
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({
  type,
  message,
  onDismiss,
  duration = 3000,
}: ToastProps): React.ReactElement {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs max-w-xs"
      style={{
        background: type === 'success' ? '#065f46' : '#7f1d1d',
        color: 'white',
        border: `1px solid ${type === 'success' ? '#059669' : '#ef4444'}`,
      }}
    >
      {type === 'success' ? (
        <CheckCircleIcon className="w-4 h-4 flex-shrink-0" style={{ color: '#34d399' }} />
      ) : (
        <XCircleIcon className="w-4 h-4 flex-shrink-0" style={{ color: '#f87171' }} />
      )}
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="flex-shrink-0 opacity-70 hover:opacity-100">
        <XMarkIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface UseToastReturn {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string) => void;
  dismissToast: (id: number) => void;
}

let _id = 0;

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}): React.ReactElement {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50">
      {toasts.map((t) => (
        <Toast key={t.id} type={t.type} message={t.message} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
