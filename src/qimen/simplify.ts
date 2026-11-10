/**
 * Simplified-character display of Qi Men facts. The calculation keeps the reference
 * implementation's characters (陰遁, 離, 開 …) for parity; saved charts and model text use
 * simplified characters consistently with the other charts.
 */

const MAP: Readonly<Record<string, string>> = {
  陰: '阴',
  陽: '阳',
  離: '离',
  兌: '兑',
  開: '开',
  傷: '伤',
  驚: '惊',
  門: '门',
  輔: '辅',
  沖: '冲',
  時: '时',
}

/** Converts the traditional characters the reference emits to simplified ones. */
export function simplify(text: string): string {
  let out = ''
  for (const c of text) out += MAP[c] ?? c
  return out
}

/** Applies {@link simplify} to every string inside a JSON value; object keys included. */
export function simplifyDeep<T>(value: T): T {
  if (typeof value === 'string') return simplify(value) as T
  if (Array.isArray(value)) return value.map(simplifyDeep) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [simplify(k), simplifyDeep(v)]),
    ) as T
  }
  return value
}

/** A lookup table that answers both the reference and the simplified form of each key. */
export function withSimplifiedKeys<V>(table: Readonly<Record<string, V>>): Record<string, V> {
  const out: Record<string, V> = { ...table }
  for (const [k, v] of Object.entries(table)) out[simplify(k)] = v
  return out
}
