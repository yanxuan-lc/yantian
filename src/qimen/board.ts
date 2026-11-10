/**
 * 时家奇门 chart layout by the 拆补 method, ported from the reference `qimen.py` (itself a
 * port of kinqimen). The 23:00–24:00 hour takes the next day's pillars. Palaces are named by
 * trigram; layers are insertion-ordered maps because pattern detection walks them in the
 * order the layout produces. Traditional rules take precedence over the reference: 天芮 rotates
 * in 禽's place, 陰遁 turns counter-clockwise round 艮坎乾兌坤離巽震, a centred 值符 with
 * the 旬首仪 at 坤 is 伏吟, and the centre stem rides with 天芮 (中五寄坤).
 */

import { Solar } from 'lunar-typescript'
import { addMinutes, type CivilTime, civil, partsOf } from '../bazi/civil-time.ts'
import { GAN, jiaZi, jiaZiIndex, xunKong } from '../bazi/ganzhi.ts'
import { eightChar } from '../bazi/natal.ts'

/** Chinese numerals of the palace numbers 1–9. */
export const NUMERALS = '一二三四五六七八九'
/** Trigram of palace number n at index n − 1 (Lo Shu). */
export const PALACE_GUA = '坎坤震巽中乾兌艮離'
const CLOCKWISE = '坎艮震巽離坤兌乾'
const YIN_ORDER = '艮坎乾兌坤離巽震'
const DOOR_RING = '休生傷杜景死驚開'
/** Rotating ring of the eight outer stars; 天芮 holds 坤 and 天禽 of the centre lodges with it. */
const STAR_RING = '蓬任沖輔英芮柱心'
const HOME_STAR = '蓬芮沖輔禽心柱任英'
const HOME_DOOR = '休死傷杜中開驚生景'
const DECADE_YI: Readonly<Record<string, string>> = {
  甲子: '戊',
  甲戌: '己',
  甲申: '庚',
  甲午: '辛',
  甲辰: '壬',
  甲寅: '癸',
}

/** Ju digits (上中下元) for each solar term. */
const TERM_JU: ReadonlyArray<readonly [readonly string[], string]> = [
  [['冬至', '驚蟄'], '一七四'],
  [['小寒'], '二八五'],
  [['大寒', '春分'], '三九六'],
  [['立春'], '八五二'],
  [['雨水'], '九六三'],
  [['清明', '立夏'], '四一七'],
  [['穀雨', '小滿'], '五二八'],
  [['芒種'], '六三九'],
  [['夏至', '白露'], '九三六'],
  [['小暑'], '八二五'],
  [['大暑', '秋分'], '七一四'],
  [['立秋'], '二五八'],
  [['處暑'], '一四七'],
  [['霜降', '小雪'], '五八二'],
  [['寒露', '立冬'], '六九三'],
  [['大雪'], '四七一'],
]
/** The twelve terms from 冬至 to 芒種 rule 陽遁; the other twelve rule 陰遁. */
const YANG_TERMS = new Set('冬至 小寒 大寒 立春 雨水 驚蟄 春分 清明 穀雨 立夏 小滿 芒種'.split(' '))
/** Simplified term names from the calendar mapped to the traditional forms of the ju table. */
const TERM_TRADITIONAL: Readonly<Record<string, string>> = {
  惊蛰: '驚蟄',
  谷雨: '穀雨',
  小满: '小滿',
  芒种: '芒種',
  处暑: '處暑',
}

/** Door quality of each door. */
export const DOOR_LUCK: Readonly<Record<string, string>> = {
  開: '吉',
  休: '吉',
  生: '吉',
  杜: '平',
  景: '平',
  死: '凶',
  驚: '凶',
  傷: '凶',
}

/** A palace-keyed layer in layout order. */
export type Layer = ReadonlyMap<string, string>

/** A cast chart layout. */
export interface Board {
  /** Year, month, day and hour pillars. */
  readonly pillars: readonly [string, string, string, string]
  /** Latest solar term begun, in the traditional form. */
  readonly term: string
  /** Ju name such as 陰遁一局中: [0] 陰/陽, [2] numeral, last 元. */
  readonly ju: string
  /** Head of the hour's decade (旬首). */
  readonly xunShou: string
  /** Stem the 旬首 hides under. */
  readonly yi: string
  /** 值符 star at its home palace and the palace it flies to. */
  readonly zhiFu: readonly [string, string]
  /** 值使 door and the palace it moves to. */
  readonly zhiShi: readonly [string, string]
  readonly xunKong: { readonly day: string; readonly hour: string }
  readonly earth: Layer
  readonly sky: Layer
  /**
   * Second heaven stem of the chart (中五寄坤): the centre's earth stem lodges in 坤 and so
   * rides with 天芮; it sits on the heaven plate of the palace where 天芮 lands, beside
   * that palace's own heaven stem.
   */
  readonly skyLodged: { readonly palace: string; readonly stem: string }
  readonly door: Layer
  readonly star: Layer
  readonly god: Layer
}

