import React, { useState } from 'react';
import { X, LogIn, Loader2 } from 'lucide-react';
import { useTrelloStore } from '../../../store/useTrelloStore';

interface Props {
  onClose: () => void;
}

export const JoinBoardModal: React.FC<Props> = ({ onClose }) => {
  const requestJoinBoard = useTrelloStore((s) => s.requestJoinBoard);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    setError('');
    if (!code.trim() || loading) return;
    setLoading(true);
    const result = await requestJoinBoard(code.trim());
    setLoading(false);
    if (result.ok) {
      setSuccess(true);
    } else {
      setError(result.error || 'Could not send the request.');
    }
  };

  return (
    <div className="trello-modal-overlay" onClick={onClose}>
      <div className="trello-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold font-display flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <LogIn size={20} /> Join a Board
            </h2>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={18} style={{ color: 'var(--color-text-secondary)' }} />
            </button>
          </div>

          {!success ? (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                Enter the board code the owner shared with you. They will decide whether to let you in.
              </p>

              <label className="block mb-6">
                <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                  Board code <span className="text-red-500">*</span>
                </span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="e.g. K7QM2XPA"
                  maxLength={12}
                  className="form-input font-mono tracking-wider"
                  autoFocus
                />
                {error && <p role="alert" className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
              </label>

              <button
                onClick={handleJoin}
                disabled={!code.trim() || loading}
                className="btn btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
                style={{ opacity: code.trim() && !loading ? 1 : 0.5 }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Sending...' : 'Request Access'}
              </button>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <LogIn size={24} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-green-700 mb-2">Request sent</h3>
              <p className="text-sm text-green-600/80 mb-4">
                You will see the board here once its owner approves your request.
              </p>
              <button onClick={onClose} className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-6">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
