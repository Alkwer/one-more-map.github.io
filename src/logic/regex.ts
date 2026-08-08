// In-game Chart search contract and repeatable client-validation matrix:
// docs/in-game-search.md. Chart-instance expressions use fields present in
// sanitized English/Korean Ctrl+C fixtures. Best-mod expressions use canonical
// English text; the UI labels live assumptions and blocks them for Korean.

import { VOYAGE_MODS, voyageModById } from '../data/mods'
import { voyageRewardKey } from './rewards'
import type { ChartData, Stat, VoyageModDef, Weights } from '../types'

const HANGUL_RE = /[\uac00-\ud7a3]/
const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g

export const MAX_CHART_SEARCH_LENGTH = 250

export type SearchClientLanguage = 'en' | 'ko'

export type ChartSearchResult = { ok: true; regex: string } | { ok: false; message: string }

export type BestModRegexResult =
  | { ok: true; regex: string; included: VoyageModDef[] }
  | { ok: false; regex: ''; included: []; message: string }

const escapeRegexLiteral = (value: string): string => value.replace(REGEX_META_RE, '\\$&')

function chartImplicitText(chart: ChartData): string {
  return (
    chart.implicitText ??
    chart.modIds.map((id) => voyageModById.get(id)).find((mod) => mod && mod.scope !== 'self')
      ?.text ??
    ''
  )
}

function chartUsesHangul(chart: ChartData): boolean {
  return HANGUL_RE.test([chart.implicitText, chart.rawText, chart.name].filter(Boolean).join('\n'))
}

export function detectSearchClientLanguage(charts: ChartData[]): SearchClientLanguage {
  return charts.some(chartUsesHangul) ? 'ko' : 'en'
}

/**
 * Build the search text used to find one exact chart in the in-game inventory.
 * Imported Korean charts keep Hangul in their verbatim item-derived fields, so
 * the level term can follow the client language without a separate UI locale.
 */
export function buildSingleChartSearch(
  chart: ChartData,
  cap = MAX_CHART_SEARCH_LENGTH,
): ChartSearchResult {
  const implicit = chartImplicitText(chart)
  const level = `${chartUsesHangul(chart) ? '지역 레벨' : 'Level'} ${chart.level}`
  const regex = [chart.name, implicit, level].filter(Boolean).map(escapeRegexLiteral).join(' ')
  const safeCap = Math.max(0, Math.floor(cap))
  return regex.length <= safeCap
    ? { ok: true, regex }
    : {
        ok: false,
        message: `Exact chart search exceeds the ${safeCap}-character in-game limit. Shorten the chart name or implicit text before copying.`,
      }
}

/**
 * Build a paste-into-game regex that highlights the BEST charts given the
 * user's reward weights - no import needed. Mods are ranked by weighted value
 * times scope reach (a global mod touches 9 areas, adjacent ~3, self 1), then
 * greedily added as shortest-unique text fragments until the length cap.
 * Fragments use letters/spaces only so rolled numeric values don't break them.
 */
export function buildBestModRegex(
  weights: Weights,
  cap = MAX_CHART_SEARCH_LENGTH,
  disabledMods?: Set<string>,
  language: SearchClientLanguage = 'en',
): BestModRegexResult {
  if (language === 'ko') {
    return {
      ok: false,
      regex: '',
      included: [],
      message:
        'Best-Charts Regex is unavailable for Korean clients until its modifier fragments are live-validated.',
    }
  }

  const safeCap = Math.max(0, Math.floor(cap))
  const reach = { self: 1, adjacent: 3, global: 9 } as const
  const lettersOnly = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  // group tier variants into families (identical text once numbers are stripped);
  // a family's value is its best tier's value
  const families = new Map<string, { m: VoyageModDef; v: number }>()
  for (const m of VOYAGE_MODS) {
    if (disabledMods?.has(m.id)) continue
    const w = weights[voyageRewardKey(m)] ?? 0
    const v = m.effects.reduce((s, e) => s + w * e.percent, 0) * reach[m.scope]
    if (v <= 0) continue
    const key = lettersOnly(m.text)
    const existing = families.get(key)
    if (!existing || v > existing.v) families.set(key, { m, v })
  }
  const scored = [...families.entries()]
    .map(([key, { m, v }]) => ({ key, m, v }))
    .sort((a, b) => b.v - a.v)

  const token = (key: string, otherKeys: string[]): string => {
    for (let len = 3; len <= key.length; len++) {
      for (let i = 0; i + len <= key.length; i++) {
        const sub = key.slice(i, i + len)
        if (sub !== sub.trim()) continue
        if (!otherKeys.some((t) => t.includes(sub))) return sub
      }
    }
    return key
  }

  const included: VoyageModDef[] = []
  const tokens: string[] = []
  for (const { key, m } of scored) {
    const otherKeys = [...families.keys()].filter((k) => k !== key)
    const t = token(key, otherKeys)
    const candidate = [...tokens, t].join('|')
    if (candidate.length > safeCap) {
      if (tokens.length === 0) continue // skip an oversized top family, try the next
      break
    }
    tokens.push(t)
    included.push(m)
  }
  return { ok: true, regex: tokens.join('|'), included }
}

