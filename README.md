# Web Guitar Looper

A fully client-side guitar looper built with modular Web Audio components for future DSP and ML effects.

## Run locally

Because this app uses ES modules and media APIs, serve it via a local HTTP server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages deployment (short guide)

1. Push this repository to GitHub.
2. In your repository settings, open **Pages**.
3. Set **Source** to deploy from the `main` branch (root folder).
4. Save and wait for Pages to publish.
5. Open the provided `https://<username>.github.io/<repo>/` URL.

## Notes

- Input device selection works through `getUserMedia` + `enumerateDevices`.
- Output device selection depends on browser support (`setSinkId` / `selectAudioOutput`) and may be unavailable in Firefox Android.
- The effects chain is intentionally plugin-ready (`effects/pedalboard.js`, `effects/ampModel.js`).


## Audio quality tips

- Input monitoring is OFF by default to avoid mic-speaker feedback loops.
- `Input Processing: Guitar` is default for instrument tone and lowest coloration.
- Switch to `Input Processing: Voice` only when you need browser echo/noise cleanup.
- Keep `Latency: Low` for fastest monitoring/response; use `Balanced` only if you want fuller processing at higher latency.
- Use wired headphones for clean overdubs on mobile devices.
- If you hear clipping with hot instrument signals, lower your interface output level and app master volume.
- A built-in compressor/limiter and safer overdub gain staging are enabled to reduce distortion.

- Recording capture uses AudioWorklet when available (with ScriptProcessor fallback) for more stable real-time buffering.
- Loop playback is stopped when starting a fresh recording to avoid bleed/echo during capture.
