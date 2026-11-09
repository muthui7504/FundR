import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./config/prisma";
import {
  databaseEnabled,
  id,
  isCampaignEndDateExpired,
  store,
  type DemoUser,
} from "./api-context";
import {
  findMembershipTier,
  requiredMembershipTier,
} from "./membership-tiers";
export {
  findMembershipTier,
  requiredMembershipTier,
} from "./membership-tiers";
import type { PaidMembershipTier } from "./membership-tiers";
export type { MembershipTier, PaidMembershipTier } from "./membership-tiers";
import type {
  Campaign,
  Member,
  MembershipRole,
  MembershipStatus,
  Organisation,
  Participant,
} from "./types";

type Transaction = Prisma.TransactionClient;

export const campaignLimitMessage =
  "This campaign has reached its member limit. Its organisation must upgrade this campaign's subscription before more members can join.";

const UNCONFIGURED_TIER = {
  code: "UNCONFIGURED",
  name: "No plan configured",
  minMembers: 0,
  maxMembers: 0,
  price: null,
};

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

async function lockOrganisation(tx: Transaction, orgId: string) {
  await tx.$executeRaw`
    INSERT INTO "MembershipCapacityLock" ("orgId", "updatedAt")
    VALUES (${orgId}, CURRENT_TIMESTAMP)
    ON CONFLICT ("orgId") DO NOTHING
  `;
  await tx.$queryRaw<Array<{ orgId: string }>>`
    SELECT "orgId" FROM "MembershipCapacityLock" WHERE "orgId" = ${orgId} FOR UPDATE
  `;
}

async function lockCampaign(tx: Transaction, campaignId: string) {
  await tx.$executeRaw`
    INSERT INTO "CampaignCapacityLock" ("campaignId", "updatedAt")
    VALUES (${campaignId}, CURRENT_TIMESTAMP)
    ON CONFLICT ("campaignId") DO NOTHING
  `;
  await tx.$queryRaw<Array<{ campaignId: string }>>`
    SELECT "campaignId" FROM "CampaignCapacityLock" WHERE "campaignId" = ${campaignId} FOR UPDATE
  `;
}

async function ensureCampaignSubscription(tx: Transaction, campaign: Campaign) {
  const existing = await tx.campaignSubscription.findUnique({
    where: { campaignId: campaign.id },
  });
  if (existing) return existing;
  const now = new Date();
  return tx.campaignSubscription.create({
    data: {
      id: randomUUID(),
      campaignId: campaign.id,
      orgId: campaign.orgId,
      planCode: UNCONFIGURED_TIER.code,
      status: "SUSPENDED",
      verifiedAt: now,
      startsAt: now,
      expiresAt: new Date("9999-12-31T23:59:59.999Z"),
    },
  });
}

async function assertCampaignCapacity(
  tx: Transaction,
  campaignId: string,
  resultingMemberCount: number,
) {
  const subscription = await tx.campaignSubscription.findUnique({
    where: { campaignId },
  });
  const now = new Date();
  const validSubscription =
    subscription?.status === "ACTIVE" &&
    subscription.verifiedAt !== null &&
    subscription.startsAt <= now &&
    subscription.expiresAt > now;
  const activeTier = validSubscription
    ? (findMembershipTier(subscription.planCode, store.plans) ?? UNCONFIGURED_TIER)
    : UNCONFIGURED_TIER;
  if (
    activeTier.maxMembers !== null &&
    resultingMemberCount > activeTier.maxMembers
  ) {
    const requiredTier = requiredMembershipTier(
      resultingMemberCount,
      store.plans,
    );
    throw new MembershipError(campaignLimitMessage, 409, {
      code: "CAMPAIGN_MEMBER_LIMIT_REACHED",
      activeMemberCount: resultingMemberCount - 1,
      activePlan: activeTier.code,
      requiredPlan: requiredTier?.code ?? null,
    });
  }
}

function isRetryableTransactionError(cause: unknown) {
  if (
    cause instanceof Prisma.PrismaClientKnownRequestError &&
    cause.code === "P2034"
  )
    return true;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    ((cause as { code?: string }).code === "40001" ||
      (cause as { code?: string }).code === "40P01")
  );
}

async function withRetryableTransaction<T>(
  callback: (tx: Transaction) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 15_000,
      });
    } catch (cause) {
      if (!isRetryableTransactionError(cause) || attempt >= 2) throw cause;
    }
  }
}

function toMembership(user: DemoUser, member: Member) {
  if (!user.orgId || !user.memberId) return undefined;
  return {
    id: randomUUID(),
    orgId: user.orgId,
    userId: user.id,
    memberId: user.memberId,
    name: member.name,
    email: member.email,
    phone: member.phone,
    role: member.role,
    status: member.status,
    joinedAt: new Date(member.joinedAt),
  };
}

