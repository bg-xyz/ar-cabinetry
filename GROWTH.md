# Plywise: ease of use, likability, and going viral

What makes people pick it up, love it, and show it to someone. Ranked by impact for the effort.
**Done** items shipped on 2026-10-23/24; the rest are the plan.

## The loop we want
See a beautiful piece in your own room → **share it** (photo, film, link) → a friend opens the link → sees it in
3D or in their own room without installing anything → installs → scans their room → shares. The engine makes the
designs real (buildable, priced), which is what turns "cool AR toy" into "I'm actually getting this made".

## Shipped
- **Pick the build first** (vanity, bookcase, console, dresser; closet, kitchen and kitchen island listed as coming soon).
- **Designs itself for the wall**: clear space, ceiling height, window sills, toilet clearance, old drain, double sink.
- **Keep or replace existing cabinets** the scan finds on the wall.
- **Tap a drawer or door to open it** in AR, with a soft haptic tick (delight, and it proves it's real cabinetry).
- **Share a photo**: the AR view with a catalogue caption and plywise.xyz on it.
- **"Make it a photo"**: the raw AR frame + a ready-written prompt, so anyone can make a magazine shot in the image AI
  they already use. No AI inside the app or site (light, private, no bills).
- **Honest price line**: "About $1,550 in plywood and hardware; the shop's work is extra."
- **Grain matching** (and its cost in sheets) as a visible craft choice.
- **Finger-roll sliders** for every choice; **glass** home screen over the live camera.
- **Vision Pro app** (first version): glass window, a volume with the piece at true scale, an immersive space that
  finds your walls; pinch to place, pinch to open drawers.
- **Site**: slow-motion hero film, banded-edge photography, scroll-snap demo slider, "Make it a photo" in the 3D viewer.

## Next, in order
1. ~~"View in your room" on the website~~ **Done (2026-10-24, untested on a phone):** the 3D viewer makes a USDZ in the
   browser (three.js USDZExporter, 512px colour maps, ~4 MB) and opens AR Quick Look on iPhone/iPad Safari.
2. ~~Share links~~ **Done (2026-10-24):** `plywise.xyz/d/#<base64url design>` (about 1 KB of JSON, no server, nothing
   personal). The page designs it in the browser with the app's own engine: 3D, the finishes chosen in the app,
   "View in your room" and "Make it a photo". The app's Share sends it with the photo, or on its own.
3. **Assembly film**: a 6-second animation of the piece building itself (sides, back sliding into its dado, drawers
   gliding in, fronts landing), recorded from AR. The most shareable thing we can make, and it explains the product.
4. **No-LiDAR mode**: most iPhones don't have LiDAR. Plane detection works on every ARKit iPhone; let people tap a wall
   and enter or two-tap its width. Multiplies the audience.
5. **Saved designs** ("My rooms"): keep every design with its wall and photo; reopen in AR later.
6. **Measure confirm**: show the key number ("This wall: 9' 4\"") with -/+ to correct it. Trust, and fewer bad cuts.
7. **Get it made**: one button that sends the job package (DXF, cut list, quote) to a maker, or joins the waitlist in
   your area. This is the business; start with a simple form and email.
8. **Before / after slider** for shared photos (the empty wall, then the piece).
9. **Light matching**: use ARKit's light estimate for the cabinet's lighting, so it sits in the room at night too.
10. **Sound**: a soft wood "thock" when a drawer closes, a quiet click on placement. Off by default in public.
11. **Kitchen islands** (Blake): freestanding runs on a toe-kick, finished on all four sides, a seating overhang on one
    side, end panels both ends. The planner places it from the kitchen's clear floor, not a wall. Then full kitchens.
12. **Closets**: hanging sections (rod + top shelf), drawer towers, shoe shelves, 24" deep.

## Vision Pro, next
- TestFlight for visionOS: add the visionOS platform to the App Store Connect record, then the CI uploads the
  PlywiseVision build next to the iPhone one (same bundle id = one app, universal purchase).
- Room scan on Vision Pro: SceneReconstructionProvider + room anchors (visionOS 2) for doors and windows, so the planner
  sees obstacles like it does on iPhone.
- Floating spec sheet: pinch the plate to unfold the cut list and the price in the air next to the piece.
- Two people, one room: SharePlay so a partner sees the same piece in the same place.

## Naming, honesty, brand safety (Leah's rule)
Plain descriptive names; nothing that leans on someone else's mark or implies a false origin; generated images are
labelled "Visualisation" and replaced by real builds as soon as they exist. USPTO search before anything new ships.
