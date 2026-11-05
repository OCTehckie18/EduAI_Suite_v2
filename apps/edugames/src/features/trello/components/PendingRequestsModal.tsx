import React, { useState } from 'react';
import { X, Shield, CheckCircle, User } from 'lucide-react';
import { useTrelloStore } from '../../../store/useTrelloStore';

interface Props {
  onClose: () => void;
}

export const PendingRequestsModal: React.FC<Props> = ({ onClose }) => {
  const { boards, approveJoinRequest, rejectJoinRequest } = useTrelloStore();
  const [error, setError] = useState('');

  // The server only tells an owner about requests on their own boards.
  const boardsWithRequests = boards.filter((b) => b.isOwner && b.joinRequests.length > 0);

  const handleAction = async (action: 'approve' | 'reject', boardId: string, email: string) => {
    setError('');
    const result = action === 'approve' ? await approveJoinRequest(boardId, email) : await rejectJoinRequest(boardId, email);
    if (!result.ok) setError(result.error || 'That did not work. Try again.');
  };

  return (
    <div className="trello-modal-overlay" onClick={onClose}>
      <div className="trello-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold font-display flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <Shield size={20} className="text-amber-500" /> Pending Join Requests
            </h2>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={18} style={{ color: 'var(--color-text-secondary)' }} />
            </button>
          </div>

          {error && <p role="alert" className="mb-4 text-sm font-medium text-red-600">{error}</p>}

          {boardsWithRequests.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Shield size={24} className="text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium">No pending requests at the moment.</p>
            </div>
          ) : (
            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
              {boardsWithRequests.map((board) => (
                <div key={board.id} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{board.name}</span>
                    <span className="badge badge-amber">{board.joinRequests.length} pending</span>
                  </div>
                  <div className="p-2 space-y-2">
                    {board.joinRequests.map((email) => (
                      <div key={email} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                            <User size={16} className="text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-700">{email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAction('approve', board.id, email)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Approve"
                            aria-label={`Approve ${email}`}
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button
                            onClick={() => handleAction('reject', board.id, email)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reject"
                            aria-label={`Reject ${email}`}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <button onClick={onClose} className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-6">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
