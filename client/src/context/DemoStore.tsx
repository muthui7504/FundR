import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { AuditEvent, Campaign, Contribution, FundraisingProfile, Member, Organisation, Participant, Pledge, Plan, Subscription, MpesaAccount } from "@/types";
import { api, type CampaignMember } from "@/services/api";

interface Store {
  loading: boolean;
  initialized: boolean;
  loadError: string;
  retry: () => void;
  user: import("@/services/api").AuthUser | null;
  memberId: string | undefined;
  org: Organisation; setOrg: Dispatch<SetStateAction<Organisation>>;
  organisations: Organisation[]; setOrganisations: Dispatch<SetStateAction<Organisation[]>>;
  campaigns: Campaign[]; setCampaigns: Dispatch<SetStateAction<Campaign[]>>;
  members: Member[]; setMembers: Dispatch<SetStateAction<Member[]>>;
  participants: Participant[]; setParticipants: Dispatch<SetStateAction<Participant[]>>;
  profiles: FundraisingProfile[]; setProfiles: Dispatch<SetStateAction<FundraisingProfile[]>>;
  pledges: Pledge[]; setPledges: Dispatch<SetStateAction<Pledge[]>>;
  contributions: Contribution[]; setContributions: Dispatch<SetStateAction<Contribution[]>>;
  plans: Plan[]; setPlans: Dispatch<SetStateAction<Plan[]>>;
  audit: AuditEvent[]; setAudit: Dispatch<SetStateAction<AuditEvent[]>>;
  subscriptions: Subscription[]; setSubscriptions: Dispatch<SetStateAction<Subscription[]>>;
  mpesa: MpesaAccount; setMpesa: Dispatch<SetStateAction<MpesaAccount>>;
}
const Ctx = createContext<Store | null>(null);

function arrayResponse<T>(value: T[] | { data?: T[] } | unknown): T[] {
  if (Array.isArray(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "data" in value &&
    Array.isArray(value.data)
  ) {
    return value.data;
  }
  return [];
}

function isCampaign(value: Campaign): value is Campaign {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.orgId === "string" &&
      typeof value.status === "string",
  );
}

