/**
 * Built-in city coordinates for true-solar-time correction. Longitudes are approximate city
 * centres in degrees east; latitude is recorded for charts that need it.
 */

/** Civil-time reference meridian used when a city does not register its own. */
export const DEFAULT_MERIDIAN = 120

/** `[longitude, latitude]` in degrees keyed by the canonical Chinese name. */
export const CITIES: Readonly<Record<string, readonly [number, number]>> = {
  北京: [116.41, 39.9],
  上海: [121.47, 31.23],
  天津: [117.2, 39.13],
  重庆: [106.55, 29.56],
  哈尔滨: [126.64, 45.75],
  长春: [125.32, 43.82],
  沈阳: [123.43, 41.8],
  大连: [121.62, 38.91],
  石家庄: [114.51, 38.04],
  太原: [112.55, 37.87],
  运城: [111.0, 35.03],
  芮城: [110.69, 34.69],
  呼和浩特: [111.75, 40.84],
  济南: [117.0, 36.65],
  青岛: [120.38, 36.07],
  郑州: [113.63, 34.75],
  西安: [108.94, 34.34],
  兰州: [103.82, 36.06],
  西宁: [101.78, 36.62],
  银川: [106.23, 38.49],
  乌鲁木齐: [87.62, 43.83],
  拉萨: [91.11, 29.65],
  成都: [104.07, 30.67],
  贵阳: [106.71, 26.57],
  昆明: [102.83, 25.04],
  南宁: [108.37, 22.82],
  海口: [110.33, 20.03],
  广州: [113.26, 23.13],
  深圳: [114.06, 22.54],
  珠海: [113.55, 22.27],
  东莞: [113.75, 23.02],
  佛山: [113.12, 23.02],
  厦门: [118.08, 24.48],
  福州: [119.3, 26.08],
  泉州: [118.67, 24.87],
  南昌: [115.89, 28.68],
  长沙: [112.94, 28.23],
  武汉: [114.3, 30.6],
  合肥: [117.28, 31.86],
  南京: [118.78, 32.04],
  苏州: [120.62, 31.32],
  无锡: [120.31, 31.49],
  杭州: [120.15, 30.28],
  宁波: [121.56, 29.87],
  温州: [120.7, 28.0],
  台北: [121.56, 25.03],
  香港: [114.17, 22.32],
  澳门: [113.54, 22.2],
  东京: [139.69, 35.69],
  首尔: [126.98, 37.57],
  新加坡: [103.82, 1.35],
  纽约: [-74.01, 40.71],
  伦敦: [-0.13, 51.51],
}

/** Time-zone central meridians for cities whose civil time is not UTC+8. */
const CIVIL_MERIDIAN: Readonly<Record<string, number>> = {
  东京: 135,
  首尔: 135,
  纽约: -75,
  伦敦: 0,
}

const ALIASES: Readonly<Record<string, string>> = {
  BJ: '北京',
  SH: '上海',
  GZ: '广州',
  SZ: '深圳',
  beijing: '北京',
  shanghai: '上海',
  shenzhen: '深圳',
  guangzhou: '广州',
  hangzhou: '杭州',
  chengdu: '成都',
  芮成: '芮城',
  山西芮城: '芮城',
  山西芮成: '芮城',
}

/** A resolved city: canonical name, coordinates in degrees and civil reference meridian. */
export interface City {
  readonly name: string
  readonly longitude: number
  readonly latitude: number
  readonly meridian: number
}

function pack(name: string): City {
  const [longitude, latitude] = CITIES[name]!
  return { name, longitude, latitude, meridian: CIVIL_MERIDIAN[name] ?? DEFAULT_MERIDIAN }
}

/**
 * Resolves a city by canonical name, alias, lower-case alias, or name with a trailing
 * 市/区/县. Returns `undefined` when nothing matches.
 */
export function lookupCity(input: string): City | undefined {
  const key = input.trim()
  if (key === '') return undefined
  if (key in CITIES) return pack(key)
  const alias = ALIASES[key] ?? ALIASES[key.toLowerCase()]
  if (alias !== undefined) return pack(alias)
  for (const suffix of ['市', '区', '县']) {
    if (key.endsWith(suffix) && key.slice(0, -suffix.length) in CITIES) {
      return pack(key.slice(0, -suffix.length))
    }
  }
  return undefined
}
