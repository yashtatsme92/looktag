import { getRequest } from "@tanstack/react-start/server";
import { resolveClientIp, transportPeerAddress } from "./native-nonce";

export function requestClientIp(): string | null {
  let current: Request;
  try {
    current = getRequest();
  } catch {
    return null;
  }
  return resolveClientIp({
    forwardedFor: current.headers.get("x-forwarded-for"),
    socketAddress: transportPeerAddress(current),
  });
}
