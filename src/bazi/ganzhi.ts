/**
 * Pure stem-branch arithmetic shared by the backend and the browser module. Nothing here
 * depends on the calendar library; solar-term times arrive as data.
 */

/** The ten heavenly stems in cycle order. */
export const GAN = '甲乙丙丁戊己庚辛壬癸'
/** The twelve earthly branches in cycle order. */
export const ZHI = '子丑寅卯辰巳午未申酉戌亥'
/** Five elements in generating order: wood → fire → earth → metal → water. */
export const ELEMENTS = '木火土金水'

const ZHI_ELEMENT = '水土木木土火火土金金土水'

/** Element character of a stem or branch; `undefined` for anything else. */
export function elementOf(char: string): string | undefined {
  const g = GAN.indexOf(char)
  if (g >= 0) return ELEMENTS[Math.floor(g / 2)]
  const z = ZHI.indexOf(char)
  return z >= 0 ? ZHI_ELEMENT[z] : undefined
}

/** Whether a stem or branch is yang (even cycle index). */
export function isYang(char: string): boolean {
  const g = GAN.indexOf(char)
  return (g >= 0 ? g : ZHI.indexOf(char)) % 2 === 0
}

/** Steps from element `a` to element `b` along the generating cycle, 0–4. */
function elementStep(a: string, b: string): number {
  return (ELEMENTS.indexOf(b) - ELEMENTS.indexOf(a) + 5) % 5
}

/** Whether element `a` controls element `b` (wood→earth→water→fire→metal→wood). */
export function controls(a: string, b: string): boolean {
  return elementStep(a, b) === 2
}

const SHI_SHEN_BY_STEP = [
  ['比肩', '劫财'],
  ['食神', '伤官'],
  ['偏财', '正财'],
  ['七杀', '正官'],
  ['偏印', '正印'],
] as const

/** Ten god of stem `gan` relative to the day master `dayGan`. */
export function shiShen(dayGan: string, gan: string): string {
  // Steps along the generating cycle: same, I generate, I control, controls me, generates me.
  const step = elementStep(elementOf(dayGan)!, elementOf(gan)!)
  return SHI_SHEN_BY_STEP[step]![isYang(dayGan) === isYang(gan) ? 0 : 1]
}

const SHORT_SHI_SHEN: Readonly<Record<string, string>> = {
  比肩: '比',
  劫财: '劫',
  食神: '食',
  伤官: '伤',
  偏财: '才',
  正财: '财',
  七杀: '杀',
  正官: '官',
  偏印: '枭',
  正印: '印',
}

/** One-character form of a ten god as used in timeline strips (偏财 → 才, 偏印 → 枭). */
export function shortShiShen(name: string): string {
  return SHORT_SHI_SHEN[name] ?? name
}

const HIDE_GAN: Readonly<Record<string, readonly string[]>> = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '庚', '戊'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
}

/** Hidden stems of a branch: main, middle and residual qi. */
export function hideGan(zhi: string): string[] {
  return [...(HIDE_GAN[zhi] ?? [])]
}

/** Ten god of a branch: that of its main hidden stem. */
export function zhiShiShen(dayGan: string, zhi: string): string {
  return shiShen(dayGan, hideGan(zhi)[0]!)
}

const CHANG_SHENG = [
  '长生',
  '沐浴',
  '冠带',
  '临官',
  '帝旺',
  '衰',
  '病',
  '死',
  '墓',
  '绝',
  '胎',
  '养',
] as const
const CHANG_SHENG_OFFSET: Readonly<Record<string, number>> = {
  甲: 1,
  丙: 10,
  戊: 10,
  庚: 7,
  壬: 4,
  乙: 6,
  丁: 9,
  己: 9,
  辛: 0,
  癸: 3,
}

/** Twelve growth phase of stem `gan` in branch `zhi`: yang stems run forward, yin backward. */
export function diShi(gan: string, zhi: string): string {
  const zi = ZHI.indexOf(zhi)
  const step = GAN.indexOf(gan) % 2 === 0 ? zi : -zi
  return CHANG_SHENG[(((CHANG_SHENG_OFFSET[gan]! + step) % 12) + 12) % 12]!
}

/** Index 0–59 of a stem-branch pair in the sexagenary cycle (甲子 = 0). */
export function jiaZiIndex(ganZhi: string): number {
  const g = GAN.indexOf(ganZhi.charAt(0))
  const z = ZHI.indexOf(ganZhi.charAt(1))
  for (let n = g; n < 60; n += 10) if (n % 12 === z) return n
  return -1
}

/** Stem-branch pair at cycle index `n` (any integer, taken modulo 60). */
export function jiaZi(n: number): string {
  const i = ((n % 60) + 60) % 60
  return GAN.charAt(i % 10) + ZHI.charAt(i % 12)
}

