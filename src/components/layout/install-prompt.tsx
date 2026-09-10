import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isStandaloneDisplay,
  markInstallHintDone,
  peekDeferredInstall,
  readInstallHintDone,
  requestInstallSheet,
  takeDeferredInstall,
} from "@/lib/pwa/display";
import { useInstallAvailability } from "@/lib/pwa/use-display";

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const { ios, android, prompt } = useInstallAvailability();

  useEffect(() => {
    if (isStandaloneDisplay() || readInstallHintDone()) return;
    setVisible(true);
  }, []);

  function dismiss() {
    markInstallHintDone();
    setVisible(false);
  }

  async function install() {
    const event = takeDeferredInstall() ?? prompt;
    if (event && !ios) {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") dismiss();
      return;
    }
    requestInstallSheet();
  }

  if (!visible) return null;

  const detail = ios
    ? "Add to Home Screen in Safari. Looktag then opens like any other iPhone app."
    : android
      ? peekDeferredInstall() || prompt
        ? "Install from Chrome. Full screen, own icon, same looks."
        : "In Chrome, open the menu and choose Install app."
      : "Works as a website, or install on iPhone and Android for a full-screen app.";

  return (
    <aside className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Smartphone className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl leading-tight sm:text-2xl">The Looktag app</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={dismiss}>
          Not now
        </Button>
        <Button type="button" className="flex-1 sm:flex-none" onClick={() => void install()}>
          <Download className="size-4" />
          {ios ? "Add to iPhone" : android && (peekDeferredInstall() || prompt) ? "Install" : "How to install"}
        </Button>
      </div>
    </aside>
  );
}
