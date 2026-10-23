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
