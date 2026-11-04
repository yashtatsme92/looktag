# Splash screen

The admin-selected splash is stored in the shared settings row and rendered for
all users on their next load. iOS home-screen startup images are static PNGs:
generate the image set for the design being released with
`LOOKTAG_SPLASH_DESIGN=<wordmark|tag-draw|pieces|soft-power> npm run splash:generate`
before building. If the variable is omitted, the generator uses `tag-draw`.

The generator writes fourteen device-sized images into `public/`; the root document
links each image to its iPhone or iPad viewport. These images do not change when
an admin switches the live in-app splash, so regenerate them for that design
before the corresponding app build/release. The generator embeds the bundled
Playfair Display and Figtree font files so launch images use the same type as the
in-app splash even when external font services are unavailable.
