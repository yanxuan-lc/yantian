/** Casting a 时家奇门 chart from a request: time basis, chart layout and optional judgement. */

import { DEFAULT_MERIDIAN } from '../bazi/cities.ts'
import { addMinutes, formatMinute, formatSecond, trueSolarTime } from '../bazi/civil-time.ts'
import { requireCivil, resolvePlace } from '../bazi/natal.ts'
import { type Board, castBoard, DOOR_LUCK, NUMERALS, PALACE_GUA } from './board.ts'
import { judge, PALACE_ELEMENT } from './judge.ts'
import type { QimenChart, QimenEvent, QimenPalace } from './schema.ts'

/** Facts needed to cast a chart. */
export interface QimenRequest {
  /** Display label; defaults to the clock time. */
  readonly label?: string
  /** Civil clock time, `YYYY-MM-DD HH:MM`. */
  readonly time: string
  /** Matter to judge; the chart is cast without a judgement when absent. */
  readonly event?: QimenEvent
  /** City for true-solar-time correction; absent means the clock time is used as is. */
  readonly city?: string
  /** Adds the equation of time to the longitude correction; ignored without a city. */
  readonly apparentSolar?: boolean
}

function palaces(board: Board): QimenPalace[] {
  return [...PALACE_GUA].map((gua, i) => {
    const door = board.door.get(gua) ?? null
    return {
      number: i + 1,
      gua,
      element: PALACE_ELEMENT[gua]!,
      earth: board.earth.get(gua)!,
      sky: board.sky.get(gua) ?? null,
      ...(board.skyLodged.palace === gua ? { skyLodged: board.skyLodged.stem } : {}),
      star: board.star.get(gua) ?? null,
      door,
      doorLuck: door === null ? null : DOOR_LUCK[door]!,
      god: board.god.get(gua) ?? null,
    }
  })
}

/**
 * Casts the chart for a request. With a city the chart moment is the true solar time there
 * (mean, or apparent with `apparentSolar`) and the solar term is taken at the clock time
 * converted to Beijing time through the city's civil meridian; otherwise both follow the
 * clock time, read as Beijing time. Throws a
 * `ChartInputError` for an unparsable time or an unknown city.
 */
export function castQimen(request: QimenRequest): QimenChart {
  const clock = requireCivil('time', request.time)
  const place = request.city === undefined ? undefined : resolvePlace(request.city)
  const apparent = request.apparentSolar === true
  const solar =
    place === undefined
      ? undefined
      : trueSolarTime(clock, place.longitude, false, place.meridian, apparent)
  // The clock reads the city's civil meridian; Beijing time runs on 120°E, 4 minutes a degree.
  const beijing =
    place === undefined ? clock : addMinutes(clock, -(place.meridian - DEFAULT_MERIDIAN) * 4)
  const board = castBoard(solar ?? clock, beijing)
  const [year, month, day, hour] = board.pillars
  return {
    label: request.label ?? formatMinute(clock),
    input: {
      clockTime: formatMinute(clock),
      city: place?.name ?? null,
      longitude: place?.longitude ?? null,
      meridian: place?.meridian ?? null,
      basis: place === undefined ? 'clock' : apparent ? 'apparent' : 'mean',
    },
    chartTime: formatMinute(solar ?? clock),
    trueSolarTime: solar === undefined ? null : formatSecond(solar),
    conventions: { juMethod: '拆补', lateZi: 'tomorrow' },
    pillars: { year, month, day, hour },
    solarTerm: board.term,
    ju: {
      name: board.ju,
      dun: board.ju.slice(0, 2),
      number: NUMERALS.indexOf(board.ju.charAt(2)) + 1,
      yuan: board.ju.slice(-1),
    },
    xunShou: board.xunShou,
    xunKong: board.xunKong,
    zhiFu: { yi: board.yi, star: board.zhiFu[0], palace: board.zhiFu[1] },
    zhiShi: { door: board.zhiShi[0], palace: board.zhiShi[1] },
    palaces: palaces(board),
    ...(request.event === undefined ? {} : { judgement: judge(board, request.event) }),
  }
}
