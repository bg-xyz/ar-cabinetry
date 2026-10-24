# Plywise design language

**2026-clean, with a nod to midcentury European high style.** Think a 1960s Danish or Italian furniture catalogue
set by a modern studio: generous paper, one confident serif, a geometric sans, hairline rules, real wood, and almost
no chrome. Posh by restraint, never by decoration.

## Type
- **Display:** Instrument Serif (Google Fonts). High-contrast Didone-ish; use the *italic* for one or two words per
  headline ("Built for *your walls.*"). Large, tight leading (1.02), slight negative tracking. iOS: New York (`.serif` design).
- **Text + UI:** Jost (Google Fonts), a Futura revival. 400 body, 500 UI. Labels in small caps: 12px, uppercase,
  0.16em tracking. iOS: SF with `.tracking(1.4)` and `.textCase(.uppercase)` for labels.
- Numbers: catalogue style. "Nº 04", "60 in · 27 in · 19 in", tabular.

## Colour (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| paper | #F3EEE6 | #15120F | page |
| bone | #FBF8F2 | #1E1A16 | cards, panels |
| ink | #1C1915 | #F1EBE1 | text |
| muted | #6E655B | #A89D90 | secondary text |
| rule | rgba(28,25,21,.14) | rgba(241,235,225,.14) | hairlines |
| walnut | #3E2A1E | #3E2A1E | dark bands, buttons |
| teak | #9A5B32 | #C17E4F | links, hover |
| brass | #B4955A | #C9AC72 | accents, selected state, icons |
| signal | #D8572A | #E5683C | one dot per screen max (live / new) |

## Shape and rhythm
- Radius 4-10px (catalogue cards, not bubbles). Buttons are squared-off with an arrow: "Spin the 3D model →".
- Hairline 1px rules between sections; numbered sections ("01 · Scan").
- Photography fills edge to edge; captions under images in small caps with a spec line, like a catalogue plate:
  `Nº 02 · Dresser · 60 in · Walnut, shadow inset`.
- Motion: slow fades and 8px rises (400ms, ease-out). Nothing bounces.

## Names (no one else's marks)
Leah's rule (2026-10-23): no names or taglines that lean on someone else's brand or imply an origin we don't have.
Style names are plain descriptive words; the tagline is **"Built for your walls."** ("Make room." was retired: "Make Room for
Life" and "Make Room for Living" are registered for closet furniture and furniture retail). Run a USPTO search before any
new name ships, and keep real brand and designer names out of prompts and copy.

| Preset | Name | What it is |
|---|---|---|
| classic-euro | **Slab** | full-overlay slab fronts |
| ply-inset | **Frame** | the plywood box frames each front |
| recessed-inset | **Shadow** | fronts set back, a shadow line all round |
| milan-flush | **Flush** | flush, push to open, no pulls |

## Imagery
Editorial interior photos generated from the engine's own renders (so the piece in the photo is the piece the
CNC cuts), labelled "Visualisation" on the site. Prompts live in `marketing/PROMPTS.md`. Real test-cut photos
replace them as soon as they exist.
