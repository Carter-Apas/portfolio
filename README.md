# Carter's Studio

An isometric, single-room portfolio where visitors enter as softly shaded animals,
explore a Blender-rendered studio, and chat. Click the computer, A1 mini printer,
surfboard, or university certificate to open coding, hobby, and education notes.

## Run it

```bash
npm install
npm run dev
```

Movement works with a mouse, WASD, or the arrow keys. Open the site in two tabs
to test local multiplayer presence and chat.

A robot vacuum wanders between walkable floor tiles without counting as a
visitor. It pauses in hidden tabs and for reduced motion. Each browser runs its
own ambient resident, with no AI chat or backend required. The cat prototype is
preserved in `src/hooks/useResidentCat.ts`; the active vacuum uses
`src/hooks/useResidentVacuum.ts`.

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

Cat visitors use transparent sprites rendered from the separate
`art/studio_cat.blend` scene. This scene matches the room camera angle and uses
warm, softly shaded ginger materials. It contains an eight-frame idle animation
and an eight-frame walk cycle; the website sheet contains four diagonal directions.
The cat's floor anchor is recorded in `art/cat/sprite-layout.json`.

To regenerate the cat without modifying the room:

```sh
blender -b --factory-startup -P scripts/render_studio_cat.py
uv run --with pillow python scripts/pack_studio_cat.py
```

The output is `public/assets/animals/cat/studio-cat-spritesheet.png`; a direction
preview is saved to `art/cat/preview.png`. The other animal sources and export
commands are listed below.

The wandering resident currently uses a robot vacuum from the separate
`art/studio_vacuum.blend` scene. The saved cat scene and sprite sheet remain
available. The vacuum has four directions and an animated side brush, avoids
blocked furniture tiles, and pauses for reduced motion or a hidden tab.

```sh
blender -b --factory-startup -P scripts/render_studio_vacuum.py
uv run --with pillow python scripts/pack_studio_vacuum.py
```

Preview: `art/vacuum/preview.png`. Website sprites:
`public/assets/residents/vacuum/studio-vacuum-spritesheet.png`.

Fox, bunny, frog and kiwi visitors now use matching Blender artwork instead of pixel
avatars. Each animal has its own `art/studio_fox.blend`,
`art/studio_bunny.blend`, `art/studio_frog.blend`, or `art/studio_kiwi.blend`
source, with eight idle and walking frames in each of four diagonal directions. They share the cat's camera,
lighting, transparent frame size, and floor anchor. Entry previews use the same
rendered artwork; visitor movement and room presence still work as before.

To regenerate these animals without editing the saved cat or room:

```sh
blender -b --factory-startup -P scripts/render_studio_animals.py -- fox
blender -b --factory-startup -P scripts/render_studio_animals.py -- bunny
blender -b --factory-startup -P scripts/render_studio_animals.py -- frog
blender -b --factory-startup -P scripts/render_studio_animals.py -- kiwi
uv run --with pillow python scripts/pack_studio_animals.py
```

Direction previews are in `art/fox/preview.png`, `art/bunny/preview.png`,
`art/frog/preview.png`, and `art/kiwi/preview.png`. The robot vacuum remains the wandering resident.

Room messages also appear in a bubble above the sender for seven seconds; a new
message replaces their previous bubble. Long messages are shortened in the bubble
and remain complete in the chat panel. Bubbles follow visitors and disappear when
the visitor leaves.

Connections close on `pagehide` and reopen when restored from the browser's page
cache. Local rooms announce stationary visitors every five seconds and expire
peers after 30 seconds without an update, covering crashes and missed exit
messages. Hidden tabs get 90 seconds to accommodate browser timer throttling.
Online rooms use Supabase Presence as the membership source and close
both the channel and socket on exit; late move packets cannot recreate peers that
have left. See [Supabase Presence](https://supabase.com/docs/guides/realtime/presence).
Run `npm test` for lifecycle, heartbeat, and online presence regression checks.