/** Rotation of `list` starting at `item`; throws when `item` is absent. */
function from<T>(list: readonly T[], item: T): T[] {
  const i = list.indexOf(item)
  if (i < 0) throw new Error(`qimen layout: ${String(item)} missing from ${list.join('')}`)
  return [...list.slice(i), ...list.slice(0, i)]
}

/** Reverse rotation of `list` starting at `item`. */
function fromReversed<T>(list: readonly T[], item: T): T[] {
  const i = list.indexOf(item)
  return list.map((_, k) => list[(((i - k) % list.length) + list.length) % list.length]!)
}

const zip = (keys: readonly string[], values: readonly string[]) =>
  new Map(keys.map((k, i) => [k, values[i]!]))

const chars = (s: string) => [...s]
const guaOf = (numeral: string) => PALACE_GUA.charAt(NUMERALS.indexOf(numeral))

/** Head of the ten-day decade containing `ganZhi`. */
const decadeHead = (ganZhi: string) => {
  const i = jiaZiIndex(ganZhi)
  return jiaZi(i - (i % 10))
}

/** Pillars at a minute; 23:00–24:00 takes the pillars of the next day's 00:00. */
function pillarsAt(t: CivilTime): [string, string, string, string] {
  const p = partsOf(t)
  const at = p.hour === 23 ? addMinutes(civil(p.year, p.month, p.day), 24 * 60) : t
  const ec = eightChar(at)
  return [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()]
}

/** Latest solar term begun at a minute, in the traditional form. */
function termAt(t: CivilTime): string {
  const p = partsOf(t)
  const name = Solar.fromYmdHms(p.year, p.month, p.day, p.hour, p.minute, 0)
    .getLunar()
    .getPrevJieQi()
    .getName()
  return TERM_TRADITIONAL[name] ?? name
}

/** 上/中/下元 of the day pillar's 符头: the cycle splits into groups of five, cycling 上中下. */
const yuanOf = (dayGanZhi: string) => '上中下'.charAt(Math.floor(jiaZiIndex(dayGanZhi) / 5) % 3)

/** 值符 stem sequences: [home palace, then the palace for each hour-stem index]. */
function zhiFuPaths(yin: boolean, ju: string): Map<string, string> {
  const yang: Record<string, string> = {
    一: '九八七一二三四五六',
    二: '一九八二三四五六七',
    三: '二一九三四五六七八',
    四: '三二一四五六七八九',
    五: '四三二五六七八九一',
    六: '五四三六七八九一二',
    七: '六五四七八九一二三',
    八: '七六五八九一二三四',
    九: '八七六九一二三四五',
  }
  const yinTable: Record<string, string> = {
    九: '一二三九八七六五四',
    八: '九一二八七六五四三',
    七: '八九一七六五四三二',
    六: '七八九六五四三二一',
    五: '六七八五四三二一九',
    四: '五六七四三二一九八',
    三: '四五六三二一九八七',
    二: '三四五二一九八七六',
    一: '二三四一九八七六五',
  }
  const path = (yin ? yinTable : yang)[ju]!
  const homes = (yin ? fromReversed : from)(chars(NUMERALS), ju).slice(0, 6)
  return new Map(homes.map((home, i) => [jiaZi(i * 10), home + path]))
}

/** 值使 sequences: [home palace, then the next eleven palaces along the 遁 direction]. */
function zhiShiPaths(yin: boolean, ju: string): Map<string, string> {
  const ring = (yin ? fromReversed : from)(chars(NUMERALS), ju)
  const tripled = ring.join('').repeat(3)
  return new Map(
    ring
      .slice(0, 6)
      .map((home, i) => [
        jiaZi(i * 10),
        home + tripled.slice(tripled.indexOf(home) + 1).slice(0, 11),
      ]),
  )
}

/**
 * Heaven-plate stems: the 值符 carries the 旬首仪 to the hour stem's palace and the other
 * stems follow round the ring. The 旬首仪's home palace always holds the 值符 star, so a
 * 旬首仪 in the centre implies 禽 as 值符. Some layouts also give the centre the earth plate's
 * centre stem, as the reference does; that stem travels as `Board.skyLodged`.
 */
