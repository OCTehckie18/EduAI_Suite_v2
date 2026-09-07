import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Star, LayoutGrid, Trash2, MoreHorizontal, ShieldAlert, LogIn } from 'lucide-react';
import { useTrelloStore } from '../../store/useTrelloStore';
import { useAuthStore } from '../../store/useAuthStore';
import { CreateBoardModal } from './components/CreateBoardModal';
import { JoinBoardModal } from './components/JoinBoardModal';
import './trello.css';

export const TrelloBoardsPage: React.FC = () => {
  const navigate = useNavigate();
  const { boards, toggleStar, deleteBoard, pullFromBackend } = useTrelloStore();
  const user = useAuthStore((s) => s.user);
  const fallbackEmail = user?.email || 'teacher@eduai.com';
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (fallbackEmail) {
      pullFromBackend(fallbackEmail);
    }
  }, [fallbackEmail, pullFromBackend]);

  const accessibleBoards = boards.filter(
    (b) => b.creatorEmail === fallbackEmail || b.members?.includes(fallbackEmail)
  );

  const totalPendingRequests = 0; // Disabled per user request

  const starredBoards = accessibleBoards.filter((b) => b.starred);
  const recentBoards = [...accessibleBoards].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleBoardCreated = (id: string) => {
    setShowCreateModal(false);
    navigate(`/games/trello/${id}`);
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ color: 'var(--color-text-primary)' }}>
            Project Boards
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Organize your team projects with Kanban boards
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowJoinModal(true)} className="btn bg-white border border-slate-200 hover:bg-slate-50 shadow-sm flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <LogIn size={18} />
            Join Board
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary shadow-md flex items-center gap-2">
            <Plus size={18} />
            Create Board
          </button>
        </div>
      </div>

      {/* Starred Boards */}
      {starredBoards.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Star size={17} style={{ color: 'var(--color-brand-gold)' }} fill="var(--color-brand-gold)" />
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Starred Boards
            </h2>
          </div>
          <div className="trello-boards-grid">
            {starredBoards.map((board) => (
              <BoardTile
                key={board.id}
                board={board}
                onOpen={() => navigate(`/games/trello/${board.id}`)}
                onStar={() => toggleStar(board.id)}
                onDelete={() => deleteBoard(board.id)}
                menuOpen={menuOpenId === board.id}
                onMenuToggle={() => setMenuOpenId(menuOpenId === board.id ? null : board.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* All Boards */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid size={17} style={{ color: 'var(--color-text-secondary)' }} />
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            All Boards
          </h2>
          <span className="badge badge-blue ml-1">{accessibleBoards.length}</span>
        </div>
        <div className="trello-boards-grid">
          {recentBoards.map((board) => (
            <BoardTile
              key={board.id}
              board={board}
              onOpen={() => navigate(`/games/trello/${board.id}`)}
              onStar={() => toggleStar(board.id)}
              onDelete={() => deleteBoard(board.id)}
              menuOpen={menuOpenId === board.id}
              onMenuToggle={() => setMenuOpenId(menuOpenId === board.id ? null : board.id)}
            />
          ))}
          {/* Create New Board Tile */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="trello-board-tile trello-create-tile"
          >
            <Plus size={24} />
            <span>Create new board</span>
          </button>
        </div>
      </section>

      {/* Empty State */}
      {accessibleBoards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'var(--color-brand-blue-pale)' }}
          >
            <LayoutGrid size={36} style={{ color: 'var(--color-brand-blue)' }} />
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            No boards yet
          </h3>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            Create your first project board to get started
          </p>
          <div className="flex gap-4">
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              <Plus size={18} />
              Create Your First Board
            </button>
          </div>
        </div>
      )}



      {showCreateModal && (
        <CreateBoardModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleBoardCreated}
        />
      )}

      {showJoinModal && (
        <JoinBoardModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
};

/* ─── Board Tile Sub-Component ────────────────────────────── */
interface BoardTileProps {
  board: { 
    id: string; 
    name: string; 
    background: string; 
    starred: boolean; 
    createdAt: string;
    joinRequests?: string[];
    creatorEmail: string;
  };
  onOpen: () => void;
  onStar: () => void;
  onDelete: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
}

const BoardTile: React.FC<BoardTileProps> = ({ board, onOpen, onStar, onDelete, menuOpen, onMenuToggle }) => {
  return (
    <div className="trello-board-tile" style={{ background: board.background, zIndex: menuOpen ? 40 : 1 }} onClick={onOpen}>
      {/* Overlay for text readability */}
      <div className="absolute inset-0 bg-black/10 rounded-xl" />

      <div className="relative z-10 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start">
          <h3 className="text-white font-bold text-[15px] leading-tight pr-6 line-clamp-2">
            {board.name}
            {board.joinRequests && board.joinRequests.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 ml-2 bg-red-500 text-white text-[10px] rounded-full align-middle animate-pulse">
                {board.joinRequests.length}
              </span>
            )}
          </h3>
          <div className="flex gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onStar(); }}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              title={board.starred ? 'Unstar' : 'Star'}
            >
              <Star
                size={15}
                className={board.starred ? 'text-yellow-300' : 'text-white/60'}
                fill={board.starred ? 'currentColor' : 'none'}
              />
            </button>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
              >
                <MoreHorizontal size={15} className="text-white/60" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onMenuToggle(); }} />
                  <div
                    className="absolute right-0 top-8 glass-card py-1 z-50 min-w-[140px]"
                    onClick={(e) => e.stopPropagation()}
                    style={{ borderRadius: 10 }}
                  >
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 size={14} /> Delete Board
                  </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <p className="text-white/50 text-[10px] font-medium">
          {new Date(board.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
};
