import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, GROUP_LABEL, GROUP_ORDER, REWARD_TYPES } from '../../logic/rewards'
import { RewardWeights } from './RewardWeights'

describe('reward weight accessibility', () => {
  it('associates every unique slider name with its scoring scope', () => {
    const html = renderToStaticMarkup(
      <RewardWeights weights={DEFAULT_WEIGHTS} overridden={false} onChange={() => undefined} />,
    )
    const groups = [...html.matchAll(/<fieldset class="weight-group">([\s\S]*?)<\/fieldset>/g)]
    const accessibleNames: string[] = []

    expect(groups).toHaveLength(GROUP_ORDER.length)
    for (const [index, group] of GROUP_ORDER.entries()) {
      const markup = groups[index][1]
      const scopeLabel = GROUP_LABEL[group]
      const expectedRows = REWARD_TYPES.filter((reward) => reward.group === group)
      const names = [...markup.matchAll(/aria-label="([^"]+ reward weight)"/g)].map(
        (match) => match[1],
      )

      expect(markup).toContain(`<legend class="weight-group-title">${scopeLabel}</legend>`)
      expect(names).toHaveLength(expectedRows.length)
      expect(names.every((name) => name.startsWith(`${scopeLabel} — `))).toBe(true)
      accessibleNames.push(...names)
    }

    expect(new Set(accessibleNames).size).toBe(accessibleNames.length)
  })
})
