import React, { useState } from 'react';
import { Draggable, Droppable, type DroppableProvided, type DroppableStateSnapshot } from '@hello-pangea/dnd';
import { MoreHorizontal, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useTrelloStore, type TrelloCard, type TrelloColumn } from '../../../store/useTrelloStore';
import { BoardCard } from './BoardCard';

interface Props {
  column: TrelloColumn;
  cards: TrelloCard[];
  index: number;
  onCardClick: (card: TrelloCard) => void;
}

export const BoardColumn: React.FC<Props> = ({ column, cards, index, onCardClick }) => {
  const { addCard, updateColumn, deleteColumn } = useTrelloStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(column.title);
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');

  const saveTitle = () => {
    if (titleValue.trim()) {
      updateColumn(column.id, titleValue.trim());
    } else {
      setTitleValue(column.title);
    }
    setEditingTitle(false);
  };

  const handleAddCard = () => {
    if (!newCardTitle.trim()) return;
    addCard(column.id, column.boardId, newCardTitle.trim());
    setNewCardTitle('');
    setAddingCard(false);
  };

  return (
    <Draggable draggableId={column.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={provided.draggableProps.style}
          className={`trello-column ${snapshot.isDragging ? 'trello-column-dragging' : ''}`}
        >
          {/* Column Header */}
          <div className="trello-column-header" {...provided.dragHandleProps}>
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleValue(column.title); setEditingTitle(false); } }}
                  className="w-full text-[13px] font-bold bg-white px-2 py-1 rounded-md border outline-none"
                  style={{ borderColor: 'var(--color-brand-blue)', color: 'var(--color-text-primary)' }}
                  autoFocus
                />
              ) : (
                <h3
                  className="text-[13px] font-bold px-1 truncate cursor-pointer"
                  style={{ color: 'var(--color-text-primary)' }}
                  onClick={() => setEditingTitle(true)}
                >
                  {column.title}
                </h3>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface-base)' }}>
                {cards.length}
              </span>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-1 rounded-md hover:bg-slate-200/70 transition-colors"
                >
                  <MoreHorizontal size={15} style={{ color: 'var(--color-text-muted)' }} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-8 glass-card py-1 z-50 w-[160px]" style={{ borderRadius: 10 }}>
                      <button
                        onClick={() => { setEditingTitle(true); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 transition-colors"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        <Pencil size={13} /> Rename
                      </button>
                      <button
                        onClick={() => { setAddingCard(true); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 transition-colors"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        <Plus size={13} /> Add card
                      </button>
                      <div className="border-t my-1" style={{ borderColor: 'var(--color-border)' }} />
                      <button
                        onClick={() => { deleteColumn(column.id); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                      >
                        <Trash2 size={13} /> Delete list
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Cards Droppable Area */}
          <Droppable droppableId={column.id} type="card">
            {(dropProvided: DroppableProvided, dropSnapshot: DroppableStateSnapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`trello-column-cards ${dropSnapshot.isDraggingOver ? 'trello-column-cards-active' : ''}`}
              >
                {cards.map((card, i) => (
                  <BoardCard key={card.id} card={card} index={i} onClick={() => onCardClick(card)} />
                ))}
                {dropProvided.placeholder}

                {/* Add Card Form */}
                {addingCard && (
                  <div className="px-1 pb-1">
                    <textarea
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddCard(); }
                        if (e.key === 'Escape') { setAddingCard(false); setNewCardTitle(''); }
                      }}
                      placeholder="Enter a title for this card…"
                      className="w-full text-[13px] p-2.5 rounded-lg border-none outline-none resize-none min-h-[60px]"
                      style={{
                        background: 'var(--color-surface-card)',
                        color: 'var(--color-text-primary)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                      }}
                      autoFocus
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={handleAddCard} className="btn btn-primary text-xs py-1.5 px-3">
                        Add card
                      </button>
                      <button
                        onClick={() => { setAddingCard(false); setNewCardTitle(''); }}
                        className="p-1 rounded hover:bg-slate-200 transition-colors"
                      >
                        <X size={16} style={{ color: 'var(--color-text-muted)' }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Droppable>

          {/* Add Card Button */}
          {!addingCard && (
            <button
              onClick={() => setAddingCard(true)}
              className="trello-add-card-btn"
            >
              <Plus size={15} /> Add a card
            </button>
          )}
        </div>
      )}
    </Draggable>
  );
};