const NAYIN = [
  '海中金',
  '炉中火',
  '大林木',
  '路旁土',
  '剑锋金',
  '山头火',
  '涧下水',
  '城头土',
  '白蜡金',
  '杨柳木',
  '泉中水',
  '屋上土',
  '霹雳火',
  '松柏木',
  '长流水',
  '沙中金',
  '山下火',
  '平地木',
  '壁上土',
  '金箔金',
  '覆灯火',
  '天河水',
  '大驿土',
  '钗钏金',
  '桑柘木',
  '大溪水',
  '沙中土',
  '天上火',
  '石榴木',
  '大海水',
] as const

/** Na-yin of a stem-branch pair; each consecutive pair of the cycle shares one. */
export function naYin(ganZhi: string): string {
  return NAYIN[Math.floor(jiaZiIndex(ganZhi) / 2)]!
}

/** The two void branches (旬空) of the ten-day decade containing `ganZhi`. */
export function xunKong(ganZhi: string): string {
  const start = jiaZiIndex(ganZhi) - (jiaZiIndex(ganZhi) % 10)
  return ZHI.charAt((start + 10) % 12) + ZHI.charAt((start + 11) % 12)
}

/** Year pillar of the solar year that starts at 立春 of `year`. */
export function yearPillar(year: number): string {
  return jiaZi(year - 4)
}

/** Month pillar for month `index` of a solar year (0 = 寅 month from 立春) under `yearGan`. */
export function monthPillar(yearGan: string, index: number): string {
  // 五虎遁: 甲己 start 丙寅, 乙庚 戊寅, 丙辛 庚寅, 丁壬 壬寅, 戊癸 甲寅.
  const startGan = ((GAN.indexOf(yearGan) % 5) * 2 + 2) % 10
  return GAN.charAt((startGan + index) % 10) + ZHI.charAt((2 + index) % 12)
}

/** Day pillar of a civil date; days change at midnight. */
export function dayPillar(year: number, month: number, day: number): string {
  const days = Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
  // 1970-01-01 is 辛巳, cycle index 17.
  return jiaZi(days + 17)
}

/** The twelve hour pillars of a day, 子 through 亥, by 五鼠遁 from the day stem. */
export function hourPillars(dayGan: string): string[] {
  const startGan = (GAN.indexOf(dayGan) % 5) * 2
  return Array.from({ length: 12 }, (_, i) => GAN.charAt((startGan + i) % 10) + ZHI.charAt(i))
}

/** 胎元 of a month pillar: the next stem and the branch three steps on. */
export function taiYuan(monthPillar: string): string {
  return (
    GAN.charAt((GAN.indexOf(monthPillar.charAt(0)) + 1) % 10) +
    ZHI.charAt((ZHI.indexOf(monthPillar.charAt(1)) + 3) % 12)
  )
}

/** 胎息 of a day pillar: the stem in five-combination and the branch in six-combination. */
export function taiXi(dayPillar: string): string {
  return (
    GAN.charAt((GAN.indexOf(dayPillar.charAt(0)) + 5) % 10) +
    ZHI.charAt((13 - ZHI.indexOf(dayPillar.charAt(1))) % 12)
  )
}

/** Position 1–12 of a branch counted from 寅 = 1 to 丑 = 12. */
const fromYin = (zhi: string) => ((ZHI.indexOf(zhi) + 10) % 12) + 1

/** Palace at position `offset` (寅 = 1) with its stem by 五虎遁 from the year stem. */
function palace(yearGan: string, offset: number): string {
  const gan = ((GAN.indexOf(yearGan) + 1) * 2 + offset - 1) % 10
  return GAN.charAt(gan) + ZHI.charAt((offset + 1) % 12)
}

/**
 * 命宫 from the year stem, month branch and hour branch: counting from 寅, the position is
 * 14 minus the month and hour positions, or 26 minus them when their sum reaches 14.
 */
export function mingGong(yearGan: string, monthZhi: string, hourZhi: string): string {
  const sum = fromYin(monthZhi) + fromYin(hourZhi)
  return palace(yearGan, (sum >= 14 ? 26 : 14) - sum)
}

/**
 * 身宫 from the year stem, month branch and hour branch: counting from 寅, the position is
 * the month position plus the hour position counted from 子 = 1, wrapped into 1–12.
 */
export function shenGong(yearGan: string, monthZhi: string, hourZhi: string): string {
  const sum = fromYin(monthZhi) + ZHI.indexOf(hourZhi) + 1
  return palace(yearGan, sum > 12 ? sum - 12 : sum)
}

const SEASON_ORDER = ['旺', '相', '休', '囚', '死'] as const

/**
 * Seasonal strength of the five elements under a month branch, listed 旺 相 休 囚 死.
 * The ruling element is 旺, the one it generates 相, the one generating it 休, the one
 * controlling it 囚 and the one it controls 死; 辰戌丑未 months are ruled by earth.
 */
export function seasonStates(monthZhi: string): Array<{ element: string; state: string }> {
  const ruler = elementOf(monthZhi)!
  const r = ELEMENTS.indexOf(ruler)
  const order = [r, r + 1, r + 4, r + 3, r + 2].map((i) => ELEMENTS.charAt(i % 5))
  return order.map((element, i) => ({ element, state: SEASON_ORDER[i]! }))
}
