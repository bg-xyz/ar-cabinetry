"""Independent check of the CNC files: open every DXF with ezdxf, run its
audit, count entities per layer, and render each sheet to a PNG.

    python tools/check_dxf.py <job dir>
"""
import sys, pathlib
from collections import Counter
import ezdxf
from ezdxf import recover
from ezdxf.addons.drawing import matplotlib as dmpl

job = pathlib.Path(sys.argv[1])
ok = True
for f in sorted((job / "sheets").glob("*.dxf")) + sorted(job.glob("*.dxf")):
    doc, auditor = recover.readfile(f)
    counts = Counter(e.dxf.layer for e in doc.modelspace())
    errs = len(auditor.errors)
    ok &= errs == 0
    print(f"{f.name}: dxf {doc.dxfversion}, audit errors {errs}, fixes {len(auditor.fixes)}")
    print("   " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    dmpl.qsave(doc.modelspace(), str(f.with_suffix(".png")), bg="#FFFFFF", size_inches=(8, 8))
sys.exit(0 if ok else 1)
