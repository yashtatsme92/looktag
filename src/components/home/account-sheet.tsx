import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { visibleOauthProviders } from "@/lib/settings/model";
import { clearPendingSave, rememberPendingSave } from "@/lib/looks/pending-save";
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
  const emailOn = useSettingsStore((s) => s.signupEmail);
  const signupGoogle = useSettingsStore((s) => s.signupGoogle);
  const googleCredentials = useSettingsStore((s) => s.providers.google.credentials);
  const google = visibleOauthProviders({ signupGoogle, signupApple: false, signupX: false }, GROK_PROVIDERS)[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = next ?? (intent === "save" ? here : "/");
  const [email, setEmail] = useState("");
  const emailId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const continuing = useRef(false);

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

  function continueWithGoogle() {
    if (!google) return;
    setError("");
    setBusy(true);
    clearPendingSave();
    if (intent === "save" && pendingSave) rememberPendingSave(pendingSave);
    continuing.current = true;
    void signIn(google.providerId, {
      callbackURL: target === "/login" ? "/" : target,
      social: googleCredentials ? "google" : undefined,
    })
      .catch((err) => {
        continuing.current = false;
        setError(err instanceof Error ? err.message : "Sign-in did not complete.");
      })
      .finally(() => setBusy(false));
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
          emailRef.current?.focus({ preventScroll: true });
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
          {google ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="account-sheet-google h-11 w-full gap-2 rounded-xl border-[#E0E0E0] bg-white text-[#111]"
                disabled={busy}
                onClick={continueWithGoogle}
              >
                <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
                  <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.900-5.800l-7.6-5.900c-2.100 1.400-4.900 2.300-8.300 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.9 6.100C6.500 42.6 14.600 48 24 48z" />
                </svg>
                Continue with Google
              </Button>
              {emailOn ? (
                <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground" role="separator">
                  <span className="h-px flex-1 bg-[#E0E0E0]" />
                  or
                  <span className="h-px flex-1 bg-[#E0E0E0]" />
                </div>
              ) : null}
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            </>
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
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button asChild className="h-11 bg-[#111] text-white hover:bg-[#111]/90">
                <Link
                  to="/login"
                  search={{ next: target, email, intent: intent === "save" ? "save" : undefined }}
                  onClick={continueWithEmail}
                >
                  {primary}
                </Link>
              </Button>
            </>
          ) : google ? null : (
            <Button asChild className="h-11">
              <Link
                to="/login"
                search={{ next: target, intent: intent === "save" ? "save" : undefined }}
                onClick={continueWithEmail}
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
