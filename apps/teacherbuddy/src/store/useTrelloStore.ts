import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';

// ─── Types ───────────────────────────────────────────────────
export interface TrelloLabel {
  id: string;
  text: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TrelloCard {
  id: string;
  columnId: string;
  boardId: string;
  title: string;
  description: string;
  labels: TrelloLabel[];
  dueDate: string | null;
  checklist: ChecklistItem[];
  sequence: number;
  createdAt: string;
}

export interface TrelloColumn {
  id: string;
  boardId: string;
  title: string;
  sequence: number;
}

export interface TrelloBoard {
  id: string;
  name: string;
  background: string;
  createdAt: string;
  starred: boolean;
  creatorEmail: string;
  members: string[];
  joinRequests: string[];
}

interface TrelloState {
  boards: TrelloBoard[];
  columns: TrelloColumn[];
  cards: TrelloCard[];

  addBoard: (name: string, background: string, creatorEmail: string) => string;
  updateBoard: (id: string, updates: Partial<TrelloBoard>) => void;
  deleteBoard: (id: string) => Promise<boolean>;
  toggleStar: (id: string) => void;
  requestJoinBoard: (boardId: string, email: string) => void;
  approveJoinRequest: (boardId: string, email: string) => void;
  rejectJoinRequest: (boardId: string, email: string) => void;
  removeMember: (boardId: string, email: string) => void;
  addMemberDirectly: (boardId: string, email: string) => void;

  addColumn: (boardId: string, title: string) => void;
  updateColumn: (id: string, title: string) => void;
  deleteColumn: (id: string) => void;
  reorderColumns: (boardId: string, sourceIdx: number, destIdx: number) => void;

  addCard: (columnId: string, boardId: string, title: string) => void;
  updateCard: (id: string, updates: Partial<TrelloCard>) => void;
  deleteCard: (id: string) => void;
  moveCard: (cardId: string, srcColId: string, destColId: string, srcIdx: number, destIdx: number) => void;

