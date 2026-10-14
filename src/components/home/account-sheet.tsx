import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}) {
  const here = useRouterState({ select: (s) => s.location.href });
  const target = next ?? (intent === "save" ? here : "/");
  const [email, setEmail] = useState("");
  const emailId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement;
    }
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="account-sheet-modal"
        {...(description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          emailRef.current?.focus();
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
          <Button asChild className="h-11">
            <Link
              to="/login"
              search={{ next: target, email, intent: intent === "save" ? "save" : undefined }}
            >
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
