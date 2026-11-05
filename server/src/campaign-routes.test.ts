import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { DemoUser } from "./api-context";
import type { Campaign } from "./types";

function context(path: string, method: string, cookie?: string) {
  const url = new URL(`http://localhost/api/${path}`);
  return {
    request: new Request(url, {
      method,
      headers: cookie ? { cookie } : undefined,
    }),
    url,
    path: path.replace(/^\/+|\/+$/g, ""),
    parts: path.replace(/^\/+|\/+$/g, "").split("/"),
    method,
    setCookie: (sessionId: string) => sessionId,
  };
}

test("campaign links and subscription plans honor platform configuration", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "";
  const [
    { handleCampaignRoutes },
    { sessions, store },
    { beginCampaignSubscriptionPayment },
  ] = await Promise.all([
    import("./campaign-routes"),
    import("./api-context"),
    import("./membership-service"),
  ]);
  const previousPlans = store.plans;
  store.plans = [
    { id: "plan_free", name: "Free", minMembers: 0, maxMembers: 9, price: null },
    { id: "plan_basic", name: "Basic", minMembers: 10, maxMembers: 99, price: 1800 },
  ];
  const campaign: Campaign = {
    id: `campaign-${randomUUID()}`,
    orgId: `org-${randomUUID()}`,
    name: "Link onboarding test",
    shortDescription: "Join this team",
    description: "",
    target: 1000,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "2099-12-31",
    status: "ACTIVE",
    joinCode: `join-${randomUUID()}`,
  };
  const memberId = `member-${randomUUID()}`;
  const user: DemoUser = {
    id: `user-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    firstName: "Campaign",
    lastName: "Member",
    role: "MEMBER",
    password: "unused-test-password",
    orgId: campaign.orgId,
    memberId,
  };
  const otherOrgUser: DemoUser = {
    ...user,
    id: `user-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    orgId: `org-${randomUUID()}`,
    memberId: `member-${randomUUID()}`,
  };
  const staffUser: DemoUser = {
    ...user,
    id: `user-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    role: "ORGANISATION_STAFF",
    memberId: `member-${randomUUID()}`,
  };
  const sessionId = randomUUID();
  const otherSessionId = randomUUID();
  const staffSessionId = randomUUID();
  const fullCampaign: Campaign = {
    ...campaign,
    id: `campaign-${randomUUID()}`,
    name: "Full campaign",
    joinCode: `join-${randomUUID()}`,
  };
  const fullUser: DemoUser = {
    ...user,
    id: `user-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    memberId: `member-${randomUUID()}`,
  };
  const fullSessionId = randomUUID();
  store.campaigns.push(campaign);
  store.campaigns.push(fullCampaign);
  store.participants.push(...Array.from({ length: 9 }, (_, index) => ({
    campaignId: fullCampaign.id,
    memberId: `existing-member-${index}`,
    status: "ACTIVE" as const,
    joinedAt: new Date().toISOString(),
  })));
  store.users.push(user, otherOrgUser, staffUser, fullUser);
  sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + 60_000 });
  sessions.set(otherSessionId, { userId: otherOrgUser.id, expiresAt: Date.now() + 60_000 });
  sessions.set(staffSessionId, { userId: staffUser.id, expiresAt: Date.now() + 60_000 });
  sessions.set(fullSessionId, { userId: fullUser.id, expiresAt: Date.now() + 60_000 });

  try {
    const configuredPlan = await beginCampaignSubscriptionPayment({
      campaign,
      planCode: "plan_basic",
      phone: "",
    });
    assert.equal(configuredPlan.code, "plan_basic");
    assert.equal(configuredPlan.price, 1800);
    await assert.rejects(
      beginCampaignSubscriptionPayment({
        campaign,
        planCode: "STANDARD",
        phone: "",
      }),
      /Choose a paid membership tier/,
    );

    const lookup = await handleCampaignRoutes(
      context(`campaigns/code/${encodeURIComponent(campaign.joinCode)}`, "GET"),
    );
    assert.equal(lookup?.status, 200);
    assert.equal((await lookup?.json() as Campaign).id, campaign.id);

    const anonymousJoin = await handleCampaignRoutes(
      context(`campaigns/join/${encodeURIComponent(campaign.joinCode)}`, "POST"),
    );
    assert.equal(anonymousJoin?.status, 401);

    const wrongOrgJoin = await handleCampaignRoutes(
      context(`campaigns/join/${encodeURIComponent(campaign.joinCode)}`, "POST", `fundraise_session=${otherSessionId}`),
    );
    assert.equal(wrongOrgJoin?.status, 403);

    const joined = await handleCampaignRoutes(
      context(`campaigns/join/${encodeURIComponent(campaign.joinCode)}`, "POST", `fundraise_session=${sessionId}`),
    );
    assert.equal(joined?.status, 200);
    assert.equal((await joined?.json() as { alreadyJoined: boolean }).alreadyJoined, false);
    assert.equal(store.participants.filter((participant) => participant.campaignId === campaign.id).length, 1);

    const duplicateJoin = await handleCampaignRoutes(
      context(`campaigns/join/${encodeURIComponent(campaign.joinCode)}`, "POST", `fundraise_session=${sessionId}`),
    );
    assert.equal(duplicateJoin?.status, 200);
    assert.equal((await duplicateJoin?.json() as { alreadyJoined: boolean }).alreadyJoined, true);
    assert.equal(store.participants.filter((participant) => participant.campaignId === campaign.id).length, 1);

    const staffJoin = await handleCampaignRoutes(
      context(`campaigns/join/${encodeURIComponent(campaign.joinCode)}`, "POST", `fundraise_session=${staffSessionId}`),
    );
    assert.equal(staffJoin?.status, 200);
    assert.equal(store.participants.filter((participant) => participant.campaignId === campaign.id).length, 2);

    const fullCampaignJoin = await handleCampaignRoutes(
      context(`campaigns/join/${encodeURIComponent(fullCampaign.joinCode)}`, "POST", `fundraise_session=${fullSessionId}`),
    );
    assert.equal(fullCampaignJoin?.status, 409);
    assert.equal(
      ((await fullCampaignJoin?.json()) as { details: { code: string } }).details.code,
      "CAMPAIGN_MEMBER_LIMIT_REACHED",
    );
    assert.equal(store.participants.filter((participant) => participant.campaignId === fullCampaign.id).length, 9);
    const otherCampaignJoin = await handleCampaignRoutes(
      context(`campaigns/join/${encodeURIComponent(campaign.joinCode)}`, "POST", `fundraise_session=${fullSessionId}`),
    );
    assert.equal(otherCampaignJoin?.status, 200);
    assert.equal(store.participants.filter((participant) => participant.campaignId === campaign.id).length, 3);
  } finally {
    store.campaigns = store.campaigns.filter((item) => item.id !== campaign.id && item.id !== fullCampaign.id);
    store.participants = store.participants.filter((item) => item.campaignId !== campaign.id && item.campaignId !== fullCampaign.id);
    store.users = store.users.filter((item) => item.id !== user.id && item.id !== otherOrgUser.id && item.id !== staffUser.id && item.id !== fullUser.id);
    store.plans = previousPlans;
    sessions.delete(sessionId);
    sessions.delete(otherSessionId);
    sessions.delete(staffSessionId);
    sessions.delete(fullSessionId);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
