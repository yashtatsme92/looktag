import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />;
  }
  if (user) {
    return (
      <div className="flex min-w-0 items-center [&_span.font-medium]:hidden sm:[&_span.font-medium]:inline">
        <UserButton />
      </div>
    );
  }
  return (
    <Button asChild variant="ghost" size="sm" className="px-2.5 sm:px-3">
      <Link to="/login">Sign in</Link>
    </Button>
  );
}
