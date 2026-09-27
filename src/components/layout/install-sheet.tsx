import { useEffect, useState } from "react";
import { Share, SquarePlus, MoreVertical, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { shareOrCopy } from "@/lib/looks/share";
import {
  markInstallHintDone,
  onInstallSheetRequest,
  openIosInstallTutorial,
  takeDeferredInstall,
} from "@/lib/pwa/display";
import { useInstallAvailability, useStandaloneDisplay } from "@/lib/pwa/use-display";

const IOS_STEPS = [
  {
    icon: Share,
    title: "Tap Share",
    copy: "The square with the arrow, in Safari’s toolbar.",
  },
  {
    icon: SquarePlus,
    title: "Add to Home Screen",
    copy: "Scroll the sheet if you need to. Then tap Add.",
  },
  {
    icon: Download,
    title: "Open Looktag",
    copy: "It sits with your other apps and opens full-screen.",
  },
] as const;

const ANDROID_STEPS = [
  {
    icon: MoreVertical,
    title: "Open the Chrome menu",
    copy: "The three dots at the top right of the browser.",
  },
  {
    icon: Download,
    title: "Install app",
    copy: "Sometimes labelled Add to Home screen. Confirm, and Looktag gets its own icon.",
  },
] as const;

export function InstallSheet() {
  const [open, setOpen] = useState(false);
  const standalone = useStandaloneDisplay();
  const { ios, android, prompt } = useInstallAvailability();

  useEffect(() => onInstallSheetRequest(setOpen), []);

  if (standalone) return null;

  async function installNow() {
    const event = takeDeferredInstall() ?? prompt;
    if (event) {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        markInstallHintDone();
        setOpen(false);
      }
      return;
    }
    if (ios) {
      openIosInstallTutorial();
    }
  }

  const canPrompt = Boolean(prompt);
  const steps = ios ? IOS_STEPS : ANDROID_STEPS;
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function copyLink() {
    const result = await shareOrCopy({
      title: "Looktag",
      text: "Shoppable looks",
      url: appUrl || window.location.href,
    });
    if (result === "copied" || result === "shared") toast.success("Link copied");
    else toast.message("Copy this link", { description: appUrl });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader>
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {ios ? "iPhone & iPad" : android ? "Android" : "Phone app"}
          </p>
          <DrawerTitle>Keep Looktag on your home screen</DrawerTitle>
          <DrawerDescription>
            Same looks, full screen, no browser chrome. Works on iOS and Android — and still as a
            website on any laptop.
          </DrawerDescription>
        </DrawerHeader>

        <ol className="flex flex-col gap-4 overflow-y-auto px-5 pb-2">
          {ios || android ? (
            steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium">
                      <span className="mr-2 tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.copy}</p>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              {canPrompt
                ? "This browser can install Looktag as an app on this computer."
                : "Install isn’t available in this browser. Copy the link and open it on your phone."}
              {appUrl ? (
                <input className="mt-3 h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground" readOnly value={appUrl} />
              ) : null}
            </li>
          )}
        </ol>

        <DrawerFooter>
          {ios ? (
            <Button type="button" onClick={() => openIosInstallTutorial()}>
              Open the iPhone guide
            </Button>
          ) : canPrompt ? (
            <Button type="button" onClick={() => void installNow()}>
              <Download className="size-4" />
              Install app
            </Button>
          ) : (
            <Button type="button" onClick={() => void copyLink()}>
              Copy link
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              markInstallHintDone();
              setOpen(false);
            }}
          >
            Not now
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
