import React, { useState, useEffect } from 'react';
import { X, Users, Copy, CheckCircle2, UserPlus, UserMinus, ShieldAlert } from 'lucide-react';
import { useTrelloStore, type TrelloBoard } from '../../../store/useTrelloStore';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from "../../../shared/utils/apiConfig";
interface Props {
  board: TrelloBoard;
  onClose: () => void;
}

export const ShareModal: React.FC<Props> = ({ board, onClose }) => {
  const { removeMember, addMemberDirectly, leaveBoard } = useTrelloStore();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<{ email: string; name: string; role: string }[]>([]);
  const isCreator = board.isOwner;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(board.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the code and copy it by hand.');
    }
  };

  const handleInvite = async (email?: string) => {
    const targetEmail = email || inviteEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) return;
    setError('');
    const result = await addMemberDirectly(board.id, targetEmail);
    if (result.ok) setInviteEmail('');
    else setError(result.error || 'Could not add that person.');
  };

  const handleRemove = async (email: string) => {
    setError('');
    const result = await removeMember(board.id, email);
    if (!result.ok) setError(result.error || 'Could not remove that person.');
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this board? You will need the owner to approve you again to come back.')) return;
    if (await leaveBoard(board.id)) {
      onClose();
      navigate('/games/trello');
    }
  };

  // People from your own classrooms: the only ones an owner can add directly.
  useEffect(() => {
    if (!isCreator) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/trello/suggested-members`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setSuggestions(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [board.id, isCreator]);

  return (
    <div className="trello-modal-overlay" onClick={onClose}>
      <div className="trello-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold font-display flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <Users size={20} /> Share Board
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={18} style={{ color: 'var(--color-text-secondary)' }} />
            </button>
          </div>

          {/* Shareable Board Code */}
          <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--color-brand-blue-pale, #eef2ff)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Shareable Board Code
            </h3>
            <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-muted, #94a3b8)' }}>
              Anyone with this code can ask to join. You decide who gets in.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-bold tracking-wider select-all" style={{ color: 'var(--color-text-primary)' }}>
                {board.joinCode}
              </div>
              <button
                onClick={handleCopyCode}
                className="btn btn-primary py-2 px-4 whitespace-nowrap flex items-center gap-1.5"
              >
                {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Direct Add Member Interface */}
          {isCreator && (
            <div className="mb-6">
              <h3 className="text-sm font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--color-text-primary)' }}>
                <UserPlus size={16} className="text-brand-blue" />
                Add Member Directly
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="Enter email address..."
                  className="form-input text-sm py-2 flex-1"
                />
                <button
                  onClick={() => handleInvite()}
                  disabled={!inviteEmail.trim() || !inviteEmail.includes('@')}
                  className="btn btn-primary py-2 px-4 whitespace-nowrap"
                  style={{ opacity: (!inviteEmail.trim() || !inviteEmail.includes('@')) ? 0.5 : 1 }}
                >
                  Add User
                </button>
              </div>

              {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}

              {/* Suggestions list */}
              {suggestions.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Suggested Connections</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions
                      .filter(s => s.email !== board.creatorEmail && !board.members.includes(s.email))
                      .slice(0, 5)
                      .map(s => (
                        <button
                          key={s.email}
                          onClick={() => handleInvite(s.email)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
                          title={`Invite ${s.name}`}
                        >
                          <div className={`w-2 h-2 rounded-full ${s.role === 'teacher' ? 'bg-brand-gold' : 'bg-brand-blue'}`} />
                          {s.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--color-text-primary)' }}>
              <Users size={16} className="text-blue-500" />
              Members ({1 + board.members.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                    {board.creatorEmail.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-800 block">{board.creatorEmail}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Creator</span>
                  </div>
                </div>
              </div>

              {board.members?.map((email) => (
                <div key={email} className="flex items-center justify-between p-2.5 bg-white border border-slate-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold">
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-800 block">{email}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Member</span>
                    </div>
                  </div>
                  {isCreator && (
                    <button
                      onClick={() => handleRemove(email)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Remove Member"
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {!isCreator && (
            <div className="mt-6 flex justify-end">
              {error && <p role="alert" className="mr-auto text-xs font-medium text-red-600">{error}</p>}
              <button onClick={handleLeave} className="btn bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 text-sm">Leave board</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
