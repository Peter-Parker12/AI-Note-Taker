import { z } from "zod";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { deleteMeetings } from "@/lib/meetings";

export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const body = z.object({ ids: z.array(z.string()).min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "ids required" }, { status: 400 });
  return Response.json({ deleted: await deleteMeetings(user.id, body.data.ids) });
}
