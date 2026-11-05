import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/kit";
import { MemberDirectory } from "@/components/organisation/MemberDirectory";
import { useDemo } from "@/context/DemoStore";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/organisation/members")({
  head: () => meta("Members", "Search, manage roles and access for your organisation's members."),
  component: Members,
});

function Members() {
  const { org } = useDemo();
  return <><PageHeader title="Members" description={`Everyone who belongs to ${org.name || "your organisation"}.`} /><MemberDirectory /></>;
}
