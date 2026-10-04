# mediaplayer

A media player for the browser, made for practising one section of a track over
and over: load your own audio file, mark a loop, slow it down, repeat.

Built for dance rehearsal on a phone, where the built-in player has no A/B loop.

**<https://magnuslundstedt.github.io/mediaplayer/>**

> **Status: planning.** The link shows a placeholder. The player is scoped in
> [plan.md](plan.md) and not built yet.

## What it will do

- Load an mp3 from the Files app
- Loop a section, with start and end set while listening and nudged into place
- Save several named loops per track
- Slow down to 50 % without changing pitch
- Pause for a few seconds before each repeat
- Keep the screen on while playing
- Remember tracks and loops on the device, and work offline

Later: a waveform view for placing loop points, lock-screen controls, export and
import of loops.

## Your files stay on your device

The player is for playing your own music. Audio files and loops are stored in the
browser on your device and are never uploaded. There is no account, no server and
no tracking, and no way to share music with anyone.

## Using it on an iPhone

Once the player is built:

1. Open the link in Safari.
2. Share → **Add to Home Screen**.
3. Open it from the Home Screen and load your track there.

Step 3 matters: the Home Screen app keeps its own storage, separate from the
Safari tab, and it is the one iOS leaves alone when the app goes unused for a
while.

## Development

No build step and no dependencies.

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Pushing to `main` deploys to GitHub Pages.

See [AGENTS.md](AGENTS.md) for the project rules and [plan.md](plan.md) for scope
and design.

## License

[MIT](LICENSE)
