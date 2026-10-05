import { createFileRoute, Link } from "@tanstack/react-router";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { getFashionCollection, getHousesAvailability } from "@/lib/labels/api";

export const Route = createFileRoute("/houses_/$labelId_/$collectionId_/$styleId")({
  ssr: true,
  loader: async ({ params }) => {
    try {
      const open = await getHousesAvailability();
      if (!open) return { open: false, page: null };
      const data = await getFashionCollection({
        data: { labelId: params.labelId, collectionId: params.collectionId },
      });
      const style = data?.styles.find((item) => item.id === params.styleId);
      if (!data || !style) return { open: true, page: null };
      return {
        open: true,
        page: {
          style,
          houseName: data.label.name,
          lineName: data.collection.name,
          lineSlug: data.collection.slug,
          labelId: data.label.id,
          website: data.label.website ?? "",
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

  const photos = page.style.images?.length ? page.style.images : [page.style.imageSrc];

  return (
    <AppShell title="Style" backTo={`/houses/${page.labelId}/${page.lineSlug}`}>
      <article className="style-detail">
        <div className="style-photos">
          {photos.map((src) => (
            <img key={src} src={src} alt="" />
          ))}
        </div>
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
          {page.website ? (
            <a className="house-exit" href={page.website} target="_blank" rel="noreferrer">
              Visit {page.houseName}
            </a>
          ) : null}
        </div>
      </article>
    </AppShell>
  );
}
