import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LookEditor } from "@/components/looks/look-editor";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isUnauthorized } from "@/lib/looks/api";
import { ownsLook, type Look } from "@/lib/looks/types";
import { useLook, useLooksStore } from "@/lib/looks/store";

export const Route = createFileRoute("/looks/$lookId_/edit")({ component: EditLook });

function EditLook() {
  const { lookId } = Route.useParams();
  const stored = useLook(lookId);
  const hydrated = useLooksStore((s) => s.hydrated);
  const replaceLook = useLooksStore((s) => s.replaceLook);
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [look, setLook] = useState<Look | null>(null);
  const lookPath = `/looks/${lookId}`;

  useEffect(() => {
    if (stored && (!look || look.id !== stored.id)) {
      setLook(stored);
    }
  }, [stored, look]);

  if (isPending || !hydrated || (stored && !look)) {
    return (
      <AppShell title="Edit" backTo={lookPath}>
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="Edit" backTo={lookPath}>
        <h1 className="font-display text-4xl">Sign in to edit</h1>
        <p className="mt-3 text-muted-foreground">Only the creator can change a look.</p>
        <Button asChild className="mt-6">
          <Link to="/login" search={{ next: `/looks/${lookId}/edit` }}>
            Sign in
          </Link>
        </Button>
      </AppShell>
    );
  }

  if (!stored || !look) {
    return (
      <AppShell title="Edit" backTo="/">
        <h1 className="font-display text-4xl">Look not found</h1>
        <Button asChild className="mt-6">
          <Link to="/">Back to looks</Link>
        </Button>
      </AppShell>
    );
  }

  if (!ownsLook(look, user.id)) {
    return (
      <AppShell title="Edit" backTo={lookPath}>
        <h1 className="font-display text-4xl">This look is not yours</h1>
        <p className="mt-3 text-muted-foreground">
          You can shop it, or publish a new look under your account.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/looks/$lookId" params={{ lookId: look.id }}>
              View look
            </Link>
          </Button>
          <Button asChild>
            <Link to="/create">New look</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Edit" backTo={lookPath}>
      <LookEditor
        look={look}
        mode="edit"
        onChange={setLook}
        saveLabel="Save changes"
        onCancel={() => navigate({ to: "/looks/$lookId", params: { lookId: look.id } })}
        onSave={async () => {
          try {
            await replaceLook({ ...look, userId: user.id, updatedAt: Date.now() });
            toast.success("Look updated");
            await navigate({ to: "/looks/$lookId", params: { lookId: look.id } });
          } catch (error) {
            if (isUnauthorized(error)) {
              toast.error("Sign in to edit this look.");
              return;
            }
            toast.error(error instanceof Error ? error.message : "Could not save the look.");
          }
        }}
      />
    </AppShell>
  );
}
