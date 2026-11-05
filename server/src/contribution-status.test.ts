import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mpesaCredentials, store } from "./api-context";
import { handleContributionRoutes } from "./contribution-routes";
import type { Contribution } from "./types";

test("pending contribution status queries Daraja and marks an approved payment complete", async () => {
  const profileId = `profile-${randomUUID()}`;
  const campaignId = `campaign-${randomUUID()}`;
  const orgId = `org-${randomUUID()}`;
  const contributionId = `contribution-${randomUUID()}`;
  const checkoutRequestId = `ws_CO_${randomUUID()}`;
  const previousFetch = globalThis.fetch;
  const contribution: Contribution = {
    id: contributionId,
    profileId,
    campaignId,
    phone: "254712345678",
    amount: 100,
    status: "PENDING" as const,
    checkoutRequestId,
    createdAt: new Date().toISOString(),
  };
  store.campaigns.push({
    id: campaignId,
    orgId,
    name: "Test campaign",
    shortDescription: "",
    description: "",
    target: 1000,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "2099-12-31",
    status: "ACTIVE",
    joinCode: `join-${randomUUID()}`,
  });
  store.contributions.push(contribution);
  mpesaCredentials.set(orgId, {
    consumerKey: "test-key",
    consumerSecret: "test-secret",
    type: "PAYBILL",
    shortcode: "600000",
    passkey: "test-passkey",
    environment: "SANDBOX",
  });
  globalThis.fetch = async (input) =>
    String(input).includes("/oauth/")
      ? Response.json({ access_token: "test-access-token" })
      : Response.json({
          ResponseCode: "0",
          ResultCode: "0",
          ResultDesc: "The service request is processed successfully.",
        });

  try {
    const response = await handleContributionRoutes({
      request: new Request(
        `http://localhost/api/contributions/${contributionId}`,
      ),
      url: new URL(`http://localhost/api/contributions/${contributionId}`),
      path: `contributions/${contributionId}`,
      parts: ["contributions", contributionId],
      method: "GET",
      setCookie: (sessionId) => sessionId,
    });

    assert.equal(response?.status, 200);
    assert.equal(contribution.status, "COMPLETED");
    assert.equal(contribution.resultCode, 0);
  } finally {
    globalThis.fetch = previousFetch;
    store.contributions = store.contributions.filter(
      (item) => item.id !== contributionId,
    );
    store.campaigns = store.campaigns.filter(
      (campaign) => campaign.id !== campaignId,
    );
    mpesaCredentials.delete(orgId);
  }
});

test("pending contribution stays pending when Daraja says the transaction is still processing", async () => {
  const profileId = `profile-${randomUUID()}`;
  const campaignId = `campaign-${randomUUID()}`;
  const orgId = `org-${randomUUID()}`;
  const contributionId = `contribution-${randomUUID()}`;
  const previousFetch = globalThis.fetch;
  const contribution: Contribution = {
    id: contributionId,
    profileId,
    campaignId,
    phone: "254712345678",
    amount: 100,
    status: "PENDING" as const,
    checkoutRequestId: `ws_CO_${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  store.campaigns.push({
    id: campaignId,
    orgId,
    name: "Test campaign",
    shortDescription: "",
    description: "",
    target: 1000,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "2099-12-31",
    status: "ACTIVE",
    joinCode: `join-${randomUUID()}`,
  });
  store.contributions.push(contribution);
  mpesaCredentials.set(orgId, {
    consumerKey: "test-key",
    consumerSecret: "test-secret",
    type: "PAYBILL",
    shortcode: "600000",
    passkey: "test-passkey",
    environment: "SANDBOX",
  });
  globalThis.fetch = async (input) =>
    String(input).includes("/oauth/")
      ? Response.json({ access_token: "test-access-token" })
      : Response.json({
          ResponseCode: "0",
          ResultCode: "500.001.1001",
          ResultDesc: "The transaction is still under processing",
        });

  try {
    const response = await handleContributionRoutes({
      request: new Request(
        `http://localhost/api/contributions/${contributionId}`,
      ),
      url: new URL(`http://localhost/api/contributions/${contributionId}`),
      path: `contributions/${contributionId}`,
      parts: ["contributions", contributionId],
      method: "GET",
      setCookie: (sessionId) => sessionId,
    });

    assert.equal(response?.status, 200);
    assert.equal(contribution.status, "PENDING");
    assert.equal(contribution.resultCode, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    store.contributions = store.contributions.filter(
      (item) => item.id !== contributionId,
    );
    store.campaigns = store.campaigns.filter(
      (campaign) => campaign.id !== campaignId,
    );
    mpesaCredentials.delete(orgId);
  }
});

test("pending contribution times out after the M-Pesa request window", async () => {
  const profileId = `profile-${randomUUID()}`;
  const campaignId = `campaign-${randomUUID()}`;
  const orgId = `org-${randomUUID()}`;
  const contributionId = `contribution-${randomUUID()}`;
  const previousFetch = globalThis.fetch;
  const contribution: Contribution = {
    id: contributionId,
    profileId,
    campaignId,
    phone: "254712345678",
    amount: 100,
    status: "PENDING" as const,
    checkoutRequestId: `ws_CO_${randomUUID()}`,
    createdAt: new Date(Date.now() - 121_000).toISOString(),
  };
  store.campaigns.push({
    id: campaignId,
    orgId,
    name: "Test campaign",
    shortDescription: "",
    description: "",
    target: 1000,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "2099-12-31",
    status: "ACTIVE",
    joinCode: `join-${randomUUID()}`,
  });
  store.contributions.push(contribution);
  mpesaCredentials.set(orgId, {
    consumerKey: "test-key",
    consumerSecret: "test-secret",
    type: "PAYBILL",
    shortcode: "600000",
    passkey: "test-passkey",
    environment: "SANDBOX",
  });
  globalThis.fetch = async () => {
    throw new Error("A timed-out request should not query Daraja again.");
  };

  try {
    const response = await handleContributionRoutes({
      request: new Request(
        `http://localhost/api/contributions/${contributionId}`,
      ),
      url: new URL(`http://localhost/api/contributions/${contributionId}`),
      path: `contributions/${contributionId}`,
      parts: ["contributions", contributionId],
      method: "GET",
      setCookie: (sessionId) => sessionId,
    });

    assert.equal(response?.status, 200);
    assert.equal(contribution.status, "FAILED");
    assert.equal(contribution.resultCode, 1037);
    assert.match(contribution.failureReason ?? "", /timed out/i);
  } finally {
    globalThis.fetch = previousFetch;
    store.contributions = store.contributions.filter(
      (item) => item.id !== contributionId,
    );
    store.campaigns = store.campaigns.filter(
      (campaign) => campaign.id !== campaignId,
    );
    mpesaCredentials.delete(orgId);
  }
});
