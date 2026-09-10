import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/admin-gate";
import { Chip, Field, Stepper, Surface } from "@/components/ds";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { TagPin } from "@/components/looks/tag-pin";
import { AdminNav } from "@/components/observability/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  colors,
  fonts,
  motion,
  radii,
  rules,
  shadows,
  space,
  typeRoles,
} from "@/lib/design/system";
import { THEMES, type ThemeId } from "@/lib/design/themes";
import { replayBootSplash } from "@/lib/pwa/boot";
import { requestInstallSheet } from "@/lib/pwa/display";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin_/look")({ component: AdminLookPage });

const SAMPLE_STEPS = [
  { id: "photo", label: "Photo" },
  { id: "pins", label: "Pins" },
  { id: "details", label: "Name" },
] as const;

function AdminLookPage() {
  return (
    <AdminGate>
      <LookAdmin />
    </AdminGate>
  );
}

function LookAdmin() {
  const themeId = useSettingsStore((s) => s.themeId);
  const save = useSettingsStore((s) => s.save);
  const [step, setStep] = useState("pins");
  const [mood, setMood] = useState("tailored");
  const [on, setOn] = useState(true);

  async function pickTheme(id: ThemeId) {
    try {
      await save({ themeId: id });
      toast.success(`${THEMES.find((theme) => theme.id === id)?.name ?? id} palette on`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save palette.");
    }
  }

  return (
    <AppShell title="Look" backTo="/admin">
      <ScreenTitle kicker="Looktag">Design system</ScreenTitle>
      <AdminNav current="look" />
      <p className="mb-8 text-sm text-muted-foreground">
        Palettes, type, and studio. Change tokens in the theme — every screen follows.
      </p>

      <Section kicker="00" title="Palette">
        <p className="mb-4 text-sm text-muted-foreground">
          Ten monotone looks. The choice is stored with Studio settings and applied everywhere.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {THEMES.map((theme) => {
            const selected = theme.id === themeId;
            return (
              <button
                key={theme.id}
                type="button"
                data-theme-id={theme.id}
                aria-pressed={selected}
                onClick={() => void pickTheme(theme.id)}
                className={cn(
                  "flex min-h-20 flex-col items-start gap-2 rounded-xl p-3 text-left shadow-[var(--shadow-border)]",
                  selected ? "ring-2 ring-foreground" : "bg-card",
                )}
                style={{ background: theme.ground, color: theme.ink }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="size-4 rounded-full"
                    style={{ background: theme.ink }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium">{theme.name}</span>
                </span>
                <span className="text-xs opacity-70">{theme.note}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section kicker="01" title="How to restyle">
        <ol className="flex flex-col gap-3 text-sm">
          <li>
            <span className="font-medium">Theme first.</span> Palette, type, radius, and shadow live
            as CSS variables. Components read those names, never a hex.
          </li>
          <li>
            <span className="font-medium">Use the primitives.</span> Surface, Chip, Field, Stepper,
            Button, Input. New UI is composition, not a new look.
          </li>
          <li>
            <span className="font-medium">Phone and web are different layouts.</span> 390 wide, 44px
            taps, tab bar on a phone. From tablet up: masthead, portrait lookbook, plate-sized
            photos. Never stretch a look edge to edge.
          </li>
        </ol>
        <ul className="mt-4 flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule} className="border-t border-border pt-2 text-caption text-muted-foreground">
              {rule}
            </li>
          ))}
        </ul>
      </Section>

      <Section kicker="02" title="Colour">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {colors.map((color) => (
            <div key={color.token} className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-border)]">
              <div className="h-16" style={{ background: `var(${color.css})` }} />
              <div className="px-3 py-2">
                <p className="break-words text-sm font-medium">{color.token}</p>
                <p className="break-words text-caption text-muted-foreground">{color.role}</p>
                <p className="mt-1 font-sans text-caption tabular-nums text-muted-foreground">{color.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="03" title="Type">
        <div className="flex flex-col gap-5">
          {fonts.map((font) => (
            <div key={font.token}>
              <p className="ds-kicker mb-2">{font.role}</p>
              <p
                className={cn(
                  "text-3xl leading-none",
                  font.token === "font-display" ? "font-display italic" : "font-sans font-medium",
                )}
              >
                {font.sample}
              </p>
              <p className="mt-1 text-caption text-muted-foreground">{font.family}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {typeRoles.map((role) => (
            <div key={role.token} className="flex flex-col gap-1 border-t border-border pt-3">
              <span className={cn("min-w-0", role.className)}>{role.role}</span>
              <span className="text-caption tabular-nums text-muted-foreground">
                {role.size} · {role.token}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="04" title="Radius, space, motion">
        <div className="mb-5 flex items-end gap-2">
          {radii.map((item) => (
            <div key={item.token} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="aspect-square w-full bg-foreground/90"
                style={{ borderRadius: item.value }}
              />
              <p className="text-center text-[0.65rem] text-muted-foreground">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="mb-5 flex gap-1">
          {space.map((item) => (
            <div key={item.token} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-sm bg-foreground/80" style={{ height: item.value }} />
              <p className="text-[0.65rem] tabular-nums text-muted-foreground">{item.value}</p>
            </div>
          ))}
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {shadows.map((item) => (
            <li key={item.token} className="ds-surface px-4 py-3" style={{ boxShadow: `var(--${item.token})` }}>
              {item.token}
              <span className="mt-0.5 block text-caption text-muted-foreground">{item.role}</span>
            </li>
          ))}
          {motion.map((item) => (
            <li key={item.token} className="border-t border-border pt-2 text-caption text-muted-foreground">
              <span className="font-medium text-foreground">{item.token}</span> · {item.value} · {item.role}
            </li>
          ))}
        </ul>
      </Section>

      <Section kicker="05" title="Components">
        <div className="flex flex-col gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="muted">Muted</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Tailored", "Evening", "Knit"].map((label) => (
              <Chip key={label} selected={mood === label.toLowerCase()} onClick={() => setMood(label.toLowerCase())}>
                {label}
              </Chip>
            ))}
          </div>
          <Field label="Look title" htmlFor="ds-title">
            <Input id="ds-title" defaultValue="Sunday Coat" />
          </Field>
          <Field label="Caption" htmlFor="ds-caption">
            <Textarea id="ds-caption" rows={2} defaultValue="Camel coat, Saturday market." />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
            <span className="text-sm">Search shops</span>
            <Switch checked={on} onCheckedChange={setOn} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Surface</CardTitle>
              <CardDescription>Raised paper. radius-xl, shadow-border, padding 16.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Section>

      <Section kicker="06" title="Patterns">
        <p className="mb-4 text-sm text-muted-foreground">
          The create studio, a look pin, and a surface. Reuse these — do not restyle per screen.
        </p>
        <Stepper steps={SAMPLE_STEPS} current={step} onSelect={setStep} />
        <Surface className="relative mt-4 h-40 overflow-hidden p-0">
          <div className="absolute inset-0 bg-muted" />
          <TagPin index={0} x={32} y={48} selected label="Coat" />
          <TagPin index={1} x={58} y={62} pulse label="Trousers" />
        </Surface>
        <p className="mt-3 text-caption text-muted-foreground">
          Pins are 32px marks with a 44px hit area. Selected is ink fill. Idle is paper with a pulse
          on the public look.
        </p>
      </Section>

      <Section kicker="07" title="Native app">
        <p className="mb-4 text-sm text-muted-foreground">
          Looktag opens on a fashion plate: the coat draws, ink fills it, a pin lands. Then it
          lives as a phone app. Install it to the home screen — own icon, full screen — or wrap
          the same shell for the App Store and Play.
        </p>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => requestInstallSheet()}>
            Install on this phone
          </Button>
          <Button type="button" variant="outline" onClick={() => replayBootSplash()}>
            Replay launch
          </Button>
        </div>
        <ul className="mt-4 flex flex-col gap-2 text-caption text-muted-foreground">
          <li>iPhone: Safari → Share → Add to Home Screen. Cold start shows the Looktag launch.</li>
          <li>Android: Chrome menu → Install app.</li>
          <li>Stores: wrap with the Looktag native shell (app.looktag.studio).</li>
        </ul>
      </Section>
      <Section kicker="08" title="Layouts">
        <p className="mb-4 text-sm text-muted-foreground">
          Three surfaces, one system. The phone is a native app. Tablet and desktop are a magazine.
        </p>
        <ul className="flex flex-col gap-3 text-sm">
          <li>
            <span className="font-medium">Phone · under 768.</span> Full-bleed feed, native header,
            tab bar. Looks fill the screen because that is how you browse on a handset.
          </li>
          <li>
            <span className="font-medium">Tablet · 768–1023.</span> Masthead instead of tabs. Two
            portrait columns. A look page is a plate, not a banner.
          </li>
          <li>
            <span className="font-medium">Desktop · 1024+.</span> Three or four portrait columns. Look
            pages sit plate + copy. Create stays a narrow studio.
          </li>
        </ul>
      </Section>
    </AppShell>
  );
}

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <p className="ds-kicker mb-1">{kicker}</p>
      <h2 className="ds-screen-title mb-4">{title}</h2>
      {children}
    </section>
  );
}
