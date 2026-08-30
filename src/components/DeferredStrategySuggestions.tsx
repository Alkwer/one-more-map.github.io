import { t } from '../i18n/locale'
import { lazy, Suspense } from 'react'
import type { StrategySuggestionResult } from '../logic/strategySuggestions'

interface Props {
  result: StrategySuggestionResult
  loading?: boolean
  error?: string | null
  activeId: string | null
  onSelect: (id: string) => void
}

const StrategySuggestions = lazy(() =>
  import('./StrategySuggestions').then(({ StrategySuggestions }) => ({
    default: StrategySuggestions,
  })),
)

function Placeholder({ loading = false }: { loading?: boolean }) {
  return (
    <section className="strategy-suggestions" aria-labelledby="strategy-suggestions-title">
      <div className="suggestion-heading">
        <div>
          <h3 className="panel-title" id="strategy-suggestions-title">
            {t('Strategy compatibility')}
          </h3>
        </div>
      </div>
      <div className="suggestion-empty" aria-live="polite">
        {loading
          ? t('Loading strategy compatibility…')
          : t('Import charts or enter border modifiers to get a strategy recommendation.')}
      </div>
    </section>
  )
}

export function DeferredStrategySuggestions(props: Props) {
  if (!props.result.hasEvidence) return <Placeholder />

  return (
    <Suspense fallback={<Placeholder loading />}>
      <StrategySuggestions {...props} />
    </Suspense>
  )
}
