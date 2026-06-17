import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

export type ToastState = { kind: 'error' | 'success'; text: string } | null;

// Themed, auto-dismissing replacement for window.alert(). Kept dumb: the parent
// owns the single toast slot and clears it; this only renders and self-expires.
export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] w-[min(92vw,28rem)]"
          role="status"
        >
          <div className={`qb-panel shadow-2xl flex items-center gap-3 px-4 py-3 border-l-2 ${toast.kind === 'error' ? '!border-l-red-500' : '!border-l-emerald-500'}`}>
            {toast.kind === 'error'
              ? <AlertTriangle size={16} className="text-red-500 shrink-0" />
              : <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
            <p className="qb-text text-xs flex-1" style={{ fontFamily: 'var(--qb-font)' }}>{toast.text}</p>
            <button onClick={onDismiss} className="text-slate-400 hover:text-slate-900 dark:hover:text-white" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
