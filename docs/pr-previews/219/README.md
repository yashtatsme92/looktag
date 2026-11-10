# #219 look photos on storage

Homepage after migration (WebP srcset, boot splash skipped, no scroll). Phone 390×844, tablet 834×1194, desktop 1280×800.

Live `https://thelooktag.com` (current main, full `/looks` JPEGs from Render), same no-scroll measurement:

| Viewport | Before total | Before images | After total | After images |
| --- | ---: | ---: | ---: | ---: |
| 390×844 @3x | 18.49 MB | 18.00 MB, all `/looks` on Render | 3.07 MB | 1.63 MB (544 KB `/storage`, 1.09 MB `/looks`) |
| 1280×800 @1x | 18.49 MB | 18.00 MB, all `/looks` on Render | 2.04 MB | 611 KB, all `/storage` |

`/storage` is the local stand-in for `STORAGE_PUBLIC_BASE_URL`. On R2 those bytes leave Render. The phone `/looks` remainder is house/style art that is not a look row.
