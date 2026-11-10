/** Rejected chart input; `message` names the field and the accepted values. */
export class ChartInputError extends Error {
  override readonly name = 'ChartInputError'
}
