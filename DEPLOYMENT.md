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

Create a PostgreSQL project on Neon and copy its pooled connection string. Keep
the connection string private; it is the `DATABASE_URL` for the API service.

## 3. Deploy the API on Render

In Render, create a Blueprint from the GitHub repository and select the root
`render.yaml`. Provide the requested environment values:

- `DATABASE_URL`: Neon pooled PostgreSQL connection string.
- `MPESA_CREDENTIALS_ENCRYPTION_KEY`: generate a new persistent key locally
  with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`: SMTP credentials for
  an email provider. Registration requires email verification, so account
  creation will not work until SMTP is configured.

The blueprint runs Prisma client generation and database migrations during
build, starts the Express API, and checks `/health`. After deploy, copy the
service's HTTPS URL, for example `https://fundraise-api.onrender.com`.

## 4. Deploy the client on Cloudflare Workers

Create a Worker connected to the same GitHub repository. Set its root directory
to `client`, build command to `npm ci && npm run build`, and deploy command to
`npm run deploy`. Set the Worker variable `API_ORIGIN` to the Render API origin
only (scheme and hostname, no path), for example
`https://fundraise-api.onrender.com`.

The Worker proxies same-origin `/api` requests to the API, preserving the
HTTP-only session cookie without relying on third-party cookies. `VITE_API_BASE_URL`
can remain unset because the client defaults to `/api`. Set
`VITE_GOOGLE_CLIENT_ID` only if Google member sign-in is enabled, and configure
that client ID's allowed origin in Google Cloud.

## Limitations to address before production

- Render Free services can spin down and have an ephemeral filesystem. Uploaded
  fundraising images are currently stored on the API filesystem and may be lost
  after a restart or spin-down. Move image storage to durable object storage
  before depending on those uploads.
- API sessions are held in memory, so a service restart signs users out.
- Free-tier quotas, cold starts, and resource limits can interrupt use. Test
  login, registration/email verification, campaign creation, image uploads, and
  payment callbacks before sharing the preview.
- Configure the public M-Pesa callback URL to the Render API URL ending in
  `/api/contributions/mpesa/callback`. Subscription M-Pesa uses
  `/api/subscriptions/mpesa/callback`. Keep payment credentials on the API.
