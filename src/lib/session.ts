// Stateless signed-JWT sessions. Kept free of DB imports so proxy.ts can use it.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "jp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Non-null when sessions can't be issued, so forms can show a clear message instead of crashing. */
export function sessionConfigError(): string | null {
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
    return "Server setup incomplete: AUTH_SECRET is not set. Add it in your hosting settings and redeploy.";
  }
  return null;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
