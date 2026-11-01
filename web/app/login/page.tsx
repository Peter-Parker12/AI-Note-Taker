import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="text-center text-2xl font-semibold">Note Taker</h1>
      <p className="muted mt-2 text-center">Sign in with your username and password.</p>
      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Incorrect username or password, the account is disabled, or too many attempts. Wait a few minutes and try again.
        </p>
      )}
      <form
        className="mt-6 space-y-3"
        action={async (form: FormData) => {
          "use server";
          try {
            // On success signIn throws NEXT_REDIRECT (to "/"), which must propagate.
            await signIn("credentials", {
              username: String(form.get("username") ?? ""),
              password: String(form.get("password") ?? ""),
              redirectTo: "/",
            });
          } catch (e) {
            if (e instanceof AuthError) redirect("/login?error=1");
            throw e;
          }
        }}
      >
        <input name="username" className="input" placeholder="Username" autoComplete="username" autoCapitalize="none" required autoFocus />
        <input name="password" type="password" className="input" placeholder="Password" autoComplete="current-password" required />
        <button className="btn btn-primary w-full justify-center">Sign in</button>
      </form>
    </div>
  );
}
