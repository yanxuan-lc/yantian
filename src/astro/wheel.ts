/**
 * Geometry of the chart wheel, free of DOM code. Screen angles are degrees counter-clockwise
 * from 3 o'clock with the SVG y axis pointing down, so the ascendant sits at 9 o'clock and
 * the zodiac and the houses run counter-clockwise from it.
 */

/** Screen angle of an ecliptic `longitude` on a wheel whose ascendant is `ascendant`. */
export function wheelAngle(longitude: number, ascendant: number): number {
  return (((180 + longitude - ascendant) % 360) + 360) % 360
}

/** SVG point at radius `r` and screen `angle` (degrees) around the centre (`cx`, `cy`). */
export function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  const a = (angle * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) }
}

/**
 * Display longitudes for glyphs at `longitudes` so that neighbours are at least `minGap`
 * degrees apart: crowded runs are fanned out evenly around their mean, order is kept, and
 * isolated glyphs stay where they are. Each longitude in `obstacles` (such as the chart
 * axes) is a fixed obstacle that no glyph comes closer to than `clearance` degrees; a glyph
 * inside that zone moves to its nearer edge, and runs spread across it keep `minGap` on each
 * side. Returns values in [0, 360), indexed like the input; `minGap` × count must not exceed
 * the free arc, 360 less the obstacle zones.
 */
export function spread(
  longitudes: readonly number[],
  minGap: number,
  obstacles: readonly number[] = [],
  clearance = 0,
): number[] {
  const zones = obstacleZones(obstacles, clearance)
  if (zones.length === 0) return spreadOn(longitudes, minGap, 360)
  // Rotate so the first zone starts at 0, then collapse every zone to a point: spreading on
  // the shorter circle and expanding back keeps glyphs out of the zones.
  const origin = zones[0]!.start
  const local = zones.map((z) => ({ start: z.start - origin, end: z.end - origin }))
  const collapsed: number[] = []
  let removed = 0
  for (const z of local) {
    collapsed.push(z.start - removed)
    removed += z.end - z.start
  }
  const circumference = 360 - removed
  const toLocal = (l: number) => mod(l - origin, 360)
  const compress = (t: number) => {
    let cut = 0
    for (const z of local) {
      if (t < z.start) break
      if (t < z.end) return z.start - cut
      cut += z.end - z.start
    }
    return t - cut
  }
  const expand = (u: number, from: number) => {
    let k = local.length - 1
    while (k > 0 && u < collapsed[k]! - 1e-9) k--
    const z = local[k]!
    // A glyph left exactly on a collapsed zone goes to the edge nearer its own longitude.
    if (Math.abs(u - collapsed[k]!) < 1e-9 && from < (z.start + z.end) / 2) return z.start
    return z.end + (u - collapsed[k]!)
  }
  const local0 = longitudes.map(toLocal)
  const shown = spreadOn(local0.map(compress), minGap, circumference)
  return shown.map((u, i) => mod(expand(u, local0[i]!) + origin, 360))
}

const mod = (x: number, m: number) => ((x % m) + m) % m

/** Zones of half-width `clearance` around `obstacles`, merged and sorted, ends unwrapped. */
function obstacleZones(
  obstacles: readonly number[],
  clearance: number,
): { start: number; end: number }[] {
  if (clearance <= 0 || obstacles.length === 0) return []
  const sorted = obstacles
    .map((o) => ({ start: mod(o - clearance, 360), end: mod(o - clearance, 360) + 2 * clearance }))
    .sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const z of sorted) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && z.start <= prev.end) prev.end = Math.max(prev.end, z.end)
    else merged.push({ ...z })
  }
  // A last zone reaching past 360° overlaps the first one: fold it in.
  const last = merged[merged.length - 1]!
  const head = merged[0]!
  if (merged.length > 1 && last.end - 360 >= head.start) {
    head.start = last.start - 360
    head.end = Math.max(head.end, last.end - 360)
    merged.pop()
  }
  return merged
}

