import { useState } from "react";
import { MailPlus, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  EmptyState,
  FilterChips,
  Pagination,
  Panel,
  StatusBadge,
  inputCls,
  usePaged,
} from "@/components/kit";
import { useDemo } from "@/context/DemoStore";
import { formatDate } from "@/utils/format";
import type { Member, MembershipRole } from "@/types";
import { api } from "@/services/api";

const STATUSES = ["ALL", "ACTIVE", "INVITED", "SUSPENDED"] as const;

export function MemberDirectory({ staffOnly }: { staffOnly?: boolean }) {
  const { members, setMembers, user } = useDemo();
  const isAdmin = user?.role === "ORGANISATION_ADMIN";
  const isCurrentUser = (member: Member) => {
    if (user?.role !== "ORGANISATION_ADMIN") return false;
    return (
      Boolean(user.memberId && member.id === user.memberId) ||
      Boolean(user.email && member.email.trim().toLowerCase() === user.email.trim().toLowerCase())
    );
  };
  const [q, setQ] = useState("");
  const [st, setSt] = useState<(typeof STATUSES)[number]>("ALL");
  const [act, setAct] = useState<{ m: Member; kind: "suspend" | "remove" | "restore" } | null>(
    null,
  );
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviting, setInviting] = useState(false);
  const rows = members.filter(
    (m) =>
      (!isCurrentUser(m) || staffOnly) &&
      m.status !== "REMOVED" &&
      (!staffOnly || m.role !== "MEMBER") &&
      (st === "ALL" || m.status === st) &&
      [m.name, m.email, m.phone].some((v) => v.toLowerCase().includes(q.toLowerCase())),
  );
  const pg = usePaged(rows, 8);
  const activeCount = rows.filter((member) => member.status === "ACTIVE").length;
  const invitedCount = rows.filter((member) => member.status === "INVITED").length;
  const suspendedCount = rows.filter((member) => member.status === "SUSPENDED").length;
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  const setRole = async (id: string, role: MembershipRole) => {
    try {
      const updated = await api.organisations.updateMember(id, { role });
      setMembers((ms) => ms.map((m) => (m.id === id ? updated : m)));
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
        toast.success("Invitation created", {
          description: "Copy the link shown below to share it.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create an invitation.");
    } finally {
      setInviting(false);
    }
  };
  const actions = (m: Member) => (
    <div className="flex flex-wrap gap-1">
      {isAdmin && !staffOnly && (
        <select
          aria-label={`Role for ${m.name}`}
          className={inputCls + " h-8 w-28 text-xs"}
          value={m.role}
          onChange={(e) => setRole(m.id, e.target.value as MembershipRole)}
        >
          <option>ADMIN</option>
          <option>STAFF</option>
          <option>MEMBER</option>
        </select>
      )}
      {!isCurrentUser(m) &&
        (isAdmin || m.role === "MEMBER") &&
        (m.status === "SUSPENDED" ? (
          <Button size="sm" variant="ghost" onClick={() => setAct({ m, kind: "restore" })}>
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setAct({ m, kind: "suspend" })}>
            Suspend
          </Button>
        ))}
      {!isCurrentUser(m) && (isAdmin || m.role === "MEMBER") && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setAct({ m, kind: "remove" })}
        >
          Remove
        </Button>
      )}
    </div>
  );
  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <DirectoryStat
          icon={<UsersRound className="size-4" />}
          label={staffOnly ? "Team" : "People"}
          value={rows.length}
          tone="green"
        />
        <DirectoryStat
          icon={<ShieldCheck className="size-4" />}
          label="Active"
          value={activeCount}
          tone="blue"
        />
        <DirectoryStat
          icon={<MailPlus className="size-4" />}
          label={staffOnly ? "Invited" : "Invited"}
          value={invitedCount}
          tone="gold"
        />
      </div>
      <Panel className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label={staffOnly ? "Search staff" : "Search members"}
                className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Search name, email or phone"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              {!staffOnly && (
                <Button onClick={() => void inviteMember()} disabled={inviting}>
                  {inviting ? (
                    "Creating link..."
                  ) : (
                    <>
                      <MailPlus className="size-4" />
                      Invite member
                    </>
                  )}
                </Button>
              )}
              <FilterChips options={STATUSES} value={st} onChange={setSt} />
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{rows.length}</strong>{" "}
              {staffOnly ? "team members" : "people"}
              {st !== "ALL" ? ` · ${st.toLowerCase()}` : ""}
              {q.trim() ? ` · matching “${q.trim()}”` : ""}
            </span>
            {suspendedCount > 0 && <span>{suspendedCount} suspended</span>}
          </div>
        </div>
      </Panel>
      {inviteUrl && (
        <Panel className="mb-4 min-w-0 border-primary/20 bg-primary-soft/30 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MailPlus className="size-4 text-primary" />
            Invitation link ready
          </p>
          <p className="mt-2 break-all rounded-lg border bg-card p-3 font-mono text-xs text-muted-foreground">
            {inviteUrl}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            This link expires in seven days. Copy and share it with your new member.
          </p>
        </Panel>
      )}
      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title={
              q || st !== "ALL" ? "No people match" : staffOnly ? "No staff yet" : "No members yet"
            }
            description={
              q || st !== "ALL"
                ? "Try another search or filter."
                : staffOnly
                  ? "Your administrators and staff will appear here."
                  : "Invite people to join your organisation and participate in campaigns."
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5">Person</th>
                    <th className="px-5 py-3.5">Contact</th>
                    <th className="px-5 py-3.5">Role</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Joined</th>
                    <th className="px-5 py-3.5">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pg.rows.map((m) => (
                    <tr key={m.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <PersonAvatar name={m.name} initials={initials(m.name)} />
                          <span className="font-semibold">{m.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                        {m.email}
                        <br />
                        {m.phone ? `+${m.phone}` : "No phone added"}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={m.role} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground">
                        {formatDate(m.joinedAt)}
                      </td>
                      <td className="px-5 py-4">{actions(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:hidden">
              {pg.rows.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border bg-gradient-to-br from-card to-muted/25 p-4 transition hover:border-primary/25"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PersonAvatar name={m.name} initials={initials(m.name)} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{m.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {m.email || "No email added"}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                    <span>
                      {staffOnly ? "Role" : "Joined"} ·{" "}
                      {staffOnly ? m.role.toLowerCase() : formatDate(m.joinedAt)}
                    </span>
                    {staffOnly && <span>Joined · {formatDate(m.joinedAt)}</span>}
                    {m.phone && <span>+{m.phone}</span>}
                  </div>
                  {actions(m)}
                </div>
              ))}
            </div>
            <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} />
          </>
        )}
      </Panel>
      <ConfirmDialog
        open={!!act}
        onOpenChange={(o) => !o && setAct(null)}
        destructive={act?.kind !== "restore"}
        title={act ? `${act.kind[0].toUpperCase() + act.kind.slice(1)} ${act.m.name}?` : ""}
        description={
          act?.kind === "remove"
            ? "They will lose access to this organisation and its campaigns."
            : act?.kind === "suspend"
              ? "They won't be able to fundraise until restored."
              : "Their access will be restored."
        }
        confirmLabel={
          act?.kind === "remove" ? "Remove" : act?.kind === "suspend" ? "Suspend" : "Restore"
        }
        onConfirm={async () => {
          if (!act) return;
          const status =
            act.kind === "remove" ? "REMOVED" : act.kind === "suspend" ? "SUSPENDED" : "ACTIVE";
          try {
            const updated = await api.organisations.updateMember(act.m.id, { status });
            setMembers((ms) => ms.map((m) => (m.id === act.m.id ? updated : m)));
            toast.success("Updated");
            setAct(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update member status.");
          }
        }}
      />
    </>
  );
}

function DirectoryStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "green" | "blue" | "gold";
}) {
  const tones = {
    green: "bg-primary-soft text-primary",
    blue: "bg-info-soft text-info",
    gold: "bg-warning-soft text-warning",
  };
  return (
    <Panel className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.68rem] font-medium text-muted-foreground sm:text-xs">
          {label}
        </span>
        <span className="mt-0.5 block text-lg font-bold tabular-nums sm:text-xl">{value}</span>
      </span>
    </Panel>
  );
}

function PersonAvatar({ name, initials }: { name: string; initials: string }) {
  return (
    <span
      aria-label={`${name} initials`}
      className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary-soft to-info-soft text-xs font-bold text-primary"
    >
      {initials || <UserRound className="size-4" />}
    </span>
  );
}
