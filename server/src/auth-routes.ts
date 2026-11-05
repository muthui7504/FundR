import { addAudit, authError, body, error, id, isOrgUser, json, numberValue, publicUser, readCookies, requireUser, sessionDurationForRole, sessions, store, stringValue, userFromRequest, type ApiRouteContext, type DemoUser } from "./api-context";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, MpesaAccount, Organisation, Plan, Participant, Pledge, Subscription } from "./types";
import { isStrongPassword, strongPasswordMessage } from "./password-rules";
import { databaseEnabled } from "./api-context";
import { prisma } from "./config/prisma";
import {
  hashInvitationToken,
  MembershipError,
  registerInvitedMember,
  registerOrganisationAdmin,
  validateOrganisationInvitation,
} from "./membership-service";
import { OAuth2Client } from "google-auth-library";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { sendEmailVerificationCode } from "./email-service";
import type { Prisma } from "@prisma/client";

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_RESEND_DELAY_MS = 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

type PendingRegistration = {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  invitationTokenHash?: string;
  organisationName?: string;
  organisationType?: string;
};

function isPendingRegistration(value: unknown): value is PendingRegistration {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.name === "string" &&
    typeof data.email === "string" &&
    typeof data.phone === "string" &&
    typeof data.passwordHash === "string" &&
    (data.invitationTokenHash === undefined || typeof data.invitationTokenHash === "string") &&
    (data.organisationName === undefined || typeof data.organisationName === "string") &&
    (data.organisationType === undefined || typeof data.organisationType === "string");
}

function tooSoonToResend(createdAt: Date) {
  return Date.now() - createdAt.getTime() < EMAIL_CODE_RESEND_DELAY_MS;
}

function isBcryptHash(value: string) {
  return /^\$2[aby]\$/.test(value);
}

async function createPendingAccount(data: PendingRegistration): Promise<DemoUser> {
  if (data.invitationTokenHash) {
    return registerInvitedMember({
      invitationTokenHash: data.invitationTokenHash,
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.passwordHash,
    });
  }

  const organisationName = data.organisationName?.trim();
  if (!organisationName)
    throw new Error("An organisation name is required to complete account creation.");
  const [firstName, ...lastNameParts] = data.name.trim().split(/\s+/);
  const organisation: Organisation = {
    id: id("o"),
    name: organisationName,
    slug: `${organisationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`,
    type: data.organisationType || "Community organisation",
    description: "",
    email: data.email,
    phone: data.phone,
    website: "",
    country: "Kenya",
    city: "",
    address: "",
    status: "ACTIVE",
    createdAt: new Date().toISOString().slice(0, 10),
  };
  const memberId = id("m");
  const member: Member = {
    id: memberId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: "ADMIN",
    status: "ACTIVE",
    joinedAt: new Date().toISOString().slice(0, 10),
  };
  const user: DemoUser = {
    id: id("u"),
    email: data.email,
    firstName,
    lastName: lastNameParts.join(" "),
    role: "ORGANISATION_ADMIN",
    password: data.passwordHash,
    orgId: organisation.id,
    memberId,
  };

  await registerOrganisationAdmin(user, member, organisation);
  store.organisations.push(organisation);
  store.members.push(member);
  store.users.push(user);
  return user;
}

async function sendVerificationCode(email: string, name: string, code: string) {
  try {
    await sendEmailVerificationCode(email, name, code);
  } catch (cause) {
    console.error("Unable to send email verification code.", cause);
    throw cause;
  }
}

