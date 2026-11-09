import { createHash } from "node:crypto";

type DarajaEnvironment = "SANDBOX" | "PRODUCTION";
export type DarajaCredentials = {
  consumerKey: string;
  consumerSecret: string;
  type: "PAYBILL" | "TILL";
  shortcode: string;
  passkey: string;
  environment: DarajaEnvironment;
};

const oauthEndpoint = (environment: DarajaEnvironment) =>
  environment === "PRODUCTION"
    ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const apiBase = (environment: DarajaEnvironment) =>
  environment === "PRODUCTION"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const ACCESS_TOKEN_CACHE_MS = 50 * 60 * 1000;
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

function credentialCacheKey(credentials: DarajaCredentials) {
  return createHash("sha256")
    .update(
      [
        credentials.environment,
        credentials.consumerKey,
        credentials.consumerSecret,
      ].join("\0"),
    )
    .digest("hex");
}

async function accessToken(
  credentials: DarajaCredentials,
  forceRefresh = false,
) {
  const cacheKey = credentialCacheKey(credentials);
  const cached = accessTokens.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now())
    return cached.token;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(oauthEndpoint(credentials.environment), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString("base64")}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
    };
    if (!response.ok || !payload.access_token)
      throw new Error(
        `Daraja rejected the M-Pesa credentials (HTTP ${response.status}).`,
      );
    accessTokens.set(cacheKey, {
      token: payload.access_token,
      expiresAt: Date.now() + ACCESS_TOKEN_CACHE_MS,
    });
    return payload.access_token;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError")
      throw new Error("Timed out while requesting a Daraja access token.");
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

async function darajaRequest(
  credentials: DarajaCredentials,
  url: string,
  body: Record<string, string | number>,
) {
  const send = async (token: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  let response = await send(await accessToken(credentials));
  if (response.status === 401) {
    accessTokens.delete(credentialCacheKey(credentials));
    response = await send(await accessToken(credentials, true));
  }
  return response;
}

export async function initiateStkPush(
  credentials: DarajaCredentials,
  phone: string,
  amount: number,
  accountReference: string,
  callbackUrl: string,
) {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const password = Buffer.from(
    `${credentials.shortcode}${credentials.passkey}${timestamp}`,
  ).toString("base64");
  const response = await darajaRequest(
    credentials,
    `${apiBase(credentials.environment)}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: credentials.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType:
        credentials.type === "TILL"
          ? "CustomerBuyGoodsOnline"
          : "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: credentials.shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference.slice(0, 12),
      TransactionDesc: "FundR subscription",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    CheckoutRequestID?: string;
  };
  if (
    !response.ok ||
    payload.ResponseCode !== "0" ||
    !payload.CheckoutRequestID
  )
    throw new Error(
      payload.ResponseDescription || "Daraja could not send the M-Pesa prompt.",
    );
  return payload.CheckoutRequestID;
}

export async function queryStkPush(
  credentials: DarajaCredentials,
  checkoutRequestId: string,
) {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const password = Buffer.from(
    `${credentials.shortcode}${credentials.passkey}${timestamp}`,
  ).toString("base64");
  const response = await darajaRequest(
    credentials,
    `${apiBase(credentials.environment)}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: credentials.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    ResponseCode?: string;
    ResultCode?: string | number;
    ResponseDescription?: string;
    ResultDesc?: string;
  };
  const resultDescription =
    payload.ResultDesc || payload.ResponseDescription || "";
  if (
    /still\s+(?:under\s+)?processing|being\s+processed|processing\s+is\s+in\s+progress/i.test(
      resultDescription,
    )
  )
    return {
      resultCode: null,
      resultDescription,
    };
  if (
    !response.ok ||
    payload.ResponseCode !== "0" ||
    payload.ResultCode === undefined
  )
    return {
      resultCode: null,
      resultDescription:
        resultDescription || "Daraja is still processing the payment.",
    };
  return {
    resultCode: String(payload.ResultCode),
    resultDescription,
  };
}

export async function verifyDarajaCredentials(
  consumerKey: string,
  consumerSecret: string,
  environment: DarajaEnvironment,
) {
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64",
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(oauthEndpoint(environment), {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    let payload: { access_token?: unknown } = {};
    try {
      payload = (await response.json()) as { access_token?: unknown };
    } catch {
      payload = {};
    }
    if (
      response.ok &&
      typeof payload.access_token === "string" &&
      payload.access_token.length > 0
    )
      return;
    if (response.ok) {
      throw new Error(
        "Daraja returned an invalid credential verification response.",
      );
    }
    if (response.status === 400 || response.status === 401) {
      throw new Error("Daraja rejected the consumer key or consumer secret.");
    }
    throw new Error(
      `Daraja credential verification failed with status ${response.status}.`,
    );
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError")
      throw new Error(
        "Daraja verification timed out. Check the server connection and try again.",
      );
    if (cause instanceof Error) throw cause;
    throw new Error("Unable to verify Daraja credentials.");
  } finally {
    clearTimeout(timeout);
  }
}
