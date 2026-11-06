import {
  body,
  addAudit,
  authError,
  id,
  error,
  json,
  persistStore,
  store,
  stringValue,
  type ApiRouteContext,
} from "./api-context";
import type { Member, Organisation } from "./types";
import type { Plan } from "./types";
import { isStrongPassword, strongPasswordMessage } from "./password-rules";
import { databaseEnabled } from "./api-context";
import { prisma } from "./config/prisma";
import {
  findMembershipTier,
  MembershipError,
  getCampaignMembershipOverview,
  recordManualCampaignSubscriptionPayment,
  registerOrganisationAdmin,
  registerPlatformAdministrator,
} from "./membership-service";
import {
  getPlatformMpesaCallbackUrl,
  getPlatformPaymentSecrets,
  getPublicPlatformPaymentConfiguration,
  savePlatformPaymentConfiguration,
  type SubscriptionPaymentProvider,
} from "./platform-payment";
import { verifyDarajaCredentials } from "./daraja-client";
import type { DarajaCredentials } from "./daraja-client";
import { verifyStripeSecretKey } from "./stripe-client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

export async function handlePlatformRoutes(
  context: ApiRouteContext,
): Promise<Response | undefined> {
  const { request, parts, method } = context;

  if (method === "POST" && parts[0] === "bootstrap" && parts[1] === "platform-admin") {
    const secret = process.env.PLATFORM_ADMIN_BOOTSTRAP_SECRET;
    if (!secret || request.headers.get("x-bootstrap-secret") !== secret)
      return error("Not found.", 404);
    if (!databaseEnabled) return error("Database persistence is not configured.", 503);
    const input = await body(request);
    const name = stringValue(input.name);
    const email = stringValue(input.email).toLowerCase();
    const password = stringValue(input.password);
    if (name.length < 2 || !email.includes("@") || !isStrongPassword(password))
      return error(`Name, valid email, and ${strongPasswordMessage}`);
    if (await prisma.appUser.findUnique({ where: { email } }))
      return error("An account with that email already exists.", 409);
    const [firstName, ...lastNameParts] = name.split(/\s+/);
    const user: DemoUser = {
      id: randomUUID(),
      email,
      firstName,
      lastName: lastNameParts.join(" "),
      role: "PLATFORM_ADMIN",
      password: await bcrypt.hash(password, 12),
    };
    await registerPlatformAdministrator(user);
    return json({ success: true, email, role: user.role }, 201);
  }

  if (
    parts[0] === "platform" &&
    parts[1] === "payment-configuration" &&
    parts.length === 2
  ) {
    const admin = authError(request, ["PLATFORM_ADMIN"]);
    if (admin instanceof Response)
      return error("Platform admin access required.", 403);
    if (method === "GET") {
      const configuration = getPublicPlatformPaymentConfiguration();
      return json({
        ...configuration,
        stripe: {
          ...configuration.stripe,
          webhookEndpoint: new URL(
            "/api/subscriptions/stripe/webhook",
            request.url,
          ).toString(),
        },
      });
    }
    if (method !== "PUT")
      return error("Payment configuration route not found.", 404);
    if (!databaseEnabled)
      return error(
        "Payment configuration cannot be saved because database persistence is not configured.",
        503,
      );

    const input = await body(request);
    const provider = stringValue(input.provider).toUpperCase();
    if (provider !== "MPESA" && provider !== "STRIPE")
      return error(
        "Choose M-Pesa or Stripe as the subscription payment provider.",
      );

    const existing = getPlatformPaymentSecrets();
    const previousProvider = store.platformPaymentProvider;
    const previousVault = store.platformPaymentCredentialVault;
    const previousCallbackUrl = store.platformMpesaCallbackUrl;
    const mpesa: DarajaCredentials = {
      consumerKey:
        stringValue(input.mpesaConsumerKey) ||
        existing.mpesa?.consumerKey ||
        "",
      consumerSecret:
        stringValue(input.mpesaConsumerSecret) ||
        existing.mpesa?.consumerSecret ||
        "",
      shortcode:
        stringValue(input.mpesaShortcode) || existing.mpesa?.shortcode || "",
      passkey: stringValue(input.mpesaPasskey) || existing.mpesa?.passkey || "",
      type: input.mpesaType === "TILL" ? "TILL" : "PAYBILL",
      environment:
        input.mpesaEnvironment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
    };
    const stripeSecretKey =
      stringValue(input.stripeSecretKey) || existing.stripe?.secretKey || "";
    const stripeWebhookSecret =
      stringValue(input.stripeWebhookSecret) ||
      existing.stripe?.webhookSecret ||
      "";
    const callbackUrl =
      stringValue(input.mpesaCallbackUrl) || getPlatformMpesaCallbackUrl();
    if (provider === "MPESA") {
      if (
        !mpesa.consumerKey ||
        !mpesa.consumerSecret ||
        !mpesa.shortcode ||
        !mpesa.passkey
      )
        return error(
          "Enter the M-Pesa consumer key, consumer secret, shortcode, and passkey.",
        );
      if (!callbackUrl)
        return error(
          "Configure a public HTTPS M-Pesa callback URL before enabling M-Pesa.",
        );
      try {
        const callback = new URL(callbackUrl);
        const hostname = callback.hostname.replace(/^\[|\]$/g, "");
        if (
          callback.protocol !== "https:" ||
          ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
          !callback.pathname
            .replace(/\/+$/, "")
            .endsWith("/api/subscriptions/mpesa/callback")
        )
          return error(
            "The M-Pesa callback URL must use public HTTPS and end in /api/subscriptions/mpesa/callback.",
          );
      } catch {
        return error("Enter a valid public HTTPS M-Pesa callback URL.");
      }
      try {
        await verifyDarajaCredentials(
          mpesa.consumerKey,
          mpesa.consumerSecret,
          mpesa.environment,
        );
      } catch (cause) {
        return error(
          cause instanceof Error
            ? cause.message
            : "Daraja credential verification failed.",
          422,
        );
      }
    } else {
      if (!stripeSecretKey || !stripeWebhookSecret)
        return error(
          "Enter both the Stripe secret key and webhook signing secret.",
        );
      if (!/^whsec_[A-Za-z0-9]+$/.test(stripeWebhookSecret))
        return error(
          "Enter a valid Stripe webhook signing secret beginning with whsec_.",
        );
      try {
        await verifyStripeSecretKey(stripeSecretKey);
      } catch (cause) {
        return error(
          cause instanceof Error
            ? cause.message
            : "Stripe secret key verification failed.",
          422,
        );
      }
    }

    try {
      savePlatformPaymentConfiguration({
        provider: provider as SubscriptionPaymentProvider,
        secrets: {
          ...(mpesa.consumerKey &&
          mpesa.consumerSecret &&
          mpesa.shortcode &&
          mpesa.passkey
            ? { mpesa }
            : existing.mpesa
              ? { mpesa: existing.mpesa }
              : {}),
          ...(stripeSecretKey && stripeWebhookSecret
            ? {
                stripe: {
                  secretKey: stripeSecretKey,
                  webhookSecret: stripeWebhookSecret,
                },
              }
            : existing.stripe
              ? { stripe: existing.stripe }
              : {}),
        },
        mpesaCallbackUrl: callbackUrl,
      });
      await persistStore();
    } catch (cause) {
      store.platformPaymentProvider = previousProvider;
      store.platformPaymentCredentialVault = previousVault;
      store.platformMpesaCallbackUrl = previousCallbackUrl;
      return error(
        cause instanceof Error
          ? cause.message
          : "Unable to save the encrypted payment configuration.",
        503,
      );
    }
    addAudit(
      `${admin.firstName} ${admin.lastName}`,
      "platform.payment_configuration_updated",
      provider,
      "Payments",
    );
    const configuration = getPublicPlatformPaymentConfiguration();
    return json({
      ...configuration,
      stripe: {
        ...configuration.stripe,
        webhookEndpoint: new URL(
          "/api/subscriptions/stripe/webhook",
          request.url,
        ).toString(),
      },
    });
  }

  if (
    method === "GET" &&
    parts[0] === "platform" &&
    parts[1] === "campaign-subscriptions" &&
    parts.length === 2
  ) {
    const admin = authError(request, ["PLATFORM_ADMIN"]);
    if (admin instanceof Response)
      return error("Platform admin access required.", 403);
    const campaignsByOrganisation = new Map<string, typeof store.campaigns>();
    for (const campaign of store.campaigns) {
      const current = campaignsByOrganisation.get(campaign.orgId) ?? [];
      current.push(campaign);
      campaignsByOrganisation.set(campaign.orgId, current);
    }
    const campaignIds = store.campaigns.map((campaign) => campaign.id);
    const [memberships, subscriptions, payments] = await Promise.all([
      Promise.all(
        store.campaigns.map(
          async (campaign) =>
            [
              campaign.id,
              await getCampaignMembershipOverview(campaign),
            ] as const,
        ),
      ),
      databaseEnabled && campaignIds.length > 0
        ? prisma.campaignSubscription.findMany({
            where: { campaignId: { in: campaignIds } },
            select: {
              campaignId: true,
              startsAt: true,
              expiresAt: true,
              verifiedAt: true,
            },
          })
        : Promise.resolve([]),
      databaseEnabled && campaignIds.length > 0
        ? prisma.subscriptionPayment.findMany({
            where: { campaignId: { in: campaignIds } },
            select: {
              id: true,
              campaignId: true,
              planCode: true,
              amount: true,
              status: true,
              paymentMethod: true,
              paymentReference: true,
              receipt: true,
              createdAt: true,
              verifiedAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);
    const membershipByCampaign = new Map(memberships);
    const subscriptionByCampaign = new Map(
      subscriptions.map((subscription) => [
        subscription.campaignId,
        subscription,
      ]),
    );
    const paymentsByCampaign = new Map<string, typeof payments>();
    for (const payment of payments) {
      if (!payment.campaignId) continue;
      const current = paymentsByCampaign.get(payment.campaignId) ?? [];
      current.push(payment);
      paymentsByCampaign.set(payment.campaignId, current);
    }
    return json(
      store.organisations.map((organisation) => ({
        organisation,
        campaigns: (campaignsByOrganisation.get(organisation.id) ?? []).map(
          (campaign) => {
            const subscription = subscriptionByCampaign.get(campaign.id);
            const membership = membershipByCampaign.get(campaign.id);
            if (!membership)
              throw new Error(
                `Campaign membership overview is missing for ${campaign.id}.`,
              );
            return {
              campaign,
              membership,
              startsAt: subscription?.startsAt.toISOString() ?? null,
              expiresAt: subscription?.expiresAt.toISOString() ?? null,
              verifiedAt: subscription?.verifiedAt?.toISOString() ?? null,
              payments: paymentsByCampaign.get(campaign.id) ?? [],
            };
          },
        ),
      })),
    );
  }

  if (
    method === "POST" &&
    parts[0] === "platform" &&
    parts[1] === "campaigns" &&
    parts[3] === "membership" &&
    parts[4] === "manual-payment"
  ) {
    const admin = authError(request, ["PLATFORM_ADMIN"]);
    if (admin instanceof Response)
      return error("Platform admin access required.", 403);
    if (!databaseEnabled)
      return error(
        "Manual campaign payments require the configured PostgreSQL database.",
        503,
      );
    const campaign = store.campaigns.find(
      (item) => item.id === decodeURIComponent(parts[2]),
    );
    if (!campaign) return error("Campaign not found.", 404);
    const input = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const planCode = stringValue(input.planCode).trim();
    const paymentMethod = stringValue(input.paymentMethod).toUpperCase();
    const configuredPlan = findMembershipTier(planCode, store.plans);
    if (
      !configuredPlan ||
      configuredPlan.price === null ||
      configuredPlan.price <= 0
    )
      return error("Choose a valid paid campaign plan.");
    if (!["CASH", "BANK_TRANSFER", "OTHER"].includes(paymentMethod))
      return error(
        "Choose Cash, Bank transfer, or Other as the payment method.",
      );
    const paymentReference = stringValue(input.paymentReference);
    const note = stringValue(input.note);
    if (paymentReference.length > 120 || note.length > 500)
      return error(
        "Payment reference must be 120 characters or fewer and notes must be 500 characters or fewer.",
      );
    try {
      const result = await recordManualCampaignSubscriptionPayment({
        campaign,
        planCode: configuredPlan.code,
        paymentMethod:
          paymentMethod === "CASH" ||
          paymentMethod === "BANK_TRANSFER" ||
          paymentMethod === "OTHER"
            ? paymentMethod
            : "OTHER",
        paymentReference: paymentReference || undefined,
        note: note || undefined,
        actorId: admin.id,
      });
      return json({ success: true, ...result });
    } catch (cause) {
      if (cause instanceof MembershipError)
        return error(cause.message, cause.status, cause.details);
      if (cause instanceof Error && "code" in cause && cause.code === "P2002")
        return error("That payment reference has already been recorded.", 409);
      throw cause;
    }
  }

  if (parts[0] === "platform" && parts[1] === "plans") {
    const admin = authError(request, ["PLATFORM_ADMIN"]);
    if (admin instanceof Response)
      return error("Platform admin access required.", 403);
    if (method === "GET" && parts.length === 2) return json(store.plans);
    if (method === "POST" && parts.length === 2) {
      const input = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const name = stringValue(input.name);
      const minMembers = Number(input.minMembers);
      const maxMembers =
        input.maxMembers === null || input.maxMembers === ""
          ? null
          : Number(input.maxMembers);
      const price =
        input.price === null || input.price === "" ? null : Number(input.price);
      if (
        !name ||
        !Number.isInteger(minMembers) ||
        minMembers < 1 ||
        (maxMembers !== null &&
          (!Number.isInteger(maxMembers) || maxMembers < minMembers)) ||
        (price !== null && (!Number.isFinite(price) || price < 0))
      ) {
        return error(
          "Plan name, valid minimum members, maximum members, and price are required.",
        );
      }
      if (
        store.plans.some(
          (plan) => plan.name.toLowerCase() === name.toLowerCase(),
        )
      )
        return error("A plan with that name already exists.", 409);
      const plan: Plan = {
        id: id("plan"),
        name,
        minMembers,
        maxMembers,
        price,
      };
      store.plans.push(plan);
      return json(plan, 201);
    }
    if (method === "DELETE" && parts[2]) {
      const plan = store.plans.find(
        (item) => item.id === decodeURIComponent(parts[2]),
      );
      if (!plan) return error("Plan not found.", 404);
      if (
        store.subscriptions.some(
          (subscription) => subscription.planId === plan.id,
        )
      )
        return error(
          "This plan cannot be deleted because it is used by a subscription.",
          409,
        );
      if (databaseEnabled) {
        const planCodes = [
          plan.id,
          plan.name.trim().toUpperCase().replace(/\s+/g, "_"),
        ];
        const [campaignSubscription, subscriptionPayment] = await Promise.all([
          prisma.campaignSubscription.findFirst({
            where: { planCode: { in: planCodes } },
            select: { id: true },
          }),
          prisma.subscriptionPayment.findFirst({
            where: { planCode: { in: planCodes } },
            select: { id: true },
          }),
        ]);
        if (campaignSubscription || subscriptionPayment)
          return error(
            "This plan cannot be deleted because it is used by a campaign subscription or payment.",
            409,
          );
      }
      store.plans = store.plans.filter((item) => item.id !== plan.id);
      return json({ success: true });
    }
    return error("Plan route not found.", 404);
  }

  if (method === "POST" && parts[0] === "platform" && parts[1] === "accounts") {
    const admin = authError(request, ["PLATFORM_ADMIN"]);
    if (admin instanceof Response)
      return error("Platform admin access required.", 403);
    const input = await (async () => {
      try {
        const value = await request.json();
        return value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    })();
    const name = stringValue(input.name);
    const email = stringValue(input.email).toLowerCase();
    const password = stringValue(input.password);
    const accountType =
      input.accountType === "PLATFORM_ADMIN"
        ? "PLATFORM_ADMIN"
        : "ORGANISATION_ADMIN";
    const organisationName = stringValue(input.organisationName);
    const organisationType =
      stringValue(input.organisationType) || "Community organisation";
    const phone = stringValue(input.phone);
    if (name.length < 2 || !email.includes("@") || !isStrongPassword(password))
      return error(`Name, valid email, and ${strongPasswordMessage}`);
    if (
      store.users.some((user) => user.email.toLowerCase() === email) ||
      (databaseEnabled &&
        (await prisma.appUser.findUnique({ where: { email } })))
    )
      return error("An account with that email already exists.", 409);
    if (accountType === "ORGANISATION_ADMIN" && organisationName.length < 2)
      return error(
        "Organisation name is required for an organisation account.",
      );

    const [firstName, ...lastNameParts] = name.split(/\s+/);
    let organisation: Organisation | undefined;
    let member: Member | undefined;
    if (accountType === "ORGANISATION_ADMIN") {
      organisation = {
        id: id("o"),
        name: organisationName,
        slug: `${organisationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`,
        type: organisationType,
        description: "",
        email,
        phone,
        website: "",
        country: "Kenya",
        city: "",
        address: "",
        status: "ACTIVE",
        createdAt: new Date().toISOString().slice(0, 10),
      };
      member = {
        id: id("m"),
        name,
        email,
        phone,
        role: "ADMIN",
        status: "ACTIVE",
        joinedAt: new Date().toISOString().slice(0, 10),
      };
    }

    const user = {
      id: id("u"),
      email,
      firstName,
      lastName: lastNameParts.join(" "),
      role: accountType,
      password,
      ...(organisation ? { orgId: organisation.id, memberId: member?.id } : {}),
    } satisfies (typeof store.users)[number];
    if (databaseEnabled) {
      try {
        if (organisation && member)
          await registerOrganisationAdmin(user, member, organisation);
        else await registerPlatformAdministrator(user);
      } catch (cause) {
        if (cause instanceof Error && "code" in cause && cause.code === "P2002")
          return error("An account with that email already exists.", 409);
        throw cause;
      }
    }
    if (organisation) store.organisations.push(organisation);
    if (member) store.members.push(member);
    store.users.push(user);
    return json(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        organisation,
      },
      201,
    );
  }

  if (method === "GET" && parts[0] === "subscriptions") {
    const user = authError(request, [
      "PLATFORM_ADMIN",
      "ORGANISATION_ADMIN",
      "ORGANISATION_STAFF",
    ]);
    if (user instanceof Response) return user;
    return json(
      user.role === "PLATFORM_ADMIN"
        ? store.subscriptions
        : store.subscriptions.filter((item) => item.orgId === user.orgId),
    );
  }

  if (method === "GET" && parts[0] === "plans") {
    return json(store.plans);
  }

  if (
    method === "GET" &&
    parts[0] === "platform" &&
    parts[1] === "organisations"
  ) {
    if (authError(request, ["PLATFORM_ADMIN"]) instanceof Response)
      return error("Platform admin access required.", 403);
    if (parts[2]) {
      const organisation = store.organisations.find(
        (item) => item.id === decodeURIComponent(parts[2]),
      );
      if (!organisation) return error("Organisation not found.", 404);
      const campaigns = store.campaigns.filter(
        (item) => item.orgId === organisation.id,
      );
      const campaignIds = new Set(campaigns.map((item) => item.id));
      const campaignPayments = databaseEnabled
        ? await prisma.subscriptionPayment.findMany({
            where: {
              orgId: organisation.id,
              campaignId: { in: [...campaignIds] },
            },
            select: {
              id: true,
              campaignId: true,
              planCode: true,
              amount: true,
              status: true,
              paymentMethod: true,
              paymentReference: true,
              createdAt: true,
              verifiedAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : [];
      return json({
        organisation,
        campaigns,
        campaignPayments,
        members: store.members.filter((member) =>
          store.users.some(
            (user) =>
              user.orgId === organisation.id && user.memberId === member.id,
          ),
        ),
        participants: store.participants.filter((item) =>
          campaignIds.has(item.campaignId),
        ),
        contributions: store.contributions.filter((item) =>
          campaignIds.has(item.campaignId),
        ),
      });
    }
    return json(store.organisations);
  }

  if (
    method === "GET" &&
    parts[0] === "platform" &&
    parts[1] === "audit-logs"
  ) {
    if (!(authError(request, ["PLATFORM_ADMIN"]) instanceof Response))
      return json(store.audit);
    return error("Platform admin access required.", 403);
  }

  return undefined;
}