export async function handleAuthRoutes(context: ApiRouteContext): Promise<Response | undefined> {
  const { request, url, path, parts, method, setCookie } = context;
  void url;
  if (method === "POST" && path === "auth/login") {
const input = await body(request);
const email = stringValue(input.email).toLowerCase();
const password = stringValue(input.password);
  const storedAccount = databaseEnabled
    ? await prisma.appUser.findUnique({ where: { email } })
    : null;
  const user = storedAccount
    ? {
        id: storedAccount.id,
        email: storedAccount.email,
        password: storedAccount.password,
        firstName: storedAccount.firstName,
        lastName: storedAccount.lastName,
        role: storedAccount.role as DemoUser["role"],
        orgId: storedAccount.orgId ?? undefined,
        memberId: storedAccount.memberId ?? undefined,
      }
    : store.users.find(
        (item) => item.email.toLowerCase() === email && item.password === password,
      );
  if (!user) return error("Invalid email or password.", 401);
  const passwordMatches = isBcryptHash(user.password)
    ? await bcrypt.compare(password, user.password)
    : user.password === password;
  if (!passwordMatches) return error("Invalid email or password.", 401);
  const localUserIndex = store.users.findIndex((item) => item.id === user.id);
  if (localUserIndex < 0) store.users.push(user);
  else store.users[localUserIndex] = user;
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + sessionDurationForRole(user.role) });
return json({ success: true, data: { user: publicUser(user) } }, 200, {
  "set-cookie": setCookie(sessionId, user.role),
});
  }

  if (method === "POST" && path === "auth/google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId)
      return error("Google sign-in is not configured on the server.", 503);
    if (!databaseEnabled)
      return error("Google member sign-in requires the configured PostgreSQL database.", 503);

    const input = await body(request);
    const credential = stringValue(input.credential);
    if (!credential) return error("A Google credential is required.", 400);

    let payload;
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (cause) {
      console.error("Google ID token verification failed.", cause);
      return error("Google sign-in could not be verified. Please try again.", 401);
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true)
      return error("Use a Google account with a verified email address.", 401);

    const email = payload.email.toLowerCase();
    let account = await prisma.appUser.findUnique({
      where: { googleSubject: payload.sub },
    });

    if (!account) {
      const existing = await prisma.appUser.findUnique({ where: { email } });
      if (existing) {
        if (existing.role !== "MEMBER")
          return error("Google sign-in is currently available for member accounts only.", 403);
        if (existing.googleSubject && existing.googleSubject !== payload.sub)
          return error("This account is linked to a different Google account.", 409);
        try {
          account = await prisma.appUser.update({
            where: { id: existing.id },
            data: { googleSubject: payload.sub },
          });
        } catch (cause) {
          if (cause instanceof Error && "code" in cause && cause.code === "P2002")
            return error("This Google account is already linked to another account.", 409);
          throw cause;
        }
      } else {
        const invitationToken = stringValue(input.invitationToken);
        const name = stringValue(payload.name) ||
          [payload.given_name, payload.family_name].filter(Boolean).join(" ");
        const phone = stringValue(input.phone);
        if (!invitationToken)
          return error("A valid organisation invitation is required to create a member account.", 400);
        if (name.trim().length < 2)
          return error("Google did not provide a usable name for this account.", 400);
        if (!phone)
          return error("Enter your phone number to create a member account.", 400);
        try {
          await registerInvitedMember({
            invitationToken,
            name,
            email,
            phone,
            password: await bcrypt.hash(randomBytes(32).toString("base64url"), 12),
            googleSubject: payload.sub,
          });
          account = await prisma.appUser.findUnique({ where: { email } });
        } catch (cause) {
          if (cause instanceof MembershipError) return error(cause.message, cause.status, cause.details);
          if (cause instanceof Error && "code" in cause && cause.code === "P2002")
            return error("This Google account or email is already linked to an account.", 409);
          throw cause;
        }
      }
    }

    if (!account)
      return error("Unable to load the member account after Google sign-in.", 500);
    if (account.role !== "MEMBER")
      return error("Google sign-in is currently available for member accounts only.", 403);
    const safeUser: DemoUser = {
      id: account.id,
      email: account.email,
      password: account.password,
      firstName: account.firstName,
      lastName: account.lastName,
      role: account.role as DemoUser["role"],
      ...(account.orgId ? { orgId: account.orgId } : {}),
      ...(account.memberId ? { memberId: account.memberId } : {}),
    };
    const localUserIndex = store.users.findIndex((item) => item.id === safeUser.id);
    if (localUserIndex < 0) store.users.push(safeUser);
    else store.users[localUserIndex] = safeUser;
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { userId: safeUser.id, expiresAt: Date.now() + sessionDurationForRole(safeUser.role) });
    return json({ success: true, data: { user: publicUser(safeUser) } }, 200, {
      "set-cookie": setCookie(sessionId, safeUser.role),
    });
  }

  if (method === "POST" && path === "auth/register") {
    const input = await body(request);
    const name = stringValue(input.name);
    const email = stringValue(input.email).toLowerCase();
    const password = stringValue(input.password ?? input.pw);
    const phone = stringValue(input.phone);
    const invitationToken = stringValue(input.invitationToken);
    const organisationName = stringValue(input.organisationName);
    const organisationType = stringValue(input.organisationType);
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || !isStrongPassword(password))
      return error(`Name, valid email, and ${strongPasswordMessage}`);
    if (!invitationToken && organisationName.length < 2)
      return error("An organisation invitation is required to register as a member.", 400);
    if (!databaseEnabled)
      return error("Email verification requires the configured PostgreSQL database.", 503);
    if (store.users.some((item) => item.email.toLowerCase() === email) ||
      await prisma.appUser.findUnique({ where: { email } }))
      return error("An account with that email already exists.", 409);

    let invitationTokenHash: string | undefined;
    if (invitationToken) {
      try {
        const invitation = await validateOrganisationInvitation(invitationToken);
        if (invitation.invitedEmail && invitation.invitedEmail.toLowerCase() !== email)
          return error("This invitation was issued to a different email address.", 403);
        invitationTokenHash = hashInvitationToken(invitationToken);
      } catch (cause) {
        if (cause instanceof MembershipError) return error(cause.message, cause.status, cause.details);
        throw cause;
      }
    }

    const existingVerification = await prisma.emailVerification.findUnique({ where: { email } });
    if (existingVerification && tooSoonToResend(existingVerification.createdAt))
      return error("A verification code was just sent. Check your email or wait a minute before requesting another.", 429);

    const code = String(randomInt(100_000, 1_000_000));
    const codeHash = await bcrypt.hash(code, 10);
    const passwordHash = await bcrypt.hash(password, 12);
    const data: PendingRegistration = {
      name,
      email,
      phone,
      passwordHash,
      ...(invitationTokenHash ? { invitationTokenHash } : {}),
      ...(!invitationToken ? { organisationName, organisationType } : {}),
    };
    const verificationId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_CODE_TTL_MS);
    await prisma.emailVerification.upsert({
      where: { email },
      create: {
        id: verificationId,
        email,
        codeHash,
        expiresAt,
        attempts: 0,
        data: data as Prisma.InputJsonValue,
      },
      update: {
        id: verificationId,
        codeHash,
        expiresAt,
        attempts: 0,
        data: data as Prisma.InputJsonValue,
        createdAt: now,
      },
    });
    try {
      await sendVerificationCode(email, name, code);
    } catch {
      await prisma.emailVerification.deleteMany({ where: { email, id: verificationId } });
      return error("We could not send your verification email. Please try again later.", 503);
    }
    return json({
      success: true,
      data: { verificationRequired: true, email, expiresAt: expiresAt.toISOString() },
    }, 202);
  }

  if (method === "POST" && path === "auth/register/resend") {
    if (!databaseEnabled)
      return error("Email verification requires the configured PostgreSQL database.", 503);
    const input = await body(request);
    const email = stringValue(input.email).toLowerCase();
    const verification = await prisma.emailVerification.findUnique({ where: { email } });
    if (!verification || verification.expiresAt <= new Date())
      return error("Your verification request has expired. Submit the registration form again.", 410);
    if (tooSoonToResend(verification.createdAt))
      return error("Please wait a minute before requesting another code.", 429);
    if (!isPendingRegistration(verification.data))
      return error("The pending registration is invalid. Submit the registration form again.", 500);

    const code = String(randomInt(100_000, 1_000_000));
    const codeHash = await bcrypt.hash(code, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_CODE_TTL_MS);
    const updated = await prisma.emailVerification.updateMany({
      where: { id: verification.id, createdAt: verification.createdAt },
      data: { codeHash, expiresAt, attempts: 0, createdAt: now },
    });
    if (updated.count !== 1)
      return error("The verification request changed. Please try again.", 409);
    try {
      await sendVerificationCode(email, verification.data.name, code);
    } catch {
      await prisma.emailVerification.deleteMany({ where: { id: verification.id, codeHash } });
      return error("We could not send your verification email. Please try again later.", 503);
    }
    return json({ success: true, data: { email, expiresAt: expiresAt.toISOString() } });
  }

  if (method === "POST" && path === "auth/verify-email") {
    if (!databaseEnabled)
      return error("Email verification requires the configured PostgreSQL database.", 503);
    const input = await body(request);
    const email = stringValue(input.email).toLowerCase();
    const code = stringValue(input.code);
    if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code))
      return error("Enter the email address and six-digit verification code.", 400);

    const verification = await prisma.emailVerification.findUnique({ where: { email } });
    if (!verification)
      return error("No pending verification was found. Submit the registration form again.", 404);
    if (verification.expiresAt <= new Date()) {
      await prisma.emailVerification.deleteMany({ where: { id: verification.id } });
      return error("Your verification code expired. Submit the registration form again.", 410);
    }
    if (verification.attempts >= EMAIL_CODE_MAX_ATTEMPTS)
      return error("Too many incorrect codes. Request a new verification code.", 429);
    if (!(await bcrypt.compare(code, verification.codeHash))) {
      await prisma.emailVerification.updateMany({
        where: { id: verification.id, attempts: { lt: EMAIL_CODE_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      return error("That verification code is incorrect.", 400);
    }
    if (!isPendingRegistration(verification.data))
      return error("The pending registration is invalid. Submit the registration form again.", 500);

    const claimed = await prisma.emailVerification.updateMany({
      where: {
        id: verification.id,
        codeHash: verification.codeHash,
        attempts: { lt: EMAIL_CODE_MAX_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
      data: { attempts: EMAIL_CODE_MAX_ATTEMPTS },
    });
    if (claimed.count !== 1)
      return error("This code has already been used or expired. Request a new code.", 409);

    let user: DemoUser;
    try {
      user = await createPendingAccount(verification.data);
    } catch (cause) {
      if (cause instanceof MembershipError)
        return error(cause.message, cause.status, cause.details);
      if (cause instanceof Error && "code" in cause && cause.code === "P2002")
        return error("An account with that email already exists. Please log in.", 409);
      throw cause;
    }
    await prisma.emailVerification.deleteMany({ where: { id: verification.id } });
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + sessionDurationForRole(user.role) });
    return json({ success: true, data: { user: publicUser(user) } }, 201, {
      "set-cookie": setCookie(sessionId, user.role),
    });
  }

  if (method === "GET" && path === "auth/me") {
const user = requireUser(request);
return user
  ? json({ success: true, data: { user: publicUser(user) } })
  : error("Authentication required.", 401);
  }
  if (method === "POST" && path === "auth/logout") {
const sessionId = readCookies(request).fundraise_session;
if (sessionId) sessions.delete(sessionId);
return json({ success: true }, 200, {
  "set-cookie": "fundraise_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
});
  }
  if (method === "POST" && path === "auth/forgot-password")
return json({ success: true, message: "If the account exists, a reset link has been sent." });
  if (method === "POST" && path === "auth/reset-password")
return json({ success: true, message: "Password reset successfully." });

  return undefined;
}
