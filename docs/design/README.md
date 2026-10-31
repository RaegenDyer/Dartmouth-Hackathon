# Visual exploration

Status: design exploration before application styling. Product features, brand,
and visual direction remain open. No concept board is an approved specification.

## Required design workflow before frontend implementation

**Checkpoint status: PENDING. No visual direction is approved.**

October 31 preference: the optional mascot should be a cute, whimsical animal or
creature rather than a realistic human. This guides future image-generated
character options; the actual mascot, animation, and app style still await the
collaborator discussion and selection below. Mascot implementation is currently
deferred while Deepgram input and Tavus audio-only output architecture are
prepared. This does not select a character or authorize video-conversation UI.

When frontend work is about to begin, the agent must bring up the style
discussion with the collaborator requesting or leading that work. **Any project
collaborator can make the design decision; approval from the original project
owner is not required.**

1. Discuss the intended screens, mood, and current scope with that collaborator.
   Revisit the three generated concepts below and the raster icon study, keeping
   feature content mutable.
2. Use the image-generation model to design app mockups and visual directions
   informed by compatible references from [the 100 design masters](design-masters.md).
   This requirement covers the app screens and layouts as well as custom icons.
   Existing generated concepts can be selected when they fit; use image
   generation for refinements, combinations, or new directions the collaborator
   wants to explore. Save new outputs and their prompts in this directory.
3. Present the generated designs and have that collaborator choose the direction
   for the agreed scope. An agent must not silently choose a style and implement
   it directly in code. Its recommendation alone is not a decision.
4. Record the deciding collaborator, generated concept(s), decision, scope, and
   date below, and update the root README checkpoint before implementing
   frontend screens, layouts, visual components, or styling.

Backend and nonvisual preparation may continue while frontend implementation
awaits a collaborator's decision. A recorded decision satisfies the checkpoint
for its scope; repeat the discussion when a later task changes that direction
or the collaborator requests it. Implement the selected design with accessible
HTML/CSS and real controls; image generation supplies the visual design and
raster artwork.

### Collaborator design decision record

| Field | Current value |
| --- | --- |
| Status | Pending |
| Deciding collaborator | Not yet recorded |
| Selected generated concept(s) | Not yet recorded |
| Design decision / refinements | Not yet recorded |
| Approved scope | None |
| Decision date | Not yet recorded |

The user requested a catalog of 100 design masters, image-generated app concepts
informed by those references, and generated raster artwork for custom app icons
instead of SVG/vector-library icons.

## Reference catalog

See [100 design references](design-masters.md). The catalog is a curated pool of
principles, not an objective ranking or a recipe to combine 100 styles. Each
concept selects a small compatible cluster and creates original work.

## Directions

| Direction | Principles | Visual treatment |
| --- | --- | --- |
| 01 / Warm editorial | Human-scaled material warmth; editorial order; clear symbols | Ivory, forest green, restrained terracotta; serif/sans hierarchy; tactile ceramic icons |
| 02 / Playful civic | Wayfinding; modular rhythm; bold clarity; human play | Warm white, cobalt, tomato/yellow accents; strong grotesk type; dimensional wood/paper icons |
| 03 / Evening room | Architectural proportion; quiet light; restrained objects | Ink teal, warm ivory, amber; spacious dark surfaces; ceramic/glass/brass raster icons |

Desktop and mobile concepts use comparable sample content so the visual systems
can be judged independently of feature choices. Text in generated mockups is
illustrative; the implemented app will use real accessible HTML text and controls.

## Generated concepts

All four outputs were generated with the built-in image-generation tool and saved
as 1536 x 1024 PNG files. The icon-family study has an actual alpha channel with
fully transparent background pixels; the app boards are opaque presentation images.

### 01 / Warm editorial

Selected reference principles: Charles and Ray Eames, Alvar and Aino Aalto,
Dieter Rams, Susan Kare, and Massimo and Lella Vignelli. A warm, tactile direction
with an editorial reading hierarchy and restrained green/terracotta accents.

![Warm editorial desktop and mobile app concept](concepts/01-warm-editorial.png)

### 02 / Playful civic

Selected reference principles: Otl Aicher, Alexander Girard, Saul and Elaine Bass,
Lance Wyman, Wim Crouwel, and Margaret Calvert. Bold navigation and dimensional
wood/paper artwork give this direction a more energetic public-facing character.

![Playful civic desktop and mobile app concept](concepts/02-playful-civic.png)

### 03 / Evening room

Selected reference principles: Luis Barragan, Tadao Ando, Isamu Noguchi, Charlotte
Perriand, Eileen Gray, and Kenya Hara. A quieter dark palette uses architectural
light and ceramic/glass/brass materials. Its more abstract icon metaphors need
further recognition testing before production.

![Evening room desktop and mobile app concept](concepts/03-evening-room.png)

### Raster icon-family study

Six original ceramic icon concepts: home, conversation, saved item, profile,
settings, and optional microphone input. Microphone artwork represents dictation,
not a commitment to voice responses. This separate sheet explores the warm
editorial material family and preserves transparency around the objects.

![Generated raster icon-family study](concepts/raster-icon-family-study.png)

No direction has been selected, and no app styles have been changed. The boards
are visual proposals. Their sample modules, text, decorative imagery, and icons
can be changed or removed as the product evolves.

## Asset policy

- Use original image-generated raster artwork for custom icons and illustrative
  assets, following the user's preference. Do not substitute SVG icon packs,
  icon fonts, emoji, or CSS-drawn stand-ins for those assets.
- Keep labels beside navigation icons. Artwork does not replace accessible names,
  keyboard behavior, sufficient contrast, or appropriate tap targets.
- Generate production icons individually at suitable resolution with genuine
  transparency after the direction is selected. The family sheet is a visual
  study, not a claim of ready-to-use individual icon exports.
- Implement layout, text, form controls, focus states, and responsive behavior in
  HTML/CSS. Do not ship a generated screenshot as the interface.
- Save project-bound generated images in this repository. Preserve prompts and
  distinguish generated concepts from any later manually implemented screens.

Generation uses the built-in image-generation tool. The complete prompts are in
[generation-prompts.md](generation-prompts.md). The app's current CSS and components
are not restyled as part of this exploration.
