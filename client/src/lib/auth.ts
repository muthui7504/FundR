import { redirect } from "@tanstack/react-router";
import { api, type AuthRole, type AuthUser } from "@/services/api";

const homeForRole = (role: AuthRole) => {
  if (role === "PLATFORM_ADMIN") return "/platform-admin" as const;
  if (role === "ORGANISATION_ADMIN" || role === "ORGANISATION_STAFF") {
    return "/organisation" as const;
  }
  return "/member" as const;
};

export async function requireAuth(
  allowedRoles?: readonly AuthRole[],
): Promise<AuthUser | undefined> {
  if (typeof window === "undefined") return undefined;

  let user: AuthUser;

  try {
    user = (await api.auth.me()).data.user;
  } catch {
    throw redirect({ to: "/login", search: { campaignCode: undefined, invite: undefined } });
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw redirect({ to: homeForRole(user.role) });
  }

  return user;
}