/** {@link spread} without obstacles on a circle `circumference` degrees long. */
function spreadOn(longitudes: readonly number[], minGap: number, circumference: number): number[] {
  const n = longitudes.length
  if (n < 2) return longitudes.map((l) => mod(l, circumference))
  const order = longitudes
    .map((l, i) => ({ l: mod(l, circumference), i }))
    .sort((a, b) => a.l - b.l || a.i - b.i)
  // Cut the circle after its widest gap so the remaining run is linear.
  let cut = 0
  let widest = -1
  for (let k = 0; k < n; k++) {
    const next = k + 1 < n ? order[k + 1]!.l : order[0]!.l + circumference
    if (next - order[k]!.l > widest) {
      widest = next - order[k]!.l
      cut = k + 1
    }
  }
  const run = [
    ...order.slice(cut),
    ...order.slice(0, cut).map((o) => ({ ...o, l: o.l + circumference })),
  ]

  // Merge neighbouring clusters until no two clusters overlap.
  type Cluster = { sum: number; members: { l: number; i: number }[] }
  const first = (c: Cluster) => c.sum / c.members.length - ((c.members.length - 1) / 2) * minGap
  const last = (c: Cluster) => first(c) + (c.members.length - 1) * minGap
  let clusters: Cluster[] = run.map((o) => ({ sum: o.l, members: [o] }))
  let merged = true
  while (merged) {
    merged = false
    const next: Cluster[] = []
    for (const c of clusters) {
      const prev = next[next.length - 1]
      if (prev !== undefined && last(prev) + minGap > first(c) + 1e-9) {
        prev.sum += c.sum
        prev.members.push(...c.members)
        merged = true
      } else next.push({ sum: c.sum, members: [...c.members] })
    }
    clusters = next
  }
  const out = new Array<number>(n)
  for (const c of clusters) {
    c.members.forEach((m, k) => {
      out[m.i] = mod(first(c) + k * minGap, circumference)
    })
  }
  return out
}

/** Centre and rim radius R of the wheel in its 400 × 400 SVG view box. */
export const WHEEL_VIEW = { centre: 200, radius: 196 } as const

/** Centre and rim radius of a wheel in SVG user units. */
export interface WheelView {
  readonly centre: number
  readonly radius: number
}

/**
 * Ring of one person's bodies. Radii and sizes are fractions of the rim radius R; the band
 * spans `inner`–`outer`. Each body gets an exact-degree tick from `outer` in to `tick`, a
 * leader from there to the glyph's outer edge, a glyph of side `glyphSize` centred at
 * `glyph`, and a degree label of height `labelSize` centred at `label`. Collision spreading
 * moves bodies along the band only, keeping neighbours `minGap` degrees apart.
 */
export interface BodyBand {
  readonly inner: number
  readonly outer: number
  readonly tick: number
  readonly glyph: number
  readonly glyphSize: number
  readonly label: number
  readonly labelSize: number
  readonly minGap: number
  /** Smallest angular distance, degrees, between a glyph or label and an AC/DC/MC/IC axis. */
  readonly axisClearance: number
}

/**
 * Ring layout of a chart wheel, radii as fractions of the rim radius R. The zodiac band spans
 * `zodiac.inner`–`zodiac.outer` with sign glyphs of side `signGlyphSize` centred in it and
 * 1°/5°/10° ticks of length `ticks[n]` pointing inward from `zodiac.inner`. Body bands follow
 * from the outside in, divided by `separators` rings; house cusps run from `aspect` to
 * `zodiac.inner` with house numbers of height `houseNumberSize` at `houseNumber`; aspect
 * lines end on the `aspect` circle.
 */
export interface WheelLayout {
  readonly zodiac: { readonly inner: number; readonly outer: number }
  readonly signGlyphSize: number
  readonly ticks: { readonly 1: number; readonly 5: number; readonly 10: number }
  readonly bands: readonly BodyBand[]
  readonly separators: readonly number[]
  readonly houseNumber: number
  readonly houseNumberSize: number
  readonly aspect: number
}

/**
 * Layout tables, fractions of R:
 *
 * | ring                      | natal (and composite) | bi-wheel                   |
 * | ------------------------- | --------------------- | -------------------------- |
 * | zodiac band               | 0.90–1.00             | 0.90–1.00                  |
 * | sign glyph size           | 0.075                 | 0.075                      |
 * | ticks 1°/5°/10°           | 0.015/0.025/0.04      | 0.015/0.025/0.04           |
 * | outer body band           | 0.62–0.90             | B 0.74–0.90                |
 * | exact-degree tick         | 0.90→0.86             | B 0.90→0.885, A 0.74→0.725 |
 * | glyph centre / size       | 0.78 / 0.09           | B 0.852, A 0.69 / 0.066    |
 * | degree label / height     | ≤0.69 / 0.034         | B ≤0.785, A ≤0.63 / 0.024  |
 * | min glyph gap, degrees    | 10                    | B 7.5, A 8.5               |
 * | axis clearance, degrees   | 6                     | B 4.5, A 5.5               |
 * | separator ring            | —                     | 0.74                       |
 * | inner body band           | —                     | A 0.58–0.74                |
 * | house numbers / height    | 0.595 / 0.034         | 0.565 / 0.028              |
 * | aspect circle             | 0.56                  | 0.55                       |
 *
 * Degree labels sit at their listed radius or further in, where their box would otherwise
 * touch the glyph (see {@link layoutLabel}). Axis clearance keeps glyphs and labels off the
 * AC/DC/MC/IC lines; collision spreading treats each axis as a fixed obstacle.
 */
