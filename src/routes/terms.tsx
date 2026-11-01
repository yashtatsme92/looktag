import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { isFooterLinkOn } from "@/lib/site/api";

/** Behind its footer toggle: 404 until "terms" is switched on (#183). */
export const Route = createFileRoute("/terms")({
  loader: async () => {
    const result = await isFooterLinkOn({ data: "terms" });
    if (!result.on) throw notFound();
    return result;
  },
  head: () => ({ meta: [{ title: "Terms — Looktag" }] }),
  component: function Page() {
    const { contactEmail } = Route.useLoaderData();
    return <LegalPage kind="terms" email={contactEmail} />;
  },
});
