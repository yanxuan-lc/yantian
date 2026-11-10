/**
 * Traditional tables of the whole-sign chart: signs, planets, rulers, aspects and the
 * Chaldean order. Free of ephemeris code so the browser renderer can import it.
 */
import type { AspectType, PlanetName, Sign } from './schema.ts'

/** Signs in zodiacal order; index × 30° is the sign's starting longitude. */
export const SIGNS: readonly Sign[] = [
  '白羊',
  '金牛',
  '双子',
  '巨蟹',
  '狮子',
  '处女',
  '天秤',
  '天蝎',
  '射手',
  '摩羯',
  '水瓶',
  '双鱼',
]

/** The seven traditional planets in the order the chart lists them. */
export const PLANETS: readonly PlanetName[] = [
  '太阳',
  '月亮',
  '水星',
  '金星',
  '火星',
  '木星',
  '土星',
]

/** Traditional domicile ruler of each sign, indexed like {@link SIGNS}. */
export const DOMICILE: readonly PlanetName[] = [
  '火星',
  '金星',
  '水星',
  '月亮',
  '太阳',
  '水星',
  '金星',
  '火星',
  '木星',
  '土星',
  '土星',
  '木星',
]

/** Major aspects with their exact angle and allowed orb, degrees. */
export const ASPECTS: readonly { type: AspectType; angle: number; orb: number }[] = [
  { type: '合', angle: 0, orb: 8 },
  { type: '六合', angle: 60, orb: 4 },
  { type: '刑', angle: 90, orb: 7 },
  { type: '拱', angle: 120, orb: 8 },
  { type: '冲', angle: 180, orb: 8 },
]

/** Chaldean order, slowest to fastest; planetary hours advance one step per hour. */
export const CHALDEAN: readonly PlanetName[] = [
  '土星',
  '木星',
  '火星',
  '太阳',
  '金星',
  '水星',
  '月亮',
]

/** Ruler of each weekday, indexed by `Date.getUTCDay()` (0 = Sunday). */
export const WEEKDAY_RULER: readonly PlanetName[] = [
  '太阳',
  '月亮',
  '火星',
  '水星',
  '木星',
  '金星',
  '土星',
]

/** Sign index (0–11) and degree within the sign (0–30) of a longitude in [0, 360). */
export function signOf(longitude: number): { index: number; degree: number } {
  const index = Math.floor(longitude / 30) % 12
  return { index, degree: longitude - index * 30 }
}

/** Whole-sign house (1–12) of a sign, counting the ascendant's sign as the first house. */
export function wholeSignHouse(sign: number, ascendantSign: number): number {
  return ((sign - ascendantSign + 12) % 12) + 1
}

/** Longitude reduced to [0, 360). */
export function normalize(degrees: number): number {
  const d = degrees % 360
  return d < 0 ? d + 360 : d
}