const ZODIAC = { inner: 0.9, outer: 1 } as const
const TICKS = { 1: 0.015, 5: 0.025, 10: 0.04 } as const

/** Single-chart wheel: natal and composite. */
export const NATAL_LAYOUT: WheelLayout = {
  zodiac: ZODIAC,
  signGlyphSize: 0.075,
  ticks: TICKS,
  bands: [
    {
      inner: 0.62,
      outer: 0.9,
      tick: 0.86,
      glyph: 0.78,
      glyphSize: 0.09,
      label: 0.69,
      labelSize: 0.034,
      minGap: 10,
      axisClearance: 6,
    },
  ],
  separators: [],
  houseNumber: 0.595,
  houseNumberSize: 0.034,
  aspect: 0.56,
}

/** Bi-wheel: band 0 is the outer person (B), band 1 the inner person (A). */
export const BIWHEEL_LAYOUT: WheelLayout = {
  zodiac: ZODIAC,
  signGlyphSize: 0.075,
  ticks: TICKS,
  bands: [
    {
      inner: 0.74,
      outer: 0.9,
      tick: 0.885,
      glyph: 0.852,
      glyphSize: 0.066,
      label: 0.785,
      labelSize: 0.024,
      minGap: 7.5,
      axisClearance: 4.5,
    },
    {
      inner: 0.58,
      outer: 0.74,
      tick: 0.725,
      glyph: 0.69,
      glyphSize: 0.066,
      label: 0.63,
      labelSize: 0.024,
      minGap: 8.5,
      axisClearance: 5.5,
    },
  ],
  separators: [0.74],
  houseNumber: 0.565,
  houseNumberSize: 0.028,
  aspect: 0.55,
}

const f2 = (n: number) => n.toFixed(2)

/** Share of the glyph em box that a glyph outline fills along its larger side. */
export const GLYPH_FILL = 0.8

/** Font size of a degree label relative to its band's `labelSize` (its cap height). */
export const LABEL_FONT_RATIO = 1.25

/**
 * Estimated advance width of a degree label such as `25°`, plus a trailing flag glyph (℞ or
 * ≈) when `flagged`, in multiples of the label's font size.
 */
export function degreeLabelEm(text: string, flagged: boolean): number {
  return 0.6 * (text.length - 1) + 0.55 + (flagged ? 1.05 : 0)
}

/**
 * Path data of the 360 degree ticks of the zodiac band, one `M x y L x y` segment per degree
 * pointing inward from `zodiac.inner`, for a wheel whose ascendant is `ascendant`.
 */
export function zodiacTicks(layout: WheelLayout, ascendant: number, view: WheelView): string {
  const { centre: c, radius: r } = view
  const from = layout.zodiac.inner * r
  const parts: string[] = []
  for (let d = 0; d < 360; d++) {
    const len = d % 10 === 0 ? layout.ticks[10] : d % 5 === 0 ? layout.ticks[5] : layout.ticks[1]
    const a = wheelAngle(d, ascendant)
    const p = polar(c, c, from, a)
    const q = polar(c, c, from - len * r, a)
    parts.push(`M ${f2(p.x)} ${f2(p.y)} L ${f2(q.x)} ${f2(q.y)}`)
  }
  return parts.join(' ')
}

/** A point in SVG user units. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** Where one body of a band is drawn, in SVG user units. */
export interface Placement {
  /** Screen angle of the body's exact longitude. */
  readonly angle: number
  /** Screen angle the glyph and label are drawn at after collision spreading. */
  readonly shownAngle: number
  /** Exact-degree tick from the band's outer edge in to its `tick` radius. */
  readonly tick: readonly [Point, Point]
  /** Leader from the tick's inner end to the glyph's outer edge. */
  readonly leader: readonly [Point, Point]
  readonly glyph: Point
  readonly label: Point
}

/**
 * Places bodies at ecliptic `longitudes` on `band` of a wheel whose ascendant is `ascendant`.
 * Crowded bodies are spread along the band to `band.minGap` degrees and kept
 * `band.axisClearance` degrees from each longitude in `axes` (the AC/DC/MC/IC; see
 * {@link spread}); ticks still mark the exact longitude. Results are indexed like the input.
 */
