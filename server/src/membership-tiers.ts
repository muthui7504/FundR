import type { Plan } from "./types";

export interface MembershipTier {
  code: string;
  name: string;
  minMembers: number;
  maxMembers: number | null;
  price: number | null;
}

export interface PaidMembershipTier extends MembershipTier {
  price: number;
}

export function configuredMembershipTiers(plans: Plan[]): MembershipTier[] {
  return plans
    .map((plan) => ({
      code: plan.id,
      name: plan.name,
      minMembers: plan.minMembers,
      maxMembers: plan.maxMembers,
      price: plan.price,
    }))
    .sort(
      (left, right) =>
        left.minMembers - right.minMembers ||
        (left.maxMembers ?? Number.POSITIVE_INFINITY) -
          (right.maxMembers ?? Number.POSITIVE_INFINITY) ||
        left.name.localeCompare(right.name),
    );
}

export function findMembershipTier(
  code: string,
  plans: Plan[],
): MembershipTier | undefined {
  const tiers = configuredMembershipTiers(plans);
  return (
    tiers.find((tier) => tier.code === code) ??
    tiers.find(
      (tier) => tier.name.trim().toUpperCase().replace(/\s+/g, "_") === code,
    )
  );
}

export function requiredMembershipTier(
  count: number,
  plans: Plan[],
): MembershipTier | undefined {
  const memberCount = Math.max(0, Math.floor(count));
  return configuredMembershipTiers(plans)
    .filter((tier) => tier.maxMembers === null || memberCount <= tier.maxMembers)
    .sort((left, right) => {
      const leftStarted = left.minMembers <= memberCount;
      const rightStarted = right.minMembers <= memberCount;
      if (leftStarted !== rightStarted) return leftStarted ? -1 : 1;
      if (leftStarted && rightStarted)
        return (
          right.minMembers - left.minMembers ||
          (left.maxMembers ?? Number.POSITIVE_INFINITY) -
            (right.maxMembers ?? Number.POSITIVE_INFINITY) ||
          left.name.localeCompare(right.name)
        );
      return (
        left.minMembers - right.minMembers ||
        (left.maxMembers ?? Number.POSITIVE_INFINITY) -
          (right.maxMembers ?? Number.POSITIVE_INFINITY) ||
        left.name.localeCompare(right.name)
      );
    })[0];
}
