/**
 * Central API client for the existing Fundraise backend (Node/Express/Prisma).
 * Configure VITE_API_BASE_URL in your frontend .env file.
 * Authentication relies on HTTP-only cookies (credentials: "include").
 * Tokens are never stored in localStorage.
 */

import type {
  Campaign,
  Contribution,
  FundraisingProfile,
  Member,
  MpesaAccount,
  Organisation,
  Pledge,
  Plan,
  Subscription,
  AuditEvent,
  PublicFundraisingProfile,
  CampaignMembershipOverview,
  PlatformOrganisationSubscriptions,
  PlatformPaymentConfiguration,
} from "@/types";

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL?.trim() || "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type AuthRole = "PLATFORM_ADMIN" | "ORGANISATION_ADMIN" | "ORGANISATION_STAFF" | "MEMBER";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AuthRole;
  orgId?: string;
  memberId?: string;
};

export type CampaignMember = {
  participant: import("@/types").Participant;
  member: import("@/types").Member;
  profile: import("@/types").FundraisingProfile | null;
  raised: number;
  progress: number;
};

export type FundraisingProfileInput = Partial<FundraisingProfile> & {
  avatarImage?: string;
  coverImage?: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? res.statusText, body);
  }

  return body as T;
}

const get = <T>(path: string) => request<T>(path);

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });

const patch = <T>(path: string, data?: unknown) =>
  request<T>(path, {
    method: "PATCH",
    body: JSON.stringify(data ?? {}),
  });

