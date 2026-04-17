# AI Engineering Atlas · Launch Video

Programmatic 30-second launch video for the atlas, generated with Remotion.

## Structure

30-second, 1920×1080, 30fps, 5 acts:

- **Act 1 (0–6s)** — Brand hero: "AI engineering, made interactive."
- **Act 2 (6–12s)** — The specimens: 10 topics / 40 concepts / 23 primitives / ∞ free
- **Act 3 (12–20s)** — The curriculum: scrolling topic rail
- **Act 4 (20–27s)** — Every concept is live: primitives grid reveal
- **Act 5 (27–30s)** — Invitation: "Read it. Break it. Ship Monday."

Typography mirrors the site: Fraunces display, Outfit body, JetBrains Mono meta.
Colors: `#0A0A0E` ink, `#D15B2C` terracotta accent.

## Run

```bash
cd video
npm install
npm run dev          # open Remotion Studio for preview + edit
npm run build        # render to out/launch.mp4
npm run build:gif    # export as a GIF (for social cards)
```

## Web fonts

The video will fall back to system serif/sans/mono unless the three web fonts
are installed on the machine doing the render. To match the web site exactly:

1. Download Fraunces, Outfit, and JetBrains Mono from Google Fonts.
2. Install them system-wide (or add `@remotion/google-fonts` and load them
   inside `src/Root.tsx`).

## Hosting the rendered video

- Keep source MP4 in `out/launch.mp4` (gitignored).
- Upload to YouTube / LinkedIn / site hero as needed.
- Do not embed raw MP4 in the static Nuxt build — host on a CDN.

## License

Video asset inherits the atlas's license: CC BY-NC 4.0 for content,
MIT for the Remotion composition code.
