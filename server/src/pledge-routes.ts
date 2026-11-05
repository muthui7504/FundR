import { addAudit, authError, body, error, id, isOrgUser, json, numberValue, publicUser, readCookies, requireUser, sessions, store, stringValue, userFromRequest, type ApiRouteContext, type DemoUser } from "./api-context";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, MpesaAccount, Organisation, Plan, Participant, Pledge, Subscription } from "./types";

export async function handlePledgeRoutes(context: ApiRouteContext): Promise<Response | undefined> {
  const { request, url, path, parts, method, setCookie } = context;
  void url;
  if (parts[0] !== "pledges") return undefined;

if (method === "GET" && parts[1] === "me") {
  const user = requireUser(request);
  if (!user?.memberId) return error("Authentication required.", 401);
  const profileIds = store.profiles
    .filter((item) => item.memberId === user.memberId)
    .map((item) => item.id);
  return json(store.pledges.filter((item) => profileIds.includes(item.profileId)));
}
if (method === "POST" && parts.length === 1) {
  const input = await body(request);
  const profile = store.profiles.find((item) => item.id === stringValue(input.profileId));
  const amount = numberValue(input.amount);
  if (
    !profile ||
    stringValue(input.supporterName).length < 2 ||
    !stringValue(input.phone) ||
    !Number.isFinite(amount) ||
    amount < 10 ||
    !stringValue(input.dueDate)
  )
    return error("Profile, supporter details, amount, and due date are required.");
  const pledge: Pledge = {
    id: id("pl"),
    profileId: profile.id,
    campaignId: profile.campaignId,
    supporterName: stringValue(input.supporterName),
    phone: stringValue(input.phone),
    amount,
    dueDate: stringValue(input.dueDate),
    status: "PENDING",
    message: stringValue(input.message) || undefined,
    createdAt: new Date().toISOString(),
  };
  store.pledges.unshift(pledge);
  return json(pledge, 201);
}
if (method === "PATCH" && parts[1]) {
  const user = requireUser(request);
  if (!user?.memberId) return error("Authentication required.", 401);
  const pledge = store.pledges.find((item) => item.id === parts[1]);
  const ownedProfileIds = store.profiles
    .filter((item) => item.memberId === user.memberId)
    .map((item) => item.id);
  if (!pledge || !ownedProfileIds.includes(pledge.profileId))
    return error("Pledge not found.", 404);
  const input = await body(request);
  const allowedStatuses: Pledge["status"][] = [
    "PENDING",
    "DUE_SOON",
    "OVERDUE",
    "FULFILLED",
    "CANCELLED",
    "EXPIRED",
  ];
  if (
    typeof input.status !== "string" ||
    !allowedStatuses.includes(input.status as Pledge["status"])
  )
    return error("A valid pledge status is required.");
  pledge.status = input.status as Pledge["status"];
  addAudit(
    `${user.firstName} ${user.lastName}`,
    "pledge.updated",
    pledge.id,
    "Pledge",
  );
  return json(pledge);
}
if (method === "DELETE" && parts[1]) {
  const user = requireUser(request);
  if (!user?.memberId) return error("Authentication required.", 401);
  const index = store.pledges.findIndex((item) => item.id === parts[1]);
  const pledge = index >= 0 ? store.pledges[index] : undefined;
  const ownsPledge = pledge
    ? store.profiles.some(
        (profile) =>
          profile.id === pledge.profileId &&
          profile.memberId === user.memberId,
      )
    : false;
  if (!pledge || !ownsPledge) return error("Pledge not found.", 404);
  store.pledges.splice(index, 1);
  addAudit(
    `${user.firstName} ${user.lastName}`,
    "pledge.deleted",
    pledge.id,
    "Pledge",
  );
  return json({ success: true });
}

  return undefined;
}
