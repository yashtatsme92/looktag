import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Field } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getMyAccount, updateMyProfile, type AccountDetails } from "@/lib/looks/api";

export function ProfileForm({
  seed,
  onSaved,
}: {
  seed?: Partial<AccountDetails>;
  onSaved?: (account: AccountDetails) => void;
}) {
  const [account, setAccount] = useState<AccountDetails | null>(
    seed?.name && seed.handle && seed.email
      ? {
          name: seed.name,
          email: seed.email,
          handle: seed.handle,
          city: seed.city ?? "",
          bio: seed.bio ?? "",
          hasPassword: seed.hasPassword ?? true,
          emailLocked: seed.emailLocked ?? false,
        }
      : null,
  );
  const [loaded, setLoaded] = useState(Boolean(account));
  const [name, setName] = useState(seed?.name ?? "");
  const [handle, setHandle] = useState(seed?.handle ?? "");
  const [email, setEmail] = useState(seed?.email ?? "");
  const [city, setCity] = useState(seed?.city ?? "");
  const [bio, setBio] = useState(seed?.bio ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getMyAccount()
      .then((row) => {
        if (!alive) return;
        setLoaded(true);
        if (!row) return;
        setAccount(row);
        setName(row.name);
        setHandle(row.handle);
        setEmail(row.email);
        setCity(row.city);
        setBio(row.bio);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded) {
    return <div className="mb-8 h-48 animate-pulse rounded-xl bg-muted" />;
  }

  if (!account) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await updateMyProfile({
        data: {
          name,
          handle,
          email,
          city,
          bio,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        },
      });
      if (!saved) return;
      setAccount(saved);
      setName(saved.name);
      setHandle(saved.handle);
      setEmail(saved.email);
      setCity(saved.city);
      setBio(saved.bio);
      setCurrentPassword("");
      setNewPassword("");
      onSaved?.(saved);
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mb-8 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p className="ds-card-title">Your details</p>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Name, handle, email, and city from sign-up. Edit any of them here.
      </p>
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="profile-name">
          <Input
            id="profile-name"
            value={name}
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Handle" htmlFor="profile-handle" hint="Letters, numbers, and hyphens.">
          <div className="flex h-11 items-center rounded-md border border-input bg-card shadow-sm transition-[box-shadow,border-color] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <span className="pl-3 text-base text-muted-foreground">@</span>
            <input
              id="profile-handle"
              value={handle}
              required
              minLength={2}
              maxLength={24}
              autoComplete="username"
              spellCheck={false}
              className="h-11 min-w-0 flex-1 bg-transparent pr-3 pl-1 text-base text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => {
                setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
            />
          </div>
        </Field>
        <Field
          label="Email"
          htmlFor="profile-email"
          hint={account.emailLocked ? "This email is locked." : undefined}
        >
          <Input
            id="profile-email"
            type={account.emailLocked ? "email" : "text"}
            inputMode="email"
            value={email}
            required
            readOnly={account.emailLocked}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="City" htmlFor="profile-city" hint="Optional. Shown on your profile.">
          <Input
            id="profile-city"
            value={city}
            maxLength={80}
            autoComplete="address-level2"
            placeholder="Lisbon"
            onChange={(event) => setCity(event.target.value)}
          />
        </Field>
        <Field label="About" htmlFor="profile-bio" hint="Optional. A line or two.">
          <Textarea
            id="profile-bio"
            value={bio}
            maxLength={280}
            rows={3}
            placeholder="Tailoring, film stills, Sunday coats."
            onChange={(event) => setBio(event.target.value)}
          />
        </Field>
        {account.hasPassword ? (
          <>
            <Field label="Current password" htmlFor="profile-current-password" hint="Only if you change the password.">
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="New password" htmlFor="profile-new-password" hint="Leave blank to keep the current one.">
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
          </>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
