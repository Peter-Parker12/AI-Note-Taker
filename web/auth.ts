import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { burnComparison, verifyPassword } from "@/lib/password";
import { clearFailures, isLocked, recordFailure } from "@/lib/login-throttle";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!username || !password || isLocked(username)) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        const ok = user && !user.disabled ? await verifyPassword(password, user.passwordHash) : (await burnComparison(password), false);
        if (!ok || !user) { recordFailure(username); return null; }

        clearFailures(username);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, name: user.name ?? user.username, sv: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { // only present at sign-in
        token.uid = user.id;
        token.sv = (user as { sv?: number }).sv ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      session.user.sv = (token.sv as number | undefined) ?? 0;
      return session;
    },
  },
});
