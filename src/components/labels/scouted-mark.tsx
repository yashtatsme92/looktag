import { Compass } from "lucide-react";
import { SCOUTED_FLAG } from "@/lib/labels/model";
import { cn } from "@/lib/utils";

export function ScoutedMark({ className }: { className?: string }) {
  return (
    <span className={cn("scouted-mark", className)}>
      <Compass className="size-3" strokeWidth={2.2} aria-hidden />
      {SCOUTED_FLAG}
    </span>
  );
}
