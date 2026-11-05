export function normalizeKenyanMobileNumber(value: string) {
  const phone = value.replace(/\s+/g, "");
  if (!/^(\+?254|0)[17]\d{8}$/.test(phone)) return null;
  return phone.startsWith("0")
    ? `254${phone.slice(1)}`
    : phone.replace(/^\+/, "");
}
