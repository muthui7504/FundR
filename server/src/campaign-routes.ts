import { addAudit, authError, body, completeExpiredCampaigns, error, id, isCampaignEndDateExpired, isOrgUser, json, numberValue, publicUser, readCookies, requireUser, sessions, store, stringValue, userFromRequest, type ApiRouteContext, type DemoUser } from "./api-context";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, MpesaAccount, Organisation, Plan, Participant, Pledge, Subscription } from "./types";
import { getCampaignMembershipOverview, joinCampaign, MembershipError } from "./membership-service";

export async function handleCampaignRoutes(context: ApiRouteContext): Promise<Response | undefined> {
  const { request, url, path, parts, method, setCookie } = context;
  void url;
  if (parts[0] !== "campaigns") return undefined;

const user = requireUser(request);
if (method === "GET" && parts[1] === "mine") {
  if (!user?.memberId) return error("Member access required.", 403);
  return json(
    store.participants.filter((item) => item.memberId === user.memberId),
  );
}
if (method === "POST" && parts[1] === "join") {
  if (!user) return error("Authentication required.", 401);
  const campaign = store.campaigns.find(
    (item) =>
      item.joinCode.toLowerCase() ===
      decodeURIComponent(parts.slice(2).join("/")).toLowerCase(),
  );
  if (!campaign) return error("Campaign code not found.", 404);
  if (campaign.status !== "ACTIVE")
    return error("Campaign code not found.", 404);
  if (
    !user.memberId ||
    (user.role !== "MEMBER" &&
      user.role !== "ORGANISATION_ADMIN" &&
      user.role !== "ORGANISATION_STAFF")
  )
    return error("Member access required.", 403);
  if (user.orgId !== campaign.orgId)
    return error("You can only join campaigns from your organisation.", 403);
  try {
    const result = await joinCampaign(campaign, user.memberId, user.id);
    if (!result.alreadyJoined)
      addAudit(`${user.firstName} ${user.lastName}`, "campaign.joined", campaign.name, "Campaign");
    return json({ success: true, alreadyJoined: result.alreadyJoined, campaign });
  } catch (cause) {
    if (cause instanceof MembershipError) return error(cause.message, cause.status, cause.details);
    throw cause;
  }
}
if (method === "GET" && parts.length === 1)
  return json(
    user?.orgId
      ? store.campaigns.filter((item) => item.orgId === user?.orgId)
      : store.campaigns,
  );
if (method === "GET" && parts[1] === "code" && parts[2]) {
  const campaign = store.campaigns.find(
    (item) =>
      item.joinCode.toLowerCase() ===
      decodeURIComponent(parts.slice(2).join("/")).toLowerCase(),
  );
  return campaign?.status === "ACTIVE"
    ? json(campaign)
    : error("Campaign code not found.", 404);
}
const campaign = store.campaigns.find((item) => item.id === parts[1]);
if (method === "GET" && parts[2] === "membership" && campaign) {
  const canView = user?.role === "PLATFORM_ADMIN" ||
    Boolean(user && isOrgUser(user) && user.orgId === campaign.orgId);
  if (!canView) return error("Organisation staff access required.", user ? 403 : 401);
  return json(await getCampaignMembershipOverview(campaign));
}
if (method === "GET" && parts[2] === "members" && campaign) {
  if (!user) return error("Authentication required.", 401);
  const canView =
    user.role === "PLATFORM_ADMIN" ||
    (isOrgUser(user) && user.orgId === campaign.orgId) ||
    store.participants.some(
      (item) =>
        item.campaignId === campaign.id && item.memberId === user.memberId,
    );
  if (!canView) return error("You do not have permission to view these members.", 403);
  return json(
    Array.from(
      new Map(
        store.participants
      .filter((participant) => participant.campaignId === campaign.id)
      .map((participant) => {
        const member = store.members.find((item) => item.id === participant.memberId);
        const profile =
          store.profiles.find(
            (item) =>
              item.campaignId === campaign.id &&
              item.memberId === participant.memberId,
          ) ?? null;
        const raised = profile
          ? store.contributions
              .filter(
                (item) =>
                  item.profileId === profile.id &&
                  item.status === "COMPLETED",
              )
              .reduce((total, item) => total + item.amount, 0)
          : 0;
        return {
          participant,
          member: member ?? {
            id: participant.memberId,
            name: "Unknown member",
            email: "",
            phone: "",
            role: "MEMBER",
            status: "ACTIVE",
            joinedAt: participant.joinedAt,
          },
          profile,
          raised,
          progress: profile?.target ? Math.min(100, (raised / profile.target) * 100) : 0,
        };
      }).map((item) => [item.member.id, item]),
      ).values(),
    ),
  );
}
if (method === "GET" && parts[2] === "contributions" && campaign) {
  if (!user) return error("Authentication required.", 401);
  const canView =
    user.role === "PLATFORM_ADMIN" ||
    (isOrgUser(user) && user.orgId === campaign.orgId) ||
    store.participants.some(
      (item) =>
        item.campaignId === campaign.id && item.memberId === user.memberId,
    );
  if (!canView) return error("You do not have permission to view these contributions.", 403);
  return json(
    store.contributions
      .filter((item) => item.campaignId === campaign.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}
if (method === "GET" && campaign) return json(campaign);
if (method === "POST" && !parts[1]) {
  if (!user || !isOrgUser(user)) return error("Organisation staff access required.", 403);
  const input = await body(request);
  const created: Campaign = {
    id: id("c"),
    orgId: user.orgId ?? "o1",
    name: stringValue(input.name),
    shortDescription: stringValue(input.shortDescription),
    description: stringValue(input.description),
    target: numberValue(input.target),
    startDate: stringValue(input.startDate),
    endDate: stringValue(input.endDate),
    status: "ACTIVE",
    joinCode: stringValue(input.joinCode) || id("JOIN").toUpperCase(),
    createdAt: new Date().toISOString(),
  };
  if (!created.name || !Number.isFinite(created.target))
    return error("Campaign name and target are required.");
  store.campaigns.push(created);
  completeExpiredCampaigns();
  addAudit(`${user.firstName} ${user.lastName}`, "campaign.created", created.name, "Campaign");
  return json(created, 201);
}
if (method === "PATCH" && campaign) {
  if (!user || !isOrgUser(user)) return error("Organisation staff access required.", 403);
  const input = await body(request);
  const validStatuses = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
  if ("status" in input && !validStatuses.includes(String(input.status)))
    return error("Campaign status is invalid.");
  const updatedEndDate =
    typeof input.endDate === "string" ? input.endDate : campaign.endDate;
  if (
    input.status === "ACTIVE" &&
    isCampaignEndDateExpired(updatedEndDate)
  )
    return error("Update the campaign end date to a future date before activating it.", 422);
  Object.assign(campaign, input);
  completeExpiredCampaigns();
  addAudit(`${user.firstName} ${user.lastName}`, "campaign.updated", campaign.name, "Campaign");
  return json(campaign);
}
if (method === "DELETE" && parts[1]) {
  if (!campaign) return error("Campaign not found.", 404);
  if (!user) return error("Authentication required.", 401);
  if (user.role !== "ORGANISATION_ADMIN" || user.orgId !== campaign.orgId)
    return error("Only an organisation administrator can delete this campaign.", 403);
  store.campaigns = store.campaigns.filter((item) => item.id !== campaign.id);
  store.participants = store.participants.filter((item) => item.campaignId !== campaign.id);
  store.profiles = store.profiles.filter((item) => item.campaignId !== campaign.id);
  store.contributions = store.contributions.filter((item) => item.campaignId !== campaign.id);
  store.pledges = store.pledges.filter((item) => item.campaignId !== campaign.id);
  addAudit(`${user.firstName} ${user.lastName}`, "campaign.deleted", campaign.name, "Campaign");
  return json({ success: true });
}

  return undefined;
}
