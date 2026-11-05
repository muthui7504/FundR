import assert from "node:assert/strict";
import test from "node:test";
import type { Plan } from "./types";
import {
  configuredMembershipTiers,
  findMembershipTier,
  requiredMembershipTier,
} from "./membership-tiers";

const platformPlans: Plan[] = [
  {
    id: "starter-plan",
    name: "Starter",
    minMembers: 1,
    maxMembers: 9,
    price: null,
  },
  {
    id: "community-plan",
    name: "Community",
    minMembers: 10,
    maxMembers: 99,
    price: 1800,
  },
  {
    id: "unlimited-plan",
    name: "Unlimited",
    minMembers: 100,
    maxMembers: null,
    price: 4200,
  },
];

test("campaign membership tiers exactly reflect platform-configured plans", () => {
  assert.deepEqual(
    configuredMembershipTiers(platformPlans),
    [
      {
        code: "starter-plan",
        name: "Starter",
        minMembers: 1,
        maxMembers: 9,
        price: null,
      },
      {
        code: "community-plan",
        name: "Community",
        minMembers: 10,
        maxMembers: 99,
        price: 1800,
      },
      {
        code: "unlimited-plan",
        name: "Unlimited",
        minMembers: 100,
        maxMembers: null,
        price: 4200,
      },
    ],
  );
  assert.equal(findMembershipTier("community-plan", platformPlans)?.name, "Community");
  assert.equal(findMembershipTier("COMMUNITY", platformPlans)?.code, "community-plan");
});

test("required plan follows configured member limits and prices", () => {
  const cases = [
    [1, "starter-plan"],
    [9, "starter-plan"],
    [10, "community-plan"],
    [99, "community-plan"],
    [100, "unlimited-plan"],
    [1000, "unlimited-plan"],
  ] as const;

  for (const [memberCount, expectedCode] of cases)
    assert.equal(
      requiredMembershipTier(memberCount, platformPlans)?.code,
      expectedCode,
    );
});

test("no built-in plan is substituted when the platform has no configured plans", () => {
  assert.deepEqual(configuredMembershipTiers([]), []);
  assert.equal(requiredMembershipTier(1, []), undefined);
});
