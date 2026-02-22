# Web Guitar Looper

A fully client-side guitar looper built with modular Web Audio components for future DSP and ML effects.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Interaction model

- Tap a track bubble once to **record**.
- Tap the same bubble again (or press **Stop**) to **finish recording**.
- The loop does **not autoplay** after recording.
- Tap the same bubble again to **play**.
- Press **Stop** to stop playback.
- **Long-press Stop** to clear the current track.

## Audio quality notes

- `Mode: Guitar` is the default and includes input boost for low instrument-level interfaces.
- `Mode: Voice` enables browser echo/noise/AGC processing and may color guitar tone.
- `Latency: Low` is best for live feel; `Balanced` adds extra processing path.

## GitHub Pages deployment (short guide)

1. Push this repository to GitHub.
2. In **Settings → Pages**, deploy from the default branch root.
3. Open `https://<username>.github.io/<repo>/` when published.
