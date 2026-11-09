import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, FilterChips, Pagination, Panel, SearchInput, StatusBadge, inputCls, usePaged } from "@/components/kit";
import { useDemo } from "@/context/DemoStore";
import { formatDate } from "@/utils/format";
import type { Member, MembershipRole } from "@/types";
import { api } from "@/services/api";

const STATUSES = ["ALL", "ACTIVE", "INVITED", "SUSPENDED"] as const;

export function MemberDirectory({ staffOnly }: { staffOnly?: boolean }) {
  const { members, setMembers, user } = useDemo();
  const isAdmin = user?.role === "ORGANISATION_ADMIN";
  const hiddenMemberId = isAdmin && !staffOnly ? user?.memberId : undefined;
  const [q, setQ] = useState(""); const [st, setSt] = useState<(typeof STATUSES)[number]>("ALL");
  const [act, setAct] = useState<{ m: Member; kind: "suspend" | "remove" | "restore" } | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviting, setInviting] = useState(false);
  const rows = members.filter((m) => m.id !== hiddenMemberId && m.status !== "REMOVED" && (!staffOnly || m.role !== "MEMBER") && (st === "ALL" || m.status === st) &&
    [m.name, m.email, m.phone].some((v) => v.toLowerCase().includes(q.toLowerCase())));
  const pg = usePaged(rows, 8);
  const setRole = async (id: string, role: MembershipRole) => {
    try {
      const updated = await api.organisations.updateMember(id, { role });
      setMembers((ms) => ms.map((m) => m.id === id ? updated : m));
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update member role.");
    }
  };
  const inviteMember = async () => {
    setInviting(true);
    try {
      const invitation = await api.organisations.inviteMember();
      const url = `${window.location.origin}/register?invite=${encodeURIComponent(invitation.token)}`;
      setInviteUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invitation link copied");
      } catch {
        toast.success("Invitation created", { description: "Copy the link shown below to share it." });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create an invitation.");
    } finally {
      setInviting(false);
    }
  };
  const actions = (m: Member) => (
    <div className="flex flex-wrap gap-1">
      {isAdmin && !staffOnly && <select aria-label={`Role for ${m.name}`} className={inputCls + " h-8 w-28 text-xs"} value={m.role} onChange={(e) => setRole(m.id, e.target.value as MembershipRole)}><option>ADMIN</option><option>STAFF</option><option>MEMBER</option></select>}
      {(isAdmin || m.role === "MEMBER") && (m.status === "SUSPENDED" ? <Button size="sm" variant="ghost" onClick={() => setAct({ m, kind: "restore" })}>Restore</Button> : <Button size="sm" variant="ghost" onClick={() => setAct({ m, kind: "suspend" })}>Suspend</Button>)}
      {(isAdmin || m.role === "MEMBER") && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAct({ m, kind: "remove" })}>Remove</Button>}
    </div>
  );
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email or phone" />
        <div className="flex flex-col gap-3 sm:items-end">
          {!staffOnly && <Button onClick={() => void inviteMember()} disabled={inviting}>{inviting ? "Creating link..." : "Invite member"}</Button>}
          <FilterChips options={STATUSES} value={st} onChange={setSt} />
        </div>
      </div>
      {inviteUrl && <Panel className="mb-4 min-w-0 space-y-2 p-4"><p className="text-sm font-semibold">Invitation link</p><p className="break-all text-sm text-muted-foreground">{inviteUrl}</p><p className="text-xs text-muted-foreground">This link expires in seven days. It remains valid if a membership limit is reached before the plan is upgraded.</p></Panel>}
      <Panel>
        {rows.length === 0 ? <EmptyState title="No people match" description="Try a different search or filter." /> : (<>
          <table className="hidden w-full text-sm lg:table">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Name</th><th className="p-4">Contact</th><th className="p-4">Role</th><th className="p-4">Status</th><th className="p-4">Joined</th><th className="p-4">Actions</th></tr></thead>
            <tbody>{pg.rows.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-4 font-medium">{m.name}</td>
                <td className="p-4 text-muted-foreground">{m.email}<br />+{m.phone}</td>
                <td className="p-4"><StatusBadge status={m.role} /></td>
                <td className="p-4"><StatusBadge status={m.status} /></td>
                <td className="p-4 text-muted-foreground">{formatDate(m.joinedAt)}</td>
                <td className="p-4">{actions(m)}</td>
              </tr>))}</tbody>
          </table>
          <div className="divide-y lg:hidden">{pg.rows.map((m) => (
            <div key={m.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{m.name}</p><p className="truncate text-xs text-muted-foreground">{m.email} · +{m.phone}</p></div><StatusBadge status={m.status} /></div>
              <p className="text-xs text-muted-foreground">Joined {formatDate(m.joinedAt)}</p>
              {actions(m)}
            </div>))}</div>
          <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} />
        </>)}
      </Panel>
      <ConfirmDialog open={!!act} onOpenChange={(o) => !o && setAct(null)} destructive={act?.kind !== "restore"}
        title={act ? `${act.kind[0].toUpperCase() + act.kind.slice(1)} ${act.m.name}?` : ""}
        description={act?.kind === "remove" ? "They will lose access to this organisation and its campaigns." : act?.kind === "suspend" ? "They won't be able to fundraise until restored." : "Their access will be restored."}
        confirmLabel={act?.kind === "remove" ? "Remove" : act?.kind === "suspend" ? "Suspend" : "Restore"}
        onConfirm={async () => {
          if (!act) return;
          const status = act.kind === "remove" ? "REMOVED" : act.kind === "suspend" ? "SUSPENDED" : "ACTIVE";
          try {
            const updated = await api.organisations.updateMember(act.m.id, { status });
            setMembers((ms) => ms.map((m) => m.id === act.m.id ? updated : m));
            toast.success("Updated");
            setAct(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update member status.");
          }
        }} />
    </>
  );
}
