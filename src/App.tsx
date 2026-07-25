import { useEffect, useMemo, useRef, useState } from 'react'
import { BoardView } from './components/Board'
import { ModBrowser } from './components/ModBrowser'
import { Onboarding } from './components/Onboarding'
import { TooltipLayer } from './components/Tooltip'
import { generateDemoCharts } from './logic/demo'
import { buildChartSearch } from './logic/regex'
import { ImportPanel } from './components/ImportPanel'
import { Library } from './components/Library'
import { SolverPanel } from './components/SolverPanel'
import { borderModById, voyageModById } from './data/mods'
import { scoreBoard } from './logic/scoring'
import { checkConnectivity } from './logic/connectivity'
import type { SolverResult } from './logic/solver'
import { decodeShare, defaultState, encodeShare, loadLocal, saveLocal, type AppState } from './logic/storage'
import type { ChartData } from './types'
import { ALL_STATS, STAT_LABELS, borderTouches, emptyBoard } from './types'

/** discrete/guaranteed effects (drops, spawns, conversions) rather than plain % scalars */
const isNotable = (text: string) => !/^\d+% (increased|more|reduced) /i.test(text)

function initialState(): AppState {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.length > 20) {
    const shared = decodeShare(hash)
    if (shared) return shared
  }
  return loadLocal() ?? defaultState()
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState)
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('onboarding-seen')
    } catch {
      return false
    }
  })
  const closeOnboarding = () => {
    setShowOnboarding(false)
    try {
      localStorage.setItem('onboarding-seen', '1')
    } catch {
      /* ignore */
    }
  }
  const [showMods, setShowMods] = useState(false)
  const [voyageMsg, setVoyageMsg] = useState('')
  const [preserveConfirm, setPreserveConfirm] = useState<{
    charts: ChartData[]
    index: number
    kept: string[]
  } | null>(null)
  // guided "copy into game": walk the board in the in-game Ctrl+click fill order
  // (bottom-left, then right, then up a row): board cells 6,7,8, 3,4,5, 0,1,2
  const [copySeq, setCopySeq] = useState<{ order: number[]; step: number } | null>(null)
  const [harvestTheme, setHarvestTheme] = useState(() =>
    document.body.classList.contains('theme-harvest'),
  )
  const toggleTheme = () => {
    const next = !harvestTheme
    setHarvestTheme(next)
    document.body.classList.toggle('theme-harvest', next)
    try {
      localStorage.setItem('theme', next ? 'harvest' : 'allflame')
    } catch {
      /* ignore */
    }
  }
  const [selectedChart, setSelectedChart] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [results, setResults] = useState<SolverResult[]>([])
  const [shareMsg, setShareMsg] = useState('')
  const saveTimer = useRef<number>()

  // debounced autosave
  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveLocal(state), 300)
  }, [state])

  const chartMap = useMemo(() => new Map(state.pool.map((c) => [c.uid, c])), [state.pool])
  const disabledSet = useMemo(() => new Set(state.disabledMods), [state.disabledMods])
  const score = useMemo(
    () =>
      scoreBoard(state.board, state.borders, chartMap, state.weights, {
        adjacencyMode: state.adjacencyMode,
        adjacentAffectsSelf: state.adjacentAffectsSelf,
        disabledMods: disabledSet,
      }),
    [
      state.board,
      state.borders,
      chartMap,
      state.weights,
      state.adjacencyMode,
      state.adjacentAffectsSelf,
      disabledSet,
    ],
  )
  const conn = useMemo(
    () => checkConnectivity(state.board, chartMap, state.mode),
    [state.board, chartMap, state.mode],
  )

  // guaranteed/notable effects active on this board, with counts
  const notables = useMemo(() => {
    const counts = new Map<string, { label: string; full: string; count: number }>()
    const add = (key: string, label: string, full: string) => {
      const cur = counts.get(key)
      if (cur) cur.count++
      else counts.set(key, { label, full, count: 1 })
    }
    state.borders.forEach((id, seg) => {
      if (!id || !state.board[borderTouches(seg)]) return
      const mod = borderModById.get(id)
      if (mod && isNotable(mod.text)) add(mod.id, mod.short ?? mod.text, mod.text)
    })
    state.board.forEach((p) => {
      if (!p) return
      const chart = chartMap.get(p.chartUid)
      if (!chart) return
      for (const modId of chart.modIds) {
        const mod = voyageModById.get(modId)
        if (mod && isNotable(mod.text)) add(mod.id, mod.text, mod.text)
      }
    })
    return [...counts.values()]
  }, [state.borders, state.board, chartMap])

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }))

  const toggleMod = (id: string, off: boolean) =>
    setState((s) => {
      const set = new Set(s.disabledMods)
      if (off) set.add(id)
      else set.delete(id)
      return { ...s, disabledMods: [...set] }
    })
  const bulkMods = (ids: string[], off: boolean) =>
    setState((s) => {
      const set = new Set(s.disabledMods)
      for (const id of ids) (off ? set.add(id) : set.delete(id))
      return { ...s, disabledMods: [...set] }
    })

  const addCharts = (charts: ChartData[]) =>
    setState((s) => ({ ...s, pool: [...s.pool, ...charts] }))

  const removeChart = (uid: string) =>
    setState((s) => ({
      ...s,
      pool: s.pool.filter((c) => c.uid !== uid),
      board: s.board.map((p) => (p?.chartUid === uid ? null : p)),
    }))

  const updateChart = (chart: ChartData) =>
    setState((s) => ({ ...s, pool: s.pool.map((c) => (c.uid === chart.uid ? chart : c)) }))

  const togglePreserve = (uid: string) =>
    setState((s) => ({
      ...s,
      pool: s.pool.map((c) => (c.uid === uid ? { ...c, preserved: !c.preserved } : c)),
    }))

  // apply the voyage result: keep charts whose uid is in keptUids, consume the
  // rest of the board; charts not on the board are untouched.
  const commitFinish = (keptUids: Set<string>) => {
    setState((s) => {
      const onBoard = new Set(s.board.filter(Boolean).map((p) => p!.chartUid))
      let consumed = 0
      let kept = 0
      const pool = s.pool.filter((c) => {
        if (!onBoard.has(c.uid)) return true // not run this voyage
        if (keptUids.has(c.uid)) {
          kept++
          return true
        }
        consumed++
        return false
      })
      setVoyageMsg(
        `Voyage finished: consumed ${consumed} chart${consumed === 1 ? '' : 's'}` +
          (kept ? `, kept ${kept}` : ''),
      )
      window.setTimeout(() => setVoyageMsg(''), 4000)
      return {
        ...s,
        pool: pool.map((c) => (keptUids.has(c.uid) ? { ...c, preserved: false } : c)),
        board: emptyBoard(),
      }
    })
    setPreserveConfirm(null)
  }

  const finishVoyage = () => {
    const preserved = state.board
      .filter(Boolean)
      .map((p) => chartMap.get(p!.chartUid))
      .filter((c): c is ChartData => !!c && !!c.preserved)
    // no charts marked to keep -> consume everything on the board outright
    if (preserved.length === 0) commitFinish(new Set())
    else setPreserveConfirm({ charts: preserved, index: 0, kept: [] })
  }

  const FILL_ORDER = [6, 7, 8, 3, 4, 5, 0, 1, 2]
  const chartImplicit = (chart: ChartData): string =>
    chart.modIds.map((id) => voyageModById.get(id)).find((m) => m && m.scope !== 'self')?.text ??
    chart.implicitText ??
    ''
  // a PoE stash-search string: name + implicit as quoted phrases (ANDed), so
  // pasting it into the in-game chart search filters to exactly this chart.
  const chartSearch = (chart: ChartData): string =>
    [chart.name, chartImplicit(chart)]
      .filter(Boolean)
      .map((s) => `"${s}"`)
      .join(' ')
  const copyChartDetails = (chart: ChartData) => {
    navigator.clipboard.writeText(chartSearch(chart)).catch(() => {})
  }
  const startCopySeq = () => {
    const order = FILL_ORDER.filter((i) => state.board[i])
    if (order.length) setCopySeq({ order, step: 0 })
  }
  // copy the current square's chart, then advance to the next fill position
  const copyCurrentAndAdvance = () => {
    if (!copySeq) return
    const chart = chartMap.get(state.board[copySeq.order[copySeq.step]]!.chartUid)
    if (chart) copyChartDetails(chart)
    if (copySeq.step + 1 >= copySeq.order.length) setCopySeq(null)
    else setCopySeq({ ...copySeq, step: copySeq.step + 1 })
  }

  // step through each preserved chart, one at a time, its board tile highlighted
  const decidePreserve = (survived: boolean) => {
    if (!preserveConfirm) return
    const { charts, index, kept } = preserveConfirm
    const nextKept = survived ? [...kept, charts[index].uid] : kept
    if (index + 1 >= charts.length) commitFinish(new Set(nextKept))
    else setPreserveConfirm({ charts, index: index + 1, kept: nextKept })
  }

  const onCellClick = (i: number) => {
    if (selectedChart) {
      // place the selected library chart (removing it from any other cell)
      setState((s) => {
        const board = s.board.map((p) => (p?.chartUid === selectedChart ? null : p))
        board[i] = { chartUid: selectedChart, rotation: 0 }
        return { ...s, board }
      })
      setSelectedChart(null)
      setSelectedCell(null)
      return
    }
    if (selectedCell === null) {
      if (state.board[i]) setSelectedCell(i)
      return
    }
    if (selectedCell === i) {
      setSelectedCell(null)
      return
    }
    // swap cells
    setState((s) => {
      const board = [...s.board]
      const t = board[selectedCell]
      board[selectedCell] = board[i]
      board[i] = t
      return { ...s, board }
    })
    setSelectedCell(null)
  }

  const [searchMsg, setSearchMsg] = useState('')
  const copySearch = async () => {
    const placed = state.board.filter(Boolean).map((p) => chartMap.get(p!.chartUid)?.name ?? '')
    const others = state.pool
      .filter((c) => !state.board.some((p) => p?.chartUid === c.uid))
      .map((c) => c.name)
    const str = buildChartSearch(placed.filter(Boolean), others)
    try {
      await navigator.clipboard.writeText(str)
      setSearchMsg('Copied!')
    } catch {
      setSearchMsg(str)
    }
    window.setTimeout(() => setSearchMsg(''), 2500)
  }

  const share = async () => {
    const url = `${location.origin}${location.pathname}#${encodeShare(state)}`
    try {
      await navigator.clipboard.writeText(url)
      setShareMsg('Link copied!')
    } catch {
      window.location.hash = encodeShare(state)
      setShareMsg('Link set in address bar')
    }
    window.setTimeout(() => setShareMsg(''), 2500)
  }

  return (
    <div className="app">
      <TooltipLayer />
      {showOnboarding && (
        <Onboarding
          onClose={closeOnboarding}
          onDemo={() => addCharts(generateDemoCharts(25))}
        />
      )}
      {showMods && (
        <ModBrowser
          disabled={disabledSet}
          onToggle={toggleMod}
          onBulk={bulkMods}
          onClose={() => setShowMods(false)}
        />
      )}
      <header>
        <h1>
          Allflame <span className="accent">Voyage Solver</span>
        </h1>
        <div className="header-right">
          <span className="tag">PoE 3.29: Curse of the Allflame</span>
          <button title="How it works" onClick={() => setShowOnboarding(true)}>
            ?
          </button>
          <button title="Browse all modifiers and switch off ones you don't want" onClick={() => setShowMods(true)}>
            Mods{state.disabledMods.length > 0 ? ` (${state.disabledMods.length} off)` : ''}
          </button>
          <button
            className="theme-link"
            title={
              harvestTheme
                ? 'Back to the Allflame theme'
                : 'Harvest Edition, like the old garden planner sheets'
            }
            onClick={toggleTheme}
          >
            {harvestTheme ? '🔥' : '🌱'}
          </button>
          <button onClick={share}>{shareMsg || 'Share layout'}</button>
        </div>
      </header>

      <main>
        <section className="col library-col">
          <Library
            pool={state.pool}
            board={state.board}
            weights={state.weights}
            disabledMods={disabledSet}
            selected={selectedChart}
            onSelect={(uid) => {
              setSelectedChart((cur) => (cur === uid ? null : uid))
              setSelectedCell(null)
            }}
            onAdd={addCharts}
            onRemove={removeChart}
            onUpdate={updateChart}
          />
          <ImportPanel onImport={addCharts} state={state} onLoadState={setState} />
        </section>

        <section className="col board-col">
          <BoardView
            board={state.board}
            borders={state.borders}
            charts={chartMap}
            perTile={score.perTile}
            selectedCell={selectedCell}
            highlightUid={
              copySeq
                ? (state.board[copySeq.order[copySeq.step]]?.chartUid ?? null)
                : preserveConfirm
                  ? preserveConfirm.charts[preserveConfirm.index].uid
                  : selectedChart && state.board.some((p) => p?.chartUid === selectedChart)
                    ? selectedChart
                    : null
            }
            strictMode={state.mode === 'strict'}
            placingChart={selectedChart ? chartMap.get(selectedChart) ?? null : null}
            onCellClick={onCellClick}
            onRemove={(i) =>
              setState((s) => {
                const board = [...s.board]
                board[i] = null
                return { ...s, board }
              })
            }
            onRotate={(i) =>
              setState((s) => {
                const board = [...s.board]
                const p = board[i]
                if (p) board[i] = { ...p, rotation: (p.rotation + 1) % 4 }
                return { ...s, board }
              })
            }
            onBorderChange={(seg, id) =>
              setState((s) => {
                const borders = [...s.borders]
                borders[seg] = id
                return { ...s, borders }
              })
            }
            onTogglePreserve={togglePreserve}
            onFinishVoyage={finishVoyage}
            onCopySequence={startCopySeq}
            voyageMsg={voyageMsg}
          />

          {copySeq && (
            <div className="preserve-confirm copyseq">
              <div className="pc-head">
                Place into game in this order (its square is glowing). Copy pastes an in-game search
                string; Ctrl+Left-click the chart it finds. They fill bottom-left first. Step{' '}
                {copySeq.step + 1} of {copySeq.order.length}.
              </div>
              {(() => {
                const c = chartMap.get(state.board[copySeq.order[copySeq.step]]!.chartUid)
                if (!c) return null
                return (
                  <>
                    <div className="pc-name">{c.name}</div>
                    <div className="pc-sub">
                      {chartImplicit(c)}
                      {c.shape ? ` · Shape: ${c.shape}` : ''}
                    </div>
                  </>
                )
              })()}
              <div className="pc-actions">
                <button className="pc-kept" onClick={copyCurrentAndAdvance}>
                  {copySeq.step + 1 >= copySeq.order.length
                    ? '📋 Copy last & finish'
                    : '📋 Copy & next'}
                </button>
                <button className="pc-lost" onClick={() => setCopySeq(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {preserveConfirm && (
            <div className="preserve-confirm">
              <div className="pc-head">
                Preserved chart {preserveConfirm.index + 1} of {preserveConfirm.charts.length} (its
                square is glowing). Did it actually survive the Voyage?
              </div>
              <div className="pc-name">{preserveConfirm.charts[preserveConfirm.index].name}</div>
              <div className="pc-actions">
                <button className="pc-kept" onClick={() => decidePreserve(true)}>
                  ✓ Kept it
                </button>
                <button className="pc-lost" onClick={() => decidePreserve(false)}>
                  ✕ Was consumed
                </button>
              </div>
            </div>
          )}

          <div className={`conn-status ${conn.valid ? 'ok' : 'bad'}`}>
            {state.mode === 'any'
              ? 'Connector rules ignored'
              : conn.valid
                ? '✓ Connector layout valid'
                : `✗ ${conn.violations} connector issue${conn.violations === 1 ? '' : 's'}`}
          </div>

          <div className="score-panel">
            <div className="score-total">
              Voyage Rewards <strong>{score.total.toFixed(1)}</strong>
              <span className="spacer" />
              <button
                onClick={copySearch}
                disabled={state.board.every((p) => !p)}
                title="Copy a search string for the in-game chart inventory that highlights exactly the charts on this board"
              >
                {searchMsg || '⌕ Copy in-game search'}
              </button>
            </div>
            <div className="muted small-note" style={{ marginTop: 0 }}>
              A relative score for comparing your layouts, based on your weights and estimated mod
              values. Not exact loot value. See the actual contents below.
            </div>
            <div className="reward-grid">
              {ALL_STATS.filter((s) => score.perStat[s] > 0)
                .sort((a, b) => score.perStat[b] - score.perStat[a])
                .map((s, i) => (
                  <div key={s} className={`reward-card ${i === 0 ? 'best' : ''}`}>
                    <div className="reward-value">+{Math.round(score.perStat[s] * 100)}%</div>
                    <div className="reward-label">{STAT_LABELS[s]}</div>
                  </div>
                ))}
              {ALL_STATS.every((s) => score.perStat[s] === 0) && (
                <div className="muted">Place charts to see bonuses</div>
              )}
            </div>
            {ALL_STATS.some((s) => score.perStat[s] > 0) && (
              <div className="muted small-note">Average bonus per area across the Voyage.</div>
            )}
            {notables.length > 0 && (
              <>
                <div className="panel-title small">Guaranteed & Notable</div>
                <div className="notable-list">
                  {notables.map((n) => (
                    <span key={n.label} className="notable-item" title={n.full}>
                      {n.label}
                      {n.count > 1 ? ` ×${n.count}` : ''}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="col solver-col">
          <SolverPanel
            state={state}
            onPatch={patch}
            results={results}
            onResults={setResults}
            onApply={(board) => {
              patch({ board: board.map((p) => (p ? { ...p } : null)) })
              setSelectedCell(null)
              setSelectedChart(null)
            }}
          />
        </section>
      </main>
    </div>
  )
}
