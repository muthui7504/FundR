# Free preview deployment

This project can be previewed using Cloudflare Workers for the TanStack Start
client, Render for the Express API, and Neon for PostgreSQL. Free services can
sleep, restart, or have usage limits; this setup is not intended for live
fundraising.

## 1. Put the source in GitHub

This project is currently in a **public** GitHub repository. The project root
contains `client`, `server`, `render.yaml`, and this file. Before staging files,
run `git status --short` and confirm no `.env` files, uploads, or `node_modules`
appear. The root `.gitignore` excludes these.

Do not send hosting credentials, database URLs, or payment secrets in chat or
commit them to GitHub. Enter them only in the relevant provider's environment
variable settings.

## 2. Create the Neon database

Create a PostgreSQL project on Neon. In Neon’s **Connect** dialog, select the
direct (non-pooled) connection string. The Render API is a long-running Node
service and uses this URL for both API queries and Prisma migrations. Keep it
private and enter it only in Render’s environment settings.

## 3. Deploy the API on Render

In Render, create a Blueprint from the GitHub repository and select the root
`render.yaml`. Provide the requested environment values:

- `DATABASE_URL`: Neon direct PostgreSQL connection string (pooling disabled).
- `MPESA_CREDENTIALS_ENCRYPTION_KEY`: generate a new persistent key locally
  with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `BREVO_API_KEY`: a Brevo transactional email API key. Registration requires
  email verification, so account creation will not work until this is set.
- `SMTP_FROM`: an email address verified as a sender in Brevo.

The API sends verification mail through Brevo's HTTPS API. Render's free tier
blocks outbound SMTP ports, so SMTP credentials will not work there.

For durable fundraising image storage, create a private Cloudflare R2 bucket
and an S3 API token scoped to that bucket. Add `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` to the Render
service's environment settings. Do not send these credentials in chat or add
them to GitHub. Images are streamed through the API, so the bucket does not
need public access. Until all four values are configured, image uploads use the
API's local filesystem and may be lost when the free service restarts.

The blueprint runs Prisma client generation and database migrations during
build, starts the Express API, and checks `/health`. After deploy, copy the
service's HTTPS URL, for example `https://fundraise-api.onrender.com`.

## 4. Deploy the client on Cloudflare Workers

Create a Worker connected to the same GitHub repository. Set its root directory
to `client`, build command to `npm ci && npm run build`, and deploy command to
`npx wrangler deploy --config .output/server/wrangler.json --keep-vars --var API_ORIGIN:https://<your-render-api>.onrender.com`.
Set `API_ORIGIN` as a production runtime variable (not a build variable) to
the Render API origin only (scheme and hostname, no path), for example
`https://fundraise-api.onrender.com`.

The Worker proxies same-origin `/api` requests to the API, preserving the
HTTP-only session cookie without relying on third-party cookies. `VITE_API_BASE_URL`
can remain unset because the client defaults to `/api`. Set
`VITE_GOOGLE_CLIENT_ID` as a Cloudflare build variable (not only a runtime
variable) if Google member sign-in is enabled, and configure that client ID's
allowed origin in Google Cloud. Changing this variable requires a new client
build before it is available in the login bundle.

## Limitations to address before production

- Render Free services can spin down, causing cold starts. The API now persists
  sessions in PostgreSQL so restarts do not sign users out before sessions
  expire.
- Configure the R2 environment variables above before relying on uploaded
  images; without them, images remain on Render's ephemeral filesystem.
- Free-tier quotas, cold starts, and resource limits can interrupt use. Test
  login, registration/email verification, campaign creation, image uploads, and
  payment callbacks before sharing the preview.
- Configure the public M-Pesa callback URL to the Render API URL ending in
  `/api/contributions/mpesa/callback`. Subscription M-Pesa uses
  `/api/subscriptions/mpesa/callback`. Keep payment credentials on the API.
