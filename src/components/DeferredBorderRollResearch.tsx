import { formatNumber, t } from '../i18n/locale'
import { lazy, Suspense, useState } from 'react'
import type { BorderRollResearchController } from '../hooks/useBorderRollResearch'
import type { Borders } from '../types'
import type { ProtectedBorderRoll } from './BorderRollResearch'

interface Props {
  borders: Borders
  controller: BorderRollResearchController
  protectedRoll: ProtectedBorderRoll | null
}

const BorderRollResearch = lazy(() =>
  import('./BorderRollResearch').then(({ BorderRollResearch }) => ({
    default: BorderRollResearch,
  })),
)

function Summary({ controller }: Pick<Props, 'controller'>) {
  const archivedIds = new Set(controller.store.archivedSequenceIds)
  let activeSampleCount = 0
  let archivedSampleCount = 0
  for (const sample of controller.store.samples) {
    if (archivedIds.has(sample.sequenceId)) archivedSampleCount += 1
    else activeSampleCount += 1
  }

  return (
    <>
      {t('📊 Contribute border-roll data (')}
      {formatNumber(activeSampleCount)}
      {t(' active')}
      {archivedSampleCount > 0 ? t(' · {v0} archived', { v0: archivedSampleCount }) : ''})
    </>
  )
}

function LoadingResearch({ controller }: Pick<Props, 'controller'>) {
  return (
    <details className="ahk-help roll-research" open>
      <summary>
        <Summary controller={controller} />
      </summary>
      <p role="status" aria-live="polite" className="muted">
        {t('Loading border-roll research tools…')}
      </p>
    </details>
  )
}

export function DeferredBorderRollResearch(props: Props) {
  const [requested, setRequested] = useState(false)

  if (requested) {
    return (
      <Suspense fallback={<LoadingResearch controller={props.controller} />}>
        <BorderRollResearch {...props} defaultOpen />
      </Suspense>
    )
  }

  return (
    <details
      className="ahk-help roll-research"
      onToggle={(event) => {
        if (event.currentTarget.open) setRequested(true)
      }}
    >
      <summary>
        <Summary controller={props.controller} />
      </summary>
    </details>
  )
}