  addChecklistItem: (cardId: string, text: string) => void;
  toggleChecklistItem: (cardId: string, itemId: string) => void;
  deleteChecklistItem: (cardId: string, itemId: string) => void;
  syncWithBackend: (email: string) => Promise<void>;
  pullFromBackend: (email: string) => Promise<void>;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const BOARD_BACKGROUNDS = [
  { name: 'Christ Blue', value: 'linear-gradient(135deg, #264796 0%, #3460c4 100%)' },
  { name: 'Navy', value: 'linear-gradient(135deg, #1c3570 0%, #264796 100%)' },
  { name: 'Christ Gold', value: 'linear-gradient(135deg, #d0ae61 0%, #e6c97a 100%)' },
  { name: 'Royal Mix', value: 'linear-gradient(135deg, #264796 0%, #1c3570 60%, #b8943e 100%)' },
  { name: 'Ocean', value: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)' },
  { name: 'Emerald', value: 'linear-gradient(135deg, #059669 0%, #34d399 100%)' },
  { name: 'Violet', value: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)' },
  { name: 'Sunset', value: 'linear-gradient(135deg, #dc2626 0%, #f97316 100%)' },
  { name: 'Slate', value: 'linear-gradient(135deg, #334155 0%, #475569 100%)' },
];

export const CARD_LABEL_PRESETS = [
  { id: 'l1', text: 'Urgent', color: '#ef4444' },
  { id: 'l2', text: 'Feature', color: '#22c55e' },
  { id: 'l3', text: 'Bug', color: '#f97316' },
  { id: 'l4', text: 'Research', color: '#3b82f6' },
  { id: 'l5', text: 'Design', color: '#a855f7' },
  { id: 'l6', text: 'Review', color: '#eab308' },
];

export const useTrelloStore = create<TrelloState>()(
  persist(
    (set, get) => ({
      boards: [],
      columns: [],
      cards: [],

      // ── Board actions ──────────────────────────────────────
      addBoard: (name, background, creatorEmail) => {
        const id = uid();
        set((s) => ({
          boards: [
            ...s.boards,
            { id, name, background, createdAt: new Date().toISOString(), starred: false, creatorEmail, members: [], joinRequests: [] },
          ],
        }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
        return id;
      },
      updateBoard: (id, updates) => {
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, ...updates } : b)) }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      deleteBoard: async (id) => {
        if (!window.confirm("Are you sure you want to delete this board? This action cannot be undone.")) return false;
        const currentUser = useAuthStore.getState().user?.email || 'teacher@eduai.com';
        
        set((s) => ({
          boards: s.boards.filter((b) => b.id !== id),
          columns: s.columns.filter((c) => c.boardId !== id),
          cards: s.cards.filter((c) => c.boardId !== id),
        }));

        try {
          const resp = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${id}`, { method: 'DELETE' });
          if (resp.ok) {
            get().syncWithBackend(currentUser);
          }
          return true;
        } catch (err) {
          console.error("Failed to delete board from server", err);
          return true; // Still return true because local state was deleted
        }
      },
      toggleStar: (id) =>
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, starred: !b.starred } : b)) })),

      requestJoinBoard: async (boardId, email) => {
        try {
          const resp = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${boardId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (resp.ok) {
            get().syncWithBackend(email);
          }
        } catch (err) {
          console.error('Failed to request join board:', err);
        }
      },

      approveJoinRequest: async (boardId, email) => {
        const currentUser = useAuthStore.getState().user?.email || 'teacher@eduai.com';
        console.log(`Approving ${email} for board ${boardId}`);
        try {
          const resp = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${boardId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          
          if (resp.ok) {
            console.log('Approve successful');
            await get().syncWithBackend(currentUser);
          } else {
            const errData = await resp.json();
            alert(`Approval failed: ${errData.detail || 'Unknown error'}`);
          }
        } catch (err) {
          console.error('Failed to approve join request:', err);
          alert('Failed to connect to server for approval');
        }
      },

      rejectJoinRequest: async (boardId, email) => {
        const currentUser = useAuthStore.getState().user?.email || 'teacher@eduai.com';
        console.log(`Rejecting ${email} for board ${boardId}`);
        try {
          const resp = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${boardId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          
          if (resp.ok) {
            console.log('Reject successful');
            await get().syncWithBackend(currentUser);
          } else {
            const errData = await resp.json();
            alert(`Rejection failed: ${errData.detail || 'Unknown error'}`);
          }
        } catch (err) {
          console.error('Failed to reject join request:', err);
          alert('Failed to connect to server for rejection');
        }
      },

      removeMember: async (boardId, email) => {
        const currentUser = useAuthStore.getState().user?.email || 'teacher@eduai.com';
        
        // Optimistically update local state first
        set((s) => ({
          boards: s.boards.map((b) => {
            if (b.id !== boardId) return b;
            return { ...b, members: (b.members || []).filter((e) => e !== email) };
          }),
        }));

        try {
          const resp = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${boardId}/remove-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (resp.ok) {
            get().syncWithBackend(currentUser);
          }
        } catch (err) {
          console.error('Failed to remove member:', err);
        }
      },

      addMemberDirectly: async (boardId, email) => {
        const currentUser = useAuthStore.getState().user?.email || 'teacher@eduai.com';
        
        // Optimistically update local state first
        set((s) => ({
          boards: s.boards.map((b) => {
            if (b.id !== boardId) return b;
            if (b.members?.includes(email) || b.creatorEmail === email) return b;
            return {
              ...b,
              members: [...(b.members || []), email],
              joinRequests: (b.joinRequests || []).filter((e) => e !== email),
            };
          }),
        }));

        try {
          const resp = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/board/${boardId}/add-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (resp.ok) {
            get().syncWithBackend(currentUser);
          }
        } catch (err) {
          console.error('Failed to add member directly:', err);
        }
      },

      // ── Column actions ─────────────────────────────────────
      addColumn: (boardId, title) => {
        const cols = get().columns.filter((c) => c.boardId === boardId);
        const maxSeq = cols.length > 0 ? Math.max(...cols.map((c) => c.sequence)) : -1;
        set((s) => ({
          columns: [...s.columns, { id: uid(), boardId, title, sequence: maxSeq + 1 }],
        }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      updateColumn: (id, title) => {
        set((s) => ({ columns: s.columns.map((c) => (c.id === id ? { ...c, title } : c)) }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      deleteColumn: (id) => {
        set((s) => ({
          columns: s.columns.filter((c) => c.id !== id),
          cards: s.cards.filter((c) => c.columnId !== id),
        }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      reorderColumns: (boardId, sourceIdx, destIdx) => {
        set((s) => {
          const boardCols = s.columns
            .filter((c) => c.boardId === boardId)
            .sort((a, b) => a.sequence - b.sequence);
          const [moved] = boardCols.splice(sourceIdx, 1);
          boardCols.splice(destIdx, 0, moved);
          const reseq = boardCols.map((c, i) => ({ ...c, sequence: i }));
          return { columns: [...s.columns.filter((c) => c.boardId !== boardId), ...reseq] };
        });
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },

      // ── Card actions ───────────────────────────────────────
      addCard: (columnId, boardId, title) => {
        const colCards = get().cards.filter((c) => c.columnId === columnId);
        const maxSeq = colCards.length > 0 ? Math.max(...colCards.map((c) => c.sequence)) : -1;
        set((s) => ({
          cards: [
            ...s.cards,
            {
              id: uid(),
              columnId,
              boardId,
              title,
              description: '',
              labels: [],
              dueDate: null,
              checklist: [],
              sequence: maxSeq + 1,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      updateCard: (id, updates) => {
        set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)) }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      deleteCard: (id) => {
        set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },

      moveCard: (cardId, srcColId, destColId, srcIdx, destIdx) => {
        set((s) => {
          const allCards = [...s.cards];
          const srcCards = allCards
            .filter((c) => c.columnId === srcColId)
            .sort((a, b) => a.sequence - b.sequence);
          const [moved] = srcCards.splice(srcIdx, 1);
          if (!moved) return s;

          if (srcColId === destColId) {
            srcCards.splice(destIdx, 0, moved);
            const reseq = srcCards.map((c, i) => ({ ...c, sequence: i }));
            return { cards: [...allCards.filter((c) => c.columnId !== srcColId), ...reseq] };
          }

          const destCards = allCards
            .filter((c) => c.columnId === destColId)
            .sort((a, b) => a.sequence - b.sequence);
          moved.columnId = destColId;
          destCards.splice(destIdx, 0, moved);

          const reseqSrc = srcCards.map((c, i) => ({ ...c, sequence: i }));
          const reseqDest = destCards.map((c, i) => ({ ...c, sequence: i }));
          return {
            cards: [
              ...allCards.filter((c) => c.columnId !== srcColId && c.columnId !== destColId),
              ...reseqSrc,
              ...reseqDest,
            ],
          };
        });
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },

      // ── Checklist actions ──────────────────────────────────
      addChecklistItem: (cardId, text) => {
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === cardId
              ? { ...c, checklist: [...c.checklist, { id: uid(), text, completed: false }] }
              : c
          ),
        }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      toggleChecklistItem: (cardId, itemId) => {
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === cardId
              ? { ...c, checklist: c.checklist.map((i) => (i.id === itemId ? { ...i, completed: !i.completed } : i)) }
              : c
          ),
        }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },
      deleteChecklistItem: (cardId: string, itemId: string) => {
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === cardId ? { ...c, checklist: c.checklist.filter((i) => i.id !== itemId) } : c
          ),
        }));
        get().syncWithBackend(useAuthStore.getState().user?.email || 'teacher@eduai.com');
      },

      syncWithBackend: async (email) => {
        const state = get();
        try {
          // POST local changes to the server (non-destructive upsert)
          await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/trello/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              boards: state.boards,
              columns: state.columns,
              cards: state.cards,
              email
            }),
          });
          // Then pull the merged state from the server (includes other users' changes)
          await get().pullFromBackend(email);
        } catch (error) {
          console.error('Trello sync failed:', error);
        }
      },
      pullFromBackend: async (email) => {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/trello/sync?email=${encodeURIComponent(email)}`);
          if (response.ok) {
            const data = await response.json();
            set({
              boards: data.boards,
              columns: data.columns,
              cards: data.cards
            });
          }
        } catch (error) {
          console.error('Trello pull failed:', error);
        }
      },
    }),
    { name: 'edugames-trello-storage' }
  )
);
