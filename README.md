# Web Guitar Looper

Simple, client-side looper with input/output device selection and low-latency guitar defaults.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Usage

1. Select your input device (and output if supported).
2. Press **Record** to start recording.
3. Press **Record** again or **Stop** to finish recording (no autoplay).
4. Press **Play** to start loop playback.
5. Press **Stop** to stop playback.
6. Press **Clear** to remove the loop.

## Notes

- `Mode: Guitar` applies an input boost for low instrument-level interfaces.
- `Mode: Voice` enables browser echo/noise/AGC processing.
- Output selection depends on browser `setSinkId` support.
