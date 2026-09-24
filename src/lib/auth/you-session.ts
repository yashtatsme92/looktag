import { isAdminEmail } from "../admin/access.ts";

export type YouSessionState = "pending" | "guest" | "member" | "admin";

export type YouSessionInput = {
  isPending: boolean;
  user: { primaryEmail: string | null } | null;
};

export function resolveYouSessionState(input: YouSessionInput): YouSessionState {
  if (input.isPending) return "pending";
  if (!input.user) return "guest";
  return isAdminEmail(input.user.primaryEmail) ? "admin" : "member";
}

export function youSessionSignedIn(state: YouSessionState): boolean {
  return state === "member" || state === "admin";
}
