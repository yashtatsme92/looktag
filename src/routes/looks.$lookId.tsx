import { useLayoutEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bookmark, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { LookCanvas } from "@/components/looks/look-canvas";
import { ProductList } from "@/components/looks/product-list";
import { ShopDock } from "@/components/looks/shop-dock";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getLookById, isUnauthorized } from "@/lib/looks/api";
import { useSavedLooks } from "@/lib/looks/saved";
import { shareOrCopy } from "@/lib/looks/share";
import { duplicateLookLocal, useLook, useLooksStore } from "@/lib/looks/store";
import { isEditorialLook, ownsLook } from "@/lib/looks/types";
import { recordShareView } from "@/lib/share/api";
import {
  lookShareMeta,
  notFoundShareHead,
  shareCacheHeaders,
  shareHead,
} from "@/lib/share-meta";

export const Route = createFileRoute("/looks/$lookId")({
  ssr: true,
  loader: async ({ params }) => {
    try {
      const look = await getLookById({ data: params.lookId });
      const share = await recordShareView({
        data: { kind: "look", id: params.lookId, found: Boolean(look) },
      });
      return { look, origin: share.origin };
    } catch {
      return { look: null, origin: "" };
    }
  },
  headers: ({ loaderData }) => shareCacheHeaders(Boolean(loaderData?.look)),
  head: ({ loaderData }) => {
    const look = loaderData?.look;
    if (!look) return notFoundShareHead("look");
    return shareHead(lookShareMeta(look, loaderData.origin));
  },
  component: LookPage,
});

function LookPage() {
  const { lookId } = Route.useParams();
  const { look: ssrLook } = Route.useLoaderData();
  const lookFromStore = useLook(lookId);
  const addLook = useLooksStore((s) => s.addLook);
  const deleteLook = useLooksStore((s) => s.deleteLook);
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const isSaved = useSavedLooks((s) => s.has(lookId));
  const toggleSaved = useSavedLooks((s) => s.toggle);

  useLayoutEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  const look = lookFromStore ?? (ssrLook && ssrLook.id === lookId ? ssrLook : undefined);

  if (!look) {
    return (
      <AppShell title="Look" backTo="/">
        <h1 className="font-display text-4xl">Look not found</h1>
        <p className="mt-3 text-muted-foreground">It may have been deleted.</p>
        <Button asChild className="mt-6">
          <Link to="/">Back to looks</Link>
        </Button>
      </AppShell>
    );
  }

  const activeId = selectedId ?? look.tags[0]?.id ?? null;
  const mine = ownsLook(look, user?.id);
  const creatorHref = !isEditorialLook(look) && look.userId ? look.userId : null;
  const shareTitle = look.title;
  const shareText = look.caption || `${look.title} on Looktag`;

  async function shareLook() {
    const url = `${window.location.origin}/looks/${lookId}`;
    const result = await shareOrCopy({
      title: shareTitle,
      text: shareText,
      url,
      kind: "look",
    });
    if (result === "copied") toast.success("Link copied");
    if (result === "shown") toast.message("Share this look", { description: url });
  }

  function saveLook() {
    const saved = toggleSaved(lookId);
    toast.success(saved ? "Saved" : "Removed from saved");
  }

  const trailing = (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={isSaved ? "Remove saved look" : "Save look"}
        aria-pressed={isSaved}
        onClick={saveLook}
      >
        <Bookmark className={isSaved ? "size-5 fill-current" : "size-5"} />
      </Button>
      <Button variant="ghost" size="icon" className="size-11" aria-label="Share look" onClick={() => void shareLook()}>
        <Share2 className="size-5" />
      </Button>
      {mine ? (
        <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Edit look">
          <Link to="/looks/$lookId/edit" params={{ lookId: look.id }}>
            <Pencil className="size-5" />
          </Link>
        </Button>
      ) : null}
      {mine && user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="More actions">
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                void (async () => {
                  try {
                    const copy = duplicateLookLocal(
                      look,
                      user.displayName?.trim() || "You",
                      user.id,
                    );
                    const saved = await addLook(copy);
                    toast.success("Look duplicated");
                    await navigate({ to: "/looks/$lookId/edit", params: { lookId: saved.id } });
                  } catch (error) {
                    if (isUnauthorized(error)) {
                      toast.error("Sign in to duplicate a look.");
                      return;
                    }
                    toast.error(error instanceof Error ? error.message : "Could not duplicate.");
                  }
                })();
              }}
            >
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  return (
    <AppShell title={look.title} backTo="/" trailing={trailing}>
      <article className="look-layout">
        <div className="look-layout-copy">
          <ScreenTitle kicker={creatorHref ? undefined : look.creator}>{look.title}</ScreenTitle>
          {creatorHref ? (
            <Link
              to="/creators/$userId"
              params={{ userId: creatorHref }}
              className="-mt-3 mb-4 block text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase underline-offset-4 hover:text-foreground hover:underline"
            >
              {look.creator}
            </Link>
          ) : null}
          {look.caption ? <p className="mb-4 text-sm text-muted-foreground">{look.caption}</p> : null}
        </div>

        <LookCanvas
          imageSrc={look.imageSrc}
          title={look.title}
          tags={look.tags}
          selectedId={activeId}
          onSelect={setSelectedId}
          fit="cover"
          className="look-layout-photo"
        />
        <div className="look-layout-shop">
          <ShopDock tags={look.tags} selectedId={activeId} onSelect={setSelectedId} />

          {look.tags.length > 0 ? (
            <section className="mt-6">
              <h2 className="ds-section-title mb-3">Pieces</h2>
              <ProductList tags={look.tags} selectedId={activeId} onSelect={setSelectedId} shoppable lookSrc={look.imageSrc} />
            </section>
          ) : null}
        </div>
      </article>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this look?</DialogTitle>
            <DialogDescription>
              {look.title} will be removed from your account. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void (async () => {
                  try {
                    await deleteLook(look.id);
                    toast.success("Look deleted");
                    await navigate({ to: "/" });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not delete.");
                  }
                })();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
