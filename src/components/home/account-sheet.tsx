import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pt-2 pb-6">
          <label className="text-sm font-medium" htmlFor="account-sheet-email">
            Email
          </label>
          <Input
            id="account-sheet-email"
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
