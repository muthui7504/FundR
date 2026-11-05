export function normalizeShortcode(value: string) {
  return value.replace(/\D/g, "").slice(0, 7);
}

export function isValidShortcode(value: string) {
  return /^\d{5,7}$/.test(value);
}