export function placeBodies(
  longitudes: readonly number[],
  ascendant: number,
  band: BodyBand,
  view: WheelView,
  axes: readonly number[] = [],
): Placement[] {
  const { centre: c, radius: r } = view
  const shown = spread(longitudes, band.minGap, axes, band.axisClearance)
  return longitudes.map((lon, i) => {
    const angle = wheelAngle(lon, ascendant)
    const shownAngle = wheelAngle(shown[i]!, ascendant)
    const tickEnd = polar(c, c, band.tick * r, angle)
    return {
      angle,
      shownAngle,
      tick: [polar(c, c, band.outer * r, angle), tickEnd],
      leader: [tickEnd, polar(c, c, (band.glyph + band.glyphSize / 2) * r, shownAngle)],
      glyph: polar(c, c, band.glyph * r, shownAngle),
      label: polar(c, c, band.label * r, shownAngle),
    }
  })
}

/**
 * Path data of the annular sector between radius fractions `inner` < `outer` from screen
 * angle `a1` to `a1 + 30`.
 */
export function signSector(inner: number, outer: number, a1: number, view: WheelView): string {
  const { centre: c, radius: r } = view
  const at = (f: number, a: number) => {
    const p = polar(c, c, f * r, a)
    return `${f2(p.x)} ${f2(p.y)}`
  }
  const r1 = f2(inner * r)
  const r2 = f2(outer * r)
  const a2 = a1 + 30
  return `M ${at(outer, a1)} A ${r2} ${r2} 0 0 0 ${at(outer, a2)} L ${at(inner, a2)} A ${r1} ${r1} 0 0 1 ${at(inner, a1)} Z`
}

/** Where a degree label is drawn, in SVG user units. */
export interface LabelLayout {
  /** Axis-aligned box around the text and flag, centred on (`x`, `y`). */
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly fontSize: number
  /** Left end of the text baseline row; the text is drawn start-anchored, centred vertically. */
  readonly text: Point
  /** Centre of the flag glyph (℞ or ≈), `null` when unflagged. */
  readonly flag: Point | null
  /** Side of the flag glyph's em box. */
  readonly flagSize: number
}

/**
 * Lays out the degree label `text` of a body placed at `place` on `band`, followed by a flag
 * glyph when `flagged`. Labels read horizontally; the flag follows the text, or stacks under
 * it where that leaves more room between the band's inner edge and the glyph (beside 3 and
 * 9 o'clock, where the band runs nearly vertically). The label centres on the ray
 * through the glyph at `band.label`, or further in where its box would otherwise touch the
 * glyph's box, and never so far in that the box crosses `band.inner`.
 */
export function layoutLabel(
  place: Placement,
  text: string,
  flagged: boolean,
  band: BodyBand,
  view: WheelView,
): LabelLayout {
  const { centre: c, radius: r } = view
  const fontSize = band.labelSize * LABEL_FONT_RATIO * r
  const textW = degreeLabelEm(text, false) * fontSize
  const flagSize = degreeLabelEm(text, true) * fontSize - textW
  const rad = (place.shownAngle * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const side = band.glyphSize * GLYPH_FILL * r
  const fitLabel = (w: number, h: number) => {
    // Half-extent of the box along the radius, and the radial distance at which the box
    // clears the glyph's box along one screen axis.
    const reach = (w / 2) * cos + (h / 2) * sin
    const clear = Math.min(
      cos > 1e-9 ? (w + side) / 2 / cos : Infinity,
      sin > 1e-9 ? (h + side) / 2 / sin : Infinity,
    )
    const lowest = band.inner * r + reach
    const highest = band.glyph * r - clear - LABEL_GAP * r
    return {
      w,
      h,
      slack: highest - lowest,
      radius: Math.max(lowest, Math.min(band.label * r, highest)),
    }
  }
  const inline = fitLabel(textW + (flagged ? flagSize : 0), fontSize)
  const stack = flagged ? fitLabel(Math.max(textW, flagSize), fontSize * 2) : null
  const stacked = stack !== null && stack.slack > inline.slack
  const { w, h, radius } = stacked ? stack : inline
  const { x, y } = polar(c, c, radius, place.shownAngle)
  if (stacked) {
    return {
      box: { x, y, w, h },
      fontSize,
      text: { x: x - textW / 2, y: y - fontSize / 2 },
      flag: { x, y: y + fontSize / 2 },
      flagSize,
    }
  }
  const x0 = x - w / 2
  return {
    box: { x, y, w, h },
    fontSize,
    text: { x: x0, y },
    flag: flagged ? { x: x0 + textW + flagSize / 2, y } : null,
    flagSize,
  }
}

/** Radial gap between a label box and its glyph box, fraction of R. */
const LABEL_GAP = 0.002
