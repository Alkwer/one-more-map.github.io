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
import { ALL_STATS, STAT_LABELS, borderTouches } from './types'

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

  const addCharts = (charts: ChartData[]) => patch({ pool: [...state.pool, ...charts] })

  const removeChart = (uid: string) =>
    setState((s) => ({
      ...s,
      pool: s.pool.filter((c) => c.uid !== uid),
      board: s.board.map((p) => (p?.chartUid === uid ? null : p)),
    }))

  const updateChart = (chart: ChartData) =>
    setState((s) => ({ ...s, pool: s.pool.map((c) => (c.uid === chart.uid ? chart : c)) }))

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
              selectedChart && state.board.some((p) => p?.chartUid === selectedChart)
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
          />

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
