export interface UnresolvedBorderSourceRecord {
  /** Raw `Mods.dat` identifier from the referenced client-data snapshot. */
  rawId: string
  /** Datamined stat and value; this is not necessarily the live tooltip. */
  dataminedStat: string
  /** Public translation when one exists for this exact raw record. */
  publicTranslation: string | null
  /**
   * Existing canonical entry with the same public tooltip.
   * This documents a collision, not a confirmed gameplay-equivalent mapping.
   */
  duplicateCanonicalId: string | null
  /** What the public translation table establishes without claiming live behavior. */
  translationStatus: 'missing-for-stat-value' | 'canonical-tooltip-collision'
  /** Resolution stays blocked until the requested live evidence exists. */
  liveStatus: 'unverified'
  verificationNeeded: string
}

export interface BorderSourceSnapshot {
  clientPatch: string
  /** Commit of the generated `repoe-fork.github.io` export inspected below. */
  repoeExportCommit: string
  reviewedAt: string
  rawRecordCount: number
  canonicalTooltipCount: number
  unresolvedRecords: readonly UnresolvedBorderSourceRecord[]
}

/**
 * Raw records that must not become separately scored OCR definitions until a
 * live tooltip and gameplay semantics distinguish or collapse them.
 */
export const BORDER_SOURCE_SNAPSHOT = {
  clientPatch: '3.29.3.1.2',
  repoeExportCommit: 'af4ccc5e3e011da671553a40d851b1140902ef19',
  reviewedAt: '2026-08-14',
  rawRecordCount: 66,
  canonicalTooltipCount: 64,
  unresolvedRecords: [
    {
      rawId: 'DeepwaterBorderMagicMonsterMods2',
      dataminedStat: 'map_magic_monster_num_additional_modifiers = 2',
      publicTranslation: null,
      duplicateCanonicalId: null,
      translationStatus: 'missing-for-stat-value',
      liveStatus: 'unverified',
      verificationNeeded:
        'Capture a live occurrence or establish that the raw record is non-rollable or blank.',
    },
    {
      rawId: 'DeepwaterBorderTreasureAnchorsHardMode',
      dataminedStat: 'chart_contains_x_additional_treasure_anchors_hard_mode = 2',
      publicTranslation: 'Adjacent Areas contain 2 additional Treasure Anchors',
      duplicateCanonicalId: 'b-anchor-1',
      translationStatus: 'canonical-tooltip-collision',
      liveStatus: 'unverified',
      verificationNeeded:
        'Confirm whether the live tooltip or gameplay semantics differ from the normal +2 Treasure Anchors record.',
    },
  ],
} as const satisfies BorderSourceSnapshot
