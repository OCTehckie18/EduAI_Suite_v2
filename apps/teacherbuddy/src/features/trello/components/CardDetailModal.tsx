import React, { useState, useEffect } from 'react';
import {
  X, Trash2, Calendar, CheckSquare, Tag, AlignLeft,
  Plus, Clock, Square, SquareCheck
} from 'lucide-react';
import { useTrelloStore, CARD_LABEL_PRESETS, type TrelloCard, type TrelloLabel } from '../../../store/useTrelloStore';

interface Props {
  card: TrelloCard;
  columnTitle: string;
  onClose: () => void;
}

export const CardDetailModal: React.FC<Props> = ({ card, columnTitle, onClose }) => {
  const { updateCard, deleteCard, addChecklistItem, toggleChecklistItem, deleteChecklistItem, columns } =
    useTrelloStore();

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [dueDate, setDueDate] = useState(card.dueDate || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [showChecklist, setShowChecklist] = useState(card.checklist.length > 0);
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  const boardColumns = columns.filter((c) => c.boardId === card.boardId);
  const completedItems = card.checklist.filter((i) => i.completed).length;
  const totalItems = card.checklist.length;
  const checklistPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const saveTitle = () => {
    if (title.trim()) updateCard(card.id, { title: title.trim() });
    setEditingTitle(false);
  };

  const saveDesc = () => {
    updateCard(card.id, { description });
    setEditingDesc(false);
  };

  const saveDueDate = (val: string) => {
    setDueDate(val);
    updateCard(card.id, { dueDate: val || null });
  };

  const toggleLabel = (preset: typeof CARD_LABEL_PRESETS[0]) => {
    const exists = card.labels.find((l) => l.id === preset.id);
    if (exists) {
      updateCard(card.id, { labels: card.labels.filter((l) => l.id !== preset.id) });
    } else {
      updateCard(card.id, { labels: [...card.labels, preset as TrelloLabel] });
    }
  };

  const handleAddCheckItem = () => {
    if (!newCheckItem.trim()) return;
    addChecklistItem(card.id, newCheckItem.trim());
    setNewCheckItem('');
  };

  const handleDelete = () => {
    deleteCard(card.id);
    onClose();
  };

  const handleMoveCard = (toColumnId: string) => {
    updateCard(card.id, { columnId: toColumnId });
    setShowMoveMenu(false);
  };

  return (
    <div className="trello-modal-overlay" onClick={onClose}>
      <div className="trello-modal trello-card-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="flex-1 min-w-0">
            {/* Labels inline */}
            {card.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {card.labels.map((l) => (
                  <span
                    key={l.id}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider"
                    style={{ background: l.color }}
                  >
                    {l.text}
                  </span>
                ))}
              </div>
            )}
            {editingTitle ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                className="text-lg font-bold w-full bg-transparent border-b-2 outline-none pb-1"
                style={{ borderColor: 'var(--color-brand-blue)', color: 'var(--color-text-primary)' }}
                autoFocus
              />
            ) : (
              <h2
                className="text-lg font-bold cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: 'var(--color-text-primary)' }}
                onClick={() => setEditingTitle(true)}
              >
                {card.title}
              </h2>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              in list <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{columnTitle}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
            <X size={18} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        </div>

        <div className="flex gap-4 px-5 pb-5">
          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Due Date Display */}
            {card.dueDate && (
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: 'var(--color-text-muted)' }} />
                <span className="text-xs font-medium badge badge-blue">
                  Due: {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}

            {/* Description */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlignLeft size={15} style={{ color: 'var(--color-text-secondary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Description
                </span>
              </div>
              {editingDesc ? (
                <div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add a more detailed description…"
                    className="form-input min-h-[120px] resize-y text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveDesc} className="btn btn-primary text-xs py-1.5 px-3">Save</button>
                    <button onClick={() => { setDescription(card.description); setEditingDesc(false); }}
                      className="btn btn-ghost text-xs py-1.5 px-3">Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setEditingDesc(true)}
                  className="text-sm p-3 rounded-lg cursor-pointer min-h-[60px] transition-colors"
                  style={{
                    background: description ? 'transparent' : 'var(--color-surface-base)',
                    color: description ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {description || 'Add a more detailed description…'}
                </div>
              )}
            </div>

            {/* Checklist */}
            {showChecklist && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={15} style={{ color: 'var(--color-text-secondary)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      Checklist
                    </span>
                  </div>
                  {totalItems > 0 && (
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                      {checklistPct}%
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {totalItems > 0 && (
                  <div className="progress-bar mb-3">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${checklistPct}%`,
                        background: checklistPct === 100
                          ? 'var(--color-success)'
                          : 'linear-gradient(90deg, #264796, #3460c4)',
                      }}
                    />
                  </div>
                )}

                {/* Items */}
                <div className="space-y-1">
                  {card.checklist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 group py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <button onClick={() => toggleChecklistItem(card.id, item.id)} className="shrink-0">
                        {item.completed ? (
                          <SquareCheck size={17} style={{ color: 'var(--color-success)' }} />
                        ) : (
                          <Square size={17} style={{ color: 'var(--color-text-muted)' }} />
                        )}
                      </button>
                      <span
                        className="flex-1 text-sm"
                        style={{
                          color: item.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                          textDecoration: item.completed ? 'line-through' : 'none',
                        }}
                      >
                        {item.text}
                      </span>
                      <button
                        onClick={() => deleteChecklistItem(card.id, item.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all"
                      >
                        <X size={13} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add item */}
                <div className="flex gap-2 mt-2">
                  <input
                    value={newCheckItem}
                    onChange={(e) => setNewCheckItem(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCheckItem()}
                    placeholder="Add an item…"
                    className="form-input text-sm flex-1 py-1.5"
                  />
                  <button onClick={handleAddCheckItem} className="btn btn-primary text-xs py-1.5 px-3" disabled={!newCheckItem.trim()}>
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Actions */}
          <div className="w-[160px] shrink-0 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'var(--color-text-muted)' }}>Add to card</p>

            {/* Labels */}
            <div className="relative">
              <button
                onClick={() => setShowLabels(!showLabels)}
                className="trello-sidebar-btn"
              >
                <Tag size={14} /> Labels
              </button>
              {showLabels && (
                <div className="absolute left-0 top-9 glass-card p-3 z-50 w-[200px]" style={{ borderRadius: 10 }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--color-text-muted)' }}>Labels</p>
                  <div className="space-y-1.5">
                    {CARD_LABEL_PRESETS.map((preset) => {
                      const active = card.labels.some((l) => l.id === preset.id);
                      return (
                        <button
                          key={preset.id}
                          onClick={() => toggleLabel(preset)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left"
                          style={{ background: active ? `${preset.color}18` : 'transparent' }}
                        >
                          <div className="w-8 h-5 rounded" style={{ background: preset.color }} />
                          <span className="text-xs font-medium flex-1" style={{ color: 'var(--color-text-primary)' }}>
                            {preset.text}
                          </span>
                          {active && <SquareCheck size={14} style={{ color: preset.color }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Checklist toggle */}
            {!showChecklist && (
              <button onClick={() => setShowChecklist(true)} className="trello-sidebar-btn">
                <CheckSquare size={14} /> Checklist
              </button>
            )}

            {/* Due Date */}
            <div className="relative">
              <button className="trello-sidebar-btn" onClick={() => (document.getElementById('due-date-input') as HTMLInputElement)?.showPicker()}>
                <Calendar size={14} /> Due Date
              </button>
              <input
                id="due-date-input"
                type="date"
                value={dueDate}
                onChange={(e) => saveDueDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            {/* Move */}
            <div className="relative">
              <button onClick={() => setShowMoveMenu(!showMoveMenu)} className="trello-sidebar-btn">
                <AlignLeft size={14} /> Move
              </button>
              {showMoveMenu && (
                <div className="absolute left-0 top-9 glass-card py-1 z-50 w-[180px]" style={{ borderRadius: 10 }}>
                  {boardColumns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => handleMoveCard(col.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2"
                      style={{
                        color: col.id === card.columnId ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
                        fontWeight: col.id === card.columnId ? 600 : 400,
                      }}
                    >
                      {col.title}
                      {col.id === card.columnId && <span className="text-[10px] badge badge-blue">current</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={handleDelete} className="trello-sidebar-btn text-red-500 hover:!bg-red-50">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
