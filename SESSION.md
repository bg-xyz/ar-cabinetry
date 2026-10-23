# Session log

Newest at the bottom. Each entry covers what happened, what was decided, and what's next.

---

## 2026-10-22: Session 1: idea brainstorm and project setup

**Blake's pitch:** an iPhone AR native app. You scan the walls of your home or office, it generates modern European cabinetry that suits the space (bath vanity, kitchen, closet built-in, bookshelf) and shows it in the room. It outputs CNC files with all the holes and Blum hardware placed, and the user posts the job to a manufacturing board. We make money as a lead generator.

**My feasibility read:**
- Scanning (RoomPlan) and AR preview (RealityKit): easy, well-supported Apple APIs.
- The scan's accuracy (about 1-2") isn't good enough to cut from. The app needs a confirm-measurements step plus scribe/filler allowances.
- Cabinet generation: medium. Use a parametric 32mm-system library with rules, not freeform AI.
- CNC output: the real engineering work. Every shop's machine, post-processor, tooling and materials differ, and shops don't trust outside files. Lock to one reference machine first.
- The job board as the main business is the weakest link: a chicken-and-egg marketplace, and custom shops see homeowner-designed jobs as poor leads. I suggested selling the product as a brand and routing it to contract shops instead. Blake prefers platform/lead-gen; noted, not argued further.
- Start with a vanity, closet or bookshelf, not kitchens.

**What Blake told me:**
- He owns a **5x10 CNC router with VCarve + Mach3**. He has built several production-grade pieces.
- He does **not** want to be the manufacturer, but his shop can be the **test shop**.
- **No ATC**, **no edge bander**, materials "wood plastic" (confirm what he means).
- **Vanity is the first project.**

**What that changed:**
- Target supply side: the many small 3-axis router shops on VCarve/Aspire, not pro Cabinet Vision shops.
- Design rule: **face-only machining**, no edge boring (Cabineo or dado+confirmat joinery; hinge cups cut as spiral pockets).
- Output format: a **layered DXF** whose layer names carry operation, tool and depth, matched by a VCarve toolpath template. Operations ordered by tool for manual changes.

**Set up this session:**
- Project folder `Desktop\ar-cabinetry` with `CLAUDE.md` (handoff/plan) and this `SESSION.md`.
- Launcher `Claude_ARCabinetry.bat` + Desktop shortcut "Claude AR Cabinetry".
- Git repo initialized. Memory entry `ar-cabinetry-app-idea`.

**Next session:**
1. Get from Blake: exact sheet materials + measured thicknesses, his bit list, his iPhone model, and vanity preferences (size, sink type, drawers vs doors).
2. Build Phase 0: a Python cabinet engine → nested, layered DXF + cut list for vanity v0.
3. Blake sets up the VCarve toolpath template once, then cuts and assembles the test vanity.

---

## 2026-10-23: Session 2: engine concept (Blake's thoughts)

**What Blake said:**
- Cabinets are just basic boxes assembled according to the number of doors and drawers. Euro/contemporary work shares the same reveal, flat slab fronts and simple top-mounted pulls.
- So the engine can generate parametric boxes and assemble them into the right forms, all in code.
- Limit materials to 1/4"-3/4" plywood and trim boards. Backs are captured in a dado and glued.
- The only really dynamic variables are the hinge and drawer-slide hole positions, and Blum publishes those schematics.
- The engine should be light enough to be fast and still output nice AR models that lock in place and can be viewed from every angle.
- **Firm restatement:** the goal is the app. His CNC is only for testing outputs. We are the middle layer, never production.

**Decided:**
- Three-layer engine: box primitive → assembly grammar (front layouts, one global reveal) → hardware rules as JSON data.
- One neutral parts model → emitters for AR mesh, layered DXF, cut/hardware list, job package.
- **TypeScript** engine: runs in Node now, in the browser for the job board, and on the iPhone via JavaScriptCore. Swift only builds RealityKit meshes from the parts JSON.
- AR: snap cabinets to RoomPlan walls + world anchors, so they stay locked in place while you walk around.
- Details are in CLAUDE.md under "Engine architecture".

