import { useState, useCallback } from 'react';
import type { Toast, ToastType } from '../components/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type, duration }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const updateToast = useCallback((id: string, message: string, type: ToastType) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, message, type } : t));
    if (type !== 'loading') setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return { toasts, toast, dismiss, updateToast };
}
