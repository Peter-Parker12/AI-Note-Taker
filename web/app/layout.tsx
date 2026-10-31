import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/auth";
import { getSessionUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = { title: "Note Taker" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body>
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="font-semibold">Note Taker</Link>
              {user && <>
                <Link href="/recordings" className="hover:underline">Recordings</Link>
                <Link href="/settings" className="hover:underline">Account</Link>
                {user.role === "ADMIN" && <Link href="/admin" className="hover:underline">Admin</Link>}
              </>}
            </nav>
            {user && (
              <div className="flex items-center gap-3 text-sm">
                <span className="muted hidden sm:inline">{user.email}</span>
                <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                  <button className="btn">Sign out</button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
