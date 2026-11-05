import type { PublicFundraisingProfile } from "@/types";
import sampleCover from "@/assets/hero.jpg";

const now = new Date();
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

export const SAMPLE_FUNDRAISING_SLUG = "wanjiku-building-fund";

export const sampleFundraisingPage: PublicFundraisingProfile = {
  profile: {
    id: "sample-profile",
    slug: SAMPLE_FUNDRAISING_SLUG,
    memberId: "sample-member",
    campaignId: "sample-campaign",
    title: "Help us build a brighter future",
    message:
      "I’m raising funds to help Grace Community Church complete a safe, welcoming hall for worship, youth programmes and community support. Every contribution brings us closer to a space the whole neighbourhood can share. Thank you for being part of this journey.",
    target: 100_000,
    status: "PUBLISHED",
    coverImageUrl: sampleCover,
  },
  member: {
    id: "sample-member",
    name: "Wanjiku Kamau",
    email: "wanjiku@example.test",
    phone: "",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: daysAgo(180),
  },
  campaign: {
    id: "sample-campaign",
    orgId: "sample-organisation",
    name: "Grace Community Church Building Fund",
    shortDescription: "A welcoming hall for worship and community programmes.",
    description:
      "Our community is raising funds to complete a multi-purpose hall in Nairobi. The space will host weekly services, youth mentorship, family support meetings and local outreach programmes.",
    target: 5_000_000,
    startDate: daysAgo(90),
    endDate: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    joinCode: "SAMPLE",
  },
  organisation: {
    id: "sample-organisation",
    name: "Grace Community Church",
    slug: "grace-community-church",
    type: "Church",
    description:
      "A welcoming community serving families and neighbours through worship, youth mentorship and practical support.",
    email: "hello@example.test",
    phone: "",
    website: "",
    country: "Kenya",
    city: "Nairobi",
    address: "",
    status: "ACTIVE",
    createdAt: daysAgo(1000),
  },
  contributions: [
    {
      id: "sample-contribution-1",
      profileId: "sample-profile",
      campaignId: "sample-campaign",
      supporterName: "A. Njoroge",
      phone: "",
      amount: 10_000,
      status: "COMPLETED",
      createdAt: daysAgo(1),
    },
    {
      id: "sample-contribution-2",
      profileId: "sample-profile",
      campaignId: "sample-campaign",
      supporterName: "M. Wambui",
      phone: "",
      amount: 5_000,
      status: "COMPLETED",
      createdAt: daysAgo(2),
    },
    {
      id: "sample-contribution-3",
      profileId: "sample-profile",
      campaignId: "sample-campaign",
      supporterName: "Anonymous",
      phone: "",
      amount: 2_500,
      status: "COMPLETED",
      createdAt: daysAgo(4),
    },
  ],
};
