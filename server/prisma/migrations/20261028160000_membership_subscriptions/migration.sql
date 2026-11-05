CREATE TABLE IF NOT EXISTS "AppState" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppState_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE IF NOT EXISTS "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "orgId" TEXT,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AppUser_email_key" ON "AppUser"("email");
CREATE INDEX IF NOT EXISTS "AppUser_orgId_idx" ON "AppUser"("orgId");

CREATE TABLE IF NOT EXISTS "MembershipCapacityLock" (
    "orgId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MembershipCapacityLock_pkey" PRIMARY KEY ("orgId")
);

CREATE TABLE IF NOT EXISTS "OrganisationMembership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganisationMembership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrganisationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganisationMembership_orgId_userId_key" ON "OrganisationMembership"("orgId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganisationMembership_orgId_memberId_key" ON "OrganisationMembership"("orgId", "memberId");
CREATE INDEX IF NOT EXISTS "OrganisationMembership_orgId_status_idx" ON "OrganisationMembership"("orgId", "status");

CREATE TABLE IF NOT EXISTS "OrganisationInvitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "OrganisationInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganisationInvitation_tokenHash_key" ON "OrganisationInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "OrganisationInvitation_orgId_expiresAt_idx" ON "OrganisationInvitation"("orgId", "expiresAt");

CREATE TABLE IF NOT EXISTS "OrganisationSubscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedPaymentId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganisationSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganisationSubscription_orgId_key" ON "OrganisationSubscription"("orgId");
CREATE INDEX IF NOT EXISTS "OrganisationSubscription_status_expiresAt_idx" ON "OrganisationSubscription"("status", "expiresAt");

CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkoutRequestId" TEXT,
    "merchantRequestId" TEXT,
    "receipt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "payload" JSONB,
    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_checkoutRequestId_key" ON "SubscriptionPayment"("checkoutRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_receipt_key" ON "SubscriptionPayment"("receipt");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_orgId_status_createdAt_idx" ON "SubscriptionPayment"("orgId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "MembershipAudit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MembershipAudit_orgId_createdAt_idx" ON "MembershipAudit"("orgId", "createdAt");
