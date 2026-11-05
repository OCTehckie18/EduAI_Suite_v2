import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTrelloStore, BOARD_BACKGROUNDS } from '../../../store/useTrelloStore';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export const CreateBoardModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const { addBoard } = useTrelloStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [bg, setBg] = useState(BOARD_BACKGROUNDS[0].value);

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    const id = await addBoard(name.trim(), bg);
    setSaving(false);
    if (id) onCreated(id);
    else setError('The board could not be created. Try again.');
  };

  return (
    <div className="trello-modal-overlay" onClick={onClose}>
      <div className="trello-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        {/* Preview */}
        <div className="trello-modal-preview" style={{ background: bg }}>
          <p className="text-white/90 font-bold text-lg truncate px-4 pt-4">
            {name || 'Board Preview'}
          </p>
          <div className="flex gap-2 px-4 pb-4 mt-3">
            <div className="h-16 w-[30%] rounded-lg" style={{ background: 'rgba(255,255,255,0.18)' }} />
            <div className="h-16 w-[30%] rounded-lg" style={{ background: 'rgba(255,255,255,0.18)' }} />
            <div className="h-16 w-[30%] rounded-lg" style={{ background: 'rgba(255,255,255,0.18)' }} />
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold font-display" style={{ color: 'var(--color-text-primary)' }}>
              Create Board
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={18} style={{ color: 'var(--color-text-secondary)' }} />
            </button>
          </div>

          {/* Board Name */}
          <label className="block mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
              style={{ color: 'var(--color-text-secondary)' }}>
              Board Title <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Sprint 1 — Group Project"
              className="form-input"
              autoFocus
            />
          </label>

          {/* Background Picker */}
          <div className="mb-5">
            <span className="text-xs font-semibold uppercase tracking-wider mb-2 block"
              style={{ color: 'var(--color-text-secondary)' }}>
              Background
            </span>
            <div className="grid grid-cols-3 gap-2">
              {BOARD_BACKGROUNDS.map((b) => (
                <button
                  key={b.name}
                  onClick={() => setBg(b.value)}
                  className="trello-bg-option"
                  style={{
                    background: b.value,
                    outline: bg === b.value ? '3px solid var(--color-brand-blue)' : 'none',
                    outlineOffset: '2px',
                  }}
                  title={b.name}
                />
              ))}
            </div>
          </div>

          {error && <p role="alert" className="text-xs text-red-500 mb-3 font-medium">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="btn btn-primary w-full"
            style={{ opacity: name.trim() && !saving ? 1 : 0.5 }}
          >
            {saving ? 'Creating...' : 'Create Board'}
          </button>
        </div>
      </div>
    </div>
  );
};
