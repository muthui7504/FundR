import { describe, expect, it } from "vitest";
import { isWithinDateRange, localDateInputValue, safeFilename, toCsv } from "./reports";

describe("report export utilities", () => {
  it("filters inclusive date ranges and allows open bounds", () => {
    expect(isWithinDateRange("2026-03-15T12:00:00.000Z", "2026-03-15", "2026-03-15")).toBe(true);
    expect(isWithinDateRange("2026-03-14", "2026-03-15", "")).toBe(false);
    expect(isWithinDateRange("2026-03-14", "", "2026-03-15")).toBe(true);
  });

  it("quotes CSV values and neutralises spreadsheet formulas", () => {
    expect(
      toCsv([
        ["name", "note"],
        ['A "quoted" name', "=1+1"],
      ]),
    ).toBe('"name","note"\r\n"A ""quoted"" name","\'=1+1"');
    expect(toCsv([["amount"], [-120]])).toBe('"amount"\r\n"-120"');
  });

  it("formats local dates and safe filenames", () => {
    expect(localDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(safeFilename("St. Mark’s Fund")).toBe("st-mark-s-fund");
  });
});
