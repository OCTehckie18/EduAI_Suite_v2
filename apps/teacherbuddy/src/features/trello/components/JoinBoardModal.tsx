import React, { useState } from 'react';
import { X, LogIn, Loader2 } from 'lucide-react';
import { useTrelloStore } from '../../../store/useTrelloStore';
import { useAuthStore } from '../../../store/useAuthStore';

interface Props {
  onClose: () => void;
}

export const JoinBoardModal: React.FC<Props> = ({ onClose }) => {
  const { requestJoinBoard, boards, syncWithBackend } = useTrelloStore();
  const user = useAuthStore((s) => s.user);
  const [boardId, setBoardId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    setError('');
    if (!boardId.trim()) return;

    const userEmail = user?.email || 'teacher@eduai.com';
    const trimmedId = boardId.trim();

    // First check local store
    const localBoard = boards.find(b => b.id === trimmedId);
    if (localBoard) {
      if (localBoard.creatorEmail === userEmail || localBoard.members?.includes(userEmail)) {
        setError('You are already a member of this board.');
        return;
      }
      if (localBoard.joinRequests?.includes(userEmail)) {
        setError('You have already requested to join this board. Please wait for approval.');
        return;
      }
      await requestJoinBoard(localBoard.id, userEmail);
      syncWithBackend(userEmail);
      setSuccess(true);
      setTimeout(() => onClose(), 2000);
      return;
    }

    // Not found locally — check backend (cross-app board)
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${trimmedId}`);
      if (!res.ok) {
        setError('Board not found. Please check the ID.');
        setLoading(false);
        return;
      }

      const boardData = await res.json();

      if (boardData.creatorEmail === userEmail || boardData.members?.includes(userEmail)) {
        setError('You are already a member of this board.');
        setLoading(false);
        return;
      }
      if (boardData.joinRequests?.includes(userEmail)) {
        setError('You have already requested to join this board. Please wait for approval.');
        setLoading(false);
        return;
      }

      // Submit join request via backend
      const joinRes = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${trimmedId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      if (joinRes.ok) {
        setSuccess(true);
        setTimeout(() => onClose(), 2000);
      } else {
        const errData = await joinRes.json();
        setError(errData.detail || 'Failed to submit join request.');
      }
    } catch (err) {
      setError('Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
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
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={18} style={{ color: 'var(--color-text-secondary)' }} />
            </button>
          </div>

          {!success ? (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                Enter the Board ID shared with you by the creator to request access.
              </p>

              <label className="block mb-6">
                <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                  Board ID <span className="text-red-500">*</span>
                </span>
                <input
                  type="text"
                  value={boardId}
                  onChange={(e) => { setBoardId(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="e.g. a1b2c3d4"
                  className="form-input"
                  autoFocus
                />
                {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
              </label>

              <button
                onClick={handleJoin}
                disabled={!boardId.trim() || loading}
                className="btn btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
                style={{ opacity: boardId.trim() && !loading ? 1 : 0.5 }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Looking up board...' : 'Request Access'}
              </button>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <LogIn size={24} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-green-700 mb-2">Request Sent!</h3>
              <p className="text-sm text-green-600/80">
                The board creator has been notified. You will gain access once they approve your request.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