function skyLayer(
  ring: readonly string[],
  earth: Layer,
  god: Layer,
  yi: string,
  zhiFuStar: string,
  zhiFuPalace: string,
  hourGan: string,
): Map<string, string> {
  const earthOf = new Map([...earth].map(([gua, gan]) => [gan, gua]))
  const hourHome = earthOf.get(hourGan)
  const ringGan = ring.map((g) => earth.get(g)!)
  const kun = earth.get('坤')!
  const withCentre = (m: Map<string, string>) => m.set('中', earth.get('中')!)
  if (zhiFuPalace === '中') {
    const defaultRing = from(ring, '坤')
    // The 值符 in the centre lodges in 坤 and carries the 旬首仪 there; a 旬首仪 already at
    // 坤 leaves the plate in place (伏吟).
    if (god.get('坤') !== '符') return zip(defaultRing, from(ringGan, kun))
    return zip(defaultRing, from(ringGan, ringGan.includes(yi) ? yi : kun))
  }
  const palaces = from(ring, zhiFuPalace)
  if (zhiFuStar.replace('芮', '禽') === '禽') {
    const stems = from(ringGan, kun)
    if (!stems.includes(yi)) return zip(from(palaces, hourHome!), stems)
    return withCentre(zip(palaces, stems))
  }
  if (hourHome === undefined) return new Map(earth)
  return withCentre(zip(palaces, from(ringGan, yi)))
}

/**
 * Lays out the chart for a civil minute; seconds are ignored. The pillars follow `moment`;
 * the solar term, and with it the 局 and the 遁, follows `termMoment`, the same instant on
 * Beijing time (UTC+8), because a term begins at one absolute instant everywhere. It
 * defaults to `moment`, which treats `moment` as Beijing time.
 */
export function castBoard(moment: CivilTime, termMoment: CivilTime = moment): Board {
  const p = partsOf(moment)
  const t = civil(p.year, p.month, p.day, p.hour, p.minute)
  const pillars = pillarsAt(t)
  const term = termAt(termMoment)
  const yuan = yuanOf(pillars[2])
  const digits = TERM_JU.find(([terms]) => terms.includes(term))![1]
  const ju = `${YANG_TERMS.has(term) ? '陽遁' : '陰遁'}${digits.charAt('上中下'.indexOf(yuan))}局${yuan}`
  const yin = ju.charAt(0) === '陰'
  const juNumeral = ju.charAt(2)

  const earth = zip(
    from(chars(NUMERALS), juNumeral).map(guaOf),
    chars(yin ? '戊乙丙丁癸壬辛庚己' : '戊己庚辛壬癸丁丙乙'),
  )

  const hour = pillars[3]
  const hourStem = GAN.indexOf(hour.charAt(0))
  const xunShou = decadeHead(hour)
  const fuPath = zhiFuPaths(yin, juNumeral).get(xunShou)!
  const shiPath = zhiShiPaths(yin, juNumeral).get(xunShou)!
  const zhiFuStar = HOME_STAR.charAt(NUMERALS.indexOf(fuPath.charAt(0)))
  const zhiFuPalace = guaOf(fuPath.charAt(hourStem))
  const homeDoor = HOME_DOOR.charAt(NUMERALS.indexOf(shiPath.charAt(0)))
  const zhiShiDoor = homeDoor === '中' ? '死' : homeDoor
  const zhiShiPalace = guaOf(shiPath.charAt(hourStem))
  const yi = DECADE_YI[xunShou]!

  const ring = chars(yin ? YIN_ORDER : CLOCKWISE)
  const startAt = (palace: string) => from(ring, palace === '中' ? '坤' : palace)
  const doorRing = chars(DOOR_RING)
  const starRing = chars(STAR_RING)
  const door = zip(startAt(zhiShiPalace), from(yin ? doorRing.reverse() : doorRing, zhiShiDoor))
  const god = zip(startAt(zhiFuPalace), chars(yin ? '符蛇陰合虎玄地天' : '符蛇陰合勾雀地天'))
  const star = zip(
    startAt(zhiFuPalace),
    // A 禽 值符 rotates with 天芮, the star it lodges with.
    from(yin ? starRing.reverse() : starRing, zhiFuStar.replace('禽', '芮')),
  )
  const sky = skyLayer(ring, earth, god, yi, zhiFuStar, zhiFuPalace, hour.charAt(0))
  const ruiPalace = [...star].find(([, s]) => s === '芮')![0]

  return {
    pillars,
    term,
    ju,
    xunShou,
    yi,
    zhiFu: [zhiFuStar, zhiFuPalace],
    zhiShi: [zhiShiDoor, zhiShiPalace],
    xunKong: { day: xunKong(pillars[2]), hour: xunKong(hour) },
    earth,
    sky,
    skyLodged: { palace: ruiPalace, stem: earth.get('中')! },
    door,
    star,
    god,
  }
}
