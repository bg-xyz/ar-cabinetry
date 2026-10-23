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
