import assert from "node:assert/strict";
import test from "node:test";
import { sendEmailVerificationCode } from "./email-service";

test("Brevo sends verification email through its HTTPS API", async () => {
  const originalApiKey = process.env.BREVO_API_KEY;
  const originalFrom = process.env.SMTP_FROM;
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;

  process.env.BREVO_API_KEY = "brevo-test-key";
  process.env.SMTP_FROM = "verified@example.test";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(null, { status: 201 });
  };

  try {
    await sendEmailVerificationCode("member@example.test", "Sam <Member>", "123456");
    assert.equal(requestUrl, "https://api.brevo.com/v3/smtp/email");
    assert.equal(requestHeaders?.get("api-key"), "brevo-test-key");
    assert.deepEqual(requestBody?.sender, {
      email: "verified@example.test",
      name: "Fundraise",
    });
    assert.deepEqual(requestBody?.to, [
      { email: "member@example.test", name: "Sam <Member>" },
    ]);
    assert.match(String(requestBody?.htmlContent), /Sam &lt;Member&gt;/);
    assert.match(String(requestBody?.textContent), /123456/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = originalFrom;
  }
});

test("Brevo errors are surfaced without exposing API response contents", async () => {
  const originalApiKey = process.env.BREVO_API_KEY;
  const originalFrom = process.env.SMTP_FROM;
  const originalFetch = globalThis.fetch;
  process.env.BREVO_API_KEY = "brevo-test-key";
  process.env.SMTP_FROM = "verified@example.test";
  globalThis.fetch = async () => new Response("sensitive provider details", { status: 401 });

  try {
    await assert.rejects(
      sendEmailVerificationCode("member@example.test", "Sam", "123456"),
      /Brevo email API request failed with status 401/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = originalFrom;
  }
});
