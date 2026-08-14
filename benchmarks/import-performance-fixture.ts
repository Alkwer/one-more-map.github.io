import { readFileSync } from 'node:fs'
import {
  MAX_IMPORT_CHART_HEADERS,
  MAX_IMPORT_LINE_LENGTH,
  MAX_IMPORT_TEXT_LENGTH,
} from '../src/logic/importBudget'

const chartFixture = readFileSync(
  new URL('../src/logic/__fixtures__/charted.en.txt', import.meta.url),
  'utf8',
).trim()

/** Build 300 valid, ordered charts occupying the exact supported 512 KiB input boundary. */
export function makeMaximumChartImportSource(): string {
  const charts = Array.from({ length: MAX_IMPORT_CHART_HEADERS }, (_, index) =>
    chartFixture.replace(
      'Armoured Coral Reef Chart of Ice',
      `Maximum Import Chart ${String(index + 1).padStart(3, '0')}`,
    ),
  )
  const separatorCharacters = charts.length - 1
  const baselineLength = charts.reduce((total, chart) => total + chart.length, separatorCharacters)
  const paddingSeparators = charts.length
  const paddingCharacters = MAX_IMPORT_TEXT_LENGTH - baselineLength - paddingSeparators

  if (paddingCharacters < 0) throw new Error('Maximum import fixture baseline exceeds its budget')
  const paddingPerChart = Math.floor(paddingCharacters / charts.length)
  const paddingRemainder = paddingCharacters % charts.length
  if (paddingPerChart + Number(paddingRemainder > 0) > MAX_IMPORT_LINE_LENGTH) {
    throw new Error('Maximum import fixture needs an overlong padding line')
  }

  const source = charts
    .map(
      (chart, index) =>
        `${chart}\n${'x'.repeat(paddingPerChart + Number(index < paddingRemainder))}`,
    )
    .join('\n')
  if (source.length !== MAX_IMPORT_TEXT_LENGTH) {
    throw new Error(`Maximum import fixture has unexpected length ${source.length}`)
  }
  return source
}
