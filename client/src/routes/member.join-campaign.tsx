import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, PageHeader, Panel, StatusBadge, inputCls } from "@/components/kit";
import { useDemo } from "@/context/DemoStore";
import { meta } from "@/utils/meta";
import type { Campaign } from "@/types";
import { api } from "@/services/api";

export const Route = createFileRoute("/member/join-campaign")({
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({ code: typeof s.code === "string" ? s.code : undefined }),
  head: () => meta("Join a campaign", "Use a join code or link from your organisation to join a campaign."),
  component: Join,
});

function Join() {
  const { code: initial } = Route.useSearch();
  const { setParticipants } = useDemo();
  const [code, setCode] = useState(initial ?? ""); const [err, setErr] = useState(""); const [found, setFound] = useState<Campaign | null>(null); const [joined, setJoined] = useState(false); const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [joining, setJoining] = useState(false);
  const lookup = async (e: React.FormEvent) => {
    e.preventDefault(); setFound(null); setJoined(false); setAlreadyJoined(false); setErr("");
    const raw = code.trim().toUpperCase().split("/").pop() ?? "";
    if (!raw) return setErr("Enter a campaign code or link.");
    setLookingUp(true);
    try {
      const c = await api.campaigns.findByCode(raw);
      if (c.status !== "ACTIVE") return setErr("Campaign code not found.");
      setFound(c);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "We couldn't find that campaign.");
    } finally {
      setLookingUp(false);
    }
  };
  const join = async () => {
    if (!found || joining) return;
    setJoining(true);
    try {
      const result = await api.campaigns.join(found.joinCode);
      setParticipants(await api.campaigns.mine());
      if (result.alreadyJoined) {
        setAlreadyJoined(true);
        return;
      }
      setJoined(true); toast.success("Joined campaign");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to join campaign.");
    } finally {
      setJoining(false);
    }
  };
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Join a campaign" description="Paste the join link or enter the code your organisation shared." />
      <Panel className="p-5 sm:p-6">
        <form onSubmit={lookup} className="space-y-4" noValidate>
          <Field label="Join code or link" htmlFor="code" error={err} hint="Try GRACE-FOOD (draft), GRACE-YOUTH, or TUMAINI-T3"><input id="code" className={inputCls + " font-mono uppercase"} value={code} onChange={(e) => setCode(e.target.value)} placeholder="GRACE-BUILD" /></Field>
          <Button type="submit" className="w-full" disabled={lookingUp}>{lookingUp && <Loader2 className="h-4 w-4 animate-spin" />}{lookingUp ? "Finding campaign…" : "Find campaign"}</Button>
        </form>
        {found && (
          <div className="mt-6 rounded-2xl border p-5">
            {joined ? (
              <div className="text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-primary" /><p className="mt-2 font-semibold">You've joined {found.name}</p>
                <Button asChild className="mt-4"><Link to="/member/fundraising-pages/create" search={{ campaign: found.id }}>Create your fundraising page</Link></Button></div>
            ) : (<>
              <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{found.name}</p></div><StatusBadge status={found.status} /></div>
              <p className="mt-2 text-sm text-muted-foreground">{found.shortDescription}</p>
              <Button className="mt-4 w-full" onClick={join} disabled={joining}>{joining && <Loader2 className="h-4 w-4 animate-spin" />}{joining ? "Joining…" : "Join campaign"}</Button>
            </>)}
          </div>
        )}
      </Panel>
      <Dialog open={alreadyJoined} onOpenChange={setAlreadyJoined}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You've already joined this campaign</DialogTitle>
            <DialogDescription>
              You are already a member of {found?.name ?? "this campaign"}. You can view it from your campaigns.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlreadyJoined(false)}>Close</Button>
            <Button asChild><Link to="/member/campaigns">Go to my campaigns</Link></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
