import { completeExpiredCampaigns, databaseEnabled, ensureDatabase, error, persistStore, sessionDurationForRole, type ApiRouteContext } from "./api-context";
import { handleAuthRoutes } from "./auth-routes";
import { handleOrganisationRoutes } from "./organisation-routes";
import { handleCampaignRoutes } from "./campaign-routes";
import { handleFundraisingProfileRoutes } from "./fundraising-profile-routes";
import { handleContributionRoutes } from "./contribution-routes";
import { handlePledgeRoutes } from "./pledge-routes";
import { handleMpesaRoutes } from "./mpesa-routes";
import { handlePlatformRoutes } from "./platform-routes";
import { handleMembershipRoutes } from "./membership-routes";
const routeHandlers = [handleMembershipRoutes, handleAuthRoutes, handlePlatformRoutes, handleOrganisationRoutes, handleCampaignRoutes, handleFundraisingProfileRoutes, handleContributionRoutes, handlePledgeRoutes, handleMpesaRoutes];
async function handleApiRequest(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api")) return undefined;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": url.origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" } });
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const context: ApiRouteContext = { request, url, path, parts: path ? path.split("/") : [], method: request.method, setCookie: (sessionId, role = "ORGANISATION_ADMIN") => `fundraise_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}; Max-Age=${Math.floor(sessionDurationForRole(role) / 1000)}` };
  for (const handler of routeHandlers) { const response = await handler(context); if (response) return response; }
  return error("API route not found.", 404);
}
export async function handleDemoApi(request: Request): Promise<Response | undefined> {
  if (!request.url.includes("/api")) return undefined;
  await ensureDatabase();
  completeExpiredCampaigns();
  const response = await handleApiRequest(request);
  completeExpiredCampaigns();
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const pathParts = path.split("/");
  const normalizedMutationPath = path.replace(/\/[^/]+$/, "/*");
  const campaignMutationPersisted =
    pathParts[0] === "campaigns" &&
    request.method === "POST" &&
    (pathParts[1] === "join" || pathParts[2] === "membership");
  const manualCampaignPayment =
    pathParts[0] === "platform" &&
    pathParts[1] === "campaigns" &&
    pathParts[3] === "membership" &&
    pathParts[4] === "manual-payment" &&
    request.method === "POST";
  const transactionPersisted =
    [
      "auth/register",
      "auth/register/resend",
      "auth/verify-email",
      "auth/google",
      "platform/accounts",
      "organisations/current/invitations",
      "organisations/current/invitations/*",
      "organisations/current/members/*",
      "subscriptions/mpesa/callback",
    ].includes(path) ||
    [
      "organisations/current/invitations/*",
      "organisations/current/members/*",
    ].includes(normalizedMutationPath) ||
    campaignMutationPersisted ||
    manualCampaignPayment;
  if (!databaseEnabled || !transactionPersisted) await persistStore();
  return response;
}
