import type { clients } from "@/db/schema";

export function publicClient(c: typeof clients.$inferSelect) {
  const { smtpPass, ...rest } = c;
  return { ...rest, hasPass: !!smtpPass };
}
