import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; sv: number };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    sv?: number;
  }
}
