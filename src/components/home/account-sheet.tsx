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
  /** Create uses one sheet for Publish and Save draft. Pins stay if they cancel. */
  intent?: "publish" | "draft";
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pt-2 pb-6">
          {intent ? (
            <p className="mb-2">
              <span className="inline-flex min-h-8 items-center rounded-full bg-secondary px-3 text-xs font-medium text-muted-foreground">
                via {intent === "publish" ? "Publish" : "Save draft"}
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
