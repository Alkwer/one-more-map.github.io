import type { AppState } from '../state/appState'

export interface VoyageFinishSnapshot {
  boardUids: (string | null)[]
  researchSequenceId: string
}

export type VoyageResearchFinishResult =
  { ok: true; summary: string } | { ok: false; message: string }

export type VoyageFinishSnapshotValidation =
  { ok: true } | { ok: false; reason: 'board-changed' | 'research-sequence-changed' }

const boardUids = (state: AppState): (string | null)[] =>
  state.board.map((placement) => placement?.chartUid ?? null)

export function createVoyageFinishSnapshot(
  state: AppState,
  researchSequenceId: string,
): VoyageFinishSnapshot {
  return { boardUids: boardUids(state), researchSequenceId }
}

export function validateVoyageFinishSnapshot(
  state: AppState,
  researchSequenceId: string,
  snapshot: VoyageFinishSnapshot,
): VoyageFinishSnapshotValidation {
  const currentBoard = boardUids(state)
  if (
    currentBoard.length !== snapshot.boardUids.length ||
    currentBoard.some((uid, index) => uid !== snapshot.boardUids[index])
  ) {
    return { ok: false, reason: 'board-changed' }
  }
  if (researchSequenceId !== snapshot.researchSequenceId) {
    return { ok: false, reason: 'research-sequence-changed' }
  }
  return { ok: true }
}
