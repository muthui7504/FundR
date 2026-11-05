export function normalizeShortcode(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function isValidShortcode(value: string) {
  return /^\d{5,7}$/.test(value);
}
