import { useLayoutEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

export function AccountSheet({
  open,
  onOpenChange,
  title = "Save this look",
  description = "Sign in to keep it in your wardrobe. Browsing stays open.",
  primary = "Sign in",
  secondary = "Keep browsing",
  next,
  intent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  primary?: string;
  secondary?: string;
  next?: string;
  /** One sheet. Save returns to this page after sign-in. Cancel returns without leaving. */
  intent?: "publish" | "draft" | "follow" | "save";
}) {
  const here = useRouterState({ select: (s) => s.location.href });
  const target = next ?? (intent === "save" ? here : "/");
  const opener = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<HTMLAnchorElement>(null);

  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement;
    }
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        {...(description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          primaryRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pt-2 pb-6">
          <Button asChild className="h-11">
            <Link ref={primaryRef} to="/login" search={{ next: target, intent: intent === "save" ? "save" : undefined }}>
              {primary}
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            {secondary}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
