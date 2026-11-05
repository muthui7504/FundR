CREATE TABLE IF NOT EXISTS "CampaignCapacityLock" (
    "campaignId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignCapacityLock_pkey" PRIMARY KEY ("campaignId")
);

CREATE TABLE IF NOT EXISTS "CampaignParticipant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignParticipant_campaignId_memberId_key"
    ON "CampaignParticipant"("campaignId", "memberId");
CREATE INDEX IF NOT EXISTS "CampaignParticipant_campaignId_status_idx"
    ON "CampaignParticipant"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "CampaignParticipant_memberId_idx"
    ON "CampaignParticipant"("memberId");

CREATE TABLE IF NOT EXISTS "CampaignSubscription" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedPaymentId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignSubscription_campaignId_key"
    ON "CampaignSubscription"("campaignId");
CREATE INDEX IF NOT EXISTS "CampaignSubscription_orgId_status_expiresAt_idx"
    ON "CampaignSubscription"("orgId", "status", "expiresAt");

ALTER TABLE "SubscriptionPayment"
    ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
