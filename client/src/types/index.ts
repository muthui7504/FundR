export type Role = "SUPPORTER" | "MEMBER" | "STAFF" | "ADMIN" | "PLATFORM_ADMIN";
export type MembershipRole = "ADMIN" | "STAFF" | "MEMBER";
export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "INVITED" | "REMOVED";
export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type ParticipantStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "LEFT";
export type PledgeStatus =
  "PENDING" | "DUE_SOON" | "OVERDUE" | "FULFILLED" | "CANCELLED" | "EXPIRED";
export type ContributionStatus = "PENDING" | "COMPLETED" | "FAILED" | "REVERSED" | "REFUNDED";
export type SubscriptionStatus =
  "TRIAL" | "ACTIVE" | "PAST_DUE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
export type OrgStatus = "ACTIVE" | "SUSPENDED";

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
  email: string;
  phone: string;
  website: string;
  country: string;
  city: string;
  address: string;
  status: OrgStatus;
  createdAt: string;
  logoUrl?: string;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
  invitationId?: string;
  invitationExpiresAt?: string;
}
export interface Campaign {
  id: string;
  orgId: string;
  name: string;
  shortDescription: string;
  description: string;
  target: number;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  joinCode: string;
  coverImageUrl?: string;
  imageUrls?: string[];
  createdAt?: string;
}
export interface Participant {
  memberId: string;
  campaignId: string;
  status: ParticipantStatus;
  joinedAt: string;
}
export interface FundraisingProfile {
  id: string;
  slug: string;
  memberId: string;
  campaignId: string;
  title: string;
  message: string;
  target?: number;
  status: "DRAFT" | "PUBLISHED";
  avatarUrl?: string;
  coverImageUrl?: string;
}
export interface Contribution {
  id: string;
  profileId: string;
  campaignId: string;
  supporterName?: string;
  phone: string;
  amount: number;
  status: ContributionStatus;
  receipt?: string;
  failureReason?: string;
  resultCode?: number;
  createdAt: string;
}
export interface Pledge {
  id: string;
  profileId: string;
  campaignId: string;
  supporterName: string;
  phone: string;
  amount: number;
  dueDate: string;
  status: PledgeStatus;
  message?: string;
  createdAt: string;
}
export interface Plan {
  id: string;
  name: string;
  minMembers: number;
  maxMembers: number | null;
  price: number | null;
}
export interface Subscription {
  id: string;
  orgId: string;
  campaignId: string;
  planId: string;
  status: SubscriptionStatus;
  billingDate?: string;
  graceEndsAt?: string;
  history: { status: SubscriptionStatus; at: string }[];
}
export interface MembershipOverview {
  activeMemberCount: number;
  activePlan: {
    code: string;
    name: string;
    minMembers: number;
    maxMembers: number | null;
    price: number | null;
  };
  requiredPlan: {
    code: string;
    name: string;
    minMembers: number;
    maxMembers: number | null;
    price: number | null;
  } | null;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  paymentVerified: boolean;
  lastPaymentStatus: string | null;
  lastPaymentPlan: string | null;
  lastPaymentAt: string | null;
  maxMembers: number | null;
  remainingCapacity: number | null;
  atLimit: boolean;
  upgradeRequired: boolean;
}
export interface CampaignMembershipOverview extends MembershipOverview {
  campaignId: string;
}
export interface PlatformCampaignSubscriptionPayment {
  id: string;
  planCode: string;
  amount: number;
  status: string;
  paymentMethod: string;
  paymentReference: string | null;
  receipt: string | null;
  createdAt: string;
  verifiedAt: string | null;
}
export interface PlatformCampaignSubscription {
  campaign: Campaign;
  membership: CampaignMembershipOverview;
  startsAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  payments: PlatformCampaignSubscriptionPayment[];
}
export interface PlatformOrganisationSubscriptions {
  organisation: Organisation;
  campaigns: PlatformCampaignSubscription[];
}
export interface PlatformPaymentConfiguration {
  provider: "MPESA" | "STRIPE";
  mpesa: {
    configured: boolean;
    shortcode: string;
    type: "PAYBILL" | "TILL";
    environment: "SANDBOX" | "PRODUCTION";
    callbackUrl: string;
  };
  stripe: {
    configured: boolean;
    webhookEndpoint: string;
  };
}
export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  category: string;
  at: string;
}
export interface MpesaAccount {
  connected: boolean;
  type: "PAYBILL" | "TILL";
  shortcode: string;
  accountName: string;
  environment: "SANDBOX" | "PRODUCTION";
  lastVerified?: string;
}
export interface PublicFundraisingProfile {
  profile: FundraisingProfile;
  member: Member;
  campaign: Campaign;
  organisation: Organisation;
  contributions: Contribution[];
}
