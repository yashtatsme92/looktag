import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { isFooterLinkOn } from "@/lib/site/api";

/** Behind its footer toggle: 404 until "about" is switched on (#183). */
export const Route = createFileRoute("/about")({
  loader: async () => {
    const result = await isFooterLinkOn({ data: "about" });
    if (!result.on) throw notFound();
    return result;
  },
  head: () => ({ meta: [{ title: "About — Looktag" }] }),
  component: function Page() {
    const { contactEmail } = Route.useLoaderData();
    return <LegalPage kind="about" email={contactEmail} />;
  },
});
