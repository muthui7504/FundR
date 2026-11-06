# Fundraise API

The active API is the TanStack/Prisma runtime in this folder and uses PostgreSQL
through Prisma. The MySQL SQL files and route modules are legacy and are not
used by this runtime.

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to the PostgreSQL
   connection used by the app. For Neon, use the direct (non-pooled) URL because
   this API uses Prisma's default client and runs as a long-lived Node service.
2. Install dependencies with `npm install`.
3. Generate the Prisma client and apply only pending additive migrations:

```bash
npm run db:generate
npm run db:migrate
```

`db:migrate` uses Prisma Migrate and does not reset or recreate existing tables.
Do not use `prisma migrate reset` or `db push` against an existing production
database. Back up the database before applying migrations.

Start the API:

```bash
npm run api
```

The server listens on `PORT` (default `3001`).

The platform administrator can select M-Pesa (Daraja) or card (Stripe) for
campaign subscription checkout in **Platform admin → Payment configuration**.
Credentials saved there are encrypted at rest; set a persistent
`MPESA_CREDENTIALS_ENCRYPTION_KEY` before saving payment credentials. The key
must be a 64-character hexadecimal value and backed up securely.

Alternatively, platform-owned M-Pesa credentials can be supplied through the
`PLATFORM_DARAJA_*` environment variables. The M-Pesa callback URL must be
publicly reachable over HTTPS and point to `/api/subscriptions/mpesa/callback`.
Campaign subscription callbacks are checked server-side with Daraja before a
plan is activated.

For card checkout, configure a Stripe secret key and webhook signing secret in
the platform admin dashboard, or provide `PLATFORM_STRIPE_SECRET_KEY` and
`PLATFORM_STRIPE_WEBHOOK_SECRET`. Set `PUBLIC_APP_URL` to the public frontend
origin so Stripe returns users to the correct campaign page. In Stripe, create a webhook endpoint at
`https://<public-api-host>/api/subscriptions/stripe/webhook` and subscribe to
`checkout.session.completed` and `checkout.session.expired`. Checkout uses
Stripe-hosted card payment for a one-time 30-day campaign subscription; Stripe
redirects the organisation administrator back to the campaign after checkout.
Use Stripe test keys and a test webhook endpoint for testing before enabling
live payments.

New member accounts still require a valid, unexpired organisation invitation,
but organisation membership itself is not capped. Each campaign has its own
subscription and active-participant limit. PostgreSQL campaign-scoped locks
serialize joins for the same campaign while allowing unrelated campaigns to
proceed independently. Expired or unverified campaign subscriptions provide
only Free capacity. The campaign tiers are Free (0–9 participants, KSh 0),
Basic (10–99, KSh 1,000), Standard (100–299, KSh 2,000), and Premium (300+,
KSh 2,500).

For M-Pesa donations, set `DARAJA_CALLBACK_URL` to a publicly reachable HTTPS
URL ending in `/api/contributions/mpesa/callback`. A localhost URL cannot receive
Safaricom callbacks. The server also checks payment status directly with Daraja
while the contributor waits, reusing the OAuth token from the STK request and
refreshing it only when needed.

Campaign share links open a public campaign page. Organisation-generated links
include a valid organisation invitation so new participants can create accounts;
campaign capacity is checked when they join. Existing members can sign in and
return to the same campaign before joining. The campaign detail page shows its own plan and capacity and supports
campaign-specific subscription upgrades through the selected payment provider.

Member accounts can use Google sign-in when `GOOGLE_CLIENT_ID` in the API
environment matches `VITE_GOOGLE_CLIENT_ID` in the client environment. Create a
Google OAuth web client and authorize the app's origins in Google Cloud Console.
Google sign-in is limited to member accounts; creating a new member account still
requires a valid organisation invitation and a phone number. Google verifies the
ID token and verified email on the server. Apply pending migrations before using
the feature.

Password-based registration sends a six-digit email verification code before any
account or membership is created. Codes expire after 10 minutes, allow five
attempts, and can be resent after one minute. Configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in the server `.env`.
For Gmail, use `smtp.gmail.com`, port `587`, `SMTP_SECURE=false`, and an App
Password (not the Gmail account password). Never commit SMTP credentials.

Platform administrators can record a campaign subscription paid by cash, bank
transfer, or another offline method from the organisation details dashboard.
The action records the tier price, payment method, optional reference and note,
admin verifier, and an audit event, then activates the plan for 30 days. It uses
the same campaign-level capacity lock as member joins. The organisation details
page also lists campaign subscription payments.

Run the tier unit tests with `npm test`. PostgreSQL integration tests require a
separate, disposable PostgreSQL database whose schema has the Prisma migrations
applied. Set `MEMBERSHIP_TEST_DATABASE_URL` only to that database and run
`npm run test:integration`; the integration test creates temporary records and
removes them when complete. It never uses the application's `.env` database
unless the test URL is explicitly set to that same database.

M-Pesa credentials used for existing organisation donation integrations are
encrypted before storage. Set `MPESA_CREDENTIALS_ENCRYPTION_KEY` to a persistent
64-character hexadecimal key. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep this key backed up and do not rotate it without decrypting and re-encrypting saved
credentials. Losing it makes stored M-Pesa credentials unreadable.

Fundraising profile images are stored on disk in `uploads/fundraising-profiles`. Keep this
directory on persistent storage and include it in backups so uploaded images remain
available after server restarts or deployments.

## Endpoints

- `POST /api/auth/register`
- `POST /api/auth/register/resend`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/platform/campaigns/:campaignId/membership/manual-payment`
- `GET /api/auth/me`
- `GET /api/invitations/validate/:token`
- `GET /api/campaigns/:campaignId/membership`
- `POST /api/campaigns/:campaignId/membership/upgrade`
- `POST /api/organisations/current/invitations`
- `GET /api/organisations/current/members`
- `PATCH /api/organisations/current/members/:memberId`
- `POST /api/subscriptions/mpesa/callback`

Authenticated API requests use the HttpOnly `fundraise_session` cookie.
