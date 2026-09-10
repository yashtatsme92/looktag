import { useEffect, useState } from "react";
import {
  isAndroidDevice,
  isIosDevice,
  isStandaloneDisplay,
  peekDeferredInstall,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/display";

export function useStandaloneDisplay() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const sync = () => setStandalone(isStandaloneDisplay());
    sync();
    document.documentElement.classList.toggle("standalone", isStandaloneDisplay());
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return standalone;
}

export function useInstallAvailability() {
  const [ios, setIos] = useState(false);
  const [android, setAndroid] = useState(false);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setIos(isIosDevice());
    setAndroid(isAndroidDevice());
    setPrompt(peekDeferredInstall());
    const onPrompt = () => setPrompt(peekDeferredInstall());
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("looktag:install-ready", onPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("looktag:install-ready", onPrompt);
    };
  }, []);

  return { ios, android, prompt };
}
