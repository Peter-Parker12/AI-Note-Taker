import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audioSize } from "@/lib/meetings";
import { TokenManager } from "@/components/token-manager";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await requireUser();
  const [tokens, meetings] = await Promise.all([
    prisma.apiToken.findMany({
      where: { userId: user.id }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    }),
    prisma.meeting.findMany({ where: { userId: user.id }, select: { audioPath: true } }),
  ]);
  const bytes = (await Promise.all(meetings.map((m) => audioSize(m.audioPath)))).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Account</h1>

      <section className="card space-y-1 text-sm">
        <p><span className="muted">Name</span> {user.name ?? "—"}</p>
        <p><span className="muted">Email</span> {user.email}</p>
        <p><span className="muted">Role</span> {user.role === "ADMIN" ? "Admin" : "Member"}</p>
        <p><span className="muted">Usage</span> {meetings.length} recordings · {(bytes / 1024 / 1024).toFixed(1)} MB of audio</p>
        <p>
          <span className="muted">Google Drive export</span>{" "}
          {user.googleRefreshToken ? "Connected" : "Not connected — sign out and sign in again, accepting the Drive permission"}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Chrome extension</h2>
        <p className="muted">Create a token, then paste it with the server URL into the extension’s options page. Each device or browser should get its own token so you can revoke one without affecting the others.</p>
        <TokenManager
          serverUrl={process.env.AUTH_URL ?? ""}
          tokens={tokens.map((t) => ({ ...t, lastUsedAt: t.lastUsedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }))}
        />
      </section>
    </div>
  );
}
