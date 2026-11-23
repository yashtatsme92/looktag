import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { isFooterLinkOn } from "@/lib/site/api";

/** Privacy is on by default. The page resolves even if other footer links are off. */
export const Route = createFileRoute("/privacy")({
  loader: async () => {
    const result = await isFooterLinkOn({ data: "privacy" });
    return { contactEmail: result.contactEmail };
  },
  head: () => ({ meta: [{ title: "Privacy — Looktag" }] }),
  component: function Page() {
    const { contactEmail } = Route.useLoaderData();
    return <LegalPage kind="privacy" email={contactEmail} />;
  },
});
