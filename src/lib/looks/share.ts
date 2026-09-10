import { recordMetric } from "@/lib/observability/runtime";

export type ShareKind = "look" | "house" | "collection";

export async function shareOrCopy(input: {
  title: string;
  text?: string;
  url: string;
  kind?: ShareKind;
}): Promise<"shared" | "copied" | "shown"> {
  let result: "shared" | "copied" | "shown" = "shown";
  let aborted = false;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: input.title,
        text: input.text,
        url: input.url,
      });
      result = "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        aborted = true;
      }
    }
  }

  if (result !== "shared" && !aborted) {
    try {
      await navigator.clipboard.writeText(input.url);
      result = "copied";
    } catch {
      try {
        const field = document.createElement("textarea");
        field.value = input.url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.left = "-9999px";
        document.body.appendChild(field);
        field.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(field);
        if (ok) result = "copied";
      } catch {
        result = "shown";
      }
    }
  }

  recordMetric("looktag.share", 1, {
    type: "counter",
    attributes: {
      "looktag.share.result": result,
      "looktag.share.kind": input.kind ?? "look",
    },
  });
  return result;
}