const ENGLISH_REWARD_LABELS: Partial<Record<Stat, string>> = {
  quantity: 'Item Quantity',
  rarity: 'Item Rarity',
  sulphur: "Dead Man's Sulphur",
  packsize: 'Pack Size',
  scarabs: 'Scarabs Found',
  currency: 'Currency Found',
}

const KOREAN_REWARD_LABELS: Partial<Record<Stat, string>> = {
  quantity: '아이템 수량',
  rarity: '아이템 희귀도',
  sulphur: '망자의 유황',
  packsize: '몬스터 무리 규모',
}

function chartSearchFields(chart: ChartData): string[] {
  const usesHangul = chartUsesHangul(chart)
  const fields = [
    chart.name,
    chartImplicitText(chart),
    `${usesHangul ? '지역 레벨' : 'Area Level'}: ${chart.level}`,
    ...(chart.implicitText ? [] : chart.modIds.map((id) => voyageModById.get(id)?.text ?? '')),
    ...(chart.rawText?.split(/\r?\n/) ?? []),
  ]
  const rewardLabels = usesHangul ? KOREAN_REWARD_LABELS : ENGLISH_REWARD_LABELS
  for (const reward of chart.rewards ?? []) {
    const label = rewardLabels[reward.stat]
    if (label) fields.push(`${label}: +${reward.percent}%`)
  }
  return [...new Set(fields.map((field) => field.normalize('NFKC').toLowerCase().trim()))].filter(
    Boolean,
  )
}

interface SearchCandidate {
  coverage: number
  regex: string
}

interface SearchPlan {
  length: number
  parts: string[]
}

function betterPlan(candidate: SearchPlan, current: SearchPlan | undefined): boolean {
  if (!current) return true
  if (candidate.length !== current.length) return candidate.length < current.length
  if (candidate.parts.length !== current.parts.length)
    return candidate.parts.length < current.parts.length
  return candidate.parts.join('|').localeCompare(current.parts.join('|')) < 0
}

/**
 * Build an exact paste-into-game regex for the placed chart instances. Only
 * fields visible to the game search are considered; opaque application ids
 * are deliberately excluded. If an unplaced chart has the same searchable
 * identity, exact selection is impossible and the caller gets a clear error.
 */
export function buildChartSearch(
  targets: ChartData[],
  otherPoolCharts: ChartData[],
  cap = MAX_CHART_SEARCH_LENGTH,
): ChartSearchResult {
  if (targets.length === 0) {
    return { ok: false, message: 'No placed charts are available to search.' }
  }

  const safeCap = Math.max(0, Math.floor(cap))
  const targetFields = targets.map(chartSearchFields)
  const otherFields = otherPoolCharts.map(chartSearchFields)
  const bestCandidateByCoverage = new Map<number, string>()

  const recordCandidate = (literal: string) => {
    if (literal !== literal.trim() || !/[\p{L}\p{N}]/u.test(literal)) return
    if (otherFields.some((document) => document.some((part) => part.includes(literal)))) return
    const regex = escapeRegexLiteral(literal)
    let coverage = 0
    for (let index = 0; index < targetFields.length; index += 1) {
      if (targetFields[index].some((part) => part.includes(literal))) {
        coverage |= 1 << index
      }
    }
    const existing = bestCandidateByCoverage.get(coverage)
    if (
      !existing ||
      regex.length < existing.length ||
      (regex.length === existing.length && regex.localeCompare(existing) < 0)
    ) {
      bestCandidateByCoverage.set(coverage, regex)
    }
  }

  for (const fields of targetFields) {
    for (const field of fields) {
      const maxLength = Math.min(field.length, safeCap)
      for (let length = 3; length <= maxLength; length += 1) {
        for (let start = 0; start + length <= field.length; start += 1) {
          recordCandidate(field.slice(start, start + length))
        }
      }
      // A unique full field proves the chart is distinguishable even when no
      // expression for it can fit the cap. This keeps the two error cases honest.
      recordCandidate(field)
    }
  }

  const candidates: SearchCandidate[] = [...bestCandidateByCoverage].map(([coverage, regex]) => ({
    coverage,
    regex,
  }))
  const fullCoverage = (1 << targets.length) - 1
  const plans: Array<SearchPlan | undefined> = Array.from({ length: fullCoverage + 1 })
  plans[0] = { length: 0, parts: [] }

  for (let covered = 0; covered <= fullCoverage; covered += 1) {
    const plan = plans[covered]
    if (!plan) continue
    for (const candidate of candidates) {
      const nextCoverage = covered | candidate.coverage
      if (nextCoverage === covered) continue
      const next: SearchPlan = {
        length: plan.length + (plan.parts.length === 0 ? 0 : 1) + candidate.regex.length,
        parts: [...plan.parts, candidate.regex],
      }
      if (betterPlan(next, plans[nextCoverage])) plans[nextCoverage] = next
    }
  }

  const best = plans[fullCoverage]
  if (!best) {
    return {
      ok: false,
      message:
        "Can't build an exact search: a placed chart is indistinguishable from an unplaced chart by its searchable name, level, modifiers, and rolls.",
    }
  }
  if (best.length > safeCap) {
    return {
      ok: false,
      message: `Exact search exceeds the ${safeCap}-character in-game limit.`,
    }
  }
  return { ok: true, regex: best.parts.join('|') }
}
