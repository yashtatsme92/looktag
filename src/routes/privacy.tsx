import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { isFooterLinkOn } from "@/lib/site/api";

/** Behind its footer toggle: 404 until "privacy" is switched on (#183). */
export const Route = createFileRoute("/privacy")({
  loader: async () => {
    const result = await isFooterLinkOn({ data: "privacy" });
    if (!result.on) throw notFound();
    return result;
  },
  head: () => ({ meta: [{ title: "Privacy — Looktag" }] }),
  component: function Page() {
    const { contactEmail } = Route.useLoaderData();
    return <LegalPage kind="privacy" email={contactEmail} />;
  },
});
