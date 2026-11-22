import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { markStyleGuideDone } from "@/components/home/style-guide";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { YouHome } from "@/components/you/you-home";
import { SavedLooks } from "@/components/looks/saved-looks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ds";
import { COPY, messageField, offlineNow } from "@/lib/errors/copy";
import { authErrorMessage } from "@/lib/errors/user-message";
import { authClient, authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { identify, setAnalyticsSignedIn, track } from "@/lib/analytics/runtime";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { clearPendingSave } from "@/lib/looks/pending-save";
import { captureSessionToken, postAuthPath, resumeCreateInsteadOfReplace, safeNext, withTimeout } from "@/lib/login-next";
import { ensureMyProfile } from "@/lib/looks/api";
import { parseHandle, suggestHandle } from "@/lib/looks/handle";
import { signupMethodCount, visibleOauthProviders } from "@/lib/settings/model";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";
import { normalizeLoginEmail, resolveYouSessionState, youSessionSignedIn } from "@/lib/admin/access";

type LoginSearch = {
  next?: string;
  intent?: "save";
  email?: string;
};

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

/** The Create page is already the history entry under /login. Pop back to it. */
function ResumeCreate() {
  const router = useRouter();
  const navigate = useNavigate();
  useEffect(() => {
    if (router.history.canGoBack()) router.history.back();
    else void navigate({ to: "/create", replace: true });
  }, [navigate, router]);
  return null;
}

let pendingSaveTraverseToken = 0;
let pendingSaveTraverseInstalled = false;

/** History back fires `navigate` before popstate, and the router unmounts this page in that event. A listener removed on unmount never runs, so arm a permanent listener and drop the flag a tick later. */
function installPendingSaveTraverseClear(): void {
  if (pendingSaveTraverseInstalled || typeof window === "undefined") return;
  pendingSaveTraverseInstalled = true;
  const clearIfArmed = (navigationType: string | undefined) => {
    if (!pendingSaveTraverseToken || navigationType !== "traverse") return;
    clearPendingSave();
  };
  const navigation = (
    window as Window & {
      navigation?: { addEventListener: (type: "navigate", cb: (event: { navigationType?: string }) => void) => void };
    }
  ).navigation;
  if (navigation?.addEventListener) {
    navigation.addEventListener("navigate", (event) => clearIfArmed(event.navigationType));
    return;
  }
  window.addEventListener("popstate", () => clearIfArmed("traverse"), true);
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: search.next === "/login" ? "/login" : safeNext(search.next),
    intent: search.intent === "save" ? "save" : undefined,
    email: typeof search.email === "string" ? search.email.slice(0, 254) : undefined,
  }),
  component: Login,
});

