import { Link } from "@tanstack/react-router";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

export function AccountSheet({
  open,
  onOpenChange,
  title = "Save this look",
  description = "Sign in to keep it in your wardrobe. Browsing stays open.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pt-2 pb-6">
          <Button asChild className="h-11">
            <Link to="/login" search={{ next: "/" }}>
              Sign in
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Keep browsing
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
