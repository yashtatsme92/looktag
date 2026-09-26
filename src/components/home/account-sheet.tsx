import { Link } from "@tanstack/react-router";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

export function AccountSheet({
  open,
  onOpenChange,
  title = "Save this look",
  description = "Sign in to keep it in your wardrobe. Browsing stays open.",
  primary = "Sign in",
  secondary = "Keep browsing",
  next = "/",
  intent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  primary?: string;
  secondary?: string;
  next?: string;
  /** One sheet. The chip names why it opened. Cancel returns without leaving. */
  intent?: "publish" | "draft" | "follow" | "save";
}) {
  const via =
    intent === "publish"
      ? "Publish"
      : intent === "draft"
        ? "Save draft"
        : intent === "follow"
          ? "Follow"
          : intent === "save"
            ? "Save"
            : null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pt-2 pb-6">
          {via ? (
            <p className="mb-2">
              <span className="inline-flex min-h-8 items-center rounded-full bg-secondary px-3 text-xs font-medium text-muted-foreground">
                via {via}
              </span>
            </p>
          ) : null}
          <Button asChild className="h-11">
            <Link to="/login" search={{ next }}>
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
