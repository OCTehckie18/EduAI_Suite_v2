import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, type DropResult, type DroppableProvided } from '@hello-pangea/dnd';
import { ArrowLeft, Star, Plus, X, MoreHorizontal, Trash2, Pencil, Users } from 'lucide-react';
import { useTrelloStore, type TrelloCard } from '../../store/useTrelloStore';
import { useAuthStore } from '../../store/useAuthStore';
import { BoardColumn } from './components/BoardColumn';
import { CardDetailModal } from './components/CardDetailModal';
import { ShareModal } from './components/ShareModal';
import { PendingRequestsModal } from './components/PendingRequestsModal';
import './trello.css';

export const TrelloBoardView: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { boards, columns, cards, toggleStar, deleteBoard, addColumn, reorderColumns, moveCard, updateBoard, syncWithBackend, pullFromBackend } =
    useTrelloStore();

  const board = boards.find((b) => b.id === boardId);
  const boardColumns = columns
    .filter((c) => c.boardId === boardId)
    .sort((a, b) => a.sequence - b.sequence);

  const [selectedCard, setSelectedCard] = useState<TrelloCard | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [boardName, setBoardName] = useState(board?.name || '');
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const user = useAuthStore((s) => s.user);
  const userEmail = user?.email || 'teacher@eduai.com';

  useEffect(() => {
    if (userEmail) {
      pullFromBackend(userEmail);
      // Auto-sync every 10 seconds (pull only)
      const interval = setInterval(() => pullFromBackend(userEmail), 5000);
      return () => clearInterval(interval);
    }
  }, [userEmail, pullFromBackend]);

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Board not found</p>
        <button onClick={() => navigate('/games/trello')} className="btn btn-primary">
          <ArrowLeft size={16} /> Back to Boards
        </button>
      </div>
    );
  }

  const getColumnCards = (columnId: string) =>
    cards
      .filter((c) => c.columnId === columnId)
      .sort((a, b) => a.sequence - b.sequence);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'column') {
      reorderColumns(board.id, source.index, destination.index);
      return;
    }

    if (type === 'card') {
      const cardId = result.draggableId;
      moveCard(cardId, source.droppableId, destination.droppableId, source.index, destination.index);
    }
  };

  const handleAddColumn = () => {
    if (!newColTitle.trim()) return;
    addColumn(board.id, newColTitle.trim());
    setNewColTitle('');
    setAddingColumn(false);
  };

  const saveBoardName = () => {
    if (boardName.trim()) {
      updateBoard(board.id, { name: boardName.trim() });
    } else {
      setBoardName(board.name);
    }
    setEditingName(false);
  };

  const handleDeleteBoard = async () => {
    const deleted = await deleteBoard(board.id);
    if (deleted) {
      navigate('/teacher/trello');
    }
  };

  const selectedColumn = selectedCard
    ? columns.find((c) => c.id === selectedCard.columnId)
    : null;

  // Re-fetch card from store so modal always has latest data
  const liveCard = selectedCard ? cards.find((c) => c.id === selectedCard.id) : null;

  return (
    <div className="trello-board-view" style={{ background: board.background }}>
      {/* Board Header */}
      <div className="trello-board-header">
        <button
          onClick={() => navigate('/games/trello')}
          className="p-2 rounded-lg hover:bg-white/15 transition-colors"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        {editingName ? (
          <input
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            onBlur={saveBoardName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveBoardName();
              if (e.key === 'Escape') { setBoardName(board.name); setEditingName(false); }
            }}
            className="text-white font-bold text-base bg-white/20 px-3 py-1 rounded-lg border border-white/30 outline-none backdrop-blur-sm"
            autoFocus
          />
        ) : (
          <h1
            className="text-white font-bold text-base cursor-pointer hover:bg-white/15 px-3 py-1 rounded-lg transition-colors"
            onClick={() => { setBoardName(board.name); setEditingName(true); }}
          >
            {board.name}
          </h1>
        )}

        <button
          onClick={() => toggleStar(board.id)}
          className="p-2 rounded-lg hover:bg-white/15 transition-colors"
        >
          <Star
            size={17}
            className={board.starred ? 'text-yellow-300' : 'text-white/50'}
            fill={board.starred ? 'currentColor' : 'none'}
          />
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setShowShareModal(true)}
          className="bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-2 mr-2"
        >
          <Users size={16} /> Share
        </button>

        {board.joinRequests && board.joinRequests.length > 0 && userEmail === board.creatorEmail && (
          <button
            onClick={() => setShowPendingModal(true)}
            className="bg-amber-500/80 hover:bg-amber-500 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 mr-2 animate-pulse"
          >
            <span className="bg-white text-amber-600 text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {board.joinRequests.length}
            </span>
            Pending
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setBoardMenuOpen(!boardMenuOpen)}
            className="p-2 rounded-lg hover:bg-white/15 transition-colors"
          >
            <MoreHorizontal size={18} className="text-white/70" />
          </button>
          {boardMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBoardMenuOpen(false)} />
              <div className="absolute right-0 top-10 glass-card py-1 z-50 w-[180px]" style={{ borderRadius: 10 }}>
                <button
                  onClick={() => { setEditingName(true); setBoardMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  <Pencil size={14} /> Rename Board
                </button>
                <div className="border-t my-1" style={{ borderColor: 'var(--color-border)' }} />
                <button
                  onClick={handleDeleteBoard}
                  className="w-full text-left px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={14} /> Delete Board
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Columns Area */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="board-columns" direction="horizontal" type="column">
          {(provided: DroppableProvided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="trello-columns-container"
            >
              {boardColumns.map((col, i) => (
                <BoardColumn
                  key={col.id}
                  column={col}
                  cards={getColumnCards(col.id)}
                  index={i}
                  onCardClick={(card) => setSelectedCard(card)}
                />
              ))}
              {provided.placeholder}

              {/* Add Column */}
              <div className="trello-add-column-wrapper">
                {addingColumn ? (
                  <div className="trello-add-column-form">
                    <input
                      value={newColTitle}
                      onChange={(e) => setNewColTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddColumn();
                        if (e.key === 'Escape') { setAddingColumn(false); setNewColTitle(''); }
                      }}
                      placeholder="Enter list title…"
                      className="form-input text-sm py-2"
                      autoFocus
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={handleAddColumn} className="btn btn-primary text-xs py-1.5 px-3">
                        Add list
                      </button>
                      <button
                        onClick={() => { setAddingColumn(false); setNewColTitle(''); }}
                        className="p-1 rounded hover:bg-slate-200 transition-colors"
                      >
                        <X size={16} style={{ color: 'var(--color-text-muted)' }} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="trello-add-column-btn"
                  >
                    <Plus size={16} /> Add another list
                  </button>
                )}
              </div>
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Card Detail Modal */}
      {liveCard && selectedColumn && (
        <CardDetailModal
          card={liveCard}
          columnTitle={selectedColumn.title}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal board={board} onClose={() => setShowShareModal(false)} />
      )}

      {/* Pending Requests Modal */}
      {showPendingModal && (
        <PendingRequestsModal onClose={() => setShowPendingModal(false)} />
      )}
    </div>
  );
};
