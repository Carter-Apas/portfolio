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

For production, run `npm run build` followed by `npm start`. The Node server
serves the built site, room WebSocket, Assistant API and chat notification endpoint
on port 8080 by default (`PORT` overrides it). Vite development and preview also
provide these endpoints.

## Pushover chat alerts

Add `PUSHOVER_API_TOKEN` and `PUSHOVER_USER_KEY` to `.env.local`, using the fields
in `.env.example`, then restart the server. These are server secrets; do not use
the `VITE_` prefix. Register an application and obtain your user key through
[Pushover’s API setup](https://pushover.net/api).

The first visitor chat message sends an alert immediately with the sender’s name
and message. Further alerts are suppressed for 30 minutes across the whole room.
Messages during the cooldown do not extend it; the next message after it expires
triggers a new alert. Only sending a message requests an alert, so receiving it
in other tabs does not generate duplicates. Missing keys disable alerts, and a
notification failure never prevents the chat message from being sent.

`PUSHOVER_STATE_PATH` stores the cooldown on disk (default:
`./data/pushover-state.json`). Preserve that file across restarts. Failed deliveries
back off for one minute before allowing another attempt. This disk-based cooldown
is intended for one server instance; multiple replicas need a shared atomic store.

The Docker image serves the site and API on port 80. Set the Pushover keys as
runtime environment variables and mount a persistent volume at `/app/data`:

```sh
docker build -t carters-studio .
docker run --env-file .env.local -p 8080:80 \
  -v studio-notifications:/app/data carters-studio
```

Multiplayer is included in the Node server. Supply `PUBLIC_ORIGIN` and any API
keys at runtime; no multiplayer build arguments are needed.

A robot vacuum wanders between walkable floor tiles without counting as a
visitor. It pauses in hidden tabs and for reduced motion. Each browser runs its
own ambient resident, with no AI chat or backend required. The cat prototype is
preserved in `src/hooks/useResidentCat.ts`; the active vacuum uses
`src/hooks/useResidentVacuum.ts`.

## Assistant in room chat

Add `OPENAI_API_KEY` to `.env.local` and restart Vite or the production server.
The Google Nest Mini hosts **Assistant**, a friendly AI guide with curated public
portfolio knowledge. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and can be changed
to another Responses API model supporting Structured Outputs. Both values are
server-side; never use a `VITE_` prefix for the API key. Supply them as runtime
environment variables when using Docker.

Assistant replies to a lone visitor's messages. With multiple visitors it uses
conversation context to answer when addressed or followed up with, and stays
quiet during visitor-to-visitor chat. Mention “Assistant” to explicitly ask it,
or click the Nest Mini to address your next message. Its dots glow while working,
and replies appear in shared chat and a speech bubble above the speaker.
A small AI badge identifies its messages. Assistant does not count as a visitor
or trigger Pushover alerts.

The server serializes reply generation, deduplicates message IDs and shares
replies through polling, so multiple tabs do not generate duplicate answers.
Context is the most recent 30 messages (visitors and Assistant) within 30 minutes.
It resets after the room has been empty for five minutes or when the server restarts.
All visitors use one shared room. The WebSocket server supplies the active
visitor roster, and AI requests require a live session token. Message submissions
must reference a recent chat message accepted by that server. Curated facts live in `server/assistant-knowledge.mjs`;
keep those aligned with the portfolio copy. No resume or private files are sent.

Room messages are sent to OpenAI when enabled. The app keeps memory in the server
process only, does not write chat to disk, and uses `store: false` for Responses.
This does not override OpenAI's own API data retention policies. Missing keys
leave human chat working without AI. Failures show an unavailable status and
back off for 30 seconds; human messages and notifications remain independent.

To bound API usage, message submissions allow 12 per minute per socket IP, 60 per
minute and 300 per hour globally, with up to eight pending requests per room.
A proxy makes visitors share the same IP limit unless `TRUST_PROXY_HOPS` is
configured as described below. AI message limits do not prevent human chat. The in-memory coordination
is intended for one server instance; multiple replicas need a shared room store
and queue. This version is text-only.

## Server WebSockets

Presence, movement and human chat use `/api/room` on the same server and origin
as the site. HTTPS pages automatically use `wss://`. There is no external
multiplayer service or database. Visitors reconnect after connection loss, and
chat is disabled until the server confirms a live session.

For production behind an HTTPS reverse proxy, set runtime environment variables:

```bash
PUBLIC_ORIGIN=https://your-domain.example
TRUST_PROXY_HOPS=0
```

`PUBLIC_ORIGIN` must exactly match the browser origin, with no trailing slash.
Configure the proxy to forward WebSocket upgrades and allow long-lived connections.
Keep `TRUST_PROXY_HOPS=0` for direct connections. If the backend is reachable only
through trusted proxies, set it to the exact number of proxy hops (often `1`).
The proxy must append or replace `X-Forwarded-For` correctly; exposing the backend
directly while trusting that header lets callers bypass IP limits. Without this
setting, visitors behind a proxy share its IP limits.

The server checks origins, assigns visitor and message IDs, reserves the Assistant
name, validates every event and walkable position, rejects binary frames, and
limits payloads to 4 KiB. It allows up to 100 connections globally, eight per IP
and 30 connection attempts per IP per minute. Each visitor can burst 12 chat
messages, recovering one allowance every five seconds. Packet and movement
limits, ping/pong heartbeats and slow-reader disconnection bound resource use.
Assistant and notification requests require a private live-session capability;
messages must first have been accepted in room chat. Tokens are never broadcast
to other visitors. Chat is rendered as React text rather than injected HTML.

This is a public anonymous room: display names are not verified identities, and
bots can imitate a browser or distribute requests across IPs. Origin checks do
not authenticate non-browser callers. Use HTTPS and your hosting provider's edge
rate limits for public deployment. Chat is visible to everyone connected; avoid
posting private information. Room presence and chat coordination are in memory
and currently require one server instance. Multiple replicas would need shared
coordination and a shared Assistant queue.

## Edit the studio

The current artwork is `art/isometric_studio_warm_laptop.png`, rendered from
`art/isometric_studio_warm_laptop.blend`. The closed laptop rests on an inclined
arm tray. The scene includes an Elliot Wild Oak
three-drawer bedside, a potted fern and a Chalk Google Nest Mini, plus warm window lighting,
foliage, sage plaster, a mottled floor, and the framed university certificate.
Earlier Blender scenes and the illustration trial remain available in the repo.

After rendering the full scene to that PNG, export the web image, masks, and
camera metadata with Blender 5.2:

```bash
blender -b art/isometric_studio_warm_laptop.blend -P scripts/export_studio_masks.py
```

This copies the artwork to `public/assets/studio/organic-room.png` and renders
six white-on-black visible-surface masks directly from the Blender geometry.
The SVG uses those luminance masks to redraw furniture among avatars in depth
order, including the chair's mesh openings. `organic-scene.json` holds the floor
corners and hotspot polygons projected through the same camera, plus collision
tiles. The exporter runs in a separate Blender process and never saves its
temporary material, render, or visibility changes to the source scene.

Keep the camera orthographic. If you move furniture, update the collision
footprints and depths in the exporter before regenerating the assets.

Popup copy lives in `INTERACTIVE_SPOTS` in `src/roomData.ts`. The computer
describes ElementX experience, the workbench opens the maker’s lab, and the
surfboard covers time outdoors. The certificate opens education and
certifications, with the Mechatronics honours degree and AWS Solutions Architect
Associate certification.
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
cache. The server sends ping frames every 15 seconds and drops connections that
miss the next heartbeat. Departures remove visitors immediately; late move
packets cannot recreate departed visitors. Run `npm test` for connection lifecycle,
room validation, abuse limits, Assistant authorization and notification checks.
