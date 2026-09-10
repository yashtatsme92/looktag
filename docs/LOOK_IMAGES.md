# Look images (size budget)

Looks store `image_src` as text (inline data URLs today, or short path / https references).
`saveLook` validates with `src/lib/looks/image-src.ts`:

| Rule | Bound |
| --- | --- |
| Allowlisted data URLs | data:image/jpeg, jpg, png, webp |
| Max data-URL length | ~3.5 MiB (MAX_LOOK_IMAGE_DATA_URL_CHARS) |
| Path / https refs | ≤ 2048 chars |

See also README "Look images (size budget)" once landed.
