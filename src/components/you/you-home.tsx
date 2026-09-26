import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, authEnabled, signOut } from "@/lib/auth/client";
import type { AppUser } from "@/lib/auth/use-current-user";
import { captureSessionToken } from "@/lib/login-next";
import { normalizeLoginEmail } from "@/lib/admin/access";
import { CREATE_DRAFT_KEY } from "@/lib/looks/create-draft";
import { useSavedLooks } from "@/lib/looks/saved";
import { useLooksStore } from "@/lib/looks/store";
import type { Look } from "@/lib/looks/types";

type YouPane = "saved" | "drafts" | "profile";

type DraftCard = {
  title: string;
  imageSrc: string;
  pins: number;
  updatedAt: number;
};

export function YouHome({ user }: { user: AppUser | null }) {
  const [pane, setPane] = useState<YouPane>("saved");
  const [sheetOpen, setSheetOpen] = useState(false);
  const saved = useSavedItems();
  const draft = useCreateDraft();
  const guest = !user;

  return (
    <div className="you-home">
      <header className="you-bar">
        <span className="w-11" />
        <h1 className="you-title">You</h1>
        <span className="w-11" />
      </header>
      <div className="you-switch" role="tablist" aria-label="You">
        {(
          [
            ["saved", "Saved"],
            ["drafts", "Drafts"],
            ["profile", "Profile"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pane === id}
            className="you-switch-item"
            data-on={pane === id ? "true" : "false"}
            onClick={() => setPane(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === "saved" ? (
        <SavedPane saved={saved} guest={guest} onSignIn={() => setSheetOpen(true)} />
      ) : null}
      {pane === "drafts" ? <DraftsPane draft={draft} /> : null}
      {pane === "profile" ? <ProfilePane user={user} onSignIn={() => setSheetOpen(true)} /> : null}

      <YouAccountSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function SavedPane({
  saved,
  guest,
  onSignIn,
}: {
  saved: Look[];
  guest: boolean;
  onSignIn: () => void;
}) {
  if (saved.length === 0) {
    return (
      <div className="you-empty">
        <p className="you-empty-title">{guest ? "Saved" : "Nothing saved yet"}</p>
        <p className="you-empty-body">
          {guest
            ? "Save looks while you browse"
            : "Hangtag looks you love while you browse. They land here."}
        </p>
        {guest ? (
          <button type="button" className="create-btn-primary you-sign-in" onClick={onSignIn}>
            Sign in
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="you-grid">
      {saved.map((look) => (
        <li key={look.id}>
          <Link to="/looks/$lookId" params={{ lookId: look.id }} className="you-card">
            {look.imageSrc ? (
              <img src={look.imageSrc} alt="" className="you-card-photo" />
            ) : (
              <span className="you-card-photo you-card-empty" />
            )}
            <span className="you-hangtag">{look.title.trim() || "Untitled"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DraftsPane({ draft }: { draft: DraftCard | null }) {
  if (!draft) {
    return (
      <div className="you-empty">
        <p className="you-empty-title">In progress</p>
        <p className="you-empty-body">A look you start on Create stays here until you publish.</p>
      </div>
    );
  }
  const when = draftLabel(draft.updatedAt);
  return (
    <div className="you-drafts">
      <p className="you-kicker">In progress</p>
      <article className="you-draft">
        {draft.imageSrc ? <img src={draft.imageSrc} alt="" className="you-draft-photo" /> : null}
        <div className="you-draft-copy">
          <p className="you-draft-title">{draft.title.trim() || "Untitled draft"}</p>
          <p className="you-draft-meta">
            {draft.pins === 1 ? "1 pin" : `${draft.pins} pins`}
            {when ? ` · ${when}` : ""}
          </p>
          <Link to="/create" className="you-draft-edit">
            Edit
          </Link>
        </div>
      </article>
    </div>
  );
}

function ProfilePane({ user, onSignIn }: { user: AppUser | null; onSignIn: () => void }) {
  if (!user) {
    return (
      <div className="you-empty">
        <p className="you-empty-title">Profile</p>
        <p className="you-empty-body">Sign in to keep a name on the looks you publish.</p>
        <button type="button" className="create-btn-primary you-sign-in" onClick={onSignIn}>
          Sign in
        </button>
      </div>
    );
  }
  const name = user.displayName?.trim() || "You";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="you-profile">
      <span className="you-avatar" aria-hidden>
        {initials || "Y"}
      </span>
      <p className="you-profile-name">{name}</p>
      {user.primaryEmail ? <p className="you-profile-mail">{user.primaryEmail}</p> : null}
      <button
        type="button"
        className="create-btn-ghost create-btn-draft you-sign-out"
        onClick={() => void signOut("/login")}
      >
        Sign out
      </button>
    </div>
  );
}

function YouAccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authEnabled) {
      setError("Sign-in is turned off.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({
        email: normalizeLoginEmail(email),
        password,
      });
      if (result.error) throw new Error(result.error.message ?? "Could not sign in.");
      captureSessionToken(result.data?.token);
      onOpenChange(false);
      toast.success("Signed in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Sign in to continue</DrawerTitle>
          <DrawerDescription>Sign in to sync You. Cancel returns here.</DrawerDescription>
        </DrawerHeader>
        <form className="flex flex-col gap-3 px-5 pt-1 pb-6" onSubmit={(event) => void onSubmit(event)}>
          <label className="you-kicker" htmlFor="you-email">
            Email
          </label>
          <Input
            id="you-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label className="you-kicker" htmlFor="you-password">
            Password
          </label>
          <Input
            id="you-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11" disabled={busy}>
            {busy ? "Continuing…" : "Continue with email"}
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function useSavedItems(): Look[] {
  const hydrate = useSavedLooks((s) => s.hydrate);
  const ids = useSavedLooks((s) => s.ids);
  const looks = useLooksStore((s) => s.looks);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return ids.map((id) => looks.find((look) => look.id === id)).filter((look): look is Look => Boolean(look));
}

function useCreateDraft(): DraftCard | null {
  const [draft, setDraft] = useState<DraftCard | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CREATE_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Look>;
      const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      const imageSrc = typeof parsed.imageSrc === "string" ? parsed.imageSrc : "";
      const title = typeof parsed.title === "string" ? parsed.title : "";
      if (!imageSrc && !title && tags.length === 0) return;
      setDraft({
        title,
        imageSrc,
        pins: tags.length,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      });
    } catch {
      setDraft(null);
    }
  }, []);
  return draft;
}

function draftLabel(updatedAt: number): string {
  if (!updatedAt) return "";
  const day = 24 * 60 * 60 * 1000;
  const age = Date.now() - updatedAt;
  if (age < day) return "edited today";
  if (age < 2 * day) return "yesterday";
  return "";
}
