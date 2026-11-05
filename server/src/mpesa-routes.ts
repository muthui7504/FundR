import { addAudit, authError, body, databaseEnabled, error, json, mpesaAccounts, mpesaCredentials, persistStore, store, stringValue, type ApiRouteContext } from "./api-context";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, MpesaAccount, Organisation, Plan, Participant, Pledge, Subscription } from "./types";
import { isValidShortcode, normalizeShortcode } from "./mpesa-validation";
import { verifyDarajaCredentials } from "./daraja-client";
import type { DarajaCredentials } from "./daraja-client";
import { encryptDarajaCredentials } from "./mpesa-crypto";

export async function handleMpesaRoutes(context: ApiRouteContext): Promise<Response | undefined> {
  const { request, url, path, parts, method, setCookie } = context;
  void url;
  if (parts[0] !== "mpesa") return undefined;

const user = authError(request, ["ORGANISATION_ADMIN", "ORGANISATION_STAFF"]);
if (user instanceof Response) return user;
if (!user.orgId) return error("Organisation account required.", 403);
if (method === "GET" && parts[1] === "account") return json(store.mpesaAccountsByOrg[user.orgId] ?? mpesaAccounts.get(user.orgId) ?? {
  connected: false,
  type: "PAYBILL",
  shortcode: "",
  accountName: "",
  environment: "SANDBOX",
});
if (method === "POST" && parts[1] === "account" && parts.length === 2) {
  if (user.role !== "ORGANISATION_ADMIN")
    return error("Only organisation administrators can change M-Pesa settings.", 403);
  const input = await body(request);
  const shortcode = normalizeShortcode(input.shortcode);
  const environment: "PRODUCTION" | "SANDBOX" =
    input.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const consumerKey = stringValue(input.key);
  const consumerSecret = stringValue(input.secret);
  if (!isValidShortcode(shortcode))
    return error("Shortcode must contain 5–7 digits.");
  if (!databaseEnabled)
    return error("M-Pesa settings cannot be saved because database persistence is not configured.", 503);
  if (!consumerKey || !consumerSecret)
    return error("Consumer key and consumer secret are required.");
  const credentials = {
    consumerKey,
    consumerSecret,
    type: input.type === "TILL" ? "TILL" as const : "PAYBILL" as const,
    shortcode,
    passkey: stringValue(input.passkey),
    environment,
  } satisfies DarajaCredentials;
  let encryptedCredentials: string;
  try {
    encryptedCredentials = encryptDarajaCredentials(credentials);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Unable to encrypt M-Pesa credentials.", 503);
  }
  try {
    await verifyDarajaCredentials(consumerKey, consumerSecret, environment);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Daraja credential verification failed.", 422);
  }
  const account = {
    connected: true,
    type: input.type === "TILL" ? "TILL" : "PAYBILL",
    shortcode,
    accountName: stringValue(input.accountName),
    environment,
    lastVerified: new Date().toISOString(),
  } satisfies MpesaAccount;
  const previousAccount = store.mpesaAccountsByOrg[user.orgId];
  const previousEncryptedCredentials = store.mpesaCredentialVault[user.orgId];
  store.mpesaAccountsByOrg[user.orgId] = account;
  store.mpesaCredentialVault[user.orgId] = encryptedCredentials;
  try {
    await persistStore();
  } catch {
    if (previousAccount) store.mpesaAccountsByOrg[user.orgId] = previousAccount;
    else delete store.mpesaAccountsByOrg[user.orgId];
    if (previousEncryptedCredentials) store.mpesaCredentialVault[user.orgId] = previousEncryptedCredentials;
    else delete store.mpesaCredentialVault[user.orgId];
    return error("M-Pesa credentials were verified but could not be saved to the database.", 503);
  }
  mpesaAccounts.set(user.orgId, account);
  mpesaCredentials.set(user.orgId, credentials);
  addAudit(
    `${user.firstName} ${user.lastName}`,
    "mpesa.verified",
    `${account.accountName} ${account.shortcode}`,
    "M-Pesa",
  );
  return json(account);
}
if (method === "POST" && parts[1] === "account" && parts[2] === "test") {
  if (user.role !== "ORGANISATION_ADMIN")
    return error("Only organisation administrators can test M-Pesa credentials.", 403);
  const input = await body(request);
  const environment = input.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const consumerKey = stringValue(input.key);
  const consumerSecret = stringValue(input.secret);
  if (!consumerKey || !consumerSecret)
    return error("Enter the consumer key and consumer secret before testing.");
  try {
    await verifyDarajaCredentials(consumerKey, consumerSecret, environment);
    return json({ success: true, message: "Daraja credentials verified successfully." });
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Daraja credential verification failed.", 422);
  }
}
if (method === "POST" && parts[1] === "account" && parts[2] === "disconnect") {
  if (user.role !== "ORGANISATION_ADMIN")
    return error("Only organisation administrators can disconnect M-Pesa.", 403);
  const account = mpesaAccounts.get(user.orgId) ?? {
    connected: false, type: "PAYBILL" as const, shortcode: "", accountName: "", environment: "SANDBOX" as const,
  };
  const disconnected = { ...account, connected: false };
  const previousEncryptedCredentials = store.mpesaCredentialVault[user.orgId];
  store.mpesaAccountsByOrg[user.orgId] = disconnected;
  delete store.mpesaCredentialVault[user.orgId];
  try {
    await persistStore();
  } catch {
    store.mpesaAccountsByOrg[user.orgId] = account;
    if (previousEncryptedCredentials) store.mpesaCredentialVault[user.orgId] = previousEncryptedCredentials;
    return error("Unable to save the M-Pesa disconnection. Please try again.", 503);
  }
  mpesaAccounts.set(user.orgId, disconnected);
  mpesaCredentials.delete(user.orgId);
  return json(disconnected);
}

  return undefined;
}
