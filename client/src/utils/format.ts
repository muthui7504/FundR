import type { CampaignStatus, Contribution, ParticipantStatus, Pledge } from "@/types";

export const formatKES = (n: number) =>
  "KSh " + new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(Math.round(n));

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;

export const effectiveParticipantStatus = (
  campaignStatus: CampaignStatus,
  participantStatus: ParticipantStatus,
): CampaignStatus | ParticipantStatus =>
  campaignStatus === "ACTIVE" ? participantStatus : campaignStatus;

export const isCampaignEndDateExpired = (endDate: string, now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate <= today;
};

/** Accepts 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +2541XXXXXXXX. Returns normalised 254… or null. */
export function normaliseKenyanPhone(input: string): string | null {
  const s = input.replace(/[\s-]/g, "");
  const m = s.match(/^(?:\+?254|0)([17]\d{8})$/);
  return m ? "254" + m[1] : null;
}
export const isValidKenyanPhone = (s: string) => normaliseKenyanPhone(s) !== null;

/** Only COMPLETED contributions count as raised money. Pledges never count. */
export const actualRaised = (contributions: Contribution[]) =>
  contributions.filter((c) => c.status === "COMPLETED").reduce((a, c) => a + c.amount, 0);

export const outstandingPledges = (pledges: Pledge[]) =>
  pledges.filter((p) => ["PENDING", "DUE_SOON", "OVERDUE"].includes(p.status)).reduce((a, p) => a + p.amount, 0);

export const maskPhone = (p: string) => p.slice(0, 6) + "***" + p.slice(-2);

export const supporterLabel = (name?: string) => {
  if (!name) return "Anonymous supporter";
  const [first, last] = name.split(" ");
  return last ? `${first} ${last[0]}.` : first;
};

export const addDays = (d: number) => {
  const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10);
};
