import { cn } from "@/lib/utils";

export type StudioStep = {
  id: string;
  label: string;
};

type StepperProps = {
  steps: readonly StudioStep[];
  current: string;
  completed?: readonly string[];
  onSelect?: (id: string) => void;
};

export function Stepper({ steps, current, completed = [], onSelect }: StepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <ol className="ds-stepper" aria-label="Steps">
      {steps.map((step, index) => {
        const done = completed.includes(step.id) || index < currentIndex;
        const state = step.id === current ? "current" : done ? "done" : "todo";
        return (
          <li key={step.id}>
            <button
              type="button"
              className="ds-step w-full"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              onClick={() => onSelect?.(step.id)}
            >
              <span className="ds-step-index">0{index + 1}</span>
              <span className={cn("ds-step-label", state === "todo" && "font-medium")}>{step.label}</span>
              <span className="ds-step-rule" aria-hidden />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
