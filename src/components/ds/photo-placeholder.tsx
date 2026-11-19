import { COPY } from "@/lib/errors/copy";
import { cn } from "@/lib/utils";

/** Quiet stand-in when a photo request fails. The frame around it stays put. */
export function PhotoPlaceholder({ className }: { className?: string }) {
  return <p className={cn("img-slot-fallback", className)}>{COPY.photoPlaceholder}</p>;
}
