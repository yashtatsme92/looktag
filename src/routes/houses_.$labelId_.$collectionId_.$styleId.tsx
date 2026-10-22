import { createFileRoute, Link } from "@tanstack/react-router";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { AppShell } from "@/components/layout/app-shell";
import { FadeLayer } from "@/components/ds/fade-layer";
import { ImgSlot } from "@/components/ds/img-slot";
import { SkeletonGrid } from "@/components/ds/skeleton";
import { HouseStylePending } from "@/components/ds/route-pending";
import { Button } from "@/components/ui/button";
import { getFashionCollection, getHousesAvailability } from "@/lib/labels/api";
import { clientDeferred, useRouteLoad } from "@/lib/loading/route-load";

type StyleData = {
  open: boolean;
  page: {
    style: { id: string; name: string; imageSrc: string; images?: string[]; description?: string };
    houseName: string;
    lineName: string;
    lineSlug: string;
    labelId: string;
    website: string;
  } | null;
};

async function loadStyle(labelId: string, collectionId: string, styleId: string): Promise<StyleData> {
  try {
    const open = await getHousesAvailability();
    if (!open) return { open: false, page: null };
    const data = await getFashionCollection({
      data: { labelId, collectionId },
    });
    const style = data?.styles.find((item) => item.id === styleId);
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
}

export const Route = createFileRoute("/houses_/$labelId_/$collectionId_/$styleId")({
  ssr: true,
  loader: ({ params }) =>
    clientDeferred(
      () => loadStyle(params.labelId, params.collectionId, params.styleId),
      `house:${params.labelId}:style:${params.styleId}`,
    ),
  pendingMs: 300,
  pendingMinMs: 420,
  pendingComponent: HouseStylePending,
  component: StylePage,
});

function StylePage() {
  const { labelId, collectionId, styleId } = Route.useParams();
  const seeded = Route.useLoaderData();
  const styleLoad = useRouteLoad(seeded, `house:${labelId}:style:${styleId}`, () =>
    loadStyle(labelId, collectionId, styleId),
  );
  const data = styleLoad.data;
  const page = data?.page ?? null;
  const closed = useHousesClosed(data ? data.open : true);
  const photos = page?.style.images?.length ? page.style.images : page ? [page.style.imageSrc] : [];
  const pending = !data && !styleLoad.error;
  if (closed) return <HousesClosed />;
  if (!pending && !styleLoad.error && !page) {
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

  const stateKey = styleLoad.error ? "error" : styleLoad.skeleton ? "skeleton" : pending ? "waiting" : "ready";

  return (
    <AppShell title="Style" backTo={page ? `/houses/${page.labelId}/${page.lineSlug}` : `/houses/${labelId}/${collectionId}`}>
      <FadeLayer stateKey={stateKey}>
        {styleLoad.error ? (
          <p className="text-sm text-muted-foreground">Houses aren't available right now</p>
        ) : styleLoad.skeleton ? (
          <SkeletonGrid count={2} lead={false} />
        ) : pending ? (
          <div className="is-loading-old" aria-hidden />
        ) : page ? (
          <article className="style-detail">
            <div className="style-photos">
              {photos.map((src) => (
                <ImgSlot key={src} src={src} alt="" />
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
        ) : null}
      </FadeLayer>
    </AppShell>
  );
}