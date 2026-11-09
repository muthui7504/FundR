import { addAudit, authError, body, error, id, isOrgUser, json, numberValue, publicUser, readCookies, requireUser, sessions, store, stringValue, userFromRequest, type ApiRouteContext, type DemoUser } from "./api-context";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, MpesaAccount, Organisation, Plan, Participant, Pledge, Subscription } from "./types";
import { ProfileImageError, readProfileImage, saveProfileImage } from "./profile-image-storage";

export async function handleFundraisingProfileRoutes(context: ApiRouteContext): Promise<Response | undefined> {
  const { request, url, path, parts, method, setCookie } = context;
  void url;
  if (parts[0] !== "fundraising-profiles") return undefined;

const user = requireUser(request);
if (method === "GET" && parts[1] === "images" && parts[2]) {
  try {
    const image = await readProfileImage(decodeURIComponent(parts[2]));
    if (!image) return error("Fundraising image not found.", 404);
    return new Response(image.image, {
      headers: {
        "content-type": image.contentType,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      return error("Fundraising image not found.", 404);
    throw cause;
  }
}
if (method === "GET" && parts[1] === "slug") {
  const profile = store.profiles.find(
    (item) =>
      item.slug === decodeURIComponent(parts.slice(2).join("/")) && item.status === "PUBLISHED",
  );
  if (!profile) return error("Fundraising profile not found.", 404);
  const campaign = store.campaigns.find((item) => item.id === profile.campaignId);
  if (!campaign || campaign.status !== "ACTIVE")
    return error("Fundraising profile not found.", 404);
  const member = store.members.find((item) => item.id === profile.memberId);
  const organisation = store.organisations.find((item) => item.id === campaign.orgId);
  if (!member || !organisation) return error("Fundraising profile data is incomplete.", 500);
  return json({
    profile,
    campaign,
    member,
    organisation,
    contributions: store.contributions
      .filter((item) => item.profileId === profile.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}
if (method === "GET" && parts[1] === "me") {
  if (!user) return error("Authentication required.", 401);
  return json(store.profiles.filter((item) => item.memberId === user.memberId));
}
if (method === "POST" && parts.length === 1) {
  if (!user?.memberId) return error("Member access required.", 403);
  const input = await body(request);
  const created: FundraisingProfile = {
    id: id("p"),
    slug: stringValue(input.slug) || id("profile"),
    memberId: user.memberId,
    campaignId: stringValue(input.campaignId),
    title: stringValue(input.title),
    message: stringValue(input.message),
    target: Number.isFinite(numberValue(input.target)) ? numberValue(input.target) : undefined,
    status: input.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
  };
  if (!created.campaignId || !created.title || !created.message)
    return error("Campaign, title, and message are required.");
  const campaign = store.campaigns.find((item) => item.id === created.campaignId);
  if (!campaign || campaign.status !== "ACTIVE")
    return error("Fundraising pages can only be created for active campaigns.", 400);
  const organisation = store.organisations.find((item) => item.id === campaign.orgId);
  created.coverImageUrl =
    organisation?.logoUrl || campaign.coverImageUrl || campaign.imageUrls?.[0];
  const participant = store.participants.find(
    (item) =>
      item.campaignId === campaign.id &&
      item.memberId === user.memberId &&
      item.status === "ACTIVE",
  );
  if (!participant)
    return error("Join this active campaign before creating a fundraising page.", 403);
  if (
    store.profiles.some(
      (item) =>
        item.campaignId === campaign.id && item.memberId === user.memberId,
    )
  )
    return error("You already have a page for this campaign.", 409);
  try {
    if (input.avatarImage !== undefined)
      created.avatarUrl = await saveProfileImage(input.avatarImage);
  } catch (cause) {
    if (cause instanceof ProfileImageError) return error(cause.message, 400);
    throw cause;
  }
  store.profiles.push(created);
  return json(created, 201);
}
if (method === "PATCH" && parts[1]) {
  if (!user) return error("Authentication required.", 401);
  const profile = store.profiles.find((item) => item.id === parts[1]);
  if (!profile || profile.memberId !== user.memberId) return error("Profile not found.", 404);
  const input = await body(request);
  const campaign = store.campaigns.find((item) => item.id === profile.campaignId);
  const organisation = campaign
    ? store.organisations.find((item) => item.id === campaign.orgId)
    : undefined;
  profile.coverImageUrl = campaign
    ? organisation?.logoUrl || campaign.coverImageUrl || campaign.imageUrls?.[0]
    : undefined;
  try {
    if (input.avatarImage !== undefined)
      profile.avatarUrl = await saveProfileImage(input.avatarImage);
  } catch (cause) {
    if (cause instanceof ProfileImageError) return error(cause.message, 400);
    throw cause;
  }
  delete input.avatarImage;
  delete input.coverImage;
  delete input.avatarUrl;
  delete input.coverImageUrl;
  Object.assign(profile, input);
  return json(profile);
}

  return undefined;
}
