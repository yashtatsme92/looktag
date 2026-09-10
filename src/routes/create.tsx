import { useEffect, useLayoutEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LookEditor } from "@/components/looks/look-editor";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isUnauthorized } from "@/lib/looks/api";
import { useLooksStore } from "@/lib/looks/store";
import { emptyLook, type Look } from "@/lib/looks/types";

export const Route = createFileRoute("/create")({ component: CreateLook });

const DRAFT_KEY = "looktag-create-draft-v1";

function loadDraft(): Look | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Look>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") return null;
    return {
      ...emptyLook(),
      ...parsed,
      id: parsed.id,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return null;
  }
}

function saveDraft(look: Look) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(look));
  } catch {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...look, imageSrc: "" }));
    } catch {
      // quota / private mode
    }
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // private mode
  }
}

const PLACEHOLDER_LOOK: Look = {
  id: "create-draft",
  userId: "",
  title: "",
  caption: "",
  creator: "You",
  imageSrc: "",
  createdAt: 0,
  updatedAt: 0,
  tags: [],
};

function CreateLook() {
  const navigate = useNavigate();
  const addLook = useLooksStore((s) => s.addLook);
  const { user, isPending } = useCurrentUserState();
  const [look, setLook] = useState<Look>(PLACEHOLDER_LOOK);
  const [draftReady, setDraftReady] = useState(false);

  useLayoutEffect(() => {
    setLook(loadDraft() ?? emptyLook({ creator: "You" }));
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady || look.id === "create-draft") return;
    saveDraft(look);
  }, [draftReady, look]);

  useEffect(() => {
    if (!user) return;
    setLook((current) => ({
      ...current,
      userId: user.id,
      creator:
        current.creator.trim() && current.creator !== "You"
          ? current.creator
          : user.displayName?.trim() || current.creator,
    }));
  }, [user?.id, user?.displayName]);

  return (
    <AppShell title="Create" largeTitle>
      <LookEditor
        key={look.id}
        look={look}
        mode="create"
        onChange={setLook}
        saveLabel={
          user ? "Publish look" : isPending ? "Checking account…" : "Sign in to publish"
        }
        showCreatorField={!user}
        onReset={() => {
          clearDraft();
          setLook(emptyLook({ creator: user?.displayName?.trim() || "You", userId: user?.id ?? "" }));
        }}
        onCancel={() => navigate({ to: "/" })}
        onSave={async () => {
          if (isPending && !user) {
            toast.message("Still checking your account. Try again in a moment.");
            return;
          }
          if (!user) {
            saveDraft(look);
            toast.message("Create an account to publish this look.");
            await navigate({ to: "/login", search: { next: "/create" } });
            return;
          }
          try {
            const saved = await addLook({ ...look, userId: user.id, updatedAt: Date.now() });
            clearDraft();
            toast.success("Look published");
            await navigate({ to: "/looks/$lookId", params: { lookId: saved.id } });
          } catch (error) {
            if (isUnauthorized(error)) {
              saveDraft(look);
              toast.error("Sign in to publish a look.");
              await navigate({ to: "/login", search: { next: "/create" } });
              return;
            }
            toast.error(error instanceof Error ? error.message : "Could not save the look.");
          }
        }}
      />
    </AppShell>
  );
}
