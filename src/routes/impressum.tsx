import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { isFooterLinkOn } from "@/lib/site/api";

/** Behind its footer toggle: 404 until "impressum" is switched on (#183). */
export const Route = createFileRoute("/impressum")({
  loader: async () => {
    const result = await isFooterLinkOn({ data: "impressum" });
    if (!result.on) throw notFound();
    return result;
  },
  head: () => ({ meta: [{ title: "Impressum — Looktag" }] }),
  component: function Page() {
    const { contactEmail } = Route.useLoaderData();
    return <LegalPage kind="impressum" email={contactEmail} />;
  },
});
