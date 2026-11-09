ALTER TABLE "OrganisationInvitation"
ADD COLUMN "acceptedAt" TIMESTAMP(3);

UPDATE "OrganisationInvitation" AS invitation
SET "acceptedAt" = invitation."createdAt"
FROM "OrganisationMembership" AS membership
WHERE invitation."orgId" = membership."orgId"
  AND invitation."email" IS NOT NULL
  AND lower(invitation."email") = lower(membership."email")
  AND invitation."acceptedAt" IS NULL;
