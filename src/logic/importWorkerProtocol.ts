import type { ImportParseResult } from './importParser'

export interface ImportWorkerRequest {
  type: 'parse-import'
  requestId: number
  source: string
  maxCharts: number
}

export type ImportWorkerResponse =
  | {
      type: 'parse-result'
      requestId: number
      result: ImportParseResult
    }
  | {
      type: 'error'
      requestId: number
      code: 'budget' | 'parse'
      message: string
    }