export const api = {
  auth: {
    login: (data: { email: string; password: string }) =>
      post<{
        success: boolean;
        data: {
          user: AuthUser;
        };
      }>("/auth/login", data),

    google: (data: { credential: string; invitationToken?: string; phone?: string }) =>
      post<{
        success: boolean;
        data: {
          user: AuthUser;
        };
      }>("/auth/google", data),

    register: (data: Record<string, unknown>) =>
      post<{
        success: boolean;
        data: { verificationRequired: boolean; email: string; expiresAt: string };
      }>("/auth/register", data),

    verifyEmail: (data: { email: string; code: string }) =>
      post<{ success: boolean; data: { user: AuthUser } }>("/auth/verify-email", data),

    resendVerification: (email: string) =>
      post<{ success: boolean; data: { email: string; expiresAt: string } }>(
        "/auth/register/resend",
        { email },
      ),

    me: () =>
      get<{
        success: boolean;
        data: {
          user: AuthUser;
        };
      }>("/auth/me"),

    logout: () => post("/auth/logout"),

    forgotPassword: (email: string) => post("/auth/forgot-password", { email }),

    resetPassword: (data: { token: string; password: string }) =>
      post("/auth/reset-password", data),
  },

  organisations: {
    current: () => get<Organisation>("/organisations/current"),

    dashboard: () =>
      get<{
        organisation: Organisation;
        campaigns: Campaign[];
        members: Member[];
        participants: import("@/types").Participant[];
        contributions: Contribution[];
      }>("/organisations/current/dashboard"),

    update: (data: Partial<Organisation>) => patch<Organisation>("/organisations/current", data),

    members: () => get<Member[]>("/organisations/current/members"),

    inviteMember: (email?: string) =>
      post<{ id: string; token: string; expiresAt: string }>("/organisations/current/invitations", {
        email,
      }),

    revokeInvitation: (id: string) =>
      request<{ success: boolean }>(
        `/organisations/current/invitations/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ),

    updateMember: (id: string, data: { status?: Member["status"]; role?: Member["role"] }) =>
      patch<Member>(`/organisations/current/members/${encodeURIComponent(id)}`, data),
  },

  invitations: {
    validate: (token: string, campaignCode?: string) =>
      get<{
        organisationId: string;
        organisation: { name: string; email: string; phone: string };
        invitedEmail: string | null;
        expiresAt: string;
        canJoin: boolean;
        campaignMembership?: CampaignMembershipOverview;
      }>(
        `/invitations/validate/${encodeURIComponent(token)}${campaignCode ? `?campaignCode=${encodeURIComponent(campaignCode)}` : ""}`,
      ),
  },

  campaigns: {
    list: () => get<Campaign[]>("/campaigns"),

    mine: () => get<import("@/types").Participant[]>("/campaigns/mine"),

    get: (id: string) => get<Campaign>(`/campaigns/${id}`),

    members: (id: string) => get<CampaignMember[]>(`/campaigns/${encodeURIComponent(id)}/members`),

    membership: (id: string) =>
      get<CampaignMembershipOverview>(`/campaigns/${encodeURIComponent(id)}/membership`),

    upgradeMembership: (
      id: string,
      data: {
        planCode: string;
        phone: string;
        paymentProvider?: "MPESA" | "STRIPE";
      },
    ) =>
      post<{
        success: boolean;
        status: string;
        message: string;
        checkoutUrl?: string;
        checkoutRequestId?: string;
      }>(`/campaigns/${encodeURIComponent(id)}/membership/upgrade`, data),

    contributions: (id: string) =>
      get<Contribution[]>(`/campaigns/${encodeURIComponent(id)}/contributions`),

    findByCode: (code: string) => get<Campaign>(`/campaigns/code/${encodeURIComponent(code)}`),

    create: (data: Partial<Campaign>) => post<Campaign>("/campaigns", data),

    update: (id: string, data: Partial<Campaign>) => patch<Campaign>(`/campaigns/${id}`, data),

    delete: (id: string) =>
      request<{ success: boolean }>(`/campaigns/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),

    join: (code: string) =>
      post<{ success: boolean; alreadyJoined: boolean; campaign: Campaign }>(
        `/campaigns/join/${encodeURIComponent(code)}`,
      ),
  },

  profiles: {
    mine: () => get<FundraisingProfile[]>("/fundraising-profiles/me"),

    bySlug: (slug: string) =>
      get<PublicFundraisingProfile>(`/fundraising-profiles/slug/${encodeURIComponent(slug)}`),

    create: (data: FundraisingProfileInput) =>
      post<FundraisingProfile>("/fundraising-profiles", data),

    update: (id: string, data: FundraisingProfileInput) =>
      patch<FundraisingProfile>(`/fundraising-profiles/${id}`, data),
  },

  contributions: {
    mine: () => get<Contribution[]>("/contributions/mine"),
    initiateStk: (data: {
      profileId: string;
      phone: string;
      amount: number;
      supporterName?: string;
    }) =>
      post<{
        contributionId: string;
        checkoutRequestId: string;
      }>("/contributions/stk-push", data),

    status: (id: string, signal?: AbortSignal) =>
      request<Contribution>(`/contributions/${id}`, { signal }),
  },

  pledges: {
    create: (data: Partial<Pledge>) => post<Pledge>("/pledges", data),

    mine: () => get<Pledge[]>("/pledges/me"),

    update: (id: string, data: { status?: Pledge["status"] }) =>
      patch<Pledge>(`/pledges/${encodeURIComponent(id)}`, data),

    delete: (id: string) =>
      request<{ success: boolean }>(`/pledges/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },

  mpesa: {
    get: () => get<MpesaAccount>("/mpesa/account"),

    save: (data: Record<string, string>) => post<MpesaAccount>("/mpesa/account", data),

    test: (data: Record<string, string>) =>
      post<{ success: boolean; message: string }>("/mpesa/account/test", data),

    disconnect: () => post<MpesaAccount>("/mpesa/account/disconnect"),
  },

  subscriptions: {
    list: () => get<Subscription[]>("/subscriptions"),

    plans: () => get<Plan[]>("/plans"),

    paymentMethod: () =>
      request<{
        provider: "MPESA" | "STRIPE";
        availableProviders?: ("MPESA" | "STRIPE")[];
        configured: boolean;
      }>("/subscriptions/payment-method", { cache: "no-store" }),

    mpesaSessionStatus: (checkoutRequestId: string) =>
      request<{ status: "PENDING" | "VERIFIED" | "FAILED"; message?: string }>(
        `/subscriptions/mpesa/status/${encodeURIComponent(checkoutRequestId)}`,
        { cache: "no-store" },
      ),

    stripeSessionStatus: (sessionId: string) =>
      get<{ status: string; subscriptionStatus: string | null }>(
        `/subscriptions/stripe/session/${encodeURIComponent(sessionId)}`,
      ),
  },

  platform: {
    paymentConfiguration: () =>
      get<PlatformPaymentConfiguration>("/platform/payment-configuration"),

    savePaymentConfiguration: (data: {
      provider: "MPESA" | "STRIPE";
      mpesaConsumerKey?: string;
      mpesaConsumerSecret?: string;
      mpesaShortcode?: string;
      mpesaPasskey?: string;
      mpesaType?: "PAYBILL" | "TILL";
      mpesaEnvironment?: "SANDBOX" | "PRODUCTION";
      mpesaCallbackUrl?: string;
      stripeSecretKey?: string;
      stripeWebhookSecret?: string;
    }) =>
      request<PlatformPaymentConfiguration>("/platform/payment-configuration", {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    campaignSubscriptions: () =>
      get<PlatformOrganisationSubscriptions[]>("/platform/campaign-subscriptions"),

    plans: () => get<Plan[]>("/platform/plans"),

    createPlan: (data: Omit<Plan, "id">) => post<Plan>("/platform/plans", data),

    deletePlan: (id: string) =>
      request<{ success: boolean }>(`/platform/plans/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),

    organisations: () => get<Organisation[]>("/platform/organisations"),

    createAccount: (data: {
      accountType: "PLATFORM_ADMIN" | "ORGANISATION_ADMIN";
      name: string;
      email: string;
      phone: string;
      password: string;
      organisationName?: string;
      organisationType?: string;
    }) =>
      post<{
        id: string;
        email: string;
        role: AuthRole;
        organisation?: Organisation;
      }>("/platform/accounts", data),

    organisation: (id: string) =>
      get<{
        organisation: Organisation;
        campaigns: Campaign[];
        members: Member[];
        participants: import("@/types").Participant[];
        contributions: Contribution[];
        campaignPayments: {
          id: string;
          campaignId: string | null;
          planCode: string;
          amount: number;
          status: string;
          paymentMethod: string;
          paymentReference: string | null;
          createdAt: string;
          verifiedAt: string | null;
        }[];
      }>(`/platform/organisations/${encodeURIComponent(id)}`),

    recordManualCampaignPayment: (
      campaignId: string,
      data: {
        planCode: string;
        paymentMethod: "CASH" | "BANK_TRANSFER" | "OTHER";
        paymentReference?: string;
        note?: string;
      },
    ) =>
      post<{
        success: boolean;
        paymentId: string;
        planCode: string;
        amount: number;
        expiresAt: string;
      }>(`/platform/campaigns/${encodeURIComponent(campaignId)}/membership/manual-payment`, data),

    audit: () => get<AuditEvent[]>("/platform/audit-logs"),
  },
};
