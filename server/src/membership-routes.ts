import { randomUUID } from "node:crypto";
import {
  authError,
  body,
  databaseEnabled,
  error,
  id,
  json,
  store,
  stringValue,
  type ApiRouteContext,
} from "./api-context";
import { prisma } from "./config/prisma";
import {
  MembershipError,
  createOrganisationInvitation,
  activateFreeCampaignPlan,
  beginCampaignSubscriptionPayment,
  findMembershipTier,
  failCampaignSubscriptionPayment,
  listOrganisationMemberships,
  revokeOrganisationInvitation,
  updateOrganisationMembership,
  validateOrganisationInvitation,
  verifyCampaignSubscriptionPayment,
} from "./membership-service";
import type { PaidMembershipTier } from "./membership-service";
import { initiateStkPush, queryStkPush } from "./daraja-client";
import type { DarajaCredentials } from "./daraja-client";
import type { MembershipRole, MembershipStatus } from "./types";
import {
  getAvailableSubscriptionPaymentProviders,
  getPlatformPaymentProvider,
  getPlatformPaymentSecrets,
  getPublicPlatformPaymentConfiguration,
} from "./platform-payment";
import {
  createStripeCheckoutSession,
  getStripeCheckoutSession,
  verifyStripeWebhookSignature,
  type StripeCheckoutSession,
} from "./stripe-client";
import { normalizeKenyanMobileNumber } from "./kenyan-phone";

const SUBSCRIPTION_STK_REQUEST_TIMEOUT_MS = 120_000;

function stripeSessionMatchesPayment(
  session: StripeCheckoutSession,
  payment: { id: string; campaignId: string | null; amount: number },
) {
  return (
    session.id &&
    (session.metadata?.paymentId === payment.id ||
      session.client_reference_id === payment.id) &&
    session.metadata?.campaignId === payment.campaignId &&
    session.payment_status === "paid" &&
    session.amount_total === payment.amount * 100 &&
    session.currency?.toLowerCase() === "kes"
  );
}

