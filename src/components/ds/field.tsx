import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";

function markInvalid(node: ReactNode, describedBy: string, invalid: boolean): ReactNode {
  if (!invalid) return node;
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode; "aria-describedby"?: string }>;
  const type = element.type;
  const host = type === "input" || type === "textarea" || type === "select";
  const component = typeof type === "function" || (typeof type === "object" && type !== null);
  if (host || component) {
    const previous = element.props["aria-describedby"];
    const described = [previous, describedBy].filter(Boolean).join(" ") || undefined;
    return cloneElement(element, {
      "aria-invalid": true,
      "aria-describedby": described,
    } as never);
  }
  if (element.props.children != null) {
    return cloneElement(
      element,
      {},
      Children.map(element.props.children, (child) => markInvalid(child, describedBy, invalid)),
    );
  }
  return node;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  live = "polite",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  /** Field errors are polite. Sign-in failures use assertive. */
  live?: "polite" | "assertive";
  children: ReactNode;
}) {
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className="ds-field">
      <Label htmlFor={htmlFor}>{label}</Label>
      {markInvalid(children, errorId ?? "", Boolean(error && errorId))}
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
      {error && errorId ? (
        <p id={errorId} className="text-sm text-destructive" role="alert" aria-live={live}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
