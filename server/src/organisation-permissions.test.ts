import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { DemoUser } from "./api-context";
import type { Campaign, Organisation } from "./types";

function context(
  path: string,
  method: string,
  sessionId: string,
  body?: Record<string, unknown>,
) {
  const url = new URL(`http://localhost/api/${path}`);
  return {
    request: new Request(url, {
      method,
      headers: {
        cookie: `fundraise_session=${sessionId}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    url,
    path: path.replace(/^\/+|\/+$/g, ""),
    parts: path.replace(/^\/+|\/+$/g, "").split("/"),
    method,
    setCookie: (value: string) => value,
  };
}

test("organisation staff can upgrade campaign plans but cannot perform administrator-only actions", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "";
  const [
    { handleCampaignRoutes },
    { handleMembershipRoutes },
    { handleMpesaRoutes },
    { handleOrganisationRoutes },
    { sessions, store },
  ] = await Promise.all([
    import("./campaign-routes"),
    import("./membership-routes"),
    import("./mpesa-routes"),
    import("./organisation-routes"),
    import("./api-context"),
  ]);
  const previousPlans = store.plans;
  store.plans = [
    { id: "FREE", name: "Free", minMembers: 0, maxMembers: null, price: null },
  ];
  const orgId = `permissions-org-${randomUUID()}`;
  const staffSessionId = randomUUID();
  const adminSessionId = randomUUID();
  const memberSessionId = randomUUID();
  const staff: DemoUser = {
    id: `staff-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    password: "unused-test-password",
    firstName: "Test",
    lastName: "Staff",
    role: "ORGANISATION_STAFF",
    orgId,
  };
  const admin: DemoUser = {
    ...staff,
    id: `admin-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    role: "ORGANISATION_ADMIN",
  };
  const memberId = `member-${randomUUID()}`;
  const member: DemoUser = {
    ...staff,
    id: `member-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    role: "MEMBER",
    memberId,
  };
  const organisation: Organisation = {
    id: orgId,
    name: "Permissions test organisation",
    slug: orgId,
    type: "Test",
    description: "",
    email: "org@example.test",
    phone: "0712345678",
    website: "",
    country: "Kenya",
    city: "",
    address: "",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };
  const campaign: Campaign = {
    id: `campaign-${randomUUID()}`,
    orgId,
    name: "Permissions test campaign",
    shortDescription: "",
    description: "",
    target: 1000,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "2099-12-31",
    status: "ACTIVE",
    joinCode: `join-${randomUUID()}`,
  };
  store.organisations.push(organisation);
  store.campaigns.push(campaign);
  store.users.push(staff, admin, member);
  store.participants.push({
    campaignId: campaign.id,
    memberId,
    status: "ACTIVE",
    joinedAt: new Date().toISOString(),
  });
  sessions.set(staffSessionId, {
    userId: staff.id,
    expiresAt: Date.now() + 60_000,
  });
  sessions.set(adminSessionId, {
    userId: admin.id,
    expiresAt: Date.now() + 60_000,
  });
  sessions.set(memberSessionId, {
    userId: member.id,
    expiresAt: Date.now() + 60_000,
  });

  try {
    const orgUpdate = await handleOrganisationRoutes(
      context(`organisations/${orgId}`, "PATCH", staffSessionId, {
        name: "Changed by staff",
      }),
    );
    assert.equal(orgUpdate?.status, 403);
    assert.equal(organisation.name, "Permissions test organisation");

    for (const [path, body] of [
      ["mpesa/account", { key: "key", secret: "secret" }],
      ["mpesa/account/test", { key: "key", secret: "secret" }],
      ["mpesa/account/disconnect", undefined],
    ] as const) {
      const response = await handleMpesaRoutes(
        context(path, "POST", staffSessionId, body),
      );
      assert.equal(response?.status, 403, `${path} must be administrator-only`);
    }

    const paymentMethods = await handleMembershipRoutes(
      context("subscriptions/payment-method", "GET", staffSessionId),
    );
    assert.equal(paymentMethods?.status, 200);

    const upgrade = await handleMembershipRoutes(
      context(
        `campaigns/${campaign.id}/membership/upgrade`,
        "POST",
        staffSessionId,
        { planCode: "FREE" },
      ),
    );
    assert.equal(upgrade?.status, 200);
    assert.equal(
      ((await upgrade?.json()) as { status: string }).status,
      "ACTIVE",
    );

    const staffDelete = await handleCampaignRoutes(
      context(`campaigns/${campaign.id}`, "DELETE", staffSessionId),
    );
    assert.equal(staffDelete?.status, 403);
    assert.equal(store.campaigns.some((item) => item.id === campaign.id), true);

    const memberDelete = await handleCampaignRoutes(
      context(`campaigns/${campaign.id}`, "DELETE", memberSessionId),
    );
    assert.equal(memberDelete?.status, 403);
    assert.equal(store.campaigns.some((item) => item.id === campaign.id), true);

    const adminDelete = await handleCampaignRoutes(
      context(`campaigns/${campaign.id}`, "DELETE", adminSessionId),
    );
    assert.equal(adminDelete?.status, 200);
    assert.equal(store.campaigns.some((item) => item.id === campaign.id), false);
  } finally {
    store.organisations = store.organisations.filter((item) => item.id !== orgId);
    store.campaigns = store.campaigns.filter((item) => item.id !== campaign.id);
    store.users = store.users.filter(
      (item) =>
        item.id !== staff.id && item.id !== admin.id && item.id !== member.id,
    );
    store.participants = store.participants.filter(
      (participant) => participant.campaignId !== campaign.id,
    );
    store.plans = previousPlans;
    sessions.delete(staffSessionId);
    sessions.delete(adminSessionId);
    sessions.delete(memberSessionId);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
