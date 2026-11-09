import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.MEMBERSHIP_TEST_DATABASE_URL;

test("PostgreSQL campaign limits, concurrency, invitations, and payment callbacks", {
  skip: testDatabaseUrl ? false : "Set MEMBERSHIP_TEST_DATABASE_URL to an isolated, migrated PostgreSQL test database.",
}, async () => {
  if (!testDatabaseUrl) return;

  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousFetch = globalThis.fetch;
  const savedDarajaEnv = {
    key: process.env.PLATFORM_DARAJA_CONSUMER_KEY,
    secret: process.env.PLATFORM_DARAJA_CONSUMER_SECRET,
    shortcode: process.env.PLATFORM_DARAJA_SHORTCODE,
    passkey: process.env.PLATFORM_DARAJA_PASSKEY,
  };
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.PLATFORM_DARAJA_CONSUMER_KEY = "integration-test-key";
  process.env.PLATFORM_DARAJA_CONSUMER_SECRET = "integration-test-secret";
  process.env.PLATFORM_DARAJA_SHORTCODE = "600000";
  process.env.PLATFORM_DARAJA_PASSKEY = "integration-test-passkey";

  const { prisma } = await import("./config/prisma");
  const { store } = await import("./api-context");
  const {
    createInvitationToken,
    createOrganisationInvitation,
    hashInvitationToken,
    MembershipError,
    registerInvitedMember,
    validateOrganisationInvitation,
    joinCampaign,
    getCampaignMembershipOverview,
    updateOrganisationMembership,
  } = await import("./membership-service");
  const { handleMembershipRoutes } = await import("./membership-routes");
  const orgIds: string[] = [];
  const campaignIds: string[] = [];
  const testUserIds = new Set<string>();
  const testMemberIds = new Set<string>();
  const originalPlans = structuredClone(store.plans);
  const originalAppState = await prisma.appState.findUnique({ where: { key: "main" } });
  const originalAppStateData = originalAppState ? structuredClone(originalAppState.data) : undefined;
  store.plans = [
    { id: "FREE", name: "Free", minMembers: 0, maxMembers: 9, price: null },
    { id: "BASIC", name: "Basic", minMembers: 10, maxMembers: 99, price: 1000 },
    { id: "STANDARD", name: "Standard", minMembers: 100, maxMembers: 299, price: 2000 },
    { id: "PREMIUM", name: "Premium", minMembers: 300, maxMembers: null, price: 2500 },
  ];

  async function seedOrganisation(memberCount: number) {
    const orgId = `membership-test-${randomUUID()}`;
    orgIds.push(orgId);
    store.organisations.push({
      id: orgId,
      name: "Membership integration test",
      slug: orgId,
      type: "Test organisation",
      description: "",
      email: `${orgId}@example.test`,
      phone: "254712345678",
      website: "",
      country: "Kenya",
      city: "",
      address: "",
      status: "ACTIVE",
      createdAt: new Date().toISOString().slice(0, 10),
    });

    const users = Array.from({ length: memberCount }, (_, index) => {
      const userId = randomUUID();
      const memberId = randomUUID();
      testUserIds.add(userId);
      return {
        id: userId,
        email: `${userId}@example.test`,
        password: "integration-test-password",
        firstName: "Existing",
        lastName: `Member ${index}`,
        role: "MEMBER",
        orgId,
        memberId,
        membership: {
          id: randomUUID(),
          orgId,
          userId,
          memberId,
          name: `Existing Member ${index}`,
          email: `${userId}@example.test`,
          phone: "254712345678",
          role: "MEMBER",
          status: "ACTIVE",
        },
      };
    });
    if (users.length) {
      await prisma.appUser.createMany({
        data: users.map(({ membership: _membership, ...user }) => user),
      });
      await prisma.organisationMembership.createMany({
        data: users.map(({ membership }) => membership),
      });
    }

    return orgId;
  }

  async function seedAdministratorMembership(orgId: string) {
    const userId = randomUUID();
    const memberId = randomUUID();
    const email = `${userId}@example.test`;
    testUserIds.add(userId);
    await prisma.appUser.create({
      data: {
        id: userId,
        email,
        password: "integration-test-password",
        firstName: "Organisation",
        lastName: "Administrator",
        role: "ORGANISATION_ADMIN",
        orgId,
        memberId,
      },
    });
    await prisma.organisationMembership.create({
      data: {
        id: randomUUID(),
        orgId,
        userId,
        memberId,
        name: "Organisation Administrator",
        email,
        phone: "0712345678",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    return memberId;
  }

  async function invite(orgId: string) {
    return createOrganisationInvitation(orgId, "membership-test-admin");
  }

  async function seedCampaign(orgId: string, participantCount: number, planCode = "FREE", subscriptionExpired = false) {
    const campaignId = `campaign-${randomUUID()}`;
    campaignIds.push(campaignId);
    const campaign = {
      id: campaignId,
      orgId,
      name: "Membership campaign test",
      shortDescription: "",
      description: "",
      target: 1000,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "2099-12-31",
      status: "ACTIVE" as const,
      joinCode: `JOIN-${randomUUID()}`,
    };
    store.campaigns.push(campaign);
    const now = new Date();
    await prisma.campaignCapacityLock.create({ data: { campaignId } });
    await prisma.campaignSubscription.create({
      data: {
        id: randomUUID(),
        campaignId,
        orgId,
        planCode,
        status: "ACTIVE",
        verifiedAt: now,
        startsAt: new Date(now.getTime() - 60_000),
        expiresAt: subscriptionExpired
          ? new Date(now.getTime() - 1_000)
          : new Date(now.getTime() + 30 * 86_400_000),
      },
    });
    if (participantCount) {
      await prisma.campaignParticipant.createMany({
        data: Array.from({ length: participantCount }, (_, index) => ({
          id: randomUUID(),
          campaignId,
          memberId: `existing-${campaignId}-${index}`,
          status: "ACTIVE",
        })),
      });
    }
    return campaign;
  }

  async function register(invitationToken: string, email: string) {
    const user = await registerInvitedMember({
      invitationToken,
      name: "New Test Member",
      email,
      phone: "0712345678",
      password: "Strong-Integration-Password-1!",
    });
    testUserIds.add(user.id);
    if (user.memberId) testMemberIds.add(user.memberId);
    return user;
  }

  try {
    const appStateBefore = originalAppStateData;
    const permissionOrg = await seedOrganisation(0);
    const administratorMemberId = await seedAdministratorMembership(permissionOrg);
    const administratorMembership = await prisma.organisationMembership.findUniqueOrThrow({
      where: {
        orgId_memberId: {
          orgId: permissionOrg,
          memberId: administratorMemberId,
        },
      },
    });
    await assert.rejects(
      updateOrganisationMembership(
        permissionOrg,
        administratorMemberId,
        { status: "SUSPENDED" },
        "membership-test-staff",
        "STAFF",
      ),
      (cause: unknown) =>
        cause instanceof MembershipError && cause.status === 403,
    );
    for (const status of ["SUSPENDED", "REMOVED"] as const) {
      await assert.rejects(
        updateOrganisationMembership(
          permissionOrg,
          administratorMemberId,
          { status },
          administratorMembership.userId,
          "ADMIN",
        ),
        (cause: unknown) =>
          cause instanceof MembershipError &&
          cause.status === 403 &&
          cause.message.includes("own administrator account"),
      );
    }
    assert.equal(
      (await prisma.organisationMembership.findUnique({
        where: {
          orgId_memberId: {
            orgId: permissionOrg,
            memberId: administratorMemberId,
          },
        },
      }))?.status,
      "ACTIVE",
      "staff cannot suspend administrator accounts",
    );

    const campaignBoundaryCases = [
      { count: 9, plan: "FREE", allowed: false },
      { count: 9, plan: "BASIC", allowed: true },
      { count: 99, plan: "BASIC", allowed: false },
      { count: 99, plan: "STANDARD", allowed: true },
      { count: 299, plan: "STANDARD", allowed: false },
      { count: 299, plan: "PREMIUM", allowed: true },
    ] as const;
    for (const [index, scenario] of campaignBoundaryCases.entries()) {
      const orgId = await seedOrganisation(0);
      const campaign = await seedCampaign(orgId, scenario.count, scenario.plan);
      const invitation = await invite(orgId);
      const email = `campaign-boundary-${index}-${randomUUID()}@example.test`;
      const user = await register(invitation.token, email);
      if (scenario.allowed) {
        await joinCampaign(campaign, user.memberId!);
      } else {
        await assert.rejects(
          joinCampaign(campaign, user.memberId!),
          (cause: unknown) => cause instanceof MembershipError &&
            cause.status === 409 &&
            (cause.details as { code?: string }).code === "CAMPAIGN_MEMBER_LIMIT_REACHED",
        );
      }
    }

    const expiredOrg = await seedOrganisation(0);
    const expiredCampaign = await seedCampaign(expiredOrg, 9, "BASIC", true);
    const expiredInvitation = await invite(expiredOrg);
    const expiredMember = await register(expiredInvitation.token, `expired-${randomUUID()}@example.test`);
    await assert.rejects(joinCampaign(expiredCampaign, expiredMember.memberId!), (cause: unknown) =>
      cause instanceof MembershipError && cause.status === 409);

    const largeOrganisation = await seedOrganisation(300);
    const smallCampaign = await seedCampaign(largeOrganisation, 4);
    const largeOrgInvite = await invite(largeOrganisation);
    const memberOfLargeOrganisation = await register(
      largeOrgInvite.token,
      `large-org-member-${randomUUID()}@example.test`,
    );
    await joinCampaign(smallCampaign, memberOfLargeOrganisation.memberId!);
    assert.equal(
      (await getCampaignMembershipOverview(smallCampaign)).activeMemberCount,
      5,
      "organisation member count must not affect campaign capacity",
    );

    const concurrentOrg = await seedOrganisation(0);
    const concurrentCampaign = await seedCampaign(concurrentOrg, 8);
    const concurrentInvitation = await invite(concurrentOrg);
    const concurrentResults = await Promise.allSettled([
      register(concurrentInvitation.token, `concurrent-a-${randomUUID()}@example.test`)
        .then((user) => joinCampaign(concurrentCampaign, user.memberId!)),
      register(concurrentInvitation.token, `concurrent-b-${randomUUID()}@example.test`)
        .then((user) => joinCampaign(concurrentCampaign, user.memberId!)),
    ]);
    assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrentResults.filter((result) => result.status === "rejected").length, 1);
    const concurrentMemberCount = await prisma.campaignParticipant.count({
      where: { campaignId: concurrentCampaign.id, status: "ACTIVE" },
    });
    assert.equal(concurrentMemberCount, 9);

    const duplicateOrg = await seedOrganisation(0);
    const duplicateInvitation = await invite(duplicateOrg);
    const duplicateEmail = `duplicate-${randomUUID()}@example.test`;
    await register(duplicateInvitation.token, duplicateEmail);
    await assert.rejects(
      register(duplicateInvitation.token, duplicateEmail),
      (cause: unknown) => cause instanceof MembershipError && cause.status === 409,
    );

    const invalidOrg = await seedOrganisation(0);
    const invalidToken = createInvitationToken();
    await assert.rejects(
      validateOrganisationInvitation(invalidToken),
      (cause: unknown) => cause instanceof MembershipError && cause.status === 404,
    );
    const expiredToken = createInvitationToken();
    await prisma.organisationInvitation.create({
      data: {
        id: randomUUID(),
        orgId: invalidOrg,
        tokenHash: hashInvitationToken(expiredToken),
        createdBy: "membership-test-admin",
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await assert.rejects(
      validateOrganisationInvitation(expiredToken),
      (cause: unknown) => cause instanceof MembershipError && cause.status === 404,
    );
    const revokedToken = createInvitationToken();
    const revokedInvitation = await prisma.organisationInvitation.create({
      data: {
        id: randomUUID(),
        orgId: invalidOrg,
        tokenHash: hashInvitationToken(revokedToken),
        createdBy: "membership-test-admin",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
    });
    assert.ok(revokedInvitation.revokedAt);
    await assert.rejects(
      validateOrganisationInvitation(revokedToken),
      (cause: unknown) => cause instanceof MembershipError && cause.status === 404,
    );

    const callbackOrg = await seedOrganisation(0);
    globalThis.fetch = async (input) => {
      const url = String(input);
      return url.includes("/oauth/")
        ? Response.json({ access_token: "integration-token" })
        : Response.json({ ResponseCode: "0", ResultCode: "0" });
    };

    const callbackCampaign = await seedCampaign(callbackOrg, 0);
    const campaignPayment = await prisma.subscriptionPayment.create({
      data: {
        id: randomUUID(),
        orgId: callbackOrg,
        campaignId: callbackCampaign.id,
        planCode: "BASIC",
        amount: 1000,
        phone: "254712345678",
        status: "PENDING",
        checkoutRequestId: `ws_CO_${randomUUID()}`,
      },
    });
    const campaignCallback = () => new Request("http://localhost/api/subscriptions/mpesa/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        Body: {
          stkCallback: {
            CheckoutRequestID: campaignPayment.checkoutRequestId,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: "Amount", Value: 1000 },
                { Name: "MpesaReceiptNumber", Value: "TESTRECEIPT2" },
                { Name: "PhoneNumber", Value: 254712345678 },
              ],
            },
          },
        },
      }),
    });
    const campaignContext = () => ({
      request: campaignCallback(),
      url: new URL("http://localhost/api/subscriptions/mpesa/callback"),
      path: "subscriptions/mpesa/callback",
      parts: ["subscriptions", "mpesa", "callback"],
      method: "POST",
      setCookie: (sessionId: string) => sessionId,
    });
    assert.equal((await handleMembershipRoutes(campaignContext()))?.status, 200);
    const campaignMembership = await getCampaignMembershipOverview(callbackCampaign);
    assert.equal(campaignMembership.activePlan.code, "BASIC");
    assert.equal(campaignMembership.paymentVerified, true);
    assert.equal((await handleMembershipRoutes(campaignContext()))?.status, 200);
    assert.equal(
      (await prisma.campaignSubscription.findUnique({ where: { campaignId: callbackCampaign.id } }))?.verifiedPaymentId,
      campaignPayment.id,
      "duplicate payment callbacks must not extend or replace the campaign subscription",
    );

    assert.deepEqual(
      (await prisma.appState.findUnique({ where: { key: "main" } }))?.data,
      appStateBefore,
      "invitation registration must not overwrite legacy application state",
    );
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries({
      PLATFORM_DARAJA_CONSUMER_KEY: savedDarajaEnv.key,
      PLATFORM_DARAJA_CONSUMER_SECRET: savedDarajaEnv.secret,
      PLATFORM_DARAJA_SHORTCODE: savedDarajaEnv.shortcode,
      PLATFORM_DARAJA_PASSKEY: savedDarajaEnv.passkey,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (orgIds.length) {
      await prisma.subscriptionPayment.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.campaignSubscription.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.campaignParticipant.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.campaignCapacityLock.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.organisationSubscription.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.membershipAudit.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.organisationInvitation.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.organisationMembership.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.appUser.deleteMany({ where: { id: { in: [...testUserIds] } } });
      await prisma.membershipCapacityLock.deleteMany({ where: { orgId: { in: orgIds } } });
    }
    store.organisations = store.organisations.filter((organisation) => !orgIds.includes(organisation.id));
    store.campaigns = store.campaigns.filter((campaign) => !campaignIds.includes(campaign.id));
    store.participants = store.participants.filter((participant) => !campaignIds.includes(participant.campaignId));
    store.users = store.users.filter((user) => !testUserIds.has(user.id));
    store.members = store.members.filter((member) => !testMemberIds.has(member.id));
    store.plans = originalPlans;
    await prisma.$disconnect();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