export async function bootstrapMembershipRecords() {
  if (!databaseEnabled) return;
  await withRetryableTransaction(async (tx) => {
    if (store.users.length) {
      await tx.appUser.createMany({
        data: store.users.map((user) => ({
          id: user.id,
          email: user.email.toLowerCase(),
          password: user.password,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          orgId: user.orgId,
          memberId: user.memberId,
        })),
        skipDuplicates: true,
      });
    }
    const membersById = new Map(
      store.members.map((member) => [member.id, member]),
    );
    const memberships = store.users.flatMap((user) => {
      const member = user.memberId ? membersById.get(user.memberId) : undefined;
      if (!user.orgId || !user.memberId || !member) return [];
      const membership = toMembership(user, member);
      return membership ? [membership] : [];
    });
    const orgIds = Array.from(
      new Set(memberships.map((membership) => membership.orgId)),
    );
    if (orgIds.length) {
      await tx.membershipCapacityLock.createMany({
        data: orgIds.map((orgId) => ({ orgId })),
        skipDuplicates: true,
      });
      await tx.organisationMembership.createMany({
        data: memberships,
        skipDuplicates: true,
      });
    }
    if (store.participants.length) {
      await tx.campaignParticipant.createMany({
        data: store.participants.map((participant) => ({
          id: randomUUID(),
          campaignId: participant.campaignId,
          memberId: participant.memberId,
          status: participant.status,
          joinedAt: new Date(participant.joinedAt),
        })),
        skipDuplicates: true,
      });
    }
    if (store.campaigns.length) {
      const now = new Date();
      await tx.campaignSubscription.createMany({
        data: store.campaigns.map((campaign) => ({
          id: randomUUID(),
          campaignId: campaign.id,
          orgId: campaign.orgId,
          planCode: UNCONFIGURED_TIER.code,
          status: "SUSPENDED",
          verifiedAt: now,
          startsAt: now,
          expiresAt: new Date("9999-12-31T23:59:59.999Z"),
        })),
        skipDuplicates: true,
      });
      await tx.campaignCapacityLock.createMany({
        data: store.campaigns.map((campaign) => ({ campaignId: campaign.id })),
        skipDuplicates: true,
      });
    }
  });
  const [accounts, memberships, participants] = await prisma.$transaction([
    prisma.appUser.findMany(),
    prisma.organisationMembership.findMany(),
    prisma.campaignParticipant.findMany(),
  ]);
  for (const account of accounts) {
    const user: DemoUser = {
      id: account.id,
      email: account.email,
      password: account.password,
      firstName: account.firstName,
      lastName: account.lastName,
      role: account.role as DemoUser["role"],
      ...(account.orgId ? { orgId: account.orgId } : {}),
      ...(account.memberId ? { memberId: account.memberId } : {}),
    };
    const index = store.users.findIndex((item) => item.id === user.id);
    if (index < 0) store.users.push(user);
    else store.users[index] = user;
  }
  for (const membership of memberships) {
    const member: Member = {
      id: membership.memberId,
      name: membership.name,
      email: membership.email,
      phone: membership.phone,
      role: membership.role as MembershipRole,
      status: membership.status as MembershipStatus,
      joinedAt: membership.joinedAt.toISOString().slice(0, 10),
    };
    const index = store.members.findIndex((item) => item.id === member.id);
    if (index < 0) store.members.push(member);
    else store.members[index] = member;
  }
  const currentParticipants = new Map(
    store.participants.map((participant) => [
      `${participant.campaignId}:${participant.memberId}`,
      participant,
    ]),
  );
  for (const participant of participants) {
    const restored: Participant = {
      campaignId: participant.campaignId,
      memberId: participant.memberId,
      status: participant.status as Participant["status"],
      joinedAt: participant.joinedAt.toISOString(),
    };
    currentParticipants.set(
      `${restored.campaignId}:${restored.memberId}`,
      restored,
    );
  }
  store.participants = Array.from(currentParticipants.values());
}

export async function registerOrganisationAdmin(
  user: DemoUser,
  member: Member,
  organisation: Organisation,
) {
  if (!databaseEnabled) return;
  await withRetryableTransaction(async (tx) => {
    await lockOrganisation(tx, organisation.id);
    await tx.appUser.create({
      data: {
        id: user.id,
        email: user.email.toLowerCase(),
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        orgId: organisation.id,
        memberId: user.memberId,
      },
    });
    await tx.organisationMembership.create({
      data: {
        ...toMembership(user, member)!,
        orgId: organisation.id,
        role: "ADMIN",
      },
    });
    await tx.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "AppState" WHERE "key" = 'main' FOR UPDATE
    `;
    const saved = await tx.appState.findUnique({ where: { key: "main" } });
    if (saved) {
      const current = saved.data as Record<string, unknown>;
      await tx.appState.update({
        where: { key: "main" },
        data: {
          data: {
            ...current,
            users: [
              ...(Array.isArray(current.users) ? current.users : []),
              user,
            ],
            members: [
              ...(Array.isArray(current.members) ? current.members : []),
              member,
            ],
            organisations: [
              ...(Array.isArray(current.organisations)
                ? current.organisations
                : []),
              organisation,
            ],
          } as Prisma.InputJsonValue,
        },
      });
    }
  });
}

export async function registerPlatformAdministrator(user: DemoUser) {
  if (!databaseEnabled) return;
  await withRetryableTransaction(async (tx) => {
    await tx.appUser.create({
      data: {
        id: user.id,
        email: user.email.toLowerCase(),
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
    await tx.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "AppState" WHERE "key" = 'main' FOR UPDATE
    `;
    const saved = await tx.appState.findUnique({ where: { key: "main" } });
    if (saved) {
      const current = saved.data as Record<string, unknown>;
      await tx.appState.update({
        where: { key: "main" },
        data: {
          data: {
            ...current,
            users: [
              ...(Array.isArray(current.users) ? current.users : []),
              user,
            ],
          } as Prisma.InputJsonValue,
        },
      });
    }
  });
}

