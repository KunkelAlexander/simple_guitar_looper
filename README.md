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
