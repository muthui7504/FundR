import { addAudit, authError, body, error, id, json, numberValue, publicUser, readCookies, requireUser, sessions, store, stringValue, userFromRequest, type ApiRouteContext, type DemoUser } from "./api-context";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, MpesaAccount, Organisation, Plan, Participant, Pledge, Subscription } from "./types";
import { databaseEnabled } from "./api-context";
import { listOrganisationMemberships } from "./membership-service";

export async function handleOrganisationRoutes(context: ApiRouteContext): Promise<Response | undefined> {
  const { request, url, path, parts, method, setCookie } = context;
  void url;
  if (parts[0] !== "organisations") return undefined;

const user = authError(request, ["ORGANISATION_ADMIN", "ORGANISATION_STAFF", "MEMBER"]);
if (user instanceof Response) return user;
const org = store.organisations.find((item) => item.id === (user.orgId ?? "o1"));
if (!org) return error("Organisation not found.", 404);
if (method === "GET" && parts.length === 2) return json(org);
if (method === "PATCH" && parts.length === 2) {
  if (user.role !== "ORGANISATION_ADMIN")
    return error("Only organisation administrators can update organisation details.", 403);
  const input = await body(request);
  Object.assign(org, {
    name: stringValue(input.name) || org.name,
    description: stringValue(input.description) || org.description,
    email: stringValue(input.email) || org.email,
    phone: stringValue(input.phone) || org.phone,
    website: stringValue(input.website),
    city: stringValue(input.city) || org.city,
    address: stringValue(input.address) || org.address,
  });
  addAudit(
    `${user.firstName} ${user.lastName}`,
    "organisation.updated",
    org.name,
    "Organisation",
  );
  return json(org);
}
if (method === "GET" && parts[2] === "members") {
  if (databaseEnabled) {
    const memberships = await listOrganisationMemberships(org.id);
    return json(memberships.map((item) => ({
      id: item.memberId,
      name: item.name,
      email: item.email,
      phone: item.phone,
      role: item.role,
      status: item.status,
      joinedAt: item.joinedAt.toISOString().slice(0, 10),
    })));
  }
  const organisationMemberIds = new Set(
    store.users
      .filter((account) => account.orgId === org.id && account.memberId)
      .map((account) => account.memberId as string),
  );
  for (const participant of store.participants) {
    const campaign = store.campaigns.find((item) => item.id === participant.campaignId);
    if (campaign?.orgId === org.id) organisationMemberIds.add(participant.memberId);
  }

  const members = Array.from(organisationMemberIds).map((memberId) => {
    const member = store.members.find((item) => item.id === memberId);
    if (member) return member;
    const account = store.users.find((item) => item.memberId === memberId);
    return {
      id: memberId,
      name: account ? `${account.firstName} ${account.lastName}`.trim() : "Unknown member",
      email: account?.email ?? "",
      phone: "",
      role: "MEMBER" as const,
      status: "ACTIVE" as const,
      joinedAt: new Date().toISOString(),
    };
  });
  return json(members);
}
if (method === "GET" && parts[2] === "dashboard") {
  const campaigns = store.campaigns.filter((item) => item.orgId === org.id);
  const campaignIds = new Set(campaigns.map((item) => item.id));
  const participants = store.participants.filter((item) => campaignIds.has(item.campaignId));
  const contributions = store.contributions.filter((item) => campaignIds.has(item.campaignId));
  const organisationMemberIds = new Set(
    store.users
      .filter((account) => account.orgId === org.id && account.memberId)
      .map((account) => account.memberId as string),
  );
  for (const participant of participants) organisationMemberIds.add(participant.memberId);
  const memberships = databaseEnabled
    ? await listOrganisationMemberships(org.id)
    : undefined;
  const members = memberships
    ? memberships.map((item) => ({
        id: item.memberId,
        name: item.name,
        email: item.email,
        phone: item.phone,
        role: item.role as Member["role"],
        status: item.status as Member["status"],
        joinedAt: item.joinedAt.toISOString().slice(0, 10),
      }))
    : Array.from(organisationMemberIds)
        .map((memberId) => store.members.find((item) => item.id === memberId))
        .filter((member): member is Member => Boolean(member));
  return json({
    organisation: org,
    campaigns,
    members,
    participants,
    contributions,
  });
}

  return undefined;
}