export async function createOrganisationInvitation(
  orgId: string,
  createdBy: string,
  email?: string,
) {
  const token = createInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = await prisma.organisationInvitation.create({
    data: {
      id: randomUUID(),
      orgId,
      tokenHash: hashInvitationToken(token),
      email: email?.trim().toLowerCase() || null,
      createdBy,
      expiresAt,
    },
  });
  return {
    id: invitation.id,
    token,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function validateOrganisationInvitation(
  token: string,
  campaignCode?: string,
) {
  const invitation = await prisma.organisationInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
  });
  if (!invitation || invitation.revokedAt || invitation.expiresAt <= new Date())
    throw new MembershipError(
      "This invitation is invalid, expired, or has been revoked.",
      404,
    );
  const organisation = store.organisations.find(
    (item) => item.id === invitation.orgId,
  );
  if (!organisation || organisation.status !== "ACTIVE")
    throw new MembershipError(
      "This organisation is not currently accepting members.",
      404,
    );
  let campaignMembership:
    Awaited<ReturnType<typeof getCampaignMembershipOverview>> | undefined;
  if (campaignCode) {
    const campaign = store.campaigns.find(
      (item) =>
        item.joinCode.toLowerCase() === campaignCode.toLowerCase() &&
        item.orgId === invitation.orgId &&
        item.status === "ACTIVE",
    );
    if (!campaign)
      throw new MembershipError(
        "The campaign does not belong to this invitation.",
        404,
      );
    campaignMembership = await getCampaignMembershipOverview(campaign);
  }
  const activeCampaigns = await Promise.all(
    store.campaigns
      .filter(
        (campaign) =>
          campaign.orgId === invitation.orgId &&
          campaign.status === "ACTIVE" &&
          !isCampaignEndDateExpired(campaign.endDate),
      )
      .map(async (campaign) => {
        const membership = await getCampaignMembershipOverview(campaign);
        return {
          id: campaign.id,
          name: campaign.name,
          shortDescription: campaign.shortDescription,
          endDate: campaign.endDate,
          joinCode: campaign.joinCode,
          coverImageUrl: campaign.coverImageUrl,
          activeMemberCount: membership.activeMemberCount,
          maxMembers: membership.maxMembers,
          remainingCapacity: membership.remainingCapacity,
          canJoin: !membership.atLimit,
        };
      }),
  );
  return {
    organisationId: invitation.orgId,
    organisation: {
      name: organisation.name,
      email: organisation.email,
      phone: organisation.phone,
    },
    invitedEmail: invitation.email,
    expiresAt: invitation.expiresAt.toISOString(),
    canJoin: campaignMembership ? !campaignMembership.atLimit : true,
    ...(campaignMembership ? { campaignMembership } : {}),
    activeCampaigns,
  };
}

