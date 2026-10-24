# Generated photography

ElevenLabs Image & Video (web app), **GPT Image 2.5 Sunburst**, 3:2, 1K (1536x1024), High, 2 takes per prompt,
each with one reference image: the engine's own render of the design (`marketing/ref/`, from the job previews).
About 1 generation each from the plan's image allowance (102 -> 96 for these six). 2026-10-23.

Rule: the reference is our real design, so the piece in the photo is the piece the CNC cuts. Label them
"Visualisation" on the site; replace with photos of real builds as soon as they exist.

| File | Reference | Setting |
|---|---|---|
| gen/dresser-a.png, -b | ref/dresser-walnut.png (60" dresser, recessed inset walnut) | sunlit Copenhagen bedroom |
| gen/bookcase-a.png, -b | ref/bookcase-oak.png (108" built-in, white oak) | 1960s Milan apartment living room |
| gen/vanity-a.png, -b | ref/vanity-walnut.png (36" floating vanity, walnut + birch) | 1950s Viennese bathroom, terrazzo |

Prompt pattern (keep it): "Editorial interior photograph for a European design magazine. Use the <piece> from the
reference image exactly as designed: <every design fact: counts, materials, pulls near the top, legs/kick>. Set it
in <city, era, restored for 2026>: <walls, floor, 2-4 props>. <light>. Medium format, <35-50>mm, natural color,
calm, quiet luxury. Do not change the <piece> design, <counts>. No text, no people."

Full prompts are in the ElevenLabs history (Image & Video -> History, 2026-10-23).

Prompt rule (Leah, 2026-10-23): no real brand or designer names in prompts or captions; describe objects generically. City settings set a mood only; captions never say a piece comes from there.

## Round 2 (2026-10-23 late): banded edges + lifestyle + film
New references rendered with banding and the tapered legs. GPT Image 2.5, 3:2, 2 takes each:
dresser (banded, shadow inset), bookcase (banded white oak), vanity (banded), and the **lifestyle** shot: a woman in an
ivory linen dress walking past the dresser, fingertips trailing across the fronts, slow shutter (she is motion-blurred,
face turned away; the dresser stays sharp). Picks: `site/img/photo-lifestyle.jpg` (hero poster), `photo-dresser.jpg`,
`photo-bookcase.jpg`, `photo-vanity.jpg`, `og.jpg`.

**Film:** ElevenLabs Video, Gemini Omni Flash 1.1, 16:9 720p 6s, 1 take, start frame = lifestyle-a (upload the frame via
the image viewer's "Create Video"; uploading straight into the video composer's start-frame slot gave a broken blob).
Prompt: "Real 35mm film footage, slow motion. Locked-off camera on a tripod ... the walnut dresser ... stay perfectly
still and sharp ... no cuts, no text." Made loopable with ffmpeg (last 0.8s dissolves into the first): `site/img/film-dresser.mp4`
(5.25s, ~1 MB). Video allowance after: 11 left this month.

Round 3: `gen/island-a.png`, `-b` from `ref/island-oak.png` (84" white oak island): "Architectural interior photograph
... Use the kitchen island from the reference image exactly as designed ... Its top is a thin honed travertine slab ...
calm, sunlit 2026 kitchen in a restored 1960s house ... two pale ceramic pendant lamps ... No text, no logos, no people."
Pick: `site/img/photo-island.jpg`. Image allowance after: about 79 left this month.

## Round 4: the three-scene film (2026-10-24)
- **Coffee nook** (Blake): engine design `specs/nook-60-coffee.json` (the bookcase planner on a 62" wall: two 30" bays,
  white oak case, recessed walnut doors, waterfall grain). Ref `ref/nook-oak-walnut.png`, GPT Image 2.5 at **16:9**
  (matches the video frame): a home coffee nook in a kitchen-dining room, espresso machine and grinder on the shelf
  above the doors, cups and jars above. Picks `gen/nook-a.png` (steam) -> video: Gemini Omni Flash 1.1, 6s, "very slow
  gentle push-in ... steam curls up ... the built-in stays perfectly still and sharp".
- **Kitchen**: video from `gen/island-a.png`, "very slow smooth camera glide from left to right along the island".
  The model dissolved to a new angle at 1.0-1.8s, so the film uses 2.0s onwards.
- **Film** `site/img/film-plywise.mp4` (13.75s, 2.75 MB): dresser (from 0.8s) -> nook -> island (from 2.0s) -> the
  dresser's first 0.8s, 0.8s dissolves (ffmpeg xfade), so the loop is seamless. The site caption follows the scene.
  Video allowance after: 8 left this month.
