# Carter's Studio

An isometric, single-room portfolio where visitors enter as animals,
explore a Blender-rendered studio, and chat. Click the computer, A1 mini printer,
surfboard, or university certificate to open coding, hobby, and education notes.

## Run it

```bash
npm install
npm run dev
```

Movement works with a mouse, WASD, or the arrow keys. Open the site in two tabs
to test local multiplayer presence and chat.

## Enable public multiplayer

The room uses Supabase Realtime presence and broadcast when these variables are
available:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Copy `.env.example` to `.env.local`, add the public project URL and anon key,
then restart Vite. No database tables are required. In Supabase, keep Realtime
public channel access enabled for the `carters-studio` channel.

When those variables are absent, the app falls back to `BroadcastChannel`. That
keeps the full flow testable locally but only connects tabs in the same browser.

## Edit the studio

The current artwork is `art/isometric_studio_warm_organic.png`, rendered from
`art/isometric_studio_warm_organic.blend`. It includes warm window lighting,
foliage, sage plaster, a mottled floor, and the framed university certificate.
Earlier Blender scenes and the illustration trial remain available in the repo.

After rendering the full scene to that PNG, export the web image, masks, and
camera metadata with Blender 5.2:

```bash
blender -b art/isometric_studio_warm_organic.blend -P scripts/export_studio_masks.py
```

This copies the artwork to `public/assets/studio/organic-room.png` and renders
five white-on-black visible-surface masks directly from the Blender geometry.
The SVG uses those luminance masks to redraw furniture among avatars in depth
order, including the chair's mesh openings. `organic-scene.json` holds the floor
corners and hotspot polygons projected through the same camera, plus collision
tiles. The exporter runs in a separate Blender process and never saves its
temporary material, render, or visibility changes to the source scene.

Keep the camera orthographic. If you move furniture, update the collision
footprints and depths in the exporter before regenerating the assets.

Popup copy lives in `INTERACTIVE_SPOTS` in `src/roomData.ts`. The computer,
printer, and surfboard descriptions are placeholders. The certificate opens
the education popup, which links to University of Auckland engineering.
Popups support keyboard
activation, focus trapping, outside-click dismissal, and Escape.

## Art sources

- Studio: original simplified Blender models based on personal photo references.
  Product appearance references: [Herman Miller Aeron](https://www.hermanmiller.com/en_apc/products/seating/office-chairs/aeron-chair/specs/)
  and [Bambu Lab A1 mini](https://us.store.bambulab.com/products/a1-mini).
  No third-party 3D models or product photography are bundled. The tree backdrop
  is an AI-generated image embedded in the blend; its source and prompt are in
  `art/textures/window_trees.png` and `art/textures/window_trees_prompt.txt`.
- Legacy room tiles (retained, not used by the current scene): "Isometric Room Builder" by Thurraya. The included licence permits
  personal and commercial projects and modification.
- Cat sprite: free "Paws & Whiskers" sample by Netherzapdos. Its included licence
  permits non-commercial projects only. Purchase the commercial pack before
  deploying this portfolio for professional or commercial use.

The original licence files are stored alongside the assets under `public/assets`.
