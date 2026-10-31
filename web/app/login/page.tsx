import { signIn } from "@/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm text-center">
      <h1 className="text-2xl font-semibold">Note Taker</h1>
      <p className="muted mt-2">Sign in with your company Google account.</p>
      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Sign-in refused. Use an allowed company account.
        </p>
      )}
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }} className="mt-6">
        <button className="btn btn-primary w-full justify-center">Continue with Google</button>
      </form>
    </div>
  );
}
