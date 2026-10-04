# loops.dance

A media player for the browser, made for practising one section of a track over
and over: load your own audio file, mark a loop, slow it down, repeat.

Built for dance rehearsal on a phone, where the built-in player has no A/B loop.

**<https://loops.dance>**

> **Status: first version, in use.** It has carried a full practice session on an
> iPhone. Scope and what comes next are in [plan.md](plan.md).

## What it does

- Loads an mp3 (or m4a, wav) from the Files app
- Loops a section, with start and end set while listening and nudged into place
- Keeps several named loops per track
- Slows down to 50 % without changing pitch
- Pauses for a few seconds before each repeat
- Keeps the screen on while playing
- Remembers tracks and loops on the device, and works offline

Later: a waveform view for placing loop points, lock-screen controls, export and
import of loops.

## Your files stay on your device

The player is for playing your own music. Audio files and loops are stored in the
browser on your device and are never uploaded. There is no account, no server and
no tracking, and no way to share music with anyone.

## Using it on an iPhone

1. Open the link in Safari.
2. Share → **Add to Home Screen**.
3. Open it from the Home Screen and load your track there.

Step 3 matters: the Home Screen app keeps its own storage, separate from the
Safari tab, and it is the one iOS leaves alone when the app goes unused for a
while.

## Marking a loop

1. Press play.
2. Tap **Set start here** where the section begins, then **Set end here** where
   it ends. Playback jumps back to the start and repeats.
3. Fine-tune either end with the ±0.1 and ±1 s buttons. Each tap jumps to where
   you can hear the change.

Loops are saved as you go. **+ New loop** starts another one; **Rename** gives it
a name. The round arrow button switches looping off and on, and the button on the
far left plays from the top of the loop.

Volume is the phone's own volume buttons.

## Development

No build step and no dependencies.

```sh
python3 -m http.server 8000
node --test
```

Then open <http://localhost:8000>. Pushing to `main` deploys to GitHub Pages.

See [AGENTS.md](AGENTS.md) for the project rules and [plan.md](plan.md) for scope
and design.

## License

[MIT](LICENSE)
