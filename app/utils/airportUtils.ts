export function isIcaoCode(code: string): boolean {
  return /^[A-Z]{4}$/.test(code);
}
