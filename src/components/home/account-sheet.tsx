import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
  const navigate = useNavigate();
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

  function prepareEmailContinuation() {
    clearPendingSave();
    if (intent === "save" && pendingSave) rememberPendingSave(pendingSave);
    continuing.current = true;
  }

  function continueWithEmail() {
    prepareEmailContinuation();
    void navigate({
      to: "/login",
      search: { next: target, email, intent: intent === "save" ? "save" : undefined },
    });
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
              variant={provider.idp === "google" ? "outline" : "default"}
              disabled={busy}
              className={
                provider.idp === "google"
                  ? "h-11 w-full rounded-[12px] border border-[#E0E0E0] bg-white text-[#111] hover:bg-neutral-50"
                  : "h-11 w-full rounded-[12px]"
              }
              onClick={() => continueWithProvider(provider)}
            >
              {provider.idp === "google" ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V8.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 6.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 3.09 14.97 2 12 2a11 11 0 0 0-9.82 6.06L5.84 10.9C6.71 8.3 9.14 6.37 12 6.37z"
                  />
                </svg>
              ) : null}
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
                type="button"
                className="h-11 rounded-[12px] bg-[#111] text-white hover:bg-[#111]/90"
                disabled={busy}
                onClick={continueWithEmail}
              >
                {primary}
              </Button>
            </>
          ) : (
            <Button asChild className="h-11">
              <Link
                to="/login"
                search={{ next: target, intent: intent === "save" ? "save" : undefined }}
                onClick={prepareEmailContinuation}
              >
                Continue to sign in
              </Link>
            </Button>
          )}
          <Button type="button" variant="ghost" className="h-11" onClick={() => onSheetOpenChange(false)}>
            {secondary}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
