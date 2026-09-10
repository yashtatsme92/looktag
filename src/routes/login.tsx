import { useLayoutEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { markStyleGuideDone } from "@/components/home/style-guide";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { SavedLooks } from "@/components/looks/saved-looks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeLoginEmail } from "@/lib/admin/access";
import { authClient, authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { captureSessionToken, postAuthPath, safeNext, withTimeout } from "@/lib/login-next";
import { ensureMyProfile } from "@/lib/looks/api";
import { parseHandle, suggestHandle } from "@/lib/looks/handle";
import { signupMethodCount, visibleOauthProviders } from "@/lib/settings/model";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

type LoginSearch = {
  next?: string;
};

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: safeNext(search.next),
  }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const dest = postAuthPath(next, "/login");
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const settings = useSettingsStore();
  const oauth = visibleOauthProviders(settings, GROK_PROVIDERS);
  const emailOn = settings.signupEmail;
  const methodCount = signupMethodCount(settings);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    setHydrated(true);
    settings.hydrate();
  }, [settings.hydrate]);

  async function goAfterAuth(displayName: string, userId?: string) {
    markStyleGuideDone({ coach: true });
    await withTimeout(authClient.getSession(), 2500, null);
    await withTimeout(
      ensureMyProfile({
        data: {
          displayName,
          handle: mode === "signup" && parseHandle(handle).ok ? handle.trim() : undefined,
          city: mode === "signup" && city.trim() ? city.trim() : undefined,
        },
      }).catch(() => null),
      2500,
      null,
    );
    toast.success(mode === "signup" ? `Welcome, ${displayName}` : `Signed in as ${displayName}`);
    if (next) {
      await navigate({ to: dest as "/" });
      return;
    }
    if (userId) {
      await navigate({ to: "/creators/$userId", params: { userId } });
      return;
    }
    await navigate({ to: "/" });
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    markStyleGuideDone({ coach: true });
    const loginEmail = normalizeLoginEmail(email);
    const displayName = name.trim() || loginEmail.split("@")[0] || "Creator";
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
        if (result.error) throw new Error(result.error.message ?? "Could not create the account.");
        captureSessionToken(result.data?.token);
        if (!result.data?.user && !result.data?.token) {
          throw new Error("Could not create the account.");
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
        if (result.error) throw new Error(result.error.message ?? "Could not sign in.");
        captureSessionToken(result.data?.token);
        if (!result.data?.user && !result.data?.token) {
          throw new Error("Could not sign in.");
        }
        await goAfterAuth(
          result.data?.user?.name?.trim() || displayName,
          result.data?.user?.id,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  function handleOauth(providerId: string) {
    setError("");
    setBusy(true);
    markStyleGuideDone({ coach: true });
    const unlock = window.setTimeout(() => {
      setBusy(false);
      setError("That sign-in did not complete. Use another method.");
    }, 7_000);
    void signIn(providerId, { callbackURL: dest === "/login" ? "/" : dest })
      .then(() => {
        window.clearTimeout(unlock);
        if (window.location.pathname.startsWith("/login")) {
          setError("That sign-in did not complete. Try email.");
          setBusy(false);
        }
      })
      .catch((err) => {
        window.clearTimeout(unlock);
        setError(err instanceof Error ? err.message : "Sign-in did not complete.");
        setBusy(false);
      });
  }

  if (user && !busy) {
    if (next) return <Navigate to={dest as "/"} />;
    return <Navigate to="/creators/$userId" params={{ userId: user.id }} />;
  }

  return (
    <AppShell title="You" largeTitle>
      <ScreenTitle kicker="Saved">You</ScreenTitle>
      <p className="mb-6 text-sm text-muted-foreground">
        Looks you keep live here. An account is only for publishing.
      </p>

      <SavedLooks variant="rail" />

      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
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
          <p className="mb-5 font-display text-2xl leading-none">Sign in</p>
        )}

        <p className="mb-5 text-sm text-muted-foreground">
          {!authEnabled
            ? "Sign-in is disabled."
            : methodCount === 0
              ? "Sign-up is turned off in Studio."
              : emailOn
                ? mode === "signup"
                  ? oauth.length
                    ? `Email always works. ${oauth.map((p) => p.label).join(" and ")} open a new window.`
                    : "Use email to create an account."
                  : "Use the same email you signed up with."
                : "Continue with a saved account."}
        </p>
        {authEnabled && methodCount > 0 ? (
          <div className="flex flex-col gap-5">
            {emailOn ? (
              <form
                className="flex flex-col gap-4"
                data-hydrated={hydrated ? "true" : "false"}
                onSubmit={(event) => void handleEmail(event)}
              >
                {mode === "signup" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="creator-name">Name</Label>
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
                        }}
                        placeholder="Your name"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="creator-handle">Handle</Label>
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
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="creator-city">City</Label>
                      <Input
                        id="creator-city"
                        autoComplete="address-level2"
                        maxLength={80}
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        placeholder="Lisbon"
                      />
                    </div>
                  </>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="creator-email">Email</Label>
                  <Input
                    id="creator-email"
                    type={mode === "signup" ? "email" : "text"}
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={mode === "signin" ? "you@email.com or admin" : "you@email.com"}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="creator-password">Password</Label>
                  <Input
                    id="creator-password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "signup" ? 8 : 5}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in with email"}
                </Button>
              </form>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            {emailOn && oauth.length > 0 ? (
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}

            {oauth.length > 0 ? (
              <div className="flex flex-col gap-2">
                {oauth.map((provider) => (
                  <Button
                    key={provider.providerId}
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => handleOauth(provider.providerId)}
                  >
                    Continue with {provider.label}
                  </Button>
                ))}
              </div>
            ) : null}
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
