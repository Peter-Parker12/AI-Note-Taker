export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAdmin } = await import("@/lib/bootstrap");
    await ensureAdmin().catch((e) => console.error("[bootstrap] failed", e));
    const { startWorker } = await import("@/lib/worker");
    startWorker();
  }
}
