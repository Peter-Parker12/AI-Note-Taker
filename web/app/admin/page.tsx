import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ActionButton } from "@/components/confirm-button";
import { InviteForm } from "@/components/invite-form";

export const dynamic = "force-dynamic";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { dateStyle: "medium" }) : "never");

export default async function Admin() {
  const me = await requireAdmin();
  const [users, invites, jobCounts, meetingCount] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { meetings: true, tokens: true } } } }),
    prisma.invite.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.job.groupBy({ by: ["status"], _count: true }),
    prisma.meeting.count(),
  ]);
  const jobs = Object.fromEntries(jobCounts.map((j) => [j.status, j._count]));
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Users", users.length], ["Recordings", meetingCount], ["Jobs pending", (jobs.PENDING ?? 0) + (jobs.RUNNING ?? 0)], ["Jobs failed", jobs.FAILED ?? 0]].map(([k, v]) => (
          <div key={k as string} className="card"><p className="muted">{k}</p><p className="text-2xl font-semibold">{v}</p></div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="muted border-b border-neutral-200 dark:border-neutral-800">
              <tr><th className="py-2">User</th><th>Role</th><th>Recordings</th><th>Tokens</th><th>Last login</th><th>Status</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {users.map((u) => {
                const self = u.id === me.id;
                return (
                  <tr key={u.id}>
                    <td className="py-2 pr-3"><span className="font-medium">{u.name ?? u.email}</span>{u.name && <span className="muted block">{u.email}</span>}</td>
                    <td className="pr-3">{u.role === "ADMIN" ? "Admin" : "Member"}</td>
                    <td className="pr-3">{u._count.meetings}</td>
                    <td className="pr-3">{u._count.tokens}</td>
                    <td className="whitespace-nowrap pr-3">{date(u.lastLoginAt)}</td>
                    <td className={`pr-3 ${u.disabled ? "text-red-600" : ""}`}>{u.disabled ? "Disabled" : "Active"}</td>
                    <td className="space-x-2 whitespace-nowrap py-2 text-right">
                      {!self && <>
                        <ActionButton url={`/api/admin/users/${u.id}`} method="PATCH"
                          body={{ role: u.role === "ADMIN" ? "MEMBER" : "ADMIN" }}
                          label={u.role === "ADMIN" ? "Make member" : "Make admin"} />
                        <ActionButton url={`/api/admin/users/${u.id}`} method="PATCH" body={{ disabled: !u.disabled }}
                          label={u.disabled ? "Enable" : "Disable"}
                          confirmText={u.disabled ? undefined : `Disable ${u.email}? They are signed out and their API tokens stop working.`} />
                        <ActionButton url={`/api/admin/users/${u.id}`} method="DELETE" label="Delete"
                          confirmText={`Delete ${u.email} and ALL their recordings, transcripts and tokens? This can't be undone.`} />
                      </>}
                      {self && <span className="muted">you</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Who can sign in</h2>
        <p className="muted">
          {domains.length ? <>Anyone with a verified Google account on <strong>{domains.join(", ")}</strong> (set by <code>ALLOWED_EMAIL_DOMAINS</code>), plus the invited addresses below.</> : <>Only invited addresses and those set in the server environment.</>}
        </p>
        <InviteForm />
        <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2">
              <span>{i.email} <span className="muted">· invited {date(i.createdAt)}{i.invitedBy ? ` by ${i.invitedBy}` : ""}</span></span>
              <ActionButton url={`/api/admin/invites/${i.id}`} method="DELETE" label="Remove" />
            </li>
          ))}
          {!invites.length && <li className="muted py-2">No invites.</li>}
        </ul>
        <p className="muted">Removing an invite stops future sign-ins; to cut off someone already signed in, disable them above.</p>
      </section>
    </div>
  );
}