**A few points I added to Blake's "only holes vary":** mostly true, but the engine also has to handle (a) door/drawer front sizes from the reveal and hinge overlay, (b) drawer-box sizes derived from the runner model (Blum specs), (c) dado widths from **measured** ply thickness, and (d) scribe/filler strips and plumbing cutouts. All of these are formulas, not new design work.

**Next:** build the engine skeleton in TypeScript: box primitive + one vanity layout → parts JSON → DXF + 3D preview on the PC.

**Later in session 2:** Blake suggested limiting support for manufacturer parts (sinks, faucets, kitchen hardware) at first. Decided: a short list of supported parts, each stored as JSON (dimensions, cutout/drill template, clearances, buy link), and users pick only from that list. I added affiliate buy links on catalog items as a second revenue stream. Vanity v0 needs about 2-3 sinks (vessel + undermount), 2-3 single-hole faucets and 1-2 pulls.

**Style research (session 2, cont.):** Blake asked for research on modern Euro cabinet and built-in styles before the engine is built, so we know the range of variation (inset with sides shown, flush face, etc.). His point: it's all the same components in slightly different construction. **Confirmed.** Wrote `STYLES.md`: every look reduces to 8 switches: front mounting (full overlay / inset / flush face / half overlay), grip (pull / edge pull / routed groove / cut-out / Gola channel / TIP-ON), front surface (slab / fluted / slatted / slim shaker), base (toe kick / plinth / legs / wall-hung), ends and edges, top, interior, run construction (separate boxes vs shared gables). Plus global reveals (3mm between, 1.5mm at ends) and 5 named presets. Visual sheet `research/style_switches.png` (from `research/style_switches.py`, matplotlib) was opened on Blake's screen.
Engine takeaway: `mount` is a box-level parameter (it moves hinge plates, runners and system holes); grip and surface are operations on a front; base, ends, fillers and top are add-on parts; the run builder chooses separate boxes or shared gables. Vanity v0 = Classic Euro preset, wall-hung, exposed ply. Inset and fluted come next (most CNC-friendly).

---

## 2026-10-23: Session 2 (cont.): engine v0.1 built

