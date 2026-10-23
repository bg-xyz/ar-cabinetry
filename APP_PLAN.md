# The iPhone app: plan

Goal: **scan the space → measure → generate the cabinet → place and lock it in AR → look at it from every angle → send the job package.** The engine (`engine/`) already does everything between "measure" and "send". The app is the eyes and hands around it.

## How the iPhone "sees" a room (plain-English version)

- **LiDAR** (Pro iPhones since the 12 Pro, iPad Pros) fires an invisible grid of laser dots and times how long each takes to bounce back. That gives a live depth map: how far away every point in view is, out to about 5 m.
- **ARKit** (Apple's AR system) combines that depth with the camera and motion sensors to track exactly where the phone is in the room, many times a second. It also builds a rough **3D mesh** of everything it sees (walls, floor, the toilet, the existing vanity).
- **RoomPlan** (an Apple framework on top of ARKit) turns that mesh into a clean architectural model while you walk around: **walls** (with length, height and exact position), **doors, windows, openings**, and recognised **objects** (sink, toilet, bathtub, storage/cabinets, fridge, stove, dishwasher, washer). You get it as data, not just a picture.
- Accuracy: Apple doesn't publish a number. In practice it's a few cm, so it's good for design and not for cutting. That's why the app ends with a **confirm-measurements step** and the engine adds scribe/filler allowances (already a project rule).

## The pipeline

| Step | What happens | Apple tech | Engine |
|---|---|---|---|
| 1. Scan | User walks the room ~30 s; walls/objects appear live | RoomPlan `RoomCaptureView` | n/a |
| 2. Pick a wall | Tap the wall (or the existing vanity RoomPlan found) | `CapturedRoom.walls`, `.objects` | n/a |
| 3. Measure | Free run length between corners/doors/obstacles, ceiling height, existing sink centreline | wall transforms + dimensions | n/a |
| 4. Generate | Choose product + style + finish, and it fills the space (e.g. 36" vanity centred on the old sink) | n/a | `designRun(spec)` → parts |
| 5. Place + lock | Cabinet snaps to the wall and is pinned with a world anchor, so it stays put while you walk around | ARKit `ARAnchor` on the wall transform; RoomPlan + AR share one session (iOS 17+) so no re-alignment | `parts.json` |
| 6. View | Real textures, real lighting, real shadows; your actual toilet/door can pass *in front* of it | RealityKit `PhysicallyBasedMaterial`, environment texturing, LiDAR scene mesh occlusion | textures/ |
| 7. Confirm | "Measure wall left-to-right with a tape: is it 61 1/4"?" Adjust and regenerate | n/a | `designRun` again |
| 8. Send | Job package (DXF, job sheet, quote, parts) → share sheet or upload to the job board | share sheet / upload | `buildJob` + `writeJob` |

## Key design decisions

- **One engine, run on the phone.** The TypeScript engine is bundled into one JS file (esbuild) and run inside the app with **JavaScriptCore**, which is built into iOS. No server is needed, so it works offline and costs nothing per use. The AR model and the CNC files can't disagree because they come from the same run.
- **Swift draws `parts.json`.** Each part is a box (or a few boxes around cut-outs) with world-space UVs, the same maths as `viewer/preview.html`. The viewer is the reference implementation, so the phone should look like the preview.
- **Textures are already app-ready:** CC0 (free for commercial apps), 1K colour/normal/roughness JPGs in `engine/textures/`. RealityKit uses the same maps.
- **Locking:** RoomPlan and ARKit share one `ARSession`, so the wall RoomPlan measured is in the same coordinate system the cabinet is drawn in. To come back later and see it again in the same spot, save an `ARWorldMap` with the design.
- **Plumbing:** RoomPlan can find the existing sink but can't see pipes in the wall. The user confirms the drain centreline (default: centred on the old sink), and the engine handles U-drawers and cut-outs from there.

## Build + install (already paid for)

- Blake's **Apple developer account (from Ragtime)** → cloud builds on GitHub Actions (macOS runners) → **TestFlight** on his phone. That's the same setup Ragtime uses, and no Mac is required. The M1 Mac mini (when it arrives) makes debugging faster.
- **Needs a LiDAR iPhone** (any Pro model since the 12 Pro). Confirm which iPhone Blake has. Without LiDAR, ARKit still works but RoomPlan doesn't.

## Milestones (each one is something you can hold in your hand)

1. **Hello room:** scan, list the walls with their lengths on screen, tap one, and it highlights.
2. **Box on the wall:** a sample vanity from `parts.json` locks onto the tapped wall at the right height; walk around it.
3. **Real look:** PBR wood textures, ceramic sink, black pulls, shadows, occlusion. The finish picker works live.
4. **Design on the phone:** pick product / style / finish / width; the engine runs on-device and the cabinet updates in place.
5. **Measure + confirm,** then **send the job package** (share sheet first; job board upload later).

## Open questions for Blake

- Which iPhone do you have (Pro / LiDAR)?
- App name.
- Job board: build our own simple board first, or integrate with an existing marketplace (CNC shop directories, maker networks)? Our job package is a plain zip, so either works.
