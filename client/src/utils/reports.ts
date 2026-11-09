export function isWithinDateRange(value: string, startDate: string, endDate: string) {
  const date = value.slice(0, 10);
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function csvValue(value: string | number | null | undefined) {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(value)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]) {
  return rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
}

export function localDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function safeFilename(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
