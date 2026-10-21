// Undo/redo over immutable snapshots. Unchanged parts are shared between
// snapshots, so keeping 100 of them is cheap.

export const HISTORY_LIMIT = 100;

export interface HistoryEntry<T> {
  state: T;
  /** The edit that moved away from this state, e.g. "Cut clip". */
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  present: T;
  future: HistoryEntry<T>[];
  /** Edits with the same key in a row (one slider drag) merge into one undo step. */
  coalesceKey: string | null;
}

export type HistoryAction<T> =
  | { type: 'apply'; op: (state: T) => T; label: string; coalesceKey?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Ends the current coalescing run, e.g. on pointer up. */
  | { type: 'seal' }
  | { type: 'reset'; state: T };

export function createHistory<T>(state: T): History<T> {
  return { past: [], present: state, future: [], coalesceKey: null };
}

export function historyReducer<T>(history: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case 'apply': {
      const next = action.op(history.present);
      if (next === history.present) return history;
      const key = action.coalesceKey ?? null;
      if (key !== null && key === history.coalesceKey && history.past.length) {
        return { ...history, present: next, future: [] };
      }
      const past = [...history.past, { state: history.present, label: action.label }].slice(-HISTORY_LIMIT);
      return { past, present: next, future: [], coalesceKey: key };
    }
    case 'undo': {
      const entry = history.past[history.past.length - 1];
      if (!entry) return history;
      return {
        past: history.past.slice(0, -1),
        present: entry.state,
        future: [{ state: history.present, label: entry.label }, ...history.future],
        coalesceKey: null,
      };
    }
    case 'redo': {
      const [entry, ...future] = history.future;
      if (!entry) return history;
      return { past: [...history.past, { state: history.present, label: entry.label }], present: entry.state, future, coalesceKey: null };
    }
    case 'seal':
      return history.coalesceKey === null ? history : { ...history, coalesceKey: null };
    case 'reset':
      return createHistory(action.state);
  }
}

export const undoLabel = <T>(history: History<T>) => history.past[history.past.length - 1]?.label ?? null;
export const redoLabel = <T>(history: History<T>) => history.future[0]?.label ?? null;
