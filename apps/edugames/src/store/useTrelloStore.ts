import { create } from 'zustand';
import { API_BASE_URL } from "../shared/utils/apiConfig";

// The server is the source of truth. This store only holds what the last
// response said, plus optimistic moves that are undone by reloading on failure.

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
  creatorName: string;
  isOwner: boolean;
  joinCode: string;
  members: string[];
  memberDetails: { email: string; name: string }[];
  joinRequests: string[];
}

export interface Result {
  ok: boolean;
  error?: string;
}

interface TrelloState {
  boards: TrelloBoard[];
  columns: TrelloColumn[];
  cards: TrelloCard[];
  loaded: boolean;
  error: string | null;

  load: (background?: boolean) => Promise<void>;
  clear: () => void;
  dismissError: () => void;

  addBoard: (name: string, background: string) => Promise<string | null>;
  updateBoard: (id: string, updates: Partial<Pick<TrelloBoard, 'name' | 'background'>>) => Promise<void>;
  deleteBoard: (id: string) => Promise<boolean>;
  toggleStar: (id: string) => Promise<void>;
  requestJoinBoard: (code: string) => Promise<Result>;
  approveJoinRequest: (boardId: string, email: string) => Promise<Result>;
  rejectJoinRequest: (boardId: string, email: string) => Promise<Result>;
  removeMember: (boardId: string, email: string) => Promise<Result>;
  addMemberDirectly: (boardId: string, email: string) => Promise<Result>;
  leaveBoard: (boardId: string) => Promise<boolean>;

  addColumn: (boardId: string, title: string) => Promise<void>;
  updateColumn: (id: string, title: string) => Promise<void>;
  deleteColumn: (id: string) => Promise<void>;
  reorderColumns: (boardId: string, sourceIdx: number, destIdx: number) => Promise<void>;

