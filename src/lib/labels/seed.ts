import type { Look, ProductOffer, ProductTag } from "../looks/types.ts";
import type { FashionCollection, FashionLabel } from "./model";

const EUR = "EUR";

function offer(id: string, retailerId: string, price: string, url: string): ProductOffer {
  return { id, retailerId, price, currency: EUR, url };
}

function piece(
  id: string,
  x: number,
  y: number,
  name: string,
  brand: string,
  offers: ProductOffer[],
): ProductTag {
  const priced = offers.filter((item) => Number.parseFloat(item.price) > 0);
  const lowest = priced.reduce(
    (best, item) => (Number.parseFloat(item.price) < Number.parseFloat(best.price) ? item : best),
    priced[0] ?? offers[0],
  );
  return {
    id,
    x,
    y,
    name,
    brand,
    currency: EUR,
    url: lowest?.url ?? "",
    price: lowest?.price ?? "",
    retailerId: lowest?.retailerId ?? "",
    offers,
    wornUrl: offers[0]?.url ?? "",
    wornRetailerId: offers[0]?.retailerId ?? "",
  };
}

const CREATED = Date.parse("2026-09-01T10:00:00Z");

export const SEED_LABELS: FashionLabel[] = [
  {
    id: "label-atelier-noir",
    name: "Atelier Noir",
    handle: "ateliernoir",
    bio: "Evening tailoring in small runs from a courtyard atelier in the 10th.",
    city: "Paris",
    moods: ["evening", "tailored"],
    scouted: true,
    status: "approved",
    createdAt: CREATED,
  },
  {
    id: "label-salt-loom",
    name: "Salt & Loom",
    handle: "saltloom",
    bio: "Knit and linen for windy coasts. Dyed in seawater-safe batches.",
    city: "Copenhagen",
    moods: ["coastal", "knit"],
    scouted: false,
    status: "approved",
    createdAt: CREATED + 1,
  },
  {
    id: "label-press-line",
    name: "Press Line",
    handle: "pressline",
    bio: "Sharp daywear. One collection a year, numbered.",
    city: "Antwerp",
    moods: ["tailored"],
    scouted: true,
    status: "approved",
    createdAt: CREATED + 2,
  },
  {
    id: "label-sunday-studio",
    name: "Sunday Studio",
    handle: "sundaystudio",
    bio: "Soft evening knits from a Hackney railway arch.",
    city: "London",
    moods: ["knit", "evening"],
    scouted: false,
    status: "approved",
    createdAt: CREATED + 3,
  },
];

export const SEED_COLLECTIONS: FashionCollection[] = [
  {
    id: "col-noir-kinkistyles",
    labelId: "label-atelier-noir",
    name: "Kinkistyles",
    slug: "kinkistyles",
    caption: "Sculptural black. One earring, an open neck, a column that holds.",
    season: "Capsule",
    moods: ["evening"],
    sortOrder: 0,
    createdAt: CREATED,
  },
  {
    id: "col-noir-after-hours",
    labelId: "label-atelier-noir",
    name: "After Hours",
    slug: "after-hours",
    caption: "City tailoring once the lights go down. Coats, cream knit, pressed wool.",
    season: "AW26",
    moods: ["tailored", "evening"],
    sortOrder: 1,
    createdAt: CREATED + 1,
  },
  {
    id: "col-salt-summer-blues",
    labelId: "label-salt-loom",
    name: "Summer Blues",
    slug: "summer-blues",
    caption: "Washed linen, open collars, salt still in the weave.",
    season: "SS26",
    moods: ["coastal"],
    sortOrder: 0,
    createdAt: CREATED + 2,
  },
  {
    id: "col-salt-north-knit",
    labelId: "label-salt-loom",
    name: "North Knit",
    slug: "north-knit",
    caption: "Heavy rib for wind that comes off the water.",
    season: "AW26",
    moods: ["knit"],
    sortOrder: 1,
    createdAt: CREATED + 3,
  },
  {
    id: "col-press-numbered",
    labelId: "label-press-line",
    name: "Numbered",
    slug: "numbered",
    caption: "One cut for the year. Grey wool, square shoulder, a number on the label.",
    season: "No. 07",
    moods: ["tailored"],
    sortOrder: 0,
    createdAt: CREATED + 4,
  },
  {
    id: "col-sunday-arch",
    labelId: "label-sunday-studio",
    name: "Arch Hours",
    slug: "arch-hours",
    caption: "Saturday light in a Hackney railway arch. Merino, nothing else.",
    season: "Studio",
    moods: ["knit"],
    sortOrder: 0,
    createdAt: CREATED + 5,
  },
  {
    id: "col-sunday-hackney",
    labelId: "label-sunday-studio",
    name: "Hackney Night",
    slug: "hackney-night",
    caption: "Black merino, one gold ring, last train.",
    season: "Night",
    moods: ["evening", "knit"],
    sortOrder: 1,
    createdAt: CREATED + 6,
  },
];

