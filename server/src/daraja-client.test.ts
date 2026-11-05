import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  initiateStkPush,
  queryStkPush,
  type DarajaCredentials,
} from "./daraja-client";

test("reuses the OAuth token from STK initiation when querying payment status", async () => {
  const credentials: DarajaCredentials = {
    consumerKey: randomUUID(),
    consumerSecret: randomUUID(),
    type: "PAYBILL",
    shortcode: "600000",
    passkey: "integration-test-passkey",
    environment: "SANDBOX",
  };
  const originalFetch = globalThis.fetch;
  let tokenRequests = 0;
  let stkRequests = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/oauth/")) {
      tokenRequests += 1;
      return Response.json({ access_token: "integration-access-token" });
    }
    stkRequests += 1;
    if (String(input).includes("/stkpushquery/"))
      return Response.json({
        ResponseCode: "0",
        ResultCode: "0",
        ResultDesc: "The service request is processed successfully.",
      });
    return Response.json({
      ResponseCode: "0",
      CheckoutRequestID: "ws_CO_test",
    });
  };

  try {
    const checkoutRequestId = await initiateStkPush(
      credentials,
      "254712345678",
      100,
      "TEST123",
      "https://example.test/api/contributions/mpesa/callback",
    );
    const paymentStatus = await queryStkPush(credentials, checkoutRequestId);

    assert.equal(checkoutRequestId, "ws_CO_test");
    assert.equal(paymentStatus.resultCode, "0");
    assert.equal(tokenRequests, 1);
    assert.equal(stkRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps a transaction pending when Daraja reports that it is still processing", async () => {
  const credentials: DarajaCredentials = {
    consumerKey: randomUUID(),
    consumerSecret: randomUUID(),
    type: "PAYBILL",
    shortcode: "600000",
    passkey: "integration-test-passkey",
    environment: "SANDBOX",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).includes("/oauth/")
      ? Response.json({ access_token: "integration-access-token" })
      : Response.json({
          ResponseCode: "0",
          ResultCode: "500.001.1001",
          ResultDesc: "The transaction is still under processing",
        });

  try {
    const paymentStatus = await queryStkPush(credentials, "ws_CO_processing");

    assert.equal(paymentStatus.resultCode, null);
    assert.equal(
      paymentStatus.resultDescription,
      "The transaction is still under processing",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
