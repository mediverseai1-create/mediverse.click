import "server-only";
import type { OrgContext } from "@/lib/org";

export const isPro = (ctx: OrgContext) => ctx.plan === "professional";
export const canManage = (ctx: OrgContext) => ctx.role === "owner" || ctx.role === "admin";

export function planError(ctx: OrgContext, feature: string): string | null {
  if (!isPro(ctx)) return `${feature} is available on the Professional plan. Upgrade in Billing & Subscription.`;
  return null;
}
