# Carter's Studio

An isometric, single-room portfolio where visitors enter as pixel animals,
explore a Blender-rendered studio, and chat. Click the computer, A1 mini printer,
or surfboard to open coding and hobby notes.

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

The editable scene is `art/studio.blend`. It contains the standing desk,
MacBook and monitor arms, split keyboard, RGB PC, Aeron-style chair, toolbox,
A1 mini printer, surfboard, and cutaway room in separate collections.

Render the web assets with Blender 5.2:

```bash
blender -b art/studio.blend -P scripts/render_studio.py
```

This exports a full preview, a room background with baked furniture shadows,
and four aligned transparent furniture layers to `public/assets/studio`.
`scene.json` stores the orthographic camera projection, floor grid, object hit
polygons, and blocked furniture tiles. Visitors are drawn between the furniture
layers according to their floor depth. Keep the camera orthographic for future
game assets. If you move furniture, update its collision footprint and depth in
the exporter before regenerating the assets.

Popup copy lives in `INTERACTIVE_SPOTS` in `src/roomData.ts`. The computer,
printer, and surfboard descriptions are placeholders. Popups support keyboard
activation, focus trapping, outside-click dismissal, and Escape.

## Art sources

- Studio: original simplified Blender models based on personal photo references.
  Product appearance references: [Herman Miller Aeron](https://www.hermanmiller.com/en_apc/products/seating/office-chairs/aeron-chair/specs/)
  and [Bambu Lab A1 mini](https://us.store.bambulab.com/products/a1-mini).
  No third-party 3D models or product photography are bundled.
- Legacy room tiles (retained, not used by the current scene): "Isometric Room Builder" by Thurraya. The included licence permits
  personal and commercial projects and modification.
- Cat sprite: free "Paws & Whiskers" sample by Netherzapdos. Its included licence
  permits non-commercial projects only. Purchase the commercial pack before
  deploying this portfolio for professional or commercial use.

The original licence files are stored alongside the assets under `public/assets`.
