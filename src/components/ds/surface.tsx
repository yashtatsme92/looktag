import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  hover?: boolean;
  padded?: boolean;
};

export function Surface({
  as: Comp = "div",
  hover,
  padded = true,
  className,
  ...props
}: SurfaceProps) {
  return (
    <Comp
      className={cn("ds-surface", padded && "p-4", hover && "ds-surface-hover", className)}
      {...props}
    />
  );
}
