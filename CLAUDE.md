# Plywise (formerly AR Cabinetry / Make Room): project handoff

Read this first in every session. Session-by-session history is in `SESSION.md`; add to it at the end of each session. Style research (the 8 style switches + presets the engine is built around) is in `STYLES.md`, with a visual sheet at `research/style_switches.png`.

## The idea

An iPhone AR app that:
1. **Scans** a room's walls (Apple RoomPlan, LiDAR iPhones).
2. **Generates** modern European frameless cabinetry that fits the space: bath vanity, closet built-in, bookshelf/wall unit, eventually kitchens.
3. **Shows** the design in the room in AR (RealityKit).
4. **Exports** CNC-ready job files with every hole already placed: Blum hinge cups, 32mm system holes, drawer runner holes, joinery.
5. **Posts** the job to a manufacturing board, where shops pick up the work. **We make money as the lead generator / platform**, not as the manufacturer.

## Ground rules (decided)

- **The product is the app. We are the middle layer** (design → job package → shop), never the producer. Blake's shop is only the **test/reference shop**: every design rule and file format is proven on his machine before any other shop sees it. No production orders. (Blake restated this firmly 2026-10-23.)
- **Every cabinet is a box.** Contemporary Euro cabinetry is the same parametric box assembled in different combinations of doors and drawers, with one reveal standard, flat slab fronts and simple top-mounted pulls. Restricting the style is what makes the engine small and fast. (Blake's insight, 2026-10-23.)
- **Short list of supported parts at launch** (Blake, 2026-10-23). Only a handful of supported sinks, faucets, pulls and Blum models. Each one is a catalog entry (JSON): dimensions, cutout/drill template, clearance needs and a buy link. Users pick from the list, with no "enter your own sink." Add items as demand shows up. Kitchen appliances work the same way later (standard 24" dishwasher, 30"/36" range openings, etc.).
  - Bonus: every catalog item can carry an **affiliate buy link**, which gives the middle layer a second revenue stream on top of lead fees.
- **Materials are limited to 1/4"-3/4" plywood plus trim boards.** Backs are **captured in a dado and glued**. Material thickness is always the measured value, never the nominal one, because dado widths come from it.
- **Start with a bath vanity** (decided 2026-10-22). Closets and bookshelves come next. Kitchens come last, if ever (countertops, appliances and plumbing make them the hardest).
- **Flat-bed 3-axis only.** Every operation is machined from the top face of the sheet. **No edge boring** (a router can't drill into panel edges). This matches Blake's machine and the large pool of small VCarve/Aspire/ShopBot-class shops, which is the target supply side of the job board.
- **Rules, not AI geometry.** Cabinets come from a parametric library on the 32mm system. AI can suggest layouts and styles, but every part dimension is computed by rules so it's always buildable.
- **The scan is for design, not for cutting.** RoomPlan is off by about 1-2"; cabinets need about 1/16". The app must make the user confirm the key measurements, and every design gets scribe/filler allowances.

## Blake's shop (the reference machine)

- 5' x 10' CNC router. A full 4x8 or 1250x2500 sheet fits.
- Software: **VCarve** for CAM and **Mach3** for machine control.
- **No ATC.** Bits are changed by hand, so files must group operations by tool to keep bit changes to a minimum.
- **No edge bander.** Design for exposed plywood edges (the modern Euro look, e.g. Reform/Plykea) or for materials that don't need banding.
- Materials: 1/4"-3/4" plywood + trim boards (see ground rules). He also cuts plastic. *(Get **measured** thicknesses before the first cut.)*
- Blake has built several production-grade pieces. He's an experienced CNC user, so skip the basics.

## Technical plan

### Engine architecture (decided 2026-10-23)

Three layers, all in code:
1. **Box primitive**: `box(W, H, D, material)` → sides, bottom, top/stretchers, dadoed back. Every part knows its own operations (dados, holes, cutouts).
2. **Assembly grammar**: a cabinet is a box plus a **front layout**, e.g. `[drawer 6"] / [drawer rest]` or `[door pair]`. The layout sets the opening sizes, the reveal math (one global reveal, e.g. 3mm / 1/8") and the pull positions. Runs of boxes (a vanity, a closet wall) are lists of cabinets along a wall.
3. **Hardware rules as data**: Blum hinge, plate and runner drilling patterns, and how drawer-box sizes follow from runner length, stored as JSON per hardware model and taken from Blum's published specs. This is the only part that really varies, and it's data, not code.

**One model, several outputs.** The engine produces a neutral parts model (JSON). Small emitters turn it into:
- **AR mesh**: every part is a box with a few holes, so the meshes are tiny and generate instantly on the phone.
- **Layered DXF** (nested on sheets) for CNC.
- **Cut list, hardware list, assembly sheet** (PDF/HTML).
- **Job package** (all of the above zipped), which is the thing the job board brokers.

**Language: TypeScript.** It runs in Node on Blake's PC now (Node 24 is installed), in the browser (job board / shop portal / web preview, free), and inside the iPhone app via JavaScriptCore. Swift reads the parts JSON and builds RealityKit meshes. One engine everywhere, so the AR model and the CNC file can never disagree. (Swift isn't installed on Windows and would be heavy, which is why I didn't pick it.)

**AR placement:** RoomPlan gives each wall's position and orientation. Cabinets snap to a wall and get a world anchor, so they stay locked in place while you walk around and look from every angle.

### Status (2026-10-23, end of session 2)
**Engine is at a good place** (`engine/`, see `engine/README.md`; VCarve setup in `engine/VCARVE.md`). 47 tests pass; DXFs pass an ezdxf audit.
- Styles: overlay, inset, recessed inset; pull (face-mounted bar, through-bolted + counterbored), routed groove, push-to-open; flush-face end panels.
- Boxes: doors (single/pair) with adjustable shelves on the 32mm grid; drawers (Blum TANDEM), **U-drawers around a sink drain**; wall-hung, **toe-kick plinth**, or **legs**.
- Run: countertop, vessel sink + faucet (auto-placed so the faucet fits), plumbing cut-out in the back, multi-box runs.
- Output: layered DXF per sheet (MaxRects nesting, grain-aware, long 4x8 sheets for long parts), job sheet, cut list, **quote** (sheets + yield, plywood + hardware estimate, CNC stats), `parts.json` for AR, single-file 3D preview.
- **Realistic finishes:** CC0 scanned textures (Baltic birch, white oak, walnut, true-scale ply edges), PBR lighting, live finish picker. These are the same assets the app will use.
- **Planner + on-device engine (2026-10-23):** `engine/src/planner.ts` auto-fits a vanity to a wall's clear space (double sink at 60"+); `npm run bundle` -> `app/Resources/plywise-engine.js` (re-run after any engine change, then push). App 0.2 plans on the phone from the scan.
- **Builds (app 0.3):** `plan({ project })` handles vanity, built-in bookcase (open shelving zone + fixed dadoed shelf, to the ceiling), media console and dresser; window sills and ceiling height come from the scan. Closets and kitchens are listed as coming soon in the app.
- **Next:** the iPhone app, see `APP_PLAN.md`. Engine leftovers: half overlay / shared-gable runs (closets, bookcases), tall units + hanging rails, fluted fronts, Blum numbers verified by Blake, hinge test cut.

### App + repo status (2026-10-23)
- **Public repo: https://github.com/bg-xyz/ar-cabinetry** (Blake OK'd open source 2026-10-23). Public = free unlimited cloud-Mac builds. Personal details were scrubbed from every commit before publishing; the original full history is kept private at `bg-xyz/ar-cabinetry-private` (git remote `private`, local branch `main-private`). **Never commit personal info (emails, family, account ids)**; key ids live in `%USERPROFILE%\.config\ragtime\asc.json`. Git identity = GitHub noreply.
- **Name: Plywise, slogan "Make room."** (Blake, 2026-10-23, after briefly being "Make Room"; the home-screen name and welcome screen say Plywise). makeroom.xyz turned out taken at the registrar, so the domain is **plywise.xyz** (Blake registered it; the site brands the project "Plywise" with "Make room" as the slogan; may switch later).
- **Site: https://plywise.xyz** = GitHub Pages from `site/` via `.github/workflows/pages.yml` (rebuilds the engine samples and publishes them as `site/demo/<spec>.html` + `-jobsheet.html`). DNS records: `PLYWISE_DNS.txt` (local only). After DNS resolves: `gh api repos/bg-xyz/ar-cabinetry/pages -X PUT -F https_enforced=true`. **License: Apache-2.0** (`LICENSE`).
- **App v0.1** (`app/`, Swift + RoomPlan + RealityKit, iOS 17+, bundle `xyz.bg.cabinets`, App ID registered via API): scan -> tap wall -> textured cabinet locked to the wall, design + finish menus, nudge. Xcode project generated by XcodeGen in CI (`app/project.yml`). `.github/workflows/ios.yml`: unsigned compile check without secrets (**BUILD SUCCEEDED** on run 40017131073), TestFlight upload with them.
- **App Store Connect (2026-10-23):** app **"Make Room: Custom Cabinets"** ("Make Room" was taken), Apple ID 6826390742, SKU makeroom-ios-001, bundle xyz.bg.cabinets; home-screen name "Make Room". Internal TestFlight group **Make Room Crew** (all builds, Blake added). External group **Friends** (public link https://testflight.apple.com/join/cHyMWKsv, live once a build passes beta review; Noah invited 2026-10-23). App Store name now **"Plywise: Custom Cabinets"**. Helper: `python tools/asc.py builds | friends <n> "notes" | invite <email>` (each new build must be added to Friends with `friends`). Secrets set (same Apple key as Ragtime). Every push to `app/**` (or `gh workflow run iOS --repo bg-xyz/ar-cabinetry`) builds + uploads to TestFlight. Gotcha: set key-file secrets byte for byte (`gh secret set X < file` from bash/cmd), never piped through PowerShell 5.
- `npm run app-assets` (in engine/) re-exports `app/Resources/Designs` + `Textures` after engine changes.
- Name ideas (.xyz unregistered per RDAP 2026-10-23): makeroom, opencabinet(s), plyhaus, scantocut, measuremade, plyroom, plywise, cabkit.

### Phase 0: the cabinet engine (Windows, no Mac needed) ← built, see Status
A generator that turns cabinet parameters into cut-ready files:
- Input: overall W/H/D, material thickness, door/drawer layout, hardware choice, plumbing cutout.
- Output: a **DXF already laid out on the sheet**, plus a parts list/cut list and an assembly sheet.
- **DXF layer naming convention**: one layer per operation, carrying tool and depth, e.g. `DRILL_5MM_13D`, `POCKET_35MM_13D`, `DADO_19W_8D`, `CUTOUT_THRU`. In VCarve, save one toolpath template keyed to these layers. After that every job is import → apply template → save G-code for Mach3.
- Order the operations for manual tool changes: all drilling → cup pockets → dados/rabbets → profile cutouts (with tabs/onion skin) last.
- Joinery must be face-only: dado/rabbet + confirmat, or **Lamello Cabineo** (designed for CNC face-only machining). Hinge cups are cut as spiral pockets, not with a Forstner bit at spindle speed.
- Hardware data: Blum publishes the drilling specs (Clip top hinges + plates, system 32 lines at 37mm setback, Movento/Tandem/Legrabox runners). Encode them as data, not hard-coded numbers.

### Phase 1: first physical test (the vanity)
Cut and assemble one vanity on Blake's machine and check that every hole lines up. Passing this test proves the core of the idea.

Vanity v0 starting spec (change freely):
- Wall-hung (floating), roughly 30" W × 21" D × ~20" H box. The countertop ends up around 32-34".
- Frameless 3/4" (19mm) carcass. Hang it on a French cleat or a hanging rail.
- Top drawer U-notched around the sink trap; second drawer, or a hinged door pair, below.
- Blum hardware (exact model to pick: Movento vs Tandem for the runners, Clip top Blumotion hinges).
- Sink type to decide: vessel, undermount, or integrated top. This sets the top cutout and stretchers.

### Phase 2: the iPhone app (full plan: `APP_PLAN.md`)
- Swift + RoomPlan + RealityKit. **Needs a LiDAR iPhone (Pro model)** for good scans. Confirm which iPhone Blake has.
- Builds: Blake **already has a paid Apple developer account**, so the cloud-build → TestFlight route works without a Mac, the same way Ragtime does it. The used M1 Mac mini (AR Police Trainer) makes local testing nicer but isn't required.
- The app runs the same TypeScript engine via JavaScriptCore (no server needed, works offline).

### Phase 3: the job board
- Shops sign up with their machine profile (bed size, tool change, materials). Jobs are posted as file packages.
- Revenue options, still open: per-lead fee, % commission, or a monthly listing fee for shops. In the first brainstorm I suggested the stronger business is **selling the product as a brand and routing it to contract shops** (bigger margin, quality control). Blake has chosen lead-gen/platform for now; the brand route stays available.
- Lessons from others: Opendesk ("design online, local makers cut it") worked technically and struggled commercially. Semihandmade/Reform/Plykea make money selling the product, not leads.

## Open questions
- Product name.
- Measured plywood thicknesses; tooling list (bit diameters for the 5mm holes, cup pockets, dados, profiling).
- How boxes are joined (sides to bottom/top): dado + glue, plus confirmat/pocket screws or Cabineo? The backs are settled (captured dado, glued).
- Pull style: one standard top-mounted pull (which one?), or edge pull / finger-groove options.
- Which iPhone Blake has (LiDAR or not).
- Vanity specifics: size, sink type, drawer vs door layout, Blum models.

## Working notes for Claude
- Blake wants me to lead: decide, build and test without approval loops. Show visuals as local images opened on screen, not claude.ai artifacts. Price free/one-time options first.
- Launcher: Desktop shortcut "Claude AR Cabinetry" → `Claude_ARCabinetry.bat` (opens Claude Code in this folder).
