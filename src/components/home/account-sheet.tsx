import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
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
  next = "/",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  primary?: string;
  secondary?: string;
  next?: string;
  intent?: "publish" | "draft" | "follow" | "save";
}) {
  const [email, setEmail] = useState("");
  const emailId = useId();
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="account-sheet-modal">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pt-2 pb-6">
          <label className="text-sm font-medium" htmlFor={emailId}>
            Email
          </label>
          <Input
            id={emailId}
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button asChild className="h-11">
            <Link to="/login" search={{ next, email }}>
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