export async function acceptOrganisationInvitation(
  token: string,
  userId: string,
) {
  const tokenHash = hashInvitationToken(token);
  const preview = await prisma.organisationInvitation.findUnique({
    where: { tokenHash },
  });
  if (!preview || preview.revokedAt || preview.expiresAt <= new Date())
    throw new MembershipError(
      "This invitation is invalid, expired, or has been revoked.",
      404,
    );
  const organisation = store.organisations.find(
    (item) => item.id === preview.orgId,
  );
  if (!organisation || organisation.status !== "ACTIVE")
    throw new MembershipError(
      "This organisation is not currently accepting members.",
      404,
    );
  const accountPreview = await prisma.appUser.findUnique({
    where: { id: userId },
    include: { memberships: true },
  });
  if (!accountPreview || accountPreview.role !== "MEMBER")
    throw new MembershipError("Member access is required to accept this invitation.", 403);
  if (
    preview.email &&
    preview.email.trim().toLowerCase() !== accountPreview.email.toLowerCase()
  )
    throw new MembershipError(
      "This invitation was issued to a different email address.",
      403,
    );
  if (accountPreview.orgId && accountPreview.orgId !== preview.orgId)
    throw new MembershipError(
      "This account already belongs to another organisation. Use an account that belongs to the invited organisation.",
      409,
    );
  if (
    accountPreview.memberships.some(
      (membership) =>
        membership.orgId !== preview.orgId && membership.status === "ACTIVE",
    )
  )
    throw new MembershipError(
      "This account already belongs to another organisation. Use an account that belongs to the invited organisation.",
      409,
    );

  const accepted = await withRetryableTransaction(async (tx) => {
    await lockOrganisation(tx, preview.orgId);
    await tx.$queryRaw`
      SELECT "id"
      FROM "AppUser"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    const [invitation, account] = await Promise.all([
      tx.organisationInvitation.findUnique({ where: { tokenHash } }),
      tx.appUser.findUnique({
        where: { id: userId },
        include: { memberships: true },
      }),
    ]);
    if (!invitation || invitation.revokedAt || invitation.expiresAt <= new Date())
      throw new MembershipError(
        "This invitation is invalid, expired, or has been revoked.",
        404,
      );
    if (!account || account.role !== "MEMBER")
      throw new MembershipError("Member access is required to accept this invitation.", 403);
    if (
      invitation.email &&
      invitation.email.trim().toLowerCase() !== account.email.toLowerCase()
    )
      throw new MembershipError(
        "This invitation was issued to a different email address.",
        403,
      );
    if (account.orgId && account.orgId !== invitation.orgId)
      throw new MembershipError(
        "This account already belongs to another organisation. Use an account that belongs to the invited organisation.",
        409,
      );
    if (
      account.memberships.some(
        (membership) =>
          membership.orgId !== invitation.orgId && membership.status === "ACTIVE",
      )
    )
      throw new MembershipError(
        "This account already belongs to another organisation. Use an account that belongs to the invited organisation.",
        409,
      );

    const existingMembership = account.memberships.find(
      (membership) => membership.orgId === invitation.orgId,
    );
    if (existingMembership && existingMembership.status !== "ACTIVE")
      throw new MembershipError(
        "Your membership in this organisation is not active. Contact an administrator for help.",
        403,
      );
    const memberId = existingMembership?.memberId ?? account.memberId ?? id("m");
    const memberName = `${account.firstName} ${account.lastName}`.trim();
    const existingMember = store.members.find((member) => member.id === memberId);
    const member: Member = {
      id: memberId,
      name: existingMembership?.name ?? existingMember?.name ?? memberName,
      email: account.email,
      phone: existingMembership?.phone ?? existingMember?.phone ?? "",
      role: "MEMBER",
      status: "ACTIVE",
      joinedAt: (
        existingMembership?.joinedAt ?? new Date()
      ).toISOString().slice(0, 10),
    };

    if (!existingMembership) {
      const user: DemoUser = {
        id: account.id,
        email: account.email,
        password: account.password,
        firstName: account.firstName,
        lastName: account.lastName,
        role: "MEMBER",
        orgId: invitation.orgId,
        memberId,
      };
      const membership = toMembership(user, member);
      if (!membership)
        throw new MembershipError("Unable to create the organisation membership.", 500);
      await tx.organisationMembership.create({ data: membership });
      await tx.membershipAudit.create({
        data: {
          id: randomUUID(),
          orgId: invitation.orgId,
          actorId: account.id,
          action: "member.invitation_accepted",
          targetId: memberId,
        },
      });
    }
    if (account.orgId !== invitation.orgId || account.memberId !== memberId) {
      await tx.appUser.update({
        where: { id: account.id },
        data: { orgId: invitation.orgId, memberId },
      });
    }

    await tx.$executeRaw`
      UPDATE "OrganisationInvitation"
      SET "acceptedAt" = COALESCE("acceptedAt", NOW())
      WHERE "id" = ${invitation.id}
    `;
    return {
      user: {
        id: account.id,
        email: account.email,
        password: account.password,
        firstName: account.firstName,
        lastName: account.lastName,
        role: "MEMBER" as const,
        orgId: invitation.orgId,
        memberId,
      },
      member,
    };
  });

  const cachedUserIndex = store.users.findIndex((user) => user.id === accepted.user.id);
  if (cachedUserIndex < 0) store.users.push(accepted.user);
  else store.users[cachedUserIndex] = accepted.user;
  const cachedMemberIndex = store.members.findIndex(
    (member) => member.id === accepted.member.id,
  );
  if (cachedMemberIndex < 0) store.members.push(accepted.member);
  else store.members[cachedMemberIndex] = accepted.member;
  return accepted.user;
}

export async function revokeOrganisationInvitation(
  orgId: string,
  invitationId: string,
) {
  const invitation = await prisma.organisationInvitation.findFirst({
    where: { id: invitationId, orgId, revokedAt: null },
  });
  if (!invitation) throw new MembershipError("Invitation not found.", 404);
  await prisma.organisationInvitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  });
}

export async function listOrganisationMemberships(orgId: string) {
  const [memberships, invitations] = await Promise.all([
    prisma.organisationMembership.findMany({
      where: { orgId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.$queryRaw<
      Array<{
        id: string;
        email: string | null;
        createdAt: Date;
        expiresAt: Date;
      }>
    >`
      SELECT "id", "email", "createdAt", "expiresAt"
      FROM "OrganisationInvitation"
      WHERE "orgId" = ${orgId}
        AND ("acceptedAt" IS NULL OR "email" IS NULL)
        AND "revokedAt" IS NULL
        AND "expiresAt" > ${new Date()}
      ORDER BY "createdAt" DESC
    `,
  ]);
  return [
    ...memberships.map((membership) => ({
      memberId: membership.memberId,
      name: membership.name,
      email: membership.email,
      phone: membership.phone,
      role: membership.role as MembershipRole,
      status: membership.status as MembershipStatus,
      joinedAt: membership.joinedAt,
      invitationId: undefined,
      invitationExpiresAt: undefined,
    })),
    ...invitations.map((invitation) => ({
      memberId: `invitation:${invitation.id}`,
      name: invitation.email ?? "Open invitation link",
      email: invitation.email ?? "",
      phone: "",
      role: "MEMBER" as const,
      status: "INVITED" as const,
      joinedAt: invitation.createdAt,
      invitationId: invitation.id,
      invitationExpiresAt: invitation.expiresAt,
    })),
  ];
}

export async function updateOrganisationMembership(
  orgId: string,
  memberId: string,
  update: { status?: MembershipStatus; role?: MembershipRole },
  actorId: string,
  actorRole: "ADMIN" | "STAFF",
) {
  return withRetryableTransaction(async (tx) => {
    await lockOrganisation(tx, orgId);
    const membership = await tx.organisationMembership.findUnique({
      where: { orgId_memberId: { orgId, memberId } },
      include: { user: true },
    });
    if (!membership) throw new MembershipError("Member not found.", 404);
    if (
      membership.userId === actorId &&
      (update.status === "SUSPENDED" || update.status === "REMOVED")
    )
      throw new MembershipError(
        "You cannot suspend or remove your own administrator account.",
        403,
      );
    if (actorRole === "STAFF" && membership.role !== "MEMBER")
      throw new MembershipError(
        "Only an organisation administrator can manage staff or administrator accounts.",
        403,
      );
    const result = await tx.organisationMembership.update({
      where: { id: membership.id },
      data: {
        ...(update.status ? { status: update.status } : {}),
        ...(update.role ? { role: update.role } : {}),
      },
    });
    if (update.role || update.status) {
      const role =
        update.status && update.status !== "ACTIVE"
          ? "MEMBER"
          : (update.role ?? membership.role) === "ADMIN"
            ? "ORGANISATION_ADMIN"
            : (update.role ?? membership.role) === "STAFF"
              ? "ORGANISATION_STAFF"
              : "MEMBER";
      await tx.appUser.update({
        where: { id: membership.userId },
        data: { role },
      });
    }
    await tx.membershipAudit.create({
      data: {
        id: randomUUID(),
        orgId,
        actorId,
        action: update.status
          ? `member.${update.status.toLowerCase()}`
          : "member.role_changed",
        targetId: memberId,
        details: { ...update },
      },
    });
    return result;
  });
}

export async function getCampaignMembershipOverview(campaign: Campaign) {
  const [activeMemberCount, subscription, lastPayment] = databaseEnabled
    ? await withRetryableTransaction(async (tx) => {
        await lockCampaign(tx, campaign.id);
        const currentSubscription = await ensureCampaignSubscription(
          tx,
          campaign,
        );
        const count = await tx.campaignParticipant.count({
          where: { campaignId: campaign.id, status: "ACTIVE" },
        });
        const payment = await tx.subscriptionPayment.findFirst({
          where: { campaignId: campaign.id },
          orderBy: { createdAt: "desc" },
          select: { status: true, planCode: true, createdAt: true },
        });
        return [count, currentSubscription, payment] as const;
      })
    : ([
        store.participants.filter(
          (participant) =>
            participant.campaignId === campaign.id &&
            participant.status === "ACTIVE",
        ).length,
        undefined,
        undefined,
      ] as const);
  const now = new Date();
  const validSubscription =
    subscription?.status === "ACTIVE" &&
    subscription.verifiedAt !== null &&
    subscription.startsAt <= now &&
    subscription.expiresAt > now;
  const activeTier =
    (validSubscription
      ? findMembershipTier(subscription.planCode, store.plans)
      : !databaseEnabled
        ? requiredMembershipTier(
            activeMemberCount,
            store.plans.filter(
              (plan) => plan.price === null || plan.price <= 0,
            ),
          )
        : undefined) ?? UNCONFIGURED_TIER;
  const requiredTier = requiredMembershipTier(
    activeMemberCount + 1,
    store.plans,
  );
  const maxMembers = activeTier.maxMembers;
  const activePlanConfigured = activeTier.code !== UNCONFIGURED_TIER.code;
  return {
    campaignId: campaign.id,
    activeMemberCount,
    activePlan: { ...activeTier },
    requiredPlan: requiredTier ? { ...requiredTier } : null,
    subscriptionStatus:
      validSubscription && activePlanConfigured
        ? activeTier.price === null || activeTier.price === 0
          ? "FREE"
          : "ACTIVE"
        : validSubscription
          ? "UNCONFIGURED"
          : subscription?.status === "ACTIVE"
            ? subscription.expiresAt <= now
              ? "EXPIRED"
              : "PENDING_VERIFICATION"
            : subscription?.planCode === UNCONFIGURED_TIER.code
              ? "UNCONFIGURED"
              : lastPayment?.status === "PENDING"
                ? "PENDING"
                : lastPayment?.status === "FAILED"
                  ? "FAILED"
                  : (subscription?.status ??
                    (activePlanConfigured ? "FREE" : "UNCONFIGURED")),
    subscriptionExpiresAt: validSubscription && activePlanConfigured
      ? subscription.expiresAt.toISOString()
      : null,
    paymentVerified: Boolean(validSubscription && activePlanConfigured),
    lastPaymentStatus: lastPayment?.status ?? null,
    lastPaymentPlan: lastPayment
      ? (findMembershipTier(lastPayment.planCode, store.plans)?.name ??
        lastPayment.planCode)
      : null,
    lastPaymentAt: lastPayment?.createdAt.toISOString() ?? null,
    maxMembers,
    remainingCapacity:
      maxMembers === null ? null : Math.max(0, maxMembers - activeMemberCount),
    atLimit: maxMembers !== null && activeMemberCount >= maxMembers,
    upgradeRequired: !requiredTier || requiredTier.code !== activeTier.code,
  };
}

export async function verifyCampaignSubscriptionPayment(input: {
  paymentId: string;
  receipt?: string;
  payload: unknown;
}) {
  if (!databaseEnabled)
    throw new MembershipError(
      "Campaign payment storage requires the configured PostgreSQL database.",
      503,
    );
  return withRetryableTransaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: input.paymentId },
    });
    if (!payment || !payment.campaignId)
      throw new MembershipError(
        "Campaign subscription payment not found.",
        404,
      );
    await lockCampaign(tx, payment.campaignId);
    const current = await tx.subscriptionPayment.findUnique({
      where: { id: payment.id },
    });
    if (!current || !current.campaignId)
      throw new MembershipError(
        "Campaign subscription payment not found.",
        404,
      );
    if (current.status === "VERIFIED" || current.verifiedAt) return current;
    if (current.status !== "PENDING")
      throw new MembershipError(
        "This campaign subscription payment is no longer pending.",
        409,
      );

    const verifiedAt = new Date();
    const expiresAt = new Date(verifiedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    await tx.subscriptionPayment.update({
      where: { id: current.id },
      data: {
        status: "VERIFIED",
        receipt: input.receipt,
        verifiedAt,
        payload: JSON.parse(JSON.stringify(input.payload)),
      },
    });
    await tx.campaignSubscription.upsert({
      where: { campaignId: current.campaignId },
      create: {
        id: randomUUID(),
        campaignId: current.campaignId,
        orgId: current.orgId,
        planCode: current.planCode,
        status: "ACTIVE",
        verifiedAt,
        startsAt: verifiedAt,
        expiresAt,
        verifiedPaymentId: current.id,
      },
      update: {
        planCode: current.planCode,
        status: "ACTIVE",
        verifiedAt,
        startsAt: verifiedAt,
        expiresAt,
        verifiedPaymentId: current.id,
      },
    });
    await tx.membershipAudit.create({
      data: {
        id: randomUUID(),
        orgId: current.orgId,
        action: "subscription.payment_verified",
        targetId: current.id,
        details: {
          campaignId: current.campaignId,
          planCode: current.planCode,
          amount: current.amount,
          paymentMethod: current.paymentMethod,
          receipt: input.receipt,
        },
      },
    });
    return tx.subscriptionPayment.findUniqueOrThrow({
      where: { id: current.id },
    });
  });
}

export async function failCampaignSubscriptionPayment(
  paymentId: string,
  payload: unknown,
) {
  if (!databaseEnabled)
    throw new MembershipError(
      "Campaign payment storage requires the configured PostgreSQL database.",
      503,
    );
  return withRetryableTransaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || !payment.campaignId)
      throw new MembershipError(
        "Campaign subscription payment not found.",
        404,
      );
    await lockCampaign(tx, payment.campaignId);
    const current = await tx.subscriptionPayment.findUnique({
      where: { id: payment.id },
    });
    if (current?.status === "PENDING" && !current.verifiedAt) {
      return tx.subscriptionPayment.update({
        where: { id: current.id },
        data: {
          status: "FAILED",
          payload: JSON.parse(JSON.stringify(payload)),
        },
      });
    }
    return current;
  });
}

export async function beginCampaignSubscriptionPayment(input: {
  campaign: Campaign;
  planCode: string;
  phone: string;
}): Promise<PaidMembershipTier> {
  const tier = findMembershipTier(input.planCode, store.plans);
  if (!tier || tier.price === null || tier.price <= 0)
    throw new MembershipError(
      "Choose a paid membership tier for this campaign.",
    );
  const overview = await getCampaignMembershipOverview(input.campaign);
  if (
    tier.maxMembers !== null &&
    overview.activeMemberCount + 1 > tier.maxMembers
  )
    throw new MembershipError(
      "Choose a plan that supports this campaign's current member count.",
      409,
    );
  return { ...tier, price: tier.price };
}

export async function activateFreeCampaignPlan(input: {
  campaign: Campaign;
  planCode: string;
  actorId?: string;
}) {
  const tier = findMembershipTier(input.planCode, store.plans);
  if (!tier || (tier.price !== null && tier.price > 0))
    throw new MembershipError("Choose a free platform campaign plan.");
  if (!databaseEnabled)
    return { planCode: tier.code, amount: 0, expiresAt: null };

  return withRetryableTransaction(async (tx) => {
    await lockCampaign(tx, input.campaign.id);
    await ensureCampaignSubscription(tx, input.campaign);
    const activeMemberCount = await tx.campaignParticipant.count({
      where: { campaignId: input.campaign.id, status: "ACTIVE" },
    });
    if (
      tier.maxMembers !== null &&
      activeMemberCount + 1 > tier.maxMembers
    )
      throw new MembershipError(
        "This free plan does not support the campaign's current membership.",
        409,
      );

    const verifiedAt = new Date();
    const expiresAt = new Date("9999-12-31T23:59:59.999Z");
    await tx.campaignSubscription.upsert({
      where: { campaignId: input.campaign.id },
      create: {
        id: randomUUID(),
        campaignId: input.campaign.id,
        orgId: input.campaign.orgId,
        planCode: tier.code,
        status: "ACTIVE",
        verifiedAt,
        startsAt: verifiedAt,
        expiresAt,
      },
      update: {
        planCode: tier.code,
        status: "ACTIVE",
        verifiedAt,
        startsAt: verifiedAt,
        expiresAt,
        verifiedPaymentId: null,
      },
    });
    await tx.membershipAudit.create({
      data: {
        id: randomUUID(),
        orgId: input.campaign.orgId,
        actorId: input.actorId,
        action: "campaign.subscription_free_plan_activated",
        targetId: input.campaign.id,
        details: { planCode: tier.code },
      },
    });
    return {
      planCode: tier.code,
      amount: 0,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function recordManualCampaignSubscriptionPayment(input: {
  campaign: Campaign;
  planCode: string;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "OTHER";
  paymentReference?: string;
  note?: string;
  actorId: string;
}) {
  if (!databaseEnabled)
    throw new MembershipError(
      "Manual subscription recording requires the configured PostgreSQL database.",
      503,
    );
  const tier = findMembershipTier(input.planCode, store.plans);
  if (!tier || tier.price === null || tier.price <= 0)
    throw new MembershipError(
      "Choose a paid membership tier for this campaign.",
    );
  const amount = tier.price;

  const paymentReference = input.paymentReference?.trim() || null;
  const note = input.note?.trim() || null;
  return withRetryableTransaction(async (tx) => {
    await lockCampaign(tx, input.campaign.id);
    await ensureCampaignSubscription(tx, input.campaign);
    const activeMemberCount = await tx.campaignParticipant.count({
      where: { campaignId: input.campaign.id, status: "ACTIVE" },
    });
    const requiredTier = requiredMembershipTier(
      activeMemberCount + 1,
      store.plans,
    );
    if (
      !requiredTier ||
      (tier.maxMembers !== null && activeMemberCount + 1 > tier.maxMembers)
    ) {
      throw new MembershipError(
        `The ${tier.name} plan does not support this campaign's current membership. Select a plan that supports ${activeMemberCount + 1} members.`,
        409,
      );
    }

    const verifiedAt = new Date();
    const expiresAt = new Date(verifiedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const payment = await tx.subscriptionPayment.create({
      data: {
        id: randomUUID(),
        orgId: input.campaign.orgId,
        campaignId: input.campaign.id,
        planCode: tier.code,
        amount,
        phone: "",
        status: "VERIFIED",
        paymentMethod: input.paymentMethod,
        paymentReference,
        verifiedBy: input.actorId,
        verifiedAt,
        payload: {
          source: "platform_manual",
          ...(note ? { note } : {}),
        },
      },
    });
    const subscription = await tx.campaignSubscription.upsert({
      where: { campaignId: input.campaign.id },
      create: {
        id: randomUUID(),
        campaignId: input.campaign.id,
        orgId: input.campaign.orgId,
        planCode: tier.code,
        status: "ACTIVE",
        verifiedAt,
        startsAt: verifiedAt,
        expiresAt,
        verifiedPaymentId: payment.id,
      },
      update: {
        planCode: tier.code,
        status: "ACTIVE",
        verifiedAt,
        startsAt: verifiedAt,
        expiresAt,
        verifiedPaymentId: payment.id,
      },
    });
    await tx.membershipAudit.create({
      data: {
        id: randomUUID(),
        orgId: input.campaign.orgId,
        actorId: input.actorId,
        action: "campaign.subscription_manually_verified",
        targetId: input.campaign.id,
        details: {
          paymentId: payment.id,
          planCode: tier.code,
          amount,
          paymentMethod: input.paymentMethod,
          ...(paymentReference ? { paymentReference } : {}),
          ...(note ? { note } : {}),
        },
      },
    });

    return {
      paymentId: payment.id,
      planCode: tier.code,
      amount,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function joinCampaign(
  campaign: Campaign,
  memberId: string,
  actorId?: string,
) {
  if (!databaseEnabled) {
    const existing = store.participants.find(
      (item) => item.campaignId === campaign.id && item.memberId === memberId,
    );
    if (existing) return { alreadyJoined: true };
    const activeCount = store.participants.filter(
      (item) => item.campaignId === campaign.id && item.status === "ACTIVE",
    ).length;
    const freeTiers = store.plans.filter(
      (plan) => plan.price === null || plan.price <= 0,
    );
    const tier = requiredMembershipTier(activeCount + 1, freeTiers);
    if (!tier || (tier.maxMembers !== null && activeCount + 1 > tier.maxMembers))
      throw new MembershipError(campaignLimitMessage, 409, {
        code: "CAMPAIGN_MEMBER_LIMIT_REACHED",
        activeMemberCount: activeCount,
        activePlan: UNCONFIGURED_TIER.code,
        requiredPlan: tier?.code ?? null,
      });
    store.participants.push({
      campaignId: campaign.id,
      memberId,
      status: "ACTIVE",
      joinedAt: new Date().toISOString(),
    });
    return { alreadyJoined: false };
  }

  const result = await withRetryableTransaction(async (tx) => {
    await lockCampaign(tx, campaign.id);
    await ensureCampaignSubscription(tx, campaign);
    const existing = await tx.campaignParticipant.findUnique({
      where: { campaignId_memberId: { campaignId: campaign.id, memberId } },
    });
    if (existing) return { alreadyJoined: true, participant: existing };
    const activeCount = await tx.campaignParticipant.count({
      where: { campaignId: campaign.id, status: "ACTIVE" },
    });
    await assertCampaignCapacity(tx, campaign.id, activeCount + 1);
    const participant = await tx.campaignParticipant.create({
      data: {
        id: randomUUID(),
        campaignId: campaign.id,
        memberId,
        status: "ACTIVE",
      },
    });
    await tx.membershipAudit.create({
      data: {
        id: randomUUID(),
        orgId: campaign.orgId,
        actorId,
        action: "campaign.member_joined",
        targetId: memberId,
        details: { campaignId: campaign.id },
      },
    });
    return { alreadyJoined: false, participant };
  });
  if (
    !store.participants.some(
      (item) => item.campaignId === campaign.id && item.memberId === memberId,
    )
  ) {
    store.participants.push({
      campaignId: campaign.id,
      memberId,
      status: result.participant.status as Participant["status"],
      joinedAt: result.participant.joinedAt.toISOString(),
    });
  }
  return { alreadyJoined: result.alreadyJoined };
}

export async function registerInvitedMember(input: {
  invitationToken?: string;
  invitationTokenHash?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  googleSubject?: string;
}) {
  const tokenHash =
    input.invitationTokenHash ??
    (input.invitationToken ? hashInvitationToken(input.invitationToken) : "");
  if (!tokenHash)
    throw new MembershipError(
      "This invitation is invalid, expired, or has been revoked.",
      404,
    );
  const invitePreview = await prisma.organisationInvitation.findUnique({
    where: { tokenHash },
  });
  if (
    !invitePreview ||
    invitePreview.revokedAt ||
    invitePreview.expiresAt <= new Date()
  )
    throw new MembershipError(
      "This invitation is invalid, expired, or has been revoked.",
      404,
    );
  const memberId = id("m");
  const user: DemoUser = {
    id: id("u"),
    email: input.email.toLowerCase(),
    firstName: input.name.trim().split(/\s+/)[0],
    lastName: input.name.trim().split(/\s+/).slice(1).join(" "),
    role: "MEMBER",
    password: input.password,
    orgId: invitePreview.orgId,
    memberId,
  };
  const member: Member = {
    id: memberId,
    name: input.name.trim(),
    email: user.email,
    phone: input.phone,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: new Date().toISOString().slice(0, 10),
  };
  await withRetryableTransaction(async (tx) => {
    await lockOrganisation(tx, invitePreview.orgId);
    const invitation = await tx.organisationInvitation.findUnique({
      where: { tokenHash },
    });
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    )
      throw new MembershipError(
        "This invitation is invalid, expired, or has been revoked.",
        404,
      );
    if (invitation.email && invitation.email.toLowerCase() !== user.email)
      throw new MembershipError(
        "This invitation was issued to a different email address.",
        403,
      );
    if (await tx.appUser.findUnique({ where: { email: user.email } }))
      throw new MembershipError(
        "An account with this email already exists. Sign in to continue.",
        409,
      );

    await tx.appUser.create({
      data: {
        id: user.id,
        email: user.email,
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        ...(input.googleSubject ? { googleSubject: input.googleSubject } : {}),
        orgId: user.orgId,
        memberId: user.memberId,
      },
    });
    await tx.organisationMembership.create({
      data: {
        ...toMembership(user, member)!,
        userId: user.id,
      },
    });
    await tx.$executeRaw`
      UPDATE "OrganisationInvitation"
      SET "acceptedAt" = COALESCE("acceptedAt", NOW())
      WHERE "id" = ${invitation.id}
    `;
    await tx.membershipAudit.create({
      data: {
        id: randomUUID(),
        orgId: invitation.orgId,
        actorId: user.id,
        action: "member.invitation_accepted",
        targetId: memberId,
      },
    });
  });
  store.users.push(user);
  store.members.push(member);
  return user;
}

export class MembershipError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "MembershipError";
  }
}
