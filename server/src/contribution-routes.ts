import { addAudit, authError, body, error, id, isOrgUser, json, numberValue, mpesaCredentials, publicUser, readCookies, requireUser, sessions, store, stringValue, userFromRequest, type ApiRouteContext, type DemoUser } from "./api-context";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, MpesaAccount, Organisation, Plan, Participant, Pledge, Subscription } from "./types";
import { initiateStkPush, queryStkPush } from "./daraja-client";
import { getPlatformMpesaContributionCallbackUrl } from "./platform-payment";

const CONTRIBUTION_REQUEST_TIMEOUT_MS = 120_000;
const STATUS_QUERY_INTERVAL_MS = 5_000;
const lastStatusQueryAt = new Map<string, number>();
const activeStatusQueries = new Map<string, Promise<void>>();

async function refreshPendingContributionStatus(contribution: Contribution) {
  if (contribution.status !== "PENDING" || !contribution.checkoutRequestId) return;
  const credentials = mpesaCredentials.get(
    store.campaigns.find((campaign) => campaign.id === contribution.campaignId)?.orgId ?? "",
  );
  if (!credentials) return;

  const age = Date.now() - new Date(contribution.createdAt).getTime();
  if (age >= CONTRIBUTION_REQUEST_TIMEOUT_MS) {
    contribution.status = "FAILED";
    contribution.resultCode = 1037;
    contribution.failureReason = "The M-Pesa request timed out before payment was confirmed.";
    lastStatusQueryAt.delete(contribution.id);
    return;
  }

  const now = Date.now();
  if (now - (lastStatusQueryAt.get(contribution.id) ?? 0) < STATUS_QUERY_INTERVAL_MS) return;
  const existingQuery = activeStatusQueries.get(contribution.id);
  if (existingQuery) return existingQuery;

  lastStatusQueryAt.set(contribution.id, now);
  const query = queryStkPush(credentials, contribution.checkoutRequestId)
    .then(({ resultCode, resultDescription }) => {
      if (contribution.status !== "PENDING" || resultCode === null) return;
      contribution.resultCode = Number(resultCode);
      if (resultCode === "0") {
        contribution.status = "COMPLETED";
        contribution.failureReason = undefined;
      } else {
        contribution.status = "FAILED";
        contribution.failureReason =
          resultDescription || "M-Pesa did not authorize this payment.";
      }
      lastStatusQueryAt.delete(contribution.id);
    })
    .catch((cause: unknown) => {
      console.error("Unable to query pending M-Pesa contribution.", cause);
    })
    .finally(() => {
      activeStatusQueries.delete(contribution.id);
    });
  activeStatusQueries.set(contribution.id, query);
  return query;
}

export async function handleContributionRoutes(context: ApiRouteContext): Promise<Response | undefined> {
  const { request, url, path, parts, method, setCookie } = context;
  void url;
  if (parts[0] !== "contributions") return undefined;
  if (method === "POST" && parts[1] === "mpesa" && parts[2] === "callback") {
    const input = await body(request);
    const result = (input.Body as { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; ResultDesc?: string; CallbackMetadata?: { Item?: { Name?: string; Value?: unknown }[] } } } | undefined)?.stkCallback;
    const checkoutRequestId = result?.CheckoutRequestID;
    const contribution = store.contributions.find((item) => item.checkoutRequestId === checkoutRequestId);
    console.info("Daraja contribution callback received.", {
      matchedContribution: Boolean(contribution),
      resultCode: result?.ResultCode ?? null,
    });
    if (contribution) {
      const lateApprovedPayment =
        contribution.status === "FAILED" &&
        contribution.resultCode === 1037 &&
        result?.ResultCode === 0;
      if (contribution.status !== "PENDING" && !lateApprovedPayment)
        return json({ ResultCode: 0, ResultDesc: "Accepted" });
      contribution.status = result?.ResultCode === 0 ? "COMPLETED" : "FAILED";
      contribution.resultCode = result?.ResultCode;
      if (result?.ResultCode !== 0)
        contribution.failureReason = result?.ResultDesc || "M-Pesa did not authorize this payment.";
      const receipt = result?.CallbackMetadata?.Item?.find((item) => item.Name === "MpesaReceiptNumber")?.Value;
      if (typeof receipt === "string") contribution.receipt = receipt;
    }
    return json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
if (method === "GET" && parts[1] === "mine") {
  const user = requireUser(request);
  if (!user?.memberId) return error("Member access required.", 403);
  const profileIds = new Set(
    store.profiles
      .filter((profile) => profile.memberId === user.memberId)
      .map((profile) => profile.id),
  );
  return json(
    store.contributions
      .filter((item) => profileIds.has(item.profileId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

if (method === "POST" && parts[1] === "stk-push") {
  const input = await body(request);
  const profile = store.profiles.find((item) => item.id === stringValue(input.profileId));
  const amount = numberValue(input.amount);
  const phone = stringValue(input.phone);
  if (!profile || !phone || !Number.isFinite(amount) || amount < 10 || amount > 150000)
    return error(
      "A valid profile, Kenyan phone number, and amount between KSh 10 and KSh 150,000 are required.",
    );
  const campaign = store.campaigns.find((item) => item.id === profile.campaignId);
  const organisationId = campaign?.orgId;
  if (!organisationId) return error("The fundraising page is not linked to an organisation.", 422);
  const credentials = mpesaCredentials.get(organisationId);
  if (!credentials) return error("M-Pesa is not connected. Ask the organisation to configure Daraja first.", 422);
  const contribution: Contribution = {
    id: id("t"),
    profileId: profile.id,
    campaignId: profile.campaignId,
    supporterName: stringValue(input.supporterName) || undefined,
    phone,
    amount,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  const callbackUrl = getPlatformMpesaContributionCallbackUrl();
  if (!callbackUrl) return error("M-Pesa callback URL is not configured on the server.", 503);
  let checkoutRequestId: string;
  try {
    checkoutRequestId = await initiateStkPush(credentials, phone, amount, contribution.id, callbackUrl);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Unable to send the M-Pesa prompt.", 422);
  }
  contribution.checkoutRequestId = checkoutRequestId;
  store.contributions.unshift(contribution);
  return json(
    {
      contributionId: contribution.id,
      checkoutRequestId,
    },
    201,
  );
}
if (method === "GET" && parts[1]) {
  const contribution = store.contributions.find((item) => item.id === parts[1]);
  if (contribution?.status === "PENDING")
    await refreshPendingContributionStatus(contribution);
  return contribution ? json(contribution) : error("Contribution not found.", 404);
}

  return undefined;
}
