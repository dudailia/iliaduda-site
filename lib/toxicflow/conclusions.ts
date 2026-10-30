/**
 * Which of the sentences fixed in advance the test run reached. Each is a template whose X, L, U and MDE stand for the
 * run's numbers; the run fills in one of them as keys.h1_statement (and, if the canary failed, keys.canary_statement),
 * and the card whose template that sentence fits is the one that opens. Nothing is matched while the keys are null.
 */

export interface ConclusionRow {
  readonly key: string
  readonly outcome: string
  readonly statement: string
}

const NUMBER = '[−+-]?\\d+(?:[.,]\\d+)*'

/** A template as a pattern for the sentences it can become. */
export function template(statement: string): RegExp {
  const esc = statement.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc.replace(/\b(?:MDE|X|L|U)\b/g, NUMBER)}$`)
}

/** The row each of the run's sentences fits, H1's and the canaries': both null before the run. */
export function reached(rows: readonly ConclusionRow[], keys: Readonly<Record<string, unknown>>): { h1: string | null; canary: string | null } {
  const fit = (said: unknown) =>
    typeof said === 'string' && said.trim() !== '' ? (rows.find((r) => template(r.statement).test(said.trim()))?.key ?? null) : null
  return { h1: fit(keys.h1_statement), canary: fit(keys.canary_statement) }
}
