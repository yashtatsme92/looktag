import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/errors/copy";

export function NotFoundScreen() {
  return (
    <AppShell title="Not found">
      <div data-screen="not-found" role="alert">
        <h1 className="ds-screen-title">{COPY.notFoundTitle}</h1>
        <p className="mt-3 max-w-md text-muted-foreground">{COPY.notFoundBody}</p>
        <Button asChild className="mt-6">
          <Link to="/">{COPY.backToLooks}</Link>
        </Button>
      </div>
    </AppShell>
  );
}