function isParticipant(value: Participant): value is Participant {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.memberId === "string" &&
      typeof value.campaignId === "string" &&
      typeof value.status === "string",
  );
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [user, setUser] = useState<import("@/services/api").AuthUser | null>(null);
  const [org, setOrg] = useState<Organisation>({
    id: "", name: "", slug: "", type: "", description: "", email: "", phone: "",
    website: "", country: "", city: "", address: "", status: "ACTIVE", createdAt: "",
  });
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [profiles, setProfiles] = useState<FundraisingProfile[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [mpesa, setMpesa] = useState<MpesaAccount>({
    connected: false, type: "PAYBILL", shortcode: "", accountName: "", environment: "SANDBOX",
  });
  const retry = () => setLoadAttempt((attempt) => attempt + 1);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const errors: string[] = [];
      let sessionLoaded = false;
      setLoading(true);
      setLoadError("");
      try {
        const session = await api.auth.me();
        if (!active) return;
        sessionLoaded = true;
        setUser(session.data.user);
        const hasMemberAccess = Boolean(session.data.user.memberId);
        const isOrganisationUser = session.data.user.role === "ORGANISATION_ADMIN" ||
          session.data.user.role === "ORGANISATION_STAFF";
        const [campaignResponse, profileResponse, pledgeResponse, contributionResponse, planResponse, mpesaResponse] =
          await Promise.allSettled([
            api.campaigns.list(),
            api.profiles.mine(),
            hasMemberAccess ? api.pledges.mine() : Promise.resolve([]),
            hasMemberAccess ? api.contributions.mine() : Promise.resolve([]),
            api.subscriptions.plans(),
            isOrganisationUser ? api.mpesa.get() : Promise.resolve(null),
          ]);
        if (campaignResponse.status === "rejected") errors.push("Campaign data could not be loaded.");
        if (profileResponse.status === "rejected") errors.push("Fundraising pages could not be loaded.");
        if (pledgeResponse.status === "rejected") errors.push("Pledges could not be loaded.");
        if (contributionResponse.status === "rejected") errors.push("Contributions could not be loaded.");
        if (planResponse.status === "rejected") errors.push("Subscription plans could not be loaded.");
        if (mpesaResponse.status === "rejected") errors.push("M-Pesa account settings could not be loaded.");
        const campaignResult = campaignResponse.status === "fulfilled"
          ? arrayResponse<Campaign>(campaignResponse.value)
          : [];
        const profileResult = profileResponse.status === "fulfilled"
          ? arrayResponse<FundraisingProfile>(profileResponse.value)
          : [];
        const pledgeResult = pledgeResponse.status === "fulfilled"
          ? arrayResponse<Pledge>(pledgeResponse.value)
          : [];
        const memberContributionResult = contributionResponse.status === "fulfilled"
          ? arrayResponse<Contribution>(contributionResponse.value)
          : [];
        const planResult = planResponse.status === "fulfilled"
          ? arrayResponse<Plan>(planResponse.value)
          : [];
        if (!active) return;
        if (campaignResponse.status === "fulfilled") setCampaigns(campaignResult.filter(isCampaign));
        if (profileResponse.status === "fulfilled") setProfiles(profileResult);
        if (pledgeResponse.status === "fulfilled") setPledges(pledgeResult);
        if (planResponse.status === "fulfilled") setPlans(planResult);
        if (mpesaResponse.status === "fulfilled" && mpesaResponse.value)
          setMpesa(mpesaResponse.value);
        if (hasMemberAccess) {
          try {
            const mine = await api.campaigns.mine();
            if (active) setParticipants(arrayResponse<Participant>(mine).filter(isParticipant));
          } catch {
            if (active) errors.push("Campaign memberships could not be loaded.");
          }
        }
        let campaignContributionFailure = false;
        const campaignContributions = session.data.user.role === "MEMBER"
          ? []
          : (await Promise.all(
              campaignResult.map(async (campaign) => {
                try {
                  return arrayResponse<Contribution>(await api.campaigns.contributions(campaign.id));
                } catch {
                  campaignContributionFailure = true;
                  errors.push("Some campaign contributions could not be loaded.");
                  return [];
                }
              }),
            )).flat();
        if (!active) return;
        let campaignMemberFailure = false;
        if (session.data.user.role !== "MEMBER" && campaignResponse.status === "fulfilled") {
          const campaignMembers = (await Promise.all(
            campaignResult.map(async (campaign) => {
              try {
                return arrayResponse<CampaignMember>(await api.campaigns.members(campaign.id));
              } catch {
                campaignMemberFailure = true;
                errors.push("Some campaign members could not be loaded.");
                return [];
              }
            }),
          )).flat();
          if (active && !campaignMemberFailure) {
            setParticipants(
              campaignMembers
                .map((item) => item.participant)
                .filter(isParticipant),
            );
          }
        }
        if (session.data.user.role === "MEMBER") {
          if (contributionResponse.status === "fulfilled") setContributions(memberContributionResult);
        } else if (campaignResponse.status === "fulfilled" && !campaignContributionFailure) {
          setContributions(campaignContributions);
        }
        if (session.data.user.role === "PLATFORM_ADMIN") {
          const [organisationsResponse, auditResponse] = await Promise.allSettled([
            api.platform.organisations(),
            api.platform.audit(),
          ]);
          if (organisationsResponse.status === "rejected") errors.push("Organisations could not be loaded.");
          if (auditResponse.status === "rejected") errors.push("Audit events could not be loaded.");
          if (active) {
            if (organisationsResponse.status === "fulfilled") setOrganisations(arrayResponse<Organisation>(organisationsResponse.value));
            if (auditResponse.status === "fulfilled") setAudit(arrayResponse<AuditEvent>(auditResponse.value));
          }
        } else if (session.data.user.role !== "MEMBER" && campaignResponse.status === "fulfilled") {
          try {
            const subscriptions = await api.subscriptions.list();
            if (active) setSubscriptions(arrayResponse<Subscription>(subscriptions));
          } catch {
            errors.push("Subscriptions could not be loaded.");
          }
        }
        if (session.data.user.role !== "PLATFORM_ADMIN") {
          const organisationDashboard = session.data.user.role === "ORGANISATION_ADMIN" ||
            session.data.user.role === "ORGANISATION_STAFF"
            ? await api.organisations.dashboard()
            : null;
          const [organisation, organisationMembers] = organisationDashboard
            ? [
                organisationDashboard.organisation,
                organisationDashboard.members,
              ]
            : await Promise.all([
                api.organisations.current(),
                api.organisations.members(),
              ]);
          if (active) {
            setOrg(organisation);
            setMembers(
              Array.from(
                new Map(arrayResponse<Member>(organisationMembers).map((member) => [member.id, member])).values(),
              ),
            );
            if (organisationDashboard) {
              setCampaigns(organisationDashboard.campaigns.filter(isCampaign));
              setParticipants(
                organisationDashboard.participants.filter(isParticipant),
              );
              setContributions(organisationDashboard.contributions);
            }
          }
        }
        if (active) setLoadError([...new Set(errors)].join(" "));
      } catch {
        if (active) {
          if (sessionLoaded) {
            setLoadError([...new Set([...errors, "Some application data could not be loaded. Please try again."])].join(" "));
          } else {
            setUser(null);
            setCampaigns([]);
            setProfiles([]);
            setPledges([]);
            setContributions([]);
            setParticipants([]);
          }
        }
      } finally {
        if (active) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };
    const handleAuthChange = () => {
      void load();
    };
    window.addEventListener("fundraise:auth-change", handleAuthChange);
    void load();
    return () => {
      active = false;
      window.removeEventListener("fundraise:auth-change", handleAuthChange);
    };
  }, [loadAttempt]);
  useEffect(() => {
    currentContributions = contributions;
  }, [contributions]);
  return (
    <Ctx.Provider value={{ loading, initialized, loadError, retry, user, memberId: user?.memberId, org, setOrg, organisations, setOrganisations, campaigns, setCampaigns, members, setMembers, participants, setParticipants, profiles, setProfiles, pledges, setPledges, contributions, setContributions, plans, setPlans, audit, setAudit, subscriptions, setSubscriptions, mpesa, setMpesa }}>
      {children}
    </Ctx.Provider>
  );
}
export function useDemo() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useDemo must be used inside DemoStoreProvider");
  return s;
}

/** Verified raised amount for a campaign = base verified total + COMPLETED contributions. Pledges excluded. */
let currentContributions: Contribution[] = [];
export function campaignRaised(id: string) {
  return currentContributions
    .filter((item) => item.campaignId === id && item.status === "COMPLETED")
    .reduce((total, item) => total + item.amount, 0);
}
export function profileRaised(id: string) {
  return currentContributions
    .filter((item) => item.profileId === id && item.status === "COMPLETED")
    .reduce((total, item) => total + item.amount, 0);
}
