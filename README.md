# Pose Beat Blaster

## Description
Pose Beat Blaster is a rhythm lane game driven by pose gestures with keyboard fallback controls.

## Features
- Three-lane rhythm gameplay with dynamic beat spawning
- A mirrored camera inset in pose mode marks each wrist green when it counts as raised
- Pose-triggered lane inputs using MediaPipe Pose Landmarker: left arm, right arm, or both for the middle lane, with separate raise and lower heights so a wobbling wrist does not fire twice
- Hits count on the press, so holding a key or an arm up does not collect every beat
- Beats speed up by 20 ms every 10 hits, down to 380 ms apart
- Hits graded perfect, great or good by distance from the line; pressing a lane with no beat in reach is a whiff and breaks the combo, so mashing doesn't pay
- Keyboard fallback inputs (`A`, `S`, `D`), or tap a lane on a touch screen (each finger tracked, so chords work)
- Best score saved in the browser
- Synthesised sounds: a note per lane that rises with the grade, a thud on whiffs and misses, a soft tick as each beat spawns; mute is remembered
- Combo + score progression
- Session start/stop control flow
- Unit-tested rhythm engine
- Static Vercel-ready deployment setup

## Run
```bash
cd pose-beat-blaster
npm run dev
```
Open `http://127.0.0.1:8106/pose-beat-blaster/index.html`.

## Test
```bash
cd pose-beat-blaster
npm test
```

## Deploy
```bash
cd pose-beat-blaster
npx vercel --prod
```

## Inspiration
- https://github.com/tensorflow/tfjs-models

## Structure
```text
pose-beat-blaster/
  index.html
  styles.css
  app.js
  src/
    rhythmEngine.js
  tests/
    rhythmEngine.test.js
  package.json
  vercel.json
  README.md
```
