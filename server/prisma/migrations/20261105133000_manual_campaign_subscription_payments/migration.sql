ALTER TABLE "SubscriptionPayment"
    ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'MPESA',
    ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
    ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_paymentReference_key"
    ON "SubscriptionPayment"("paymentReference");
