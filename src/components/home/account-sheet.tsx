import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { clearPendingSave, rememberPendingSave } from "@/lib/looks/pending-save";
import { visibleOauthProviders } from "@/lib/settings/model";
import { useSettingsStore } from "@/lib/settings/store";
import "./account-sheet.css";

export function AccountSheet({
  open,
  onOpenChange,
  title = "Sign in to save",
  description,
  primary = "Continue with email",
  secondary = "Cancel",
  next,
  intent,
  pendingSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  primary?: string;
  secondary?: string;
  next?: string;
  /** Save returns to this page after sign-in. Cancel returns without leaving. */
  intent?: "publish" | "draft" | "follow" | "save";
  pendingSave?: string;
}) {
  const here = useRouterState({ select: (s) => s.location.href });
  const settings = useSettingsStore();
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const oauth = visibleOauthProviders(settings, GROK_PROVIDERS);
  const emailOn = settings.signupEmail;
  const target = next ?? (intent === "save" ? here : "/");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const providerRef = useRef<HTMLButtonElement>(null);
  const continuing = useRef(false);

  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  function onSheetOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      continuing.current = false;
    } else if (!continuing.current) {
      clearPendingSave();
    }
    onOpenChange(nextOpen);
  }

  function continueWithEmail() {
    clearPendingSave();
    if (intent === "save" && pendingSave) rememberPendingSave(pendingSave);
    continuing.current = true;
  }

  function continueWithProvider(provider: (typeof oauth)[number]) {
    clearPendingSave();
    if (intent === "save" && pendingSave) rememberPendingSave(pendingSave);
    continuing.current = true;
    setError("");
    setBusy(true);
    const unlock = window.setTimeout(() => {
      setBusy(false);
      continuing.current = false;
      setError("That sign-in did not complete. Try again or use another method.");
    }, 7_000);
    const social =
      provider.idp === "google" || provider.idp === "apple"
        ? settings.providers[provider.idp].credentials
          ? provider.idp
          : undefined
        : undefined;
    void signIn(provider.providerId, { callbackURL: target, social }).catch((err) => {
      window.clearTimeout(unlock);
      setBusy(false);
      continuing.current = false;
      setError(err instanceof Error ? err.message : "Sign-in did not complete.");
    });
  }

  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement;
    }
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onSheetOpenChange}>
      <DrawerContent
        className="account-sheet-modal"
        {...(description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (providerRef.current ?? emailRef.current)?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus({ preventScroll: true });
        }}
      >
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pt-2 pb-6">
          {oauth.map((provider, index) => (
            <Button
              key={provider.providerId}
              ref={index === 0 ? providerRef : undefined}
              type="button"
              disabled={busy}
              className="h-11 w-full rounded-[12px]"
              onClick={() => continueWithProvider(provider)}
            >
              Continue with {provider.label}
            </Button>
          ))}
          {oauth.length > 0 && emailOn ? (
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ) : null}
          {error ? (
            <p role="alert" aria-live="assertive" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {emailOn ? (
            <>
              <label className="text-sm font-medium" htmlFor={emailId}>
                Email
              </label>
              <Input
                ref={emailRef}
                id={emailId}
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button
                asChild
                variant={oauth.length > 0 ? "outline" : "default"}
                className="h-11 rounded-[12px]"
                disabled={busy}
              >
                <Link
                  to="/login"
                  search={{ next: target, email, intent: intent === "save" ? "save" : undefined }}
                  onClick={continueWithEmail}
                >
                  {primary}
                </Link>
              </Button>
            </>
          ) : oauth.length === 0 ? (
            <Button asChild className="h-11">
              <Link
                to="/login"
                search={{ next: target, intent: intent === "save" ? "save" : undefined }}
                onClick={continueWithEmail}
              >
                Continue to sign in
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="h-11" onClick={() => onSheetOpenChange(false)}>
            {secondary}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