function Login() {
  const { next, intent, email: initialEmail } = Route.useSearch();
  const dest = postAuthPath(next, "/login");
  const navigate = useNavigate();
  const router = useRouter();
  const { user, isPending } = useCurrentUserState();
  const sessionState = resolveYouSessionState({ user, isPending });
  const settings = useSettingsStore();
  const oauth = visibleOauthProviders(settings, GROK_PROVIDERS);
  const emailOn = settings.signupEmail;
  const methodCount = signupMethodCount(settings);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [city, setCity] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "handle" | "email" | "password" | "city", string>>>({});
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [adminEmailOpen, setAdminEmailOpen] = useState(false);

  const oauthButtons =
    oauth.length > 0 ? (
      <div className="flex flex-col gap-2">
        {oauth.map((provider) => (
          <Button
            key={provider.providerId}
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => handleOauth(provider)}
          >
            Continue with {provider.label}
          </Button>
        ))}
      </div>
    ) : null;

  useLayoutEffect(() => {
    setHydrated(true);
    settings.hydrate();
  }, [settings.hydrate]);

  useEffect(() => {
    if (initialEmail !== undefined) setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    if (!emailOn) setMode("signin");
  }, [emailOn]);

  useLayoutEffect(() => {
    installPendingSaveTraverseClear();
    if (!next || user) return;
    const token = ++pendingSaveTraverseToken;
    return () => {
      queueMicrotask(() => {
        if (pendingSaveTraverseToken === token) pendingSaveTraverseToken = 0;
      });
    };
  }, [next, user]);

  async function goAfterAuth(displayName: string, userId?: string) {
    setAnalyticsSignedIn(true);
    track(mode === "signup" ? "signup_completed" : "login_completed", { method: "email" });
    if (userId) identify(userId);
    markStyleGuideDone({ coach: true });
    await withTimeout(authClient.getSession(), 2500, null);
    if (mode === "signup") {
      try {
        const saved = await withTimeout(
          ensureMyProfile({
            data: {
              displayName,
              handle: parseHandle(handle).ok ? handle.trim() : undefined,
              city: city.trim() ? city.trim() : undefined,
            },
          }).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
          2500,
          null,
        );
        if (saved == null) toast.error(COPY.signupProfile);
        else if (!saved.ok) {
          const shown = authErrorMessage(saved.error, COPY.signupProfile);
          toast.error(shown === COPY.generic ? COPY.signupProfile : shown);
        }
      } catch {
        toast.error(COPY.signupProfile);
      }
    }
    toast.success(mode === "signup" ? `Welcome, ${displayName}` : `Signed in as ${displayName}`);
    if (next === "/login") {
      setBusy(false);
      await navigate({ to: "/login", search: {} });
      return;
    }
    if (next) {
      if (resumeCreateInsteadOfReplace(dest, router.history.canGoBack())) {
        router.history.back();
        return;
      }
      await navigate({ to: dest as "/", replace: true });
      return;
    }
    if (userId) {
      await navigate({ to: "/creators/$userId", params: { userId } });
      return;
    }
    await navigate({ to: "/" });
  }

  function showAuthFailure(err: unknown, fallback: string) {
    const message = authErrorMessage(err, fallback);
    const field = messageField(message);
    if (field === "name" || field === "handle" || field === "email" || field === "password" || field === "city") {
      setFieldErrors({ [field]: message });
      setError("");
      return;
    }
    setFieldErrors({});
    setError(message);
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault();
    track("auth_method_chosen", { method: "email" });
    setError("");
    setFieldErrors({});
    if (offlineNow()) {
      setError(COPY.offline);
      return;
    }
    setBusy(true);
    markStyleGuideDone({ coach: true });
    const loginEmail = normalizeLoginEmail(email);
    const displayName = name.trim() || loginEmail.split("@")[0] || "Creator";
    if (mode === "signup") {
      if (name.trim().length < 2) {
        setFieldErrors({ name: "Give your name." });
        setBusy(false);
        return;
      }
      const parsedHandle = parseHandle(handle);
      if (!parsedHandle.ok) {
        setFieldErrors({ handle: parsedHandle.error });
        setBusy(false);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
        setFieldErrors({ email: COPY.validEmail });
        setBusy(false);
        return;
      }
      if (password.length < 8) {
        setFieldErrors({ password: COPY.passwordShort });
        setBusy(false);
        return;
      }
    }
    try {
      if (mode === "signup") {
        const result = await Promise.race([
          authClient.signUp.email({
            name: displayName,
            email: loginEmail,
            password,
          }),
          rejectAfter(15_000, "Creating the account is taking too long. Try again."),
        ]);
        if (result.error) {
          const failure = result.error as { message?: string; status?: number; code?: string };
          const err = new Error(failure.message ?? COPY.accountCreateFailed) as Error & { status?: number; code?: string };
          if (typeof failure.status === "number") err.status = failure.status;
          if (failure.code) err.code = failure.code;
          throw err;
        }
        captureSessionToken(result.data?.token);
        if (!result.data?.user && !result.data?.token) {
          throw new Error(COPY.accountCreateFailed);
        }
        await goAfterAuth(displayName, result.data?.user?.id);
      } else {
        const result = await Promise.race([
          authClient.signIn.email({
            email: loginEmail,
            password,
          }),
          rejectAfter(15_000, "Sign-in is taking too long. Try again."),
        ]);
        if (result.error) {
          const failure = result.error as { message?: string; status?: number; code?: string };
          const err = new Error(failure.message ?? COPY.couldNotSignIn) as Error & { status?: number; code?: string };
          if (typeof failure.status === "number") err.status = failure.status;
          if (failure.code) err.code = failure.code;
          throw err;
        }
        captureSessionToken(result.data?.token);
        if (!result.data?.user && !result.data?.token) {
          throw new Error(COPY.couldNotSignIn);
        }
        await goAfterAuth(
          result.data?.user?.name?.trim() || displayName,
          result.data?.user?.id,
        );
      }
    } catch (err) {
      showAuthFailure(err, COPY.generic);
      setBusy(false);
    }
  }

  function handleOauth(provider: { providerId: string; idp: string }) {
    if (provider.idp === "google") track("auth_method_chosen", { method: "google" });
    const social =
      provider.idp === "google" || provider.idp === "apple"
        ? settings.providers[provider.idp].credentials
          ? provider.idp
          : undefined
        : undefined;
    setError("");
    setFieldErrors({});
    if (offlineNow()) {
      setError(COPY.offline);
      return;
    }
    setBusy(true);
    markStyleGuideDone({ coach: true });
    const unlock = window.setTimeout(() => {
      setBusy(false);
      setError("That sign-in did not complete. Use another method.");
    }, 7_000);
    void signIn(provider.providerId, {
      callbackURL: dest === "/login" && next !== "/login" ? "/" : dest,
      social,
    })
      .then(() => {
        window.clearTimeout(unlock);
        if (window.location.pathname.startsWith("/login")) {
          setError(
            emailOn
              ? "That sign-in did not complete. Try email."
              : "That sign-in did not complete. Try again or use another method.",
          );
          setBusy(false);
        }
      })
      .catch((err) => {
        window.clearTimeout(unlock);
        setError(authErrorMessage(err, COPY.signInFailed));
        setBusy(false);
      });
  }

  if (youSessionSignedIn(sessionState) && user && !busy) {
    if (next === "/login") return <Navigate to="/login" search={{}} />;
    if (next && resumeCreateInsteadOfReplace(dest, router.history.canGoBack())) return <ResumeCreate />;
    if (next) return <Navigate to={dest as "/"} replace />;
    return (
      <AppShell title="You" header="hidden" flush>
        <YouHome user={user} />
      </AppShell>
    );
  }

  if (!next) {
    if (isPending) {
      return (
        <AppShell title="You" header="hidden" flush>
          <div className="you-home">
            <p className="you-empty-body">Checking your session…</p>
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell title="You" header="hidden" flush>
        <YouHome user={null} />
      </AppShell>
    );
  }

  return (
    <AppShell title="You" largeTitle>
      <ScreenTitle
        kicker={
          sessionState === "guest" ? "Guest" : sessionState === "pending" ? "Session" : "Saved"
        }
      >
        You
      </ScreenTitle>
      {intent === "save" ? (
        <p className="mb-2 font-display text-2xl leading-tight">Sign in to save</p>
      ) : null}
      <p className="mb-6 text-sm text-muted-foreground">
        {sessionState === "pending"
          ? "Checking your session…"
          : sessionState === "guest"
          ? "You're browsing as a guest. Sign in to publish looks or edit your profile."
          : "Looks you keep live here. An account is only for publishing."}
      </p>

      <SavedLooks variant="rail" />

      <div
        className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]"
        data-settings-hydrated={settings.hydrated ? "true" : "false"}
      >
        {emailOn ? (
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "signin"}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-md text-sm font-medium",
                mode === "signin" ? "bg-card text-foreground shadow-[var(--shadow-border)]" : "text-muted-foreground",
              )}
              onClick={() => {
                setMode("signin");
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "signup"}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-md text-sm font-medium",
                mode === "signup" ? "bg-card text-foreground shadow-[var(--shadow-border)]" : "text-muted-foreground",
              )}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              Create account
            </button>
          </div>
        ) : (
          <p className="mb-5 font-display text-2xl leading-none">Continue with an enabled provider</p>
        )}

        <p className="mb-5 text-sm text-muted-foreground">
          {!authEnabled
            ? "Sign-in is disabled."
            : methodCount === 0
              ? COPY.signupOff
              : emailOn
                ? mode === "signup"
                  ? oauth.length
                    ? `Email always works. ${oauth.map((p) => p.label).join(" and ")} open a new window.`
                    : "Use email to create an account."
                  : "Use the same email you signed up with."
                : COPY.chooseMethod}
        </p>
        {authEnabled && methodCount > 0 ? (
          <div className="flex flex-col gap-5">
            {!emailOn ? oauthButtons : null}
            {!emailOn && !adminEmailOpen && error ? (
              <p role="alert" aria-live="assertive" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {!emailOn ? (
              <button
                type="button"
                className="min-h-11 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                aria-expanded={adminEmailOpen}
                onClick={() => {
                  const opening = !adminEmailOpen;
                  if (opening) setError("");
                  setAdminEmailOpen(opening);
                }}
              >
                {adminEmailOpen ? "Hide admin sign-in" : "Admin sign in"}
              </button>
            ) : null}
            {emailOn || adminEmailOpen ? (
              <form
              className="flex flex-col gap-4"
              data-hydrated={hydrated ? "true" : "false"}
              onSubmit={(event) => void handleEmail(event)}
            >
                {mode === "signup" ? (
                  <>
                    <Field label="Name" htmlFor="creator-name" error={fieldErrors.name} live="assertive">
                      <Input
                        id="creator-name"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={80}
                        value={name}
                        onChange={(event) => {
                          const next = event.target.value;
                          setName(next);
                          if (!handleTouched) setHandle(suggestHandle(next));
                          setFieldErrors((current) => ({ ...current, name: undefined }));
                        }}
                        placeholder="Your name"
                      />
                    </Field>
                    <Field label="Handle" htmlFor="creator-handle" error={fieldErrors.handle} live="assertive">
                      <div className="flex h-11 items-center rounded-md border border-input bg-card shadow-sm transition-[box-shadow,border-color] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                        <span className="pl-3 text-base text-muted-foreground">@</span>
                        <input
                          id="creator-handle"
                          autoComplete="username"
                          spellCheck={false}
                          minLength={2}
                          maxLength={24}
                          value={handle}
                          placeholder="your-handle"
                          className="h-11 min-w-0 flex-1 bg-transparent pr-3 pl-1 text-base text-foreground outline-none placeholder:text-muted-foreground"
                          onChange={(event) => {
                            setHandleTouched(true);
                            setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                            setFieldErrors((current) => ({ ...current, handle: undefined }));
                          }}
                        />
                      </div>
                    </Field>
                    <Field label="City" htmlFor="creator-city" error={fieldErrors.city} live="assertive">
                      <Input
                        id="creator-city"
                        autoComplete="address-level2"
                        maxLength={80}
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        placeholder="Lisbon"
                      />
                    </Field>
                  </>
                ) : null}
                <Field label="Email" htmlFor="creator-email" error={fieldErrors.email} live="assertive">
                  <Input
                    id="creator-email"
                    type={mode === "signup" ? "email" : "text"}
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setFieldErrors((current) => ({ ...current, email: undefined }));
                    }}
                    placeholder={mode === "signin" ? "you@email.com or admin" : "you@email.com"}
                  />
                </Field>
                <Field label="Password" htmlFor="creator-password" error={fieldErrors.password} live="assertive">
                  <Input
                    id="creator-password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "signup" ? 8 : 5}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                    }}
                    placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
                  />
                </Field>
                {error ? (
                  <p role="alert" aria-live="assertive" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in with email"}
                </Button>
              </form>
            ) : null}

            {emailOn && oauth.length > 0 ? (
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}

            {emailOn ? oauthButtons : null}
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Just browsing?{" "}
        <Link to="/" className="text-foreground underline-offset-4 hover:underline">
          Back to looks
        </Link>
      </p>
    </AppShell>
  );
}