export const SEED_LABEL_LOOKS: Look[] = [
  {
    id: "house-noir-column",
    userId: "label-atelier-noir",
    collectionId: "col-noir-kinkistyles",
    title: "Noir Column",
    caption: "Black wool column, one earring, open neck.",
    creator: "Atelier Noir",
    imageSrc: "/looks/gallery-hour.jpg",
    createdAt: CREATED,
    updatedAt: CREATED,
    moods: ["evening"],
    tags: [
      piece("hnc-dress", 48, 42, "Wool Column Dress", "Atelier Noir", [
        offer(
          "hnc-dress-cos",
          "cos",
          "190",
          "https://www.cos.com/en-de/women/womenswear/dresses/product/straight-wool-dress-black-1228577001",
        ),
        offer(
          "hnc-dress-zal",
          "zalando",
          "149",
          "https://www.zalando.de/weekday-linda-shift-dress-black-web21c00a-q11.html",
        ),
      ]),
      piece("hnc-ear", 72, 22, "Bar Ear Cuff", "Atelier Noir", [
        offer(
          "hnc-ear-stories",
          "andotherstories",
          "29",
          "https://www.stories.com/en_eur/jewellery/earrings/product.sculptural-ear-cuff-gold.1241768001.html",
        ),
      ]),
    ],
  },
  {
    id: "house-noir-coat",
    userId: "label-atelier-noir",
    collectionId: "col-noir-after-hours",
    title: "Pressed Coat",
    caption: "Long black coat over a cream knit. City evening.",
    creator: "Atelier Noir",
    imageSrc: "/looks/quiet-tailor.jpg",
    createdAt: CREATED + 10,
    updatedAt: CREATED + 10,
    moods: ["tailored", "evening"],
    tags: [
      piece("hncoat", 46, 36, "Single-Breasted Coat", "Atelier Noir", [
        offer(
          "hncoat-cos",
          "cos",
          "279",
          "https://www.cos.com/en-de/women/womenswear/coatsjackets/coats/product/oversized-double-breasted-wool-coat-dark-green-1298577001",
        ),
        offer(
          "hncoat-zal",
          "zalando",
          "160",
          "https://www.zalando.de/weekday-oversized-classic-coat-dark-brown-web21u048-o11.html",
        ),
      ]),
    ],
  },
  {
    id: "house-salt-linen",
    userId: "label-salt-loom",
    collectionId: "col-salt-summer-blues",
    title: "North Linen",
    caption: "Washed linen, open collar, sand underfoot.",
    creator: "Salt & Loom",
    imageSrc: "/looks/coastal-linen.jpg",
    createdAt: CREATED + 20,
    updatedAt: CREATED + 20,
    moods: ["coastal"],
    tags: [
      piece("hsl-shirt", 50, 38, "Open Linen Shirt", "Salt & Loom", [
        offer(
          "hsl-shirt-arket",
          "arket",
          "79",
          "https://www.arket.com/en-de/women/shirts/product/linen-shirt-white-0952583001",
        ),
        offer(
          "hsl-shirt-cos",
          "cos",
          "89",
          "https://www.cos.com/en-de/women/womenswear/shirts/product/relaxed-linen-shirt-white-1172583001",
        ),
      ]),
    ],
  },
  {
    id: "house-salt-rib",
    userId: "label-salt-loom",
    collectionId: "col-salt-north-knit",
    title: "North Rib",
    caption: "Heavy rib, salt air, knitted on the island.",
    creator: "Salt & Loom",
    imageSrc: "/looks/studio-knit.jpg",
    createdAt: CREATED + 24,
    updatedAt: CREATED + 24,
    moods: ["knit"],
    tags: [
      piece("hsr-knit", 48, 40, "Island Rib", "Salt & Loom", [
        offer(
          "hsr-knit-cos",
          "cos",
          "89",
          "https://www.cos.com/en-de/women/womenswear/knitwear/product/merino-wool-sweater-cream-1162571001",
        ),
        offer(
          "hsr-knit-arket",
          "arket",
          "79",
          "https://www.arket.com/en-de/women/knitwear/product/merino-sweater-cream-0952581001",
        ),
      ]),
    ],
  },
  {
    id: "house-press-cut",
    userId: "label-press-line",
    collectionId: "col-press-numbered",
    title: "Numbered Cut",
    caption: "Grey wool, square shoulder, one look for the year.",
    creator: "Press Line",
    imageSrc: "/looks/city-cut.jpg",
    createdAt: CREATED + 30,
    updatedAt: CREATED + 30,
    moods: ["tailored"],
    tags: [
      piece("hpc-blazer", 48, 34, "Numbered Blazer", "Press Line", [
        offer(
          "hpc-blazer-cos",
          "cos",
          "225",
          "https://www.cos.com/en-de/women/womenswear/blazers/product/single-breasted-wool-blazer-grey-1182572001",
        ),
        offer(
          "hpc-blazer-zal",
          "zalando",
          "179",
          "https://www.zalando.de/weekday-boxy-blazer-grey-web21g00a-c11.html",
        ),
      ]),
      piece("hpc-trouser", 50, 72, "Press Trouser", "Press Line", [
        offer(
          "hpc-trouser-cos",
          "cos",
          "99",
          "https://www.cos.com/en-de/women/womenswear/trousers/product/tailored-wool-trousers-grey-1182573001",
        ),
      ]),
    ],
  },
  {
    id: "house-sunday-knit",
    userId: "label-sunday-studio",
    collectionId: "col-sunday-arch",
    title: "Arch Knit",
    caption: "Heavy merino, Saturday light, railway arch studio.",
    creator: "Sunday Studio",
    imageSrc: "/looks/studio-knit.jpg",
    createdAt: CREATED + 40,
    updatedAt: CREATED + 40,
    moods: ["knit"],
    tags: [
      piece("hsk-knit", 48, 40, "Studio Merino", "Sunday Studio", [
        offer(
          "hsk-knit-cos",
          "cos",
          "89",
          "https://www.cos.com/en-de/women/womenswear/knitwear/product/merino-wool-sweater-cream-1162571001",
        ),
      ]),
    ],
  },
  {
    id: "house-sunday-night",
    userId: "label-sunday-studio",
    collectionId: "col-sunday-hackney",
    title: "Hackney Night",
    caption: "Black merino, one gold ring, last train.",
    creator: "Sunday Studio",
    imageSrc: "/looks/sunday-coat.jpg",
    createdAt: CREATED + 48,
    updatedAt: CREATED + 48,
    moods: ["evening", "knit"],
    tags: [
      piece("hsn-knit", 48, 38, "Night Merino", "Sunday Studio", [
        offer(
          "hsn-knit-cos",
          "cos",
          "89",
          "https://www.cos.com/en-de/women/womenswear/knitwear/product/merino-wool-sweater-black-1162571002",
        ),
      ]),
      piece("hsn-ring", 62, 58, "Gold Band", "Sunday Studio", [
        offer(
          "hsn-ring-stories",
          "andotherstories",
          "29",
          "https://www.stories.com/en_eur/jewellery/rings/product.sculptural-ring-gold.1241769001.html",
        ),
      ]),
    ],
  },
];
