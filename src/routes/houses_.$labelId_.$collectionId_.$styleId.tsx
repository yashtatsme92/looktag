import { createFileRoute, Link } from "@tanstack/react-router";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { getFashionCollection, getHousesAvailability } from "@/lib/labels/api";
import { SEED_STYLES } from "@/lib/labels/seed";

export const Route = createFileRoute("/houses_/$labelId_/$collectionId_/$styleId")({
  ssr: true,
  loader: async ({ params }) => {
    try {
      const open = await getHousesAvailability();
      if (!open) return { open: false, page: null };
      const data = await getFashionCollection({
        data: { labelId: params.labelId, collectionId: params.collectionId },
      });
      const style = SEED_STYLES.find(
        (item) =>
          item.id === params.styleId &&
          item.labelId === params.labelId &&
          (item.collectionId === data?.collection.id || data?.collection.slug === params.collectionId),
      );
      if (!data || !style || style.collectionId !== data.collection.id) return { open: true, page: null };
      return {
        open: true,
        page: {
          style,
          houseName: data.label.name,
          lineName: data.collection.name,
          lineSlug: data.collection.slug,
          labelId: data.label.id,
        },
      };
    } catch {
      return { open: true, page: null };
    }
  },
  component: StylePage,
});

function StylePage() {
  const { labelId } = Route.useParams();
  const { page, open } = Route.useLoaderData();
  const closed = useHousesClosed(open);
  if (closed) return <HousesClosed />;
  if (!page) {
    return (
      <AppShell title="Style" backTo={`/houses/${labelId}`}>
        <h1 className="ds-screen-title">Style not found</h1>
        <Button asChild className="mt-6">
          <Link to="/houses/$labelId" params={{ labelId }}>
            Back to house
          </Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell title="Style" backTo={`/houses/${page.labelId}/${page.lineSlug}`}>
      <article className="style-detail">
        <img src={page.style.imageSrc} alt="" />
        <div>
          <p className="wide-kicker">Style</p>
          <h1 className="ds-screen-title">{page.style.name}</h1>
          <p className="house-line">
            <Link to="/houses/$labelId/$collectionId" params={{ labelId: page.labelId, collectionId: page.lineSlug }}>
              {page.lineName}
            </Link>
            {" · "}
            <Link to="/houses/$labelId" params={{ labelId: page.labelId }}>
              {page.houseName}
            </Link>
          </p>
          {page.style.description ? <p className="house-line">{page.style.description}</p> : null}
        </div>
      </article>
    </AppShell>
  );
}
