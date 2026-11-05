# Pixel Perfect Replica

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/78d1f2f6-cda1-471f-9c5d-0149186f0f1d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Backend

The backend is in the sibling [server/](../server/) folder and must be running
before the client can authenticate or load application data. Start it first:

```sh
cd ../server
npm install
npm run api
```

The client proxies `/api` requests to `http://localhost:3001`. The
[src/server.ts](./src/server.ts) file is only the TanStack Start SSR adapter;
it does not contain or execute the application API.

For a local PostgreSQL installation:

```sh
copy .env.example .env
npm install
npm run db:push
cd ../server
npm run api
cd ../client
npm run dev
```

The frontend defaults to the same-origin `/api` endpoint. Set
`VITE_API_BASE_URL` only when pointing the UI at a separate compatible API.

Runtime data is loaded from the database only. Create an account through the
registration page or use accounts already present in your database.

| Role | Email | Password |
| --- | --- | --- |
| Platform admin | `admin@fundraise.co.ke` | `password123` |
| Organisation admin | `peter.o@example.com` | `password123` |
| Organisation staff | `grace.m@example.com` | `password123` |
| Member | `wanjiku@example.com` | `password123` |

Implemented API areas include:

- cookie-based sessions: login, registration, current user, logout, and password reset
- organisation profile and member directory
- campaign listing, creation, updates, and joining by code
- fundraising profile creation, updates, lookup by public slug, and member listing
- M-Pesa account configuration, connection test, and disconnect
- contribution STK-push simulation and status lookup
- public pledges and member pledge history
- subscription plans, organisation subscriptions, platform organisations, and audit logs

The backend code is in the [server/](../server/) folder. The Prisma schema is in
[server/prisma/schema.prisma](../server/prisma/schema.prisma). API
sessions remain HTTP-only cookies and are never stored in browser storage.
