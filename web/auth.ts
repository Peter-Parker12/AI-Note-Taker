import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const adminEmails = () => list(process.env.ADMIN_EMAILS);

async function isAllowed(email: string) {
  const e = email.toLowerCase();
  if (adminEmails().includes(e)) return true;
  if (list(process.env.ALLOWED_EMAILS).includes(e)) return true;
  if (list(process.env.ALLOWED_EMAIL_DOMAINS).includes(e.split("@")[1])) return true;
  return !!(await prisma.invite.findUnique({ where: { email: e } })); // fail closed otherwise
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google({
      authorization: {
        params: {
          // drive.file: only files this app creates (recap docs).
          scope: "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email || profile.email_verified === false) return false;
      if (!(await isAllowed(profile.email))) return false;
      const existing = await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });
      return !existing?.disabled;
    },
    async jwt({ token, account, profile }) {
      if (account && profile?.email) {
        const email = profile.email.toLowerCase();
        // First account ever, or anyone in ADMIN_EMAILS, is an admin.
        const isFirst = (await prisma.user.count()) === 0;
        const makeAdmin = isFirst || adminEmails().includes(email);
        const user = await prisma.user.upsert({
          where: { email },
          create: {
            email,
            name: profile.name ?? null,
            image: (profile.picture as string | undefined) ?? null,
            googleRefreshToken: account.refresh_token ?? null,
            role: makeAdmin ? "ADMIN" : "MEMBER",
            lastLoginAt: new Date(),
          },
          update: {
            name: profile.name ?? undefined,
            image: (profile.picture as string | undefined) ?? undefined,
            lastLoginAt: new Date(),
            ...(makeAdmin ? { role: "ADMIN" as const } : {}),
            ...(account.refresh_token ? { googleRefreshToken: account.refresh_token } : {}),
          },
        });
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
