# Splash screen

The admin-selected splash is stored in the shared settings row and rendered for
all users on their next load. iOS home-screen startup images are pre-generated
static PNGs for all four designs. The server selects the matching image set in
the startup-image links from the same shared setting used by the in-app splash.
Regenerate all design sets with `npm run splash:generate` after changing the
artwork or typography.

The generator writes fourteen device-sized images per design under `public/splash/`;
the root document links the selected design's images to each iPhone or iPad
viewport. The generator embeds the bundled Playfair Display and Figtree font
files so launch images use the same type as the in-app splash even when external
font services are unavailable.
