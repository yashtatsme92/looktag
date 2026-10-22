import { useLayoutEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SkeletonGrid } from "@/components/ds/skeleton";

/** Marks the document so the dimmed previous page is replaced by an opaque skeleton, not a blank frame. */
function useRouteSkeleton() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("route-skeleton");
    return () => root.classList.remove("route-skeleton");
  }, []);
}

export function HousesIndexPending() {
  useRouteSkeleton();
  return (
    <AppShell title="Houses" largeTitle={false}>
      <SkeletonGrid count={8} captions />
    </AppShell>
  );
}

export function HouseProfilePending() {
  useRouteSkeleton();
  return (
    <AppShell title="House" backTo="/houses">
      <article className="house-profile">
        <div className="house-profile-lines">
          <h2 className="ops-section house-looks-title">Lines</h2>
          <SkeletonGrid count={4} captions />
        </div>
      </article>
    </AppShell>
  );
}

export function HouseLinePending() {
  useRouteSkeleton();
  return (
    <AppShell title="Line" backTo="/houses">
      <div className="house-lines-block">
        <h2 className="ops-section house-looks-title">Styles</h2>
        <SkeletonGrid count={4} captions />
      </div>
    </AppShell>
  );
}

export function HouseStylePending() {
  useRouteSkeleton();
  return (
    <AppShell title="Style" backTo="/houses">
      <div className="house-lines-block">
        <SkeletonGrid count={1} />
      </div>
    </AppShell>
  );
}
