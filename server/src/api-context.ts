import { prisma } from "./config/prisma";
import type { Prisma } from "@prisma/client";
import type {
  AuditEvent,
  Campaign,
  Contribution,
  FundraisingProfile,
  Member,
  MpesaAccount,
  Organisation,
  Plan,
  Participant,
  Pledge,
  Subscription,
} from "./types";
import type { DarajaCredentials } from "./daraja-client";
import { decryptDarajaCredentials } from "./mpesa-crypto";

export type DemoUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role:
    "PLATFORM_ADMIN" | "ORGANISATION_ADMIN" | "ORGANISATION_STAFF" | "MEMBER";
  password: string;
  orgId?: string;
  memberId?: string;
};

export type Store = {
  organisations: Organisation[];
  members: Member[];
  campaigns: Campaign[];
  participants: Participant[];
  profiles: FundraisingProfile[];
  contributions: Contribution[];
  pledges: Pledge[];
  subscriptions: Subscription[];
  plans: Plan[];
  audit: AuditEvent[];
  mpesa: MpesaAccount;
  mpesaAccountsByOrg: Record<string, MpesaAccount>;
  mpesaCredentialVault: Record<string, string>;
  platformPaymentProvider?: "MPESA" | "STRIPE";
  platformPaymentCredentialVault?: string;
  platformMpesaCallbackUrl?: string;
  users: DemoUser[];
};

const copy = <T>(value: T): T =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

export const store: Store = {
  organisations: [],
  members: [],
  campaigns: [],
  participants: [],
  profiles: [],
  contributions: [],
  pledges: [],
  subscriptions: [],
  plans: [],
  audit: [],
  mpesa: {
    connected: false,
    type: "PAYBILL",
    shortcode: "",
    accountName: "",
    environment: "SANDBOX",
  },
  mpesaAccountsByOrg: {},
  mpesaCredentialVault: {},
  platformPaymentProvider: undefined,
  platformPaymentCredentialVault: undefined,
  platformMpesaCallbackUrl: undefined,
  users: [],
};

export const SESSION_DURATION_MS = 30 * 60 * 1000;
export const MEMBER_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export function sessionDurationForRole(role: DemoUser["role"]) {
  return role === "MEMBER" ? MEMBER_SESSION_DURATION_MS : SESSION_DURATION_MS;
}
type Session = { userId: string; expiresAt: number };
export const sessions = new Map<string, Session>();
export const mpesaCredentials = new Map<string, DarajaCredentials>();
export const mpesaAccounts = new Map<string, MpesaAccount>();
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
export const databaseEnabled = Boolean(process.env.DATABASE_URL);
let databaseReady: Promise<void> | undefined;

export function isCampaignEndDateExpired(endDate: string, now = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const datePart = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((part) => part.type === type)?.value ?? "";
  const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate <= today;
}

export function completeExpiredCampaigns(now = new Date()) {
  let changed = false;

  for (const campaign of store.campaigns) {
    if (
      campaign.status !== "COMPLETED" &&
      campaign.status !== "ARCHIVED" &&
      isCampaignEndDateExpired(campaign.endDate, now)
    ) {
      campaign.status = "COMPLETED";
      changed = true;
    }
  }

  return changed;
}

export async function ensureDatabase() {
  if (!databaseEnabled) return;
  if (!databaseReady) {
    databaseReady = (async () => {
      const saved = await prisma.appState.findUnique({
        where: { key: "main" },
      });
      if (saved?.data && typeof saved.data === "object") {
        const persisted = saved.data as Partial<Store>;
        Object.assign(store, persisted);
        store.mpesaAccountsByOrg = persisted.mpesaAccountsByOrg ?? {};
        store.mpesaCredentialVault = persisted.mpesaCredentialVault ?? {};
        store.platformPaymentProvider = persisted.platformPaymentProvider;
        store.platformPaymentCredentialVault =
          persisted.platformPaymentCredentialVault;
        store.platformMpesaCallbackUrl = persisted.platformMpesaCallbackUrl;
        for (const [orgId, account] of Object.entries(store.mpesaAccountsByOrg))
          mpesaAccounts.set(orgId, account);
        for (const [orgId, encrypted] of Object.entries(
          store.mpesaCredentialVault,
        ))
          mpesaCredentials.set(orgId, decryptDarajaCredentials(encrypted));
        store.campaigns = store.campaigns.map((campaign) => ({
          ...campaign,
          createdAt: campaign.createdAt ?? campaign.startDate,
        }));
      } else {
        await persistStore();
      }
      const { bootstrapMembershipRecords } =
        await import("./membership-service");
      await bootstrapMembershipRecords();
    })().catch((cause) => {
      databaseReady = undefined;
      throw new Error(
        `Unable to connect to PostgreSQL. Check DATABASE_URL and run "npm run db:push". ${String(cause)}`,
      );
    });
  }
  await databaseReady;
}

export async function persistStore() {
  if (!databaseEnabled) return;
  const data = JSON.parse(JSON.stringify(store)) as Prisma.InputJsonValue;
  await prisma.appState.upsert({
    where: { key: "main" },
    create: { key: "main", data },
    update: { data },
  });
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...headers },
  });
}

export function error(message: string, status = 400, details?: unknown) {
  return json(
    { message, ...(details === undefined ? {} : { details }) },
    status,
  );
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function readCookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

export function userFromRequest(request: Request) {
  const sessionId = readCookies(request).fundraise_session;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) return undefined;
  if (session.expiresAt <= Date.now()) {
    if (sessionId) sessions.delete(sessionId);
    return undefined;
  }
  return store.users.find((user) => user.id === session.userId);
}

export function publicUser(user: DemoUser) {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function requireUser(request: Request) {
  const user = userFromRequest(request);
  return user ?? null;
}

export function isOrgUser(user: DemoUser) {
  return (
    user.role === "ORGANISATION_ADMIN" || user.role === "ORGANISATION_STAFF"
  );
}

export function addAudit(
  actor: string,
  action: string,
  target: string,
  category: string,
) {
  store.audit.unshift({
    id: id("audit"),
    actor,
    action,
    target,
    category,
    at: new Date().toISOString(),
  });
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function numberValue(value: unknown) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : NaN;
}

export function authError(request: Request, roles?: DemoUser["role"][]) {
  const user = requireUser(request);
  if (!user) return error("Authentication required.", 401);
  if (roles && !roles.includes(user.role))
    return error("You do not have permission to perform this action.", 403);
  return user;
}

export type ApiRouteContext = {
  request: Request;
  url: URL;
  path: string;
  parts: string[];
  method: string;
  setCookie: (sessionId: string, role?: DemoUser["role"]) => string;
};