**Blake:** missing style = **recessed inset** (fronts set in ~1/2-3/4" so the top, sides and bottom stand proud). Added to STYLES.md as `mount: inset` + `insetSetback`. Then: "make the engine, then layer on the next pieces until we can do a proper test: scan the wall, generate the model, see it in AR, send the files to a builder or an existing platform."

**Built (`engine/`, TypeScript, run directly by Node 24, no build step):**
- Box primitive + front layout + hardware in `src/cabinet.ts`; runs/top/sinks/plumbing in `src/run.ts`. All holes and dados are placed in 3D world coordinates, then projected to each part's face (`src/flatten.ts`), so the 3D model and the CNC file can't disagree.
- Catalog as JSON (`catalog/`): Baltic birch 18/15/12/6 + 4x8 ply, Blum CLIP top overlay/inset, Blum TANDEM 563H, a generic tab pull, 2 generic vessel sinks, a vessel faucet. Unconfirmed numbers carry `verify` notes that print on the job sheet.
- Outputs per job: `preview.html` (three.js, open doors/pull drawers), `jobsheet.html`, layered DXF per sheet, `cutlist.csv`, `parts.json` (for AR, incl. sink/faucet/pull fixtures).
- Samples: `specs/vanity-30-doors.json` (v0 test piece), `vanity-48-run.json` (sink cab + 3-drawer bank), `vanity-30-recessed.json`.
- Checks: 26 tests incl. a joinery-overlap test (mutation-checked: a broken rabbet makes it fail); ezdxf audit = 0 errors; I checked the right side's mirrored hole layout and the door hinge/pull positions by hand against the rendered DXF.
- Behaviors that came out of testing: the sink bowl is pushed forward automatically so a faucet fits behind it; a drawer under a sink drain is refused with a warning (U-drawer not built yet).

**Housekeeping:** port 8769 is used by another local python server; I used 8771 for testing and stopped it. Playwright browser closed. `jobs/` is generated (gitignored); rebuild with `npm run samples`.

**Open questions for Blake:**
1. Check the Blum numbers flagged on the job sheet (hinge cup edge distance for 18mm overlay on an 18mm side; TANDEM screw-hole height, rear screw positions, rear hook hole, whether the drawer back needs notching).
2. Measured ply thicknesses → `catalog/materials.json`.
3. "Top-mounted pull": a tab that wraps over the top edge (then the 3mm top gap under the counter is too tight), or a pull on the face near the top? The engine currently screws it from behind near the top edge.
4. Box joinery: dado/rabbet + glue + confirmat (current default) OK?

**Next:** hinge test cut → test vanity on Blake's machine. Engine: U-drawer, toe kick/legs, flush face, half overlay/shared gables, adjustable shelves. Then the iPhone app.

---

## 2026-10-23: Session 2 (cont.): engine built out, real textures, app plan

**Blake:** pulls go **on the face near the top**; joinery (dado/rabbet + glue + confirmat) is fine. "Keep working on the engine as long as you want, it's the most core thing." After that comes the app: use the iPhone LiDAR scan to take in the space, measure, generate the model, place and lock it, and view it. **Textures must be top notch.**

**Built this stretch (all tested, committed):**
- **Pulls:** face-mounted bar pull (128mm c/c default, 96mm option), through-bolted, with an **11mm counterbore** on the back of the front so screw heads sit flush (no clash with the drawer box). New layer `DRILL_5_THRU`.
- **Realistic finishes:** CC0 ambientCG scans in `engine/textures/`: Baltic birch face (Wood095), **true-scale ply edges** (Wood087; scaled per material ply count, so 18mm BB shows 13 plies), white oak (Wood049, lightened toward rift white oak), walnut (Wood051). `catalog/finishes.json` adds birch / white oak / walnut / painted white, sage, charcoal. Style fields `frontFinish`, `carcassFinish`, `topFinish`.
- **Viewer rebuilt:** PBR (studio environment lighting, ACES tone mapping, soft shadows), world-space UVs (grain along each part's grain, plies through the thickness), open ceramic sink with drain, matte-black faucet/pulls/legs, a **live finish picker**, and through-cuts shown in 3D. Textures are embedded, so a double-click works (~2.6MB file).
- **U-drawers** around a sink drain: two short backs, notch walls and a cross piece on a notched bottom. Sample `vanity-36-udrawers`.
- **Bases:** `mounting: toe-kick` (per-cabinet plinth ladder, 4"/3" default) and `legs` (per run: corners + a centre pair on long runs). **Flush end panels** (`endPanels`) in the front finish, with the fronts' end gap widened to match. **Adjustable shelves** (`shelves: n` on door zones) on the 32mm grid, aligned with the hinge plates, notched for a drain.
- **Nesting:** MaxRects; grain-locked parts only turn when forced; materials have a `longSheet` (4x8 BB), and long parts go first so other parts fill the leftover.
- **Quote** (`quote.json` + job sheet summary): sheets per material with yield, plywood + hardware estimate (`catalog/prices.json`, rough Oct 2026 US retail, flagged), CNC cut length / holes / pockets / bits.
- Tests: 47 (overlap/joinery check now covers plinths, shelves, end panels, U-drawers; job package write; U-drawer clears the drain).
- `APP_PLAN.md`: how LiDAR/ARKit/RoomPlan work in plain English, the scan → measure → generate → lock → view → send pipeline, milestones.

**Samples now:** vanity-30-doors, vanity-30-recessed, vanity-36-udrawers, vanity-48-run, vanity-48-milan (toe kick, end panels, push-to-open, white oak), sideboard-60-legs (walnut, shelves).

**Still open for Blake:** Blum numbers flagged on the job sheet; measured ply thickness; which iPhone (LiDAR?); the real pull model; app name.

**Next:** start the app (APP_PLAN milestone 1: "hello room"). Engine leftovers: shared-gable runs (closets/bookcases), tall units + hanging rails, fluted fronts.

---

## 2026-10-23: Session 2 (cont.): the iPhone app starts, repo goes public

Blake has an **iPhone 12 Pro** (LiDAR, RoomPlan supported). He OK'd the placeholder name and **making the repo public (open source)**, and asked for .xyz name ideas.

- **App v0.1** built: RoomPlan scan on the AR view's own session -> walls shown as teal planes -> tap -> the design locks to the wall at floor level (centred on an existing sink if RoomPlan found one) -> design menu (5 designs), Fronts/Cabinet/Top finish menus, nudge along and away from the wall, other wall. Same PBR textures and world-space UVs as the web preview; LiDAR mesh occlusion; shadowed directional light. App icon drawn from the real textures (`app/tools/make_icon.py`).
- Cloud build: XcodeGen + xcodebuild on GitHub Actions. First compile: 2 errors (SwiftUI.Scene vs RealityKit.Scene), fixed -> **BUILD SUCCEEDED**.
- Bundle ID `xyz.bg.cabinets` registered via the App Store Connect API.
- **Going public:** the history held Blake's Apple email, a family mention and App Store Connect key ids. Deleting the stash / force-pushing was blocked by the safety classifier, so instead: the scrubbed copy of all commits (git filter-branch on a new branch) became `main` and was pushed to a **new public repo bg-xyz/ar-cabinetry**; the original repo was renamed **bg-xyz/ar-cabinetry-private** (full history kept). Verified: 0 personal strings in the public history.
- .xyz names checked via the CentralNic RDAP server (404 = unregistered; premium/reserved status unknown).

**Waiting on Blake:** sign in to App Store Connect in Chrome (then Claude creates the app record, sets the secrets, builds to TestFlight); pick a license; pick a name.

**Later (same day):** Blake picked **Apache-2.0** and the name **Make Room** (makeroom.xyz; Blake registers it). Added `LICENSE`, renamed user-facing text (home-screen name "Make Room"). App Store Connect: "Make Room" was taken, so the record is **"Make Room: Custom Cabinets"** (Apple ID 6826390742). Bundle ID registered by API; internal TestFlight group "Make Room Crew" (API) + Blake added (web; the API refused internal testers). First signed build failed: PowerShell 5 piping re-encoded the key secrets; re-set byte for byte from bash, fixed the script. **Build 6 uploaded to TestFlight** (one harmless warning: arkit requirement = no Vision Pro).

---

## 2026-10-23: Session 2 (cont.): Blake's first real scan → the planner

**Blake's test (iPhone 12 Pro):** the scan worked, but (1) it's hard to tell what's been scanned; (2) the cabinet wasn't sized to the space; (3) it didn't decide single vs double sink. "This has to be very versatile, understand the space, and know what it's trying to output without a lot of user intervention." Leah's mom saw it and loved it.

**Done:**
- Engine split into pure modules (`model3d.ts`, `load.ts`; `catalog.ts` no longer touches files) so it runs on the phone.
- **`src/planner.ts`**: `planVanity({ wallLength, obstacles, sinkAt })` finds clear stretches (doors/openings + 2", toilet centre ± 15", tubs/storage blocked; windows and the old sink don't block), picks the stretch with the old sink else the widest, the largest standard width (24–84") with 1/2" each side, **double sink at 60"+** (sink | drawer bank | sink), centres on the old sink when it fits, otherwise slides over and says so. Returns spec + position + plain-English notes.
- Tests: 64 pass (every standard width builds a valid job).
- **`npm run bundle`** (esbuild) → `app/Resources/plywise-engine.js` (25 KB): `Plywise.plan(json)` / `Plywise.design(json)`. Verified in a bare JS sandbox (no Node), same as JavaScriptCore.

**Next (not started):** Swift side: `EngineBridge` (JSContext loads plywise-engine.js), room analysis (doors/windows/openings with `parentIdentifier` on the wall, toilet/tub/sink objects within ~40 cm of the wall → obstacle intervals along the wall's x, in the wall frame used by `basis()`), call `plan`, place at `x0`, show the notes. Scan UX: switch to a custom `RoomCaptureSession(arSession:)` + delegate `didUpdate` → draw walls/doors/objects live with length labels and a HUD ("4 walls · 1 door · sink ✓"), `RoomBuilder` for the final room. Then Style/Width menus re-plan on device. Then `python tools/asc.py friends <n> "..."` for Noah.
