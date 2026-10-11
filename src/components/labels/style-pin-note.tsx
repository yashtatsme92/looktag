import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listFashionLabels, listFashionStyles } from "@/lib/labels/api";
import { resolveStylePin, searchStyles, type StylePin } from "@/lib/labels/style-pin";
import type { FashionLabel, FashionStyle } from "@/lib/labels/model";
import { useSettingsStore } from "@/lib/settings/store";

type Catalog = { styles: FashionStyle[]; labels: FashionLabel[] };

let catalogPromise: Promise<Catalog> | null = null;

function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= Promise.all([listFashionStyles(), listFashionLabels()])
    .then(([styles, labels]) => ({ styles, labels }))
    .catch(() => ({ styles: [], labels: [] }));
  return catalogPromise;
}

function useStyleCatalog() {
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const [catalog, setCatalog] = useState<Catalog>({ styles: [], labels: [] });
  useEffect(() => {
    if (!housesOn) return;
    let alive = true;
    void loadCatalog().then((next) => {
      if (alive) setCatalog(next);
    });
    return () => {
      alive = false;
    };
  }, [housesOn]);
  return { housesOn, ...catalog };
}

/** The resolved Style for a pin, or null when the pin is plain (Houses off, or the House is not live). */
export function useStylePin(styleId?: string): StylePin | null {
  const { housesOn, styles, labels } = useStyleCatalog();
  return resolveStylePin(styleId, styles, labels, housesOn);
}

/** The quiet ghost `View Style` button of a Style-linked pin. The title and House are rendered by the caller. */
export function StyleViewLink({ pin, className }: { pin: StylePin; className?: string }) {
  return (
    <Link
      to="/houses/$labelId/$collectionId/$styleId"
      params={{ labelId: pin.labelId, collectionId: pin.lineSlug, styleId: pin.styleId }}
      className={className ?? "style-view-ghost"}
    >
      View Style
    </Link>
  );
}

export function StylePinNote({ styleId }: { styleId?: string }) {
  const pin = useStylePin(styleId);
  if (!pin) return null;
  return <StyleViewLink pin={pin} />;
}

export function StyleLinkField({
  styleId,
  onChange,
}: {
  styleId?: string;
  onChange: (styleId: string) => void;
}) {
  const { housesOn, styles, labels } = useStyleCatalog();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  if (!housesOn) return null;
  const current = resolveStylePin(styleId, styles, labels, true);
  const matches: StylePin[] = open ? searchStyles(query, styles, labels, true) : [];
  return (
    <div className="style-link">
      <label className="create-kicker" htmlFor="link-style">
        Link a Style
      </label>
      <input
        id="link-style"
        className="create-piece-link"
        placeholder="Style name"
        autoComplete="off"
        value={open ? query : current?.styleName ?? ""}
        onFocus={() => {
          setOpen(true);
          setQuery(current?.styleName ?? "");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value.trim()) onChange("");
        }}
      />
      {current ? (
        <button type="button" className="style-pin-view" onClick={() => onChange("")}>
          Clear
        </button>
      ) : null}
      {open && matches.length > 0 ? (
        <ul className="style-link-list" role="listbox">
          {matches.map((pin) => (
            <li key={pin.styleId}>
              <button
                type="button"
                role="option"
                onClick={() => {
                  onChange(pin.styleId);
                  setQuery(pin.styleName);
                  setOpen(false);
                }}
              >
                <span>{pin.styleName}</span>
                <span className="style-pin-house">{pin.houseName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
