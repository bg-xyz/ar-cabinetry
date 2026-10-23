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
