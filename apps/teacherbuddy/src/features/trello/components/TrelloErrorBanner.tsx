import React from 'react';
import { X } from 'lucide-react';
import { useTrelloStore } from '../../../store/useTrelloStore';

/** The last failure from the server, shown until dismissed. */
export const TrelloErrorBanner: React.FC = () => {
  const error = useTrelloStore((s) => s.error);
  const dismiss = useTrelloStore((s) => s.dismissError);
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      <span>{error}</span>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded p-0.5 hover:bg-red-100">
        <X size={16} />
      </button>
    </div>
  );
};
