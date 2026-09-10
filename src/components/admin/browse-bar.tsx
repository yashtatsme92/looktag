import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Chip } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageWindow, type PageSlice } from "@/lib/admin/browse";
import { cn } from "@/lib/utils";

export type BrowseSuggestion = {
  id: string;
  title: string;
  note: string;
};

export type BrowseSortOption = {
  id: string;
  label: string;
};

export function useScrollPicked(picked: string | null, token?: unknown) {
  useEffect(() => {
    if (!picked) return;
    document.querySelector("[data-picked='true']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [picked, token]);
}

export function BrowseBar({
  id,
  query,
  onQuery,
  placeholder,
  sort,
  onSort,
  sorts,
  filter,
  onFilter,
  filters,
  suggestions,
  onPick,
  total,
  noun,
}: {
  id: string;
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  sort: string;
  onSort: (id: string) => void;
  sorts: BrowseSortOption[];
  filter?: string;
  onFilter?: (id: string) => void;
  filters?: BrowseSortOption[];
  suggestions: BrowseSuggestion[];
  onPick: (id: string) => void;
  total: number;
  noun: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [query, suggestions]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const showList = open && suggestions.length > 0;
  const kicker = query.trim() ? "Matches" : "Suggested";

  function pick(index: number) {
    const item = suggestions[index];
    if (!item) return;
    onPick(item.id);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="mb-4 flex flex-col gap-4" data-browse={id}>
      <div ref={rootRef} className="relative flex flex-col gap-1.5">
        <Label htmlFor={`${id}-search`}>Search</Label>
        <div className="relative">
          <Input
            ref={inputRef}
            id={`${id}-search`}
            type="text"
            inputMode="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && suggestions[active] ? `${id}-opt-${suggestions[active].id}` : undefined}
            value={query}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder={placeholder}
            className={query ? "pr-11" : undefined}
            onChange={(event) => {
              onQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActive((current) => (current + 1) % Math.max(suggestions.length, 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActive((current) => (current - 1 + suggestions.length) % Math.max(suggestions.length, 1));
              } else if (event.key === "Enter" && showList) {
                event.preventDefault();
                pick(active);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {query ? (
            <button
              type="button"
              className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={() => {
                onQuery("");
                setOpen(false);
              }}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={kicker}
            className="absolute top-[calc(100%+4px)] z-20 max-h-72 w-full overflow-y-auto rounded-lg bg-popover py-1 shadow-[var(--shadow-border-hover)]"
          >
            <li className="ds-kicker px-3 py-1.5">
              {kicker}
            </li>
            {suggestions.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  id={`${id}-opt-${item.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left",
                    index === active ? "bg-accent" : "hover:bg-accent",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(index)}
                >
                  <span className="min-w-0 flex-1 ds-card-title">{item.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.note}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {filters && onFilter && filter ? (
        <ChipRow label="Filter" items={filters} value={filter} onChange={onFilter} dataPrefix="filter" />
      ) : null}
      <ChipRow label="Sort" items={sorts} value={sort} onChange={onSort} dataPrefix="sort" />
      <p className="text-xs tabular-nums text-muted-foreground">
        {total === 0 ? `No ${noun}` : `${total} ${noun}`}
      </p>
    </div>
  );
}

function ChipRow({
  label,
  items,
  value,
  onChange,
  dataPrefix,
}: {
  label: string;
  items: BrowseSortOption[];
  value: string;
  onChange: (id: string) => void;
  dataPrefix: string;
}) {
  return (
    <div>
      <p className="ds-kicker mb-2">{label}</p>
      <div className="chip-scroll -mx-1 overflow-x-auto px-1">
        <div className="flex w-max gap-2" role="group" aria-label={label}>
          {items.map((item) => (
            <Chip
              key={item.id}
              selected={value === item.id}
              data-sort={dataPrefix === "sort" ? item.id : undefined}
              data-filter={dataPrefix === "filter" ? item.id : undefined}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BrowsePager({
  page,
  pages,
  from,
  to,
  total,
  onPage,
  noun,
}: Pick<PageSlice<unknown>, "page" | "pages" | "from" | "to" | "total"> & {
  onPage: (page: number) => void;
  noun: string;
}) {
  if (total === 0) return null;
  const marks = pageWindow(page, pages);
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs tabular-nums text-muted-foreground">
        {from}–{to} of {total} {noun}
      </p>
      {pages > 1 ? (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </Button>
          {marks.map((mark, index) =>
            mark === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={mark}
                type="button"
                variant={mark === page ? "default" : "outline"}
                size="sm"
                className="min-w-11"
                aria-current={mark === page ? "page" : undefined}
                aria-label={`Page ${mark}`}
                onClick={() => onPage(mark)}
              >
                {mark}
              </Button>
            ),
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
