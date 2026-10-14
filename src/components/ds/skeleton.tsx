import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Instant placeholder for a known pending flag. Timed loads use useDelayedLoad instead. */

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("skeleton", className)} {...props} />;
}

export function SkeletonTile({
  captions = false,
  className,
}: {
  captions?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("skeleton skeleton-tile", className)}>
      {captions ? (
        <div className="skeleton-tile-captions">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonGrid({
  count = 8,
  lead = true,
  captions = false,
  className,
}: {
  count?: number;
  lead?: boolean;
  captions?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton-grid", className)}
      data-has-lead={lead ? "true" : "false"}
    >
      {Array.from({ length: Math.max(0, count) }, (_, index) => (
        <SkeletonTile key={index} captions={captions} />
      ))}
    </div>
  );
}

export function SkeletonOfferRow({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("skeleton-offer-row", className)}>
      <Skeleton className="skeleton-pin-slot" />
      <Skeleton className="skeleton-thumb" />
      <div className="skeleton-lines">
        <span />
        <span />
      </div>
      <Skeleton className="skeleton-button" />
    </div>
  );
}

export function SkeletonAdminRow({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("skeleton-admin-row", className)}>
      <Skeleton className="skeleton-admin-mark" />
      <div className="skeleton-lines">
        <span />
        <span />
      </div>
      <Skeleton className="skeleton-switch" />
    </div>
  );
}
