import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useSettingsStore } from "@/lib/settings/store";

export function useHousesClosed(serverOpen: boolean) {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const enabled = useSettingsStore((s) => s.labelsEnabled);
  return !serverOpen || (hydrated && !enabled);
}

export function HousesClosed() {
  return (
    <AppShell title="Houses" backTo="/" largeTitle={false}>
      <h1 className="ds-screen-title">Houses aren't available right now</h1>
      <Link to="/" className="house-exit">
        Back to Looks
      </Link>
    </AppShell>
  );
}
