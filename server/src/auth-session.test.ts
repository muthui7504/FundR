import assert from "node:assert/strict";
import test from "node:test";
import type { DemoUser } from "./api-context";

test("member login sessions last 30 days while administrator sessions remain 30 minutes", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "";
  const [{ handleAuthRoutes }, { sessionDurationForRole, sessions, store }] =
    await Promise.all([import("./auth-routes"), import("./api-context")]);
  const previousUsers = store.users;
  const users: DemoUser[] = [
    {
      id: "session-test-member",
      email: "session-member@example.test",
      password: "test-password",
      firstName: "Test",
      lastName: "Member",
      role: "MEMBER",
    },
    {
      id: "session-test-admin",
      email: "session-admin@example.test",
      password: "test-password",
      firstName: "Test",
      lastName: "Admin",
      role: "ORGANISATION_ADMIN",
    },
    {
      id: "session-test-platform",
      email: "session-platform@example.test",
      password: "test-password",
      firstName: "Test",
      lastName: "Platform",
      role: "PLATFORM_ADMIN",
    },
  ];
  store.users = [...previousUsers, ...users];
  const sessionIds: string[] = [];

  try {
    for (const user of users) {
      const request = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email, password: user.password }),
      });
      let sessionId = "";
      const startedAt = Date.now();
      const response = await handleAuthRoutes({
        request,
        url: new URL(request.url),
        path: "auth/login",
        parts: ["auth", "login"],
        method: "POST",
        setCookie: (value, role) => {
          sessionId = value;
          return `fundraise_session=${value}; Max-Age=${sessionDurationForRole(role ?? "MEMBER") / 1000}`;
        },
      });
      assert.equal(response?.status, 200);
      sessionIds.push(sessionId);
      const session = sessions.get(sessionId);
      assert.ok(session);
      assert.equal(session.userId, user.id);
      assert.ok(
        session.expiresAt >= startedAt + sessionDurationForRole(user.role) - 1000,
      );
      assert.match(
        response.headers.get("set-cookie") ?? "",
        new RegExp(`Max-Age=${sessionDurationForRole(user.role) / 1000}(?:;|$)`),
      );
    }

    assert.equal(
      sessionDurationForRole("MEMBER"),
      30 * 24 * 60 * 60 * 1000,
    );
    assert.equal(
      sessionDurationForRole("ORGANISATION_ADMIN"),
      30 * 60 * 1000,
    );
    assert.equal(sessionDurationForRole("PLATFORM_ADMIN"), 30 * 60 * 1000);
  } finally {
    store.users = previousUsers;
    for (const sessionId of sessionIds) sessions.delete(sessionId);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