export async function handleMembershipRoutes(
  context: ApiRouteContext,
): Promise<Response | undefined> {
  const { request, path, parts, method } = context;

  if (
    method === "GET" &&
    parts[0] === "invitations" &&
    parts[1] === "validate" &&
    parts[2]
  ) {
    try {
      const campaignCode =
        context.url.searchParams.get("campaignCode") ?? undefined;
      return json(
        await validateOrganisationInvitation(
          decodeURIComponent(parts[2]),
          campaignCode,
        ),
      );
    } catch (cause) {
      if (cause instanceof MembershipError)
        return error(cause.message, cause.status, cause.details);
      throw cause;
    }
  }

  if (
    method === "GET" &&
    parts[0] === "subscriptions" &&
    parts[1] === "payment-method" &&
    parts.length === 2
  ) {
    const user = authError(request, ["ORGANISATION_ADMIN", "ORGANISATION_STAFF"]);
    if (user instanceof Response) return user;
    const configuration = getPublicPlatformPaymentConfiguration();
    const availableProviders = getAvailableSubscriptionPaymentProviders();
    const provider = availableProviders.includes(configuration.provider)
      ? configuration.provider
      : (availableProviders[0] ?? configuration.provider);
    return json(
      {
        provider,
        availableProviders,
        configured: availableProviders.length > 0,
      },
      200,
      { "cache-control": "no-store" },
    );
  }

  if (
    method === "GET" &&
    parts[0] === "subscriptions" &&
    parts[1] === "mpesa" &&
    parts[2] === "status" &&
    parts[3]
  ) {
    const user = authError(request, ["ORGANISATION_ADMIN", "ORGANISATION_STAFF"]);
    if (user instanceof Response) return user;
    if (!databaseEnabled)
      return error("Campaign subscription storage is unavailable.", 503);
    const checkoutRequestId = decodeURIComponent(parts[3]);
    const payment = await prisma.subscriptionPayment.findUnique({
      where: { checkoutRequestId },
    });
    if (
      !payment ||
      payment.orgId !== user.orgId ||
      payment.paymentMethod !== "MPESA"
    )
      return error("M-Pesa subscription payment not found.", 404);
    if (payment.status !== "PENDING" || payment.verifiedAt)
      return json({ status: payment.status }, 200, {
        "cache-control": "no-store",
      });

    const credentials = getPlatformPaymentSecrets().mpesa;
    if (!credentials)
      return error("Platform M-Pesa credentials are not configured.", 503);
    if (
      Date.now() - payment.createdAt.getTime() >=
      SUBSCRIPTION_STK_REQUEST_TIMEOUT_MS
    ) {
      const message = "The M-Pesa request timed out before payment was approved.";
      await failCampaignSubscriptionPayment(payment.id, {
        source: "daraja_status_query",
        resultDescription: message,
      });
      return json(
        { status: "FAILED", message },
        200,
        { "cache-control": "no-store" },
      );
    }
    const query = await queryStkPush(credentials, checkoutRequestId);
    if (query.resultCode !== null && query.resultCode !== "0") {
      await failCampaignSubscriptionPayment(payment.id, {
        source: "daraja_status_query",
        resultCode: query.resultCode,
        resultDescription: query.resultDescription,
      });
      return json(
        {
          status: "FAILED",
          message:
            query.resultDescription || "M-Pesa payment was not completed.",
        },
        200,
        { "cache-control": "no-store" },
      );
    }
    if (query.resultCode === "0") {
      await verifyCampaignSubscriptionPayment({
        paymentId: payment.id,
        payload: {
          source: "daraja_status_query",
          checkoutRequestId,
          resultCode: query.resultCode,
          resultDescription: query.resultDescription,
        },
      });
      return json(
        { status: "VERIFIED", message: "M-Pesa payment confirmed." },
        200,
        { "cache-control": "no-store" },
      );
    }

    return json(
      {
        status: "PENDING",
        message: "Waiting for you to approve the M-Pesa prompt.",
      },
      200,
      { "cache-control": "no-store" },
    );
  }

  if (
    parts[0] === "subscriptions" &&
    parts[1] === "stripe" &&
    parts[2] === "webhook" &&
    method === "POST"
  ) {
    const secrets = getPlatformPaymentSecrets();
    if (!secrets.stripe)
      return error("Stripe subscription payments are not configured.", 503);
    const rawPayload = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";
    if (
      !verifyStripeWebhookSignature(
        rawPayload,
        signature,
        secrets.stripe.webhookSecret,
      )
    )
      return error("Stripe webhook signature verification failed.", 400);
    let event: {
      type?: string;
      data?: { object?: StripeCheckoutSession };
    };
    try {
      event = JSON.parse(rawPayload) as typeof event;
    } catch {
      return error("Stripe webhook payload is invalid JSON.", 400);
    }
    const session = event.data?.object;
    const paymentId = session?.metadata?.paymentId;
    if (!session?.id || !paymentId) return json({ received: true });
    const payment = await prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
    });
    if (
      !payment ||
      payment.checkoutRequestId !== session.id ||
      payment.paymentMethod !== "STRIPE"
    )
      return json({ received: true });
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (session.payment_status !== "paid") return json({ received: true });
      if (!stripeSessionMatchesPayment(session, payment))
        return error(
          "Stripe checkout details do not match the pending subscription payment.",
          422,
        );
      const intent = session.payment_intent;
      const receipt = typeof intent === "string" ? intent : intent?.id;
      await verifyCampaignSubscriptionPayment({
        paymentId: payment.id,
        receipt,
        payload: { eventType: event.type, session },
      });
    } else if (event.type === "checkout.session.expired") {
      await failCampaignSubscriptionPayment(payment.id, {
        eventType: event.type,
        session,
      });
    }
    return json({ received: true });
  }

  if (
    method === "GET" &&
    parts[0] === "subscriptions" &&
    parts[1] === "stripe" &&
    parts[2] === "session" &&
    parts[3]
  ) {
    const user = authError(request, ["ORGANISATION_ADMIN", "ORGANISATION_STAFF"]);
    if (user instanceof Response) return user;
    if (!databaseEnabled)
      return error("Campaign subscription storage is unavailable.", 503);
    const sessionId = decodeURIComponent(parts[3]);
    const payment = await prisma.subscriptionPayment.findUnique({
      where: { checkoutRequestId: sessionId },
    });
    if (
      !payment ||
      payment.orgId !== user.orgId ||
      payment.paymentMethod !== "STRIPE"
    )
      return error("Stripe subscription payment not found.", 404);
    if (payment.status === "PENDING" && !payment.verifiedAt) {
      const stripe = getPlatformPaymentSecrets().stripe;
      if (!stripe)
        return error("Stripe subscription payments are not configured.", 503);
      const session = await getStripeCheckoutSession(
        stripe.secretKey,
        sessionId,
      );
      if (stripeSessionMatchesPayment(session, payment)) {
        const intent = session.payment_intent;
        const receipt = typeof intent === "string" ? intent : intent?.id;
        await verifyCampaignSubscriptionPayment({
          paymentId: payment.id,
          receipt,
          payload: { source: "checkout_return", session },
        });
      } else if (session.status === "expired") {
        await failCampaignSubscriptionPayment(payment.id, {
          source: "checkout_return",
          session,
        });
      }
    }
    const current = await prisma.subscriptionPayment.findUnique({
      where: { id: payment.id },
    });
    return json({
      status: current?.status ?? payment.status,
      subscriptionStatus: current?.status === "VERIFIED" ? "ACTIVE" : null,
    });
  }

  if (
    parts[0] === "subscriptions" &&
    parts[1] === "mpesa" &&
    parts[2] === "callback" &&
    method === "POST"
  ) {
    if (!databaseEnabled)
      return error("Subscription payment storage is unavailable.", 503);
    const callback = await body(request);
    const result = (
      callback.Body as
        | {
            stkCallback?: {
              CheckoutRequestID?: string;
              MerchantRequestID?: string;
              ResultCode?: number;
              ResultDesc?: string;
              CallbackMetadata?: {
                Item?: { Name?: string; Value?: unknown }[];
              };
            };
          }
        | undefined
    )?.stkCallback;
    const checkoutRequestId = result?.CheckoutRequestID;
    if (!checkoutRequestId)
      return json({ ResultCode: 0, ResultDesc: "Accepted" });
    const payment = await prisma.subscriptionPayment.findUnique({
      where: { checkoutRequestId },
    });
    if (!payment || payment.status === "VERIFIED" || payment.verifiedAt) {
      return json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
    const credentials = getPlatformPaymentSecrets().mpesa;
    if (!credentials)
      return error("Platform M-Pesa credentials are not configured.", 503);
    let query: Awaited<ReturnType<typeof queryStkPush>>;
    try {
      query = await queryStkPush(credentials, checkoutRequestId);
    } catch (cause) {
      return error(
        cause instanceof Error
          ? cause.message
          : "Unable to verify the M-Pesa payment.",
        503,
      );
    }
    if (query.resultCode === null)
      return json({ ResultCode: 0, ResultDesc: "Accepted" });
    if (query.resultCode !== "0") {
      await prisma.$transaction(async (tx) => {
        if (payment.campaignId) {
          await tx.$executeRaw`
            INSERT INTO "CampaignCapacityLock" ("campaignId", "updatedAt")
            VALUES (${payment.campaignId}, CURRENT_TIMESTAMP)
            ON CONFLICT ("campaignId") DO NOTHING
          `;
          await tx.$queryRaw<Array<{ campaignId: string }>>`
            SELECT "campaignId" FROM "CampaignCapacityLock" WHERE "campaignId" = ${payment.campaignId} FOR UPDATE
          `;
        } else {
          await tx.$executeRaw`
            INSERT INTO "MembershipCapacityLock" ("orgId", "updatedAt")
            VALUES (${payment.orgId}, CURRENT_TIMESTAMP)
            ON CONFLICT ("orgId") DO NOTHING
          `;
          await tx.$queryRaw<Array<{ orgId: string }>>`
            SELECT "orgId" FROM "MembershipCapacityLock" WHERE "orgId" = ${payment.orgId} FOR UPDATE
          `;
        }
        const current = await tx.subscriptionPayment.findUnique({
          where: { id: payment.id },
        });
        if (current?.status === "PENDING" && !current.verifiedAt) {
          await tx.subscriptionPayment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              payload: JSON.parse(JSON.stringify(callback)),
            },
          });
        }
      });
      return json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
    if (result?.ResultCode !== 0)
      return json({ ResultCode: 0, ResultDesc: "Accepted" });
    const metadata = result.CallbackMetadata?.Item ?? [];
    const amount = metadata.find((item) => item.Name === "Amount")?.Value;
    const receipt = metadata.find(
      (item) => item.Name === "MpesaReceiptNumber",
    )?.Value;
    const callbackPhone = String(
      metadata.find((item) => item.Name === "PhoneNumber")?.Value ?? "",
    ).replace(/\D/g, "");
    const expectedPhone = payment.phone.replace(/\D/g, "").replace(/^0/, "254");
    if (
      Number(amount) !== payment.amount ||
      typeof receipt !== "string" ||
      !receipt ||
      callbackPhone !== expectedPhone
    )
      return error(
        "The M-Pesa callback does not match the expected subscription payment.",
        422,
      );

    await prisma.$transaction(async (tx) => {
      if (payment.campaignId) {
        await tx.$executeRaw`
          INSERT INTO "CampaignCapacityLock" ("campaignId", "updatedAt")
          VALUES (${payment.campaignId}, CURRENT_TIMESTAMP)
          ON CONFLICT ("campaignId") DO NOTHING
        `;
        await tx.$queryRaw<Array<{ campaignId: string }>>`
          SELECT "campaignId" FROM "CampaignCapacityLock" WHERE "campaignId" = ${payment.campaignId} FOR UPDATE
        `;
      } else {
        await tx.$executeRaw`
          INSERT INTO "MembershipCapacityLock" ("orgId", "updatedAt")
          VALUES (${payment.orgId}, CURRENT_TIMESTAMP)
          ON CONFLICT ("orgId") DO NOTHING
        `;
        await tx.$queryRaw<Array<{ orgId: string }>>`
          SELECT "orgId" FROM "MembershipCapacityLock" WHERE "orgId" = ${payment.orgId} FOR UPDATE
        `;
      }
      const current = await tx.subscriptionPayment.findUnique({
        where: { id: payment.id },
      });
      if (!current || current.status === "VERIFIED" || current.verifiedAt)
        return;
      const verifiedAt = new Date();
      const expiresAt = new Date(
        verifiedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
      await tx.subscriptionPayment.update({
        where: { id: current.id },
        data: {
          status: "VERIFIED",
          receipt,
          verifiedAt,
          payload: callback as object,
        },
      });
      if (current.campaignId) {
        await tx.campaignSubscription.upsert({
          where: { campaignId: current.campaignId },
          create: {
            id: randomUUID(),
            campaignId: current.campaignId,
            orgId: current.orgId,
            planCode: current.planCode,
            status: "ACTIVE",
            verifiedAt,
            startsAt: verifiedAt,
            expiresAt,
            verifiedPaymentId: current.id,
          },
          update: {
            planCode: current.planCode,
            status: "ACTIVE",
            verifiedAt,
            startsAt: verifiedAt,
            expiresAt,
            verifiedPaymentId: current.id,
          },
        });
      } else {
        await tx.organisationSubscription.upsert({
          where: { orgId: current.orgId },
          create: {
            id: randomUUID(),
            orgId: current.orgId,
            planCode: current.planCode,
            status: "ACTIVE",
            verifiedAt,
            startsAt: verifiedAt,
            expiresAt,
            verifiedPaymentId: current.id,
          },
          update: {
            planCode: current.planCode,
            status: "ACTIVE",
            verifiedAt,
            startsAt: verifiedAt,
            expiresAt,
            verifiedPaymentId: current.id,
          },
        });
      }
      await tx.membershipAudit.create({
        data: {
          id: randomUUID(),
          orgId: current.orgId,
          action: "subscription.payment_verified",
          targetId: current.id,
          details: {
            planCode: current.planCode,
            amount: current.amount,
            receipt,
          },
        },
      });
    });
    return json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (
    parts[0] === "campaigns" &&
    parts[2] === "membership" &&
    parts[3] === "upgrade" &&
    method === "POST"
  ) {
    const user = authError(request, ["ORGANISATION_ADMIN", "ORGANISATION_STAFF"]);
    if (user instanceof Response) return user;
    const campaign = store.campaigns.find((item) => item.id === parts[1]);
    if (!campaign || campaign.orgId !== user.orgId)
      return error("Campaign not found.", 404);
    const input = await body(request);
    const planCode = stringValue(input.planCode).trim();
    const configuredPlan = findMembershipTier(planCode, store.plans);
    if (!configuredPlan)
      return error("Choose a campaign plan configured by the platform administrator.");
    if (configuredPlan.price === null || configuredPlan.price <= 0) {
      try {
        const result = await activateFreeCampaignPlan({
          campaign,
          planCode: configuredPlan.code,
          actorId: user.id,
        });
        return json({
          success: true,
          status: "ACTIVE",
          message: `${configuredPlan.name} plan activated for this campaign.`,
          ...result,
        });
      } catch (cause) {
        if (cause instanceof MembershipError)
          return error(cause.message, cause.status, cause.details);
        throw cause;
      }
    }
    if (!databaseEnabled)
      return error(
        "Campaign subscription billing requires the configured PostgreSQL database.",
        503,
      );
    const defaultProvider = getPlatformPaymentProvider();
    const availableProviders = getAvailableSubscriptionPaymentProviders();
    const requestedProvider = stringValue(input.paymentProvider).toUpperCase();
    const provider = requestedProvider ? requestedProvider : defaultProvider;
    if (
      (provider !== "MPESA" && provider !== "STRIPE") ||
      !availableProviders.includes(provider)
    )
      return error(
        "The selected subscription payment method is not configured.",
        503,
      );
    const secrets = getPlatformPaymentSecrets();
    const mpesaCredentials = secrets.mpesa;
    const stripeCredentials = secrets.stripe;
    const paymentConfiguration = getPublicPlatformPaymentConfiguration();
    const mpesaCallbackUrl = paymentConfiguration.mpesa.callbackUrl;
    if (
      provider === "MPESA" &&
      (!mpesaCredentials || !mpesaCallbackUrl)
    )
      return error(
        "Platform M-Pesa credentials and callback URL are not configured.",
        503,
      );
    if (provider === "STRIPE" && !stripeCredentials)
      return error("Platform Stripe credentials are not configured.", 503);
    let appOrigin: string | undefined;
    if (provider === "STRIPE") {
      if (!process.env.PUBLIC_APP_URL)
        return error(
          "Set PUBLIC_APP_URL to the public frontend URL before enabling Stripe checkout.",
          503,
        );
      try {
        const appUrl = new URL(process.env.PUBLIC_APP_URL);
        if (
          (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") ||
          appUrl.username ||
          appUrl.password
        )
          return error("PUBLIC_APP_URL must be a valid public web URL.", 503);
        appOrigin = appUrl.origin;
      } catch {
        return error("PUBLIC_APP_URL must be a valid public web URL.", 503);
      }
    }
    const enteredPhone = stringValue(input.phone);
    let phone = "";
    if (provider === "MPESA") {
      const normalizedPhone = normalizeKenyanMobileNumber(enteredPhone);
      if (!normalizedPhone) return error("Enter a valid Kenyan mobile number.");
      phone = normalizedPhone;
    }
    let tier: PaidMembershipTier;
    try {
      tier = await beginCampaignSubscriptionPayment({
        campaign,
        planCode,
        phone,
      });
    } catch (cause) {
      if (cause instanceof MembershipError)
        return error(cause.message, cause.status, cause.details);
      throw cause;
    }
    const paymentId = id("campaign-subpay");
    const payment = await prisma.subscriptionPayment.create({
      data: {
        id: paymentId,
        orgId: campaign.orgId,
        campaignId: campaign.id,
        planCode: tier.code,
        amount: tier.price,
        phone,
        status: "PENDING",
        paymentMethod: provider === "STRIPE" ? "STRIPE" : "MPESA",
      },
    });
    try {
      if (provider === "MPESA" && mpesaCredentials) {
        if (!mpesaCallbackUrl)
          throw new Error("Platform M-Pesa callback URL is not configured.");
        const checkoutRequestId = await initiateStkPush(
          mpesaCredentials,
          phone,
          tier.price,
          `SUB${paymentId.replace(/[^a-z0-9]/gi, "").slice(0, 9)}`,
          mpesaCallbackUrl,
        );
        await prisma.subscriptionPayment.update({
          where: { id: payment.id },
          data: { checkoutRequestId },
        });
        return json(
          {
            success: true,
            status: "PENDING",
            checkoutRequestId,
            message: "Approve the M-Pesa prompt on your phone to continue.",
          },
          202,
        );
      }

      if (!stripeCredentials)
        throw new Error("Platform Stripe credentials are not configured.");
      const campaignUrl = `${appOrigin}/organisation/campaigns/${encodeURIComponent(campaign.id)}`;
      const checkout = await createStripeCheckoutSession({
        secretKey: stripeCredentials.secretKey,
        paymentId: payment.id,
        campaignId: campaign.id,
        campaignName: campaign.name,
        planCode: tier.code,
        planName: tier.name,
        amountKes: tier.price,
        successUrl: `${campaignUrl}?subscription_payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${campaignUrl}?subscription_payment=cancelled`,
      });
      if (!checkout.id || !checkout.url)
        throw new Error("Stripe did not return a checkout URL.");
      await prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { checkoutRequestId: checkout.id },
      });
      return json(
        {
          success: true,
          status: "PENDING",
          message:
            "Continue to Stripe to complete the campaign subscription payment.",
          checkoutUrl: checkout.url,
        },
        202,
      );
    } catch (cause) {
      await prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      return error(
        cause instanceof Error
          ? cause.message
          : "Unable to start campaign subscription payment.",
        422,
      );
    }
  }

  if (parts[0] !== "organisations" || parts[1] !== "current") return undefined;
  const user = authError(request, ["ORGANISATION_ADMIN", "ORGANISATION_STAFF"]);
  if (user instanceof Response) return user;
  const orgId = user.orgId;
  if (!orgId) return error("Organisation account required.", 403);

  if (method === "GET" && path === "organisations/current/membership") {
    return error(
      "Subscription capacity is managed separately for each campaign.",
      410,
    );
  }
  if (
    method === "POST" &&
    path === "organisations/current/membership/upgrade"
  ) {
    return error(
      "Organisation-wide subscriptions are no longer supported. Upgrade from an individual campaign page.",
      410,
    );
  }

  if (method === "POST" && path === "organisations/current/invitations") {
    if (!databaseEnabled)
      return error(
        "Invitations require the configured PostgreSQL database.",
        503,
      );
    const input = await body(request);
    const email = stringValue(input.email).toLowerCase();
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      return error("Enter a valid email address.");
    const invite = await createOrganisationInvitation(
      orgId,
      user.id,
      email || undefined,
    );
    return json(invite, 201);
  }

  if (method === "DELETE" && parts[2] === "invitations" && parts[3]) {
    if (!databaseEnabled)
      return error(
        "Invitations require the configured PostgreSQL database.",
        503,
      );
    try {
      await revokeOrganisationInvitation(orgId, decodeURIComponent(parts[3]));
      return json({ success: true });
    } catch (cause) {
      if (cause instanceof MembershipError)
        return error(cause.message, cause.status);
      throw cause;
    }
  }

  if (method === "PATCH" && parts[2] === "members" && parts[3]) {
    if (!databaseEnabled)
      return error(
        "Membership management requires the configured PostgreSQL database.",
        503,
      );
    const input = await body(request);
    const validStatuses: MembershipStatus[] = [
      "ACTIVE",
      "SUSPENDED",
      "INVITED",
      "REMOVED",
    ];
    const validRoles: MembershipRole[] = ["ADMIN", "STAFF", "MEMBER"];
    const status =
      typeof input.status === "string" &&
      validStatuses.includes(input.status as MembershipStatus)
        ? (input.status as MembershipStatus)
        : undefined;
    const role =
      typeof input.role === "string" &&
      validRoles.includes(input.role as MembershipRole)
        ? (input.role as MembershipRole)
        : undefined;
    if (!status && !role)
      return error("A valid membership status or role is required.");
    if (role && user.role !== "ORGANISATION_ADMIN")
      return error(
        "Only an organisation administrator can change membership roles.",
        403,
      );
    try {
      const updated = await updateOrganisationMembership(
        orgId,
        decodeURIComponent(parts[3]),
        { status, role },
        user.id,
        user.role === "ORGANISATION_ADMIN" ? "ADMIN" : "STAFF",
      );
      const cached = store.members.find(
        (member) => member.id === updated.memberId,
      );
      if (cached) {
        if (status) cached.status = status;
        if (role) cached.role = role;
      }
      const account = store.users.find((item) => item.id === updated.userId);
      if (account && (status === "REMOVED" || role)) {
        account.role =
          status === "REMOVED"
            ? "MEMBER"
            : role === "ADMIN"
              ? "ORGANISATION_ADMIN"
              : role === "STAFF"
                ? "ORGANISATION_STAFF"
                : "MEMBER";
      }
      return json({
        id: updated.memberId,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        status: updated.status,
        joinedAt: updated.joinedAt.toISOString().slice(0, 10),
      });
    } catch (cause) {
      if (cause instanceof MembershipError)
        return error(cause.message, cause.status);
      throw cause;
    }
  }

  if (method === "GET" && path === "organisations/current/members") {
    if (!databaseEnabled)
      return error(
        "Membership records require the configured PostgreSQL database.",
        503,
      );
    const memberships = await listOrganisationMemberships(orgId);
    return json(
      memberships.map((item) => ({
        id: item.memberId,
        name: item.name,
        email: item.email,
        phone: item.phone,
        role: item.role,
        status: item.status,
        joinedAt: item.joinedAt.toISOString().slice(0, 10),
      })),
    );
  }

  return undefined;
}