  addCard: (columnId: string, boardId: string, title: string) => Promise<void>;
  updateCard: (id: string, updates: Partial<Pick<TrelloCard, 'title' | 'description' | 'labels' | 'dueDate' | 'checklist'>>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  moveCard: (cardId: string, srcColId: string, destColId: string, srcIdx: number, destIdx: number) => Promise<void>;

  addChecklistItem: (cardId: string, text: string) => Promise<void>;
  toggleChecklistItem: (cardId: string, itemId: string) => Promise<void>;
  deleteChecklistItem: (cardId: string, itemId: string) => Promise<void>;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ── server shape → store shape ────────────────────────────────
const toBoard = (b: any): TrelloBoard => ({
  id: b.id,
  name: b.name,
  background: b.background,
  createdAt: b.created_at,
  starred: !!b.starred,
  creatorEmail: b.owner_email,
  creatorName: b.owner_name,
  isOwner: !!b.is_owner,
  joinCode: b.join_code,
  members: b.members || [],
  memberDetails: b.member_details || [],
  joinRequests: b.join_requests || [],
});
const toColumn = (c: any): TrelloColumn => ({ id: c.id, boardId: c.board_id, title: c.title, sequence: c.sequence });
const toCard = (c: any): TrelloCard => ({
  id: c.id,
  columnId: c.column_id,
  boardId: c.board_id,
  title: c.title,
  description: c.description || '',
  labels: c.labels || [],
  dueDate: c.due_date,
  checklist: c.checklist || [],
  sequence: c.sequence,
  createdAt: c.created_at,
});

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';

let inflight = 0;

/** One request. Never throws: a failure comes back as a message the page can show. */
async function request(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data: any; error?: string }> {
  inflight += 1;
  try {
    const res = await fetch(`${API_BASE_URL}/trello/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, data, error: data?.detail || data?.error?.message || `Something went wrong (${res.status}).` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, data: null, error: NETWORK_MESSAGE };
  } finally {
    inflight -= 1;
  }
}

const bySequence = <T extends { sequence: number }>(a: T, b: T) => a.sequence - b.sequence;

export const BOARD_BACKGROUNDS = [
  { name: 'Blue', value: 'linear-gradient(135deg, #0b4a87 0%, #32679a 100%)' },
  { name: 'Navy', value: 'linear-gradient(135deg, #083561 0%, #0b4a87 100%)' },
  { name: 'Orange', value: 'linear-gradient(135deg, #e8792b 0%, #ee9f66 100%)' },
  { name: 'Blue and orange', value: 'linear-gradient(135deg, #0b4a87 0%, #083561 60%, #ba6122 100%)' },
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

// Boards used to be cached here for good; nothing is kept on this device any more.
try { localStorage.removeItem('edugames-trello-storage'); } catch { /* storage unavailable */ }

export const useTrelloStore = create<TrelloState>()((set, get) => {
  /** Show a failure, and reload so the screen matches the server again. */
  const fail = async (error: string | undefined) => {
    set({ error: error || NETWORK_MESSAGE });
    await get().load();
  };
  const patchCard = (id: string, fn: (c: TrelloCard) => TrelloCard) =>
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? fn(c) : c)) }));

  return {
    boards: [],
    columns: [],
    cards: [],
    loaded: false,
    error: null,

    load: async (background = false) => {
      // A timed refresh must not wipe a change that is still on its way to the server.
      if (background && inflight > 0) return;
      const res = await request('GET', 'state');
      if (res.ok) {
        set({
          boards: res.data.boards.map(toBoard),
          columns: res.data.columns.map(toColumn),
          cards: res.data.cards.map(toCard),
          loaded: true,
        });
      } else {
        set({ error: res.error || NETWORK_MESSAGE, loaded: true });
      }
    },
    clear: () => set({ boards: [], columns: [], cards: [], loaded: false, error: null }),
    dismissError: () => set({ error: null }),

    // ── Boards ──────────────────────────────────────────────
    addBoard: async (name, background) => {
      const res = await request('POST', 'board', { name, background });
      if (!res.ok) {
        set({ error: res.error || NETWORK_MESSAGE });
        return null;
      }
      await get().load();
      return res.data.id as string;
    },
    updateBoard: async (id, updates) => {
      set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, ...updates } : b)) }));
      const res = await request('PATCH', `board/${id}`, updates);
      if (!res.ok) await fail(res.error);
    },
    deleteBoard: async (id) => {
      if (!window.confirm('Delete this board and everything on it? This cannot be undone.')) return false;
      const res = await request('DELETE', `board/${id}`);
      if (!res.ok) {
        set({ error: res.error || NETWORK_MESSAGE });
        return false;
      }
      set((s) => ({
        boards: s.boards.filter((b) => b.id !== id),
        columns: s.columns.filter((c) => c.boardId !== id),
        cards: s.cards.filter((c) => c.boardId !== id),
      }));
      return true;
    },
    toggleStar: async (id) => {
      set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, starred: !b.starred } : b)) }));
      const res = await request('POST', `board/${id}/star`);
      if (!res.ok) await fail(res.error);
    },

    requestJoinBoard: async (code) => {
      const res = await request('POST', 'board/join', { code });
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    approveJoinRequest: async (boardId, email) => {
      const res = await request('POST', `board/${boardId}/approve`, { email });
      await get().load();
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    rejectJoinRequest: async (boardId, email) => {
      const res = await request('POST', `board/${boardId}/reject`, { email });
      await get().load();
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    removeMember: async (boardId, email) => {
      const res = await request('POST', `board/${boardId}/remove-member`, { email });
      await get().load();
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    addMemberDirectly: async (boardId, email) => {
      const res = await request('POST', `board/${boardId}/add-member`, { email });
      await get().load();
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    leaveBoard: async (boardId) => {
      const res = await request('POST', `board/${boardId}/leave`);
      if (!res.ok) {
        set({ error: res.error || NETWORK_MESSAGE });
        return false;
      }
      await get().load();
      return true;
    },

    // ── Columns ─────────────────────────────────────────────
    addColumn: async (boardId, title) => {
      const res = await request('POST', `board/${boardId}/columns`, { title });
      if (!res.ok) return fail(res.error);
      set((s) => ({ columns: [...s.columns, toColumn(res.data)] }));
    },
    updateColumn: async (id, title) => {
      set((s) => ({ columns: s.columns.map((c) => (c.id === id ? { ...c, title } : c)) }));
      const res = await request('PATCH', `column/${id}`, { title });
      if (!res.ok) await fail(res.error);
    },
    deleteColumn: async (id) => {
      set((s) => ({ columns: s.columns.filter((c) => c.id !== id), cards: s.cards.filter((c) => c.columnId !== id) }));
      const res = await request('DELETE', `column/${id}`);
      if (!res.ok) await fail(res.error);
    },
    reorderColumns: async (boardId, sourceIdx, destIdx) => {
      const ordered = get().columns.filter((c) => c.boardId === boardId).sort(bySequence);
      const [moved] = ordered.splice(sourceIdx, 1);
      if (!moved) return;
      ordered.splice(destIdx, 0, moved);
      const sequence = new Map(ordered.map((c, i) => [c.id, i]));
      set((s) => ({ columns: s.columns.map((c) => (sequence.has(c.id) ? { ...c, sequence: sequence.get(c.id)! } : c)) }));
      const res = await request('POST', `board/${boardId}/columns/reorder`, { ids: ordered.map((c) => Number(c.id)) });
      if (!res.ok) await fail(res.error);
    },

    // ── Cards ───────────────────────────────────────────────
    addCard: async (columnId, _boardId, title) => {
      const res = await request('POST', `column/${columnId}/cards`, { title });
      if (!res.ok) return fail(res.error);
      set((s) => ({ cards: [...s.cards, toCard(res.data)] }));
    },
    updateCard: async (id, updates) => {
      patchCard(id, (c) => ({ ...c, ...updates }));
      const body: Record<string, unknown> = {};
      if ('title' in updates) body.title = updates.title;
      if ('description' in updates) body.description = updates.description;
      if ('labels' in updates) body.labels = updates.labels;
      if ('dueDate' in updates) body.due_date = updates.dueDate;
      if ('checklist' in updates) body.checklist = updates.checklist;
      const res = await request('PATCH', `card/${id}`, body);
      if (!res.ok) await fail(res.error);
    },
    deleteCard: async (id) => {
      set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
      const res = await request('DELETE', `card/${id}`);
      if (!res.ok) await fail(res.error);
    },
    moveCard: async (cardId, srcColId, destColId, srcIdx, destIdx) => {
      const all = get().cards;
      const src = all.filter((c) => c.columnId === srcColId).sort(bySequence);
      const [moved] = src.splice(srcIdx, 1);
      if (!moved) return;
      const dest = srcColId === destColId ? src : all.filter((c) => c.columnId === destColId).sort(bySequence);
      dest.splice(destIdx, 0, { ...moved, columnId: destColId });
      const placed = new Map<string, TrelloCard>();
      [...src, ...dest].forEach((c, i, list) => {
        const siblings = list.filter((x) => x.columnId === c.columnId);
        placed.set(c.id, { ...c, sequence: siblings.indexOf(c) });
      });
      set((s) => ({ cards: s.cards.map((c) => placed.get(c.id) || c) }));
      const res = await request('POST', `card/${cardId}/move`, { column_id: Number(destColId), index: destIdx });
      if (!res.ok) await fail(res.error);
    },

    // ── Checklists (stored on the card) ─────────────────────
    addChecklistItem: async (cardId, text) => {
      const card = get().cards.find((c) => c.id === cardId);
      if (card) await get().updateCard(cardId, { checklist: [...card.checklist, { id: uid(), text, completed: false }] });
    },
    toggleChecklistItem: async (cardId, itemId) => {
      const card = get().cards.find((c) => c.id === cardId);
      if (card) {
        await get().updateCard(cardId, {
          checklist: card.checklist.map((i) => (i.id === itemId ? { ...i, completed: !i.completed } : i)),
        });
      }
    },
    deleteChecklistItem: async (cardId, itemId) => {
      const card = get().cards.find((c) => c.id === cardId);
      if (card) await get().updateCard(cardId, { checklist: card.checklist.filter((i) => i.id !== itemId) });
    },
  };
});
