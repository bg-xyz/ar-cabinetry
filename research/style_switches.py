"""Draw the style-switch reference sheet: plan views (front mounting),
side sections (grip) and side sections (base). Units are mm.

    python research/style_switches.py  ->  research/style_switches.png
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle

T = 18      # carcass + front thickness
G = 3       # gap between fronts
E = 1.5     # reveal at outside ends
W, D = 400, 300

PLY = "#e8d3a6"
FRONT = "#c99a5b"
METAL = "#8a8f98"
EDGE = "#5a4630"


def rect(ax, x, y, w, h, c=PLY, **kw):
    ax.add_patch(Rectangle((x, y), w, h, facecolor=c, edgecolor=EDGE, lw=0.8, **kw))


def frame(ax, title, note):
    ax.set_title(title, fontsize=11, fontweight="bold", loc="left")
    ax.text(0.0, -0.06, note, transform=ax.transAxes, fontsize=8, va="top", wrap=True)
    ax.set_aspect("equal")
    ax.axis("off")


# ---- plan views: front edge at the bottom (y = 0) -------------------------
def plan_box(ax, x0, inset=False, w=W):
    """One carcass in plan; returns the y of the carcass front edge."""
    y0 = 0 if inset else T          # overlay fronts sit in front of the box
    rect(ax, x0, y0, T, D)                      # left side
    rect(ax, x0 + w - T, y0, T, D)              # right side
    rect(ax, x0 + T, y0 + D - 6 - 6, w - 2 * T, 6, c="#d9c08d")  # captured back
    return y0


def plan_full_overlay(ax):
    plan_box(ax, 0)
    fw = (W - 2 * E - G) / 2
    rect(ax, E, 0, fw, T, c=FRONT)
    rect(ax, E + fw + G, 0, fw, T, c=FRONT)
    ax.set_xlim(-40, W + 40); ax.set_ylim(-60, D + 40)
    frame(ax, "1a  Full overlay", "Fronts cover the box edges.\nClassic Euro. Full-crank hinge.")


def plan_inset(ax):
    plan_box(ax, 0, inset=True)
    open_w = W - 2 * T
    fw = (open_w - 3 * G) / 2
    rect(ax, T + G, 0, fw, T, c=FRONT)
    rect(ax, T + 2 * G + fw, 0, fw, T, c=FRONT)
    ax.annotate("ply edge shows", (T / 2, 0), (-30, -45), fontsize=7,
                arrowprops=dict(arrowstyle="->", lw=0.6))
    ax.set_xlim(-40, W + 40); ax.set_ylim(-60, D + 40)
    frame(ax, "1b  Inset (sides shown)", "Fronts sit inside the box; box frames them.\n18mm-crank inset hinge; hardware set back.")


def plan_flush_face(ax):
    plan_box(ax, T)
    rect(ax, 0, 0, T, D + T, c="#d7b77e")           # applied end panels
    rect(ax, W + T, 0, T, D + T, c="#d7b77e")
    fw = (W - G - 2 * G) / 2
    rect(ax, T + G, 0, fw, T, c=FRONT)
    rect(ax, T + 2 * G + fw, 0, fw, T, c=FRONT)
    ax.set_xlim(-40, W + 2 * T + 40); ax.set_ylim(-60, D + 40)
    frame(ax, "1c  Flush face", "End panels come forward to the fronts.\nMonolithic 'Milan' look; box disappears.")


def plan_half_overlay(ax):
    w = W * 0.7
    rect(ax, 0, T, T, D)
    rect(ax, w, T, T, D)                              # shared middle gable
    rect(ax, 2 * w, T, T, D)
    fw = w - E - G / 2
    rect(ax, E, 0, fw, T, c=FRONT)
    rect(ax, w + T / 2 + G / 2, 0, fw, T, c=FRONT)
    ax.annotate("shared gable", (w + T / 2, D / 2), (w + 40, D * 0.75), fontsize=7,
                arrowprops=dict(arrowstyle="->", lw=0.6))
    ax.set_xlim(-40, 2 * w + T + 40); ax.set_ylim(-60, D + 40)
    frame(ax, "1d  Half overlay run", "One carcass, shared dividers; each front\ncovers half a gable. Closets, bookcases.")


# ---- side sections of the top of a base cabinet: front at the left --------
H = 220


def section_top(ax, front_h=H - G, stretcher=True, notch=False):
    rect(ax, T, 0, D, T)                                   # bottom (cut short)
    if stretcher and not notch:
        rect(ax, T, H - T, 100, T)                         # top front stretcher
    rect(ax, T + D - 6, 0, 6, H)                           # back
    rect(ax, 0, 0, T, front_h, c=FRONT)                    # front
    ax.add_patch(Rectangle((T, 0), 6, H, facecolor="none", edgecolor="#aaa", lw=0.5, ls="--"))
    ax.set_xlim(-60, D + 40); ax.set_ylim(-20, H + 40)


def grip_pull(ax):
    section_top(ax)
    rect(ax, -14, H - G - 40, 14, 40, c=METAL)
    frame(ax, "2a  Top-mounted pull", "Catalog pull; drill points only.\nBlake's default.")


def grip_jgroove(ax):
    section_top(ax, front_h=H - G)
    ax.add_patch(Rectangle((T * 0.35, H - G - 22), T * 0.65 + 0.5, 22, facecolor="white", edgecolor=EDGE, lw=0.8))
    frame(ax, "2b  Routed finger groove", "Groove cut into the back of the front's top.\nNo hardware; just a toolpath.")


def grip_gola(ax):
    section_top(ax, front_h=H - 45, notch=True)
    rect(ax, T, H - 45, 6, 45, c=METAL)
    rect(ax, T, H - 45, 40, 5, c=METAL)
    rect(ax, T + 34, H - 45, 6, 45, c=METAL)
    frame(ax, "2c  Channel (Gola-style)", "Aluminum profile; box notched, front shorter.\nBox geometry changes.")


def grip_push(ax):
    section_top(ax)
    rect(ax, T, H - T - 50, 60, 14, c=METAL)
    frame(ax, "2d  Push-to-open", "Blum TIP-ON in the box; unsprung hinges.\nNo visible grip at all.")


# ---- side sections of the bottom of a cabinet: front at the left ---------
BH = 260


def section_bottom(ax, y0, front_y=None):
    rect(ax, T, y0, D, T)                                  # bottom panel
    rect(ax, T + D - 6, y0, 6, BH - y0)                    # back
    fy = y0 if front_y is None else front_y
    rect(ax, 0, fy, T, BH - fy, c=FRONT)
    ax.plot([-60, D + 60], [0, 0], color="#333", lw=1.2)  # floor
    ax.set_xlim(-60, D + 60); ax.set_ylim(-20, BH + 30)


def base_toekick(ax):
    section_bottom(ax, 100)
    rect(ax, 75, 0, T, 100, c="#d7b77e")
    frame(ax, "3a  Recessed toe kick", "~4\" high, ~3\" deep. Notched gables\nor a separate plinth box.")


def base_plinth(ax):
    section_bottom(ax, 100)
    rect(ax, 0, 0, T, 100 - G, c="#d7b77e")
    frame(ax, "3b  Flush plinth", "Plinth in line with the fronts.\nClean, but gets kicked.")


def base_legs(ax):
    section_bottom(ax, 120)
    rect(ax, 50, 0, 22, 120, c=METAL)
    rect(ax, D - 40, 0, 22, 120, c=METAL)
    frame(ax, "3c  Legs / feet", "Catalog legs. Lighter look;\nkeeps vanities off wet floors.")


def base_wallhung(ax):
    section_bottom(ax, 140)
    ax.plot([D + T + 6, D + T + 6], [0, BH + 30], color="#333", lw=2)   # wall
    rect(ax, D + T - 30, BH - 60, 30, 40, c="#d9c08d")
    frame(ax, "3d  Wall-hung (floating)", "French cleat to studs; 10\"+ off the floor\nreads as floating. Vanity v0 default.")


def main():
    fig, axes = plt.subplots(3, 4, figsize=(17, 12.5))
    fig.suptitle("Same parts, different construction: the style switches the engine needs",
                 fontsize=15, fontweight="bold", x=0.01, ha="left")
    fig.text(0.01, 0.945, "Row 1 = plan view from above (front at bottom).  Rows 2-3 = side sections (front at left).  "
             "Light tan = carcass ply, dark tan = fronts, grey = bought hardware.  "
             "Gaps: 3mm between fronts, 1.5mm at outside ends.", fontsize=9)
    for ax, fn in zip(axes.flat, [plan_full_overlay, plan_inset, plan_flush_face, plan_half_overlay,
                                  grip_pull, grip_jgroove, grip_gola, grip_push,
                                  base_toekick, base_plinth, base_legs, base_wallhung]):
        fn(ax)
    fig.subplots_adjust(left=0.02, right=0.98, top=0.90, bottom=0.05, wspace=0.12, hspace=0.45)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "style_switches.png")
    fig.savefig(out, dpi=110)
    print(out)


if __name__ == "__main__":
    main()
