# S³ — Listening room

An anonymous, self-contained research demo for joint lyrics–melody transcription and reference-conditioned singing. The site has **Singing conversion** and **Applications** views, synchronized audio/MIDI playback, an interactive piano roll, lyric assignments, and melisma visualization.

## Preview

Requires Node.js 22 or later. No frontend framework, CDN, runtime API, or analytics is required. Fonts are bundled locally.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. Source/data changes are rebuilt automatically; refresh the browser to see them.

```sh
npm test
npm run build
```

The build creates `dist/`. You can **double-click `dist/index.html`** without starting a server. To distribute an offline supplement, ZIP the contents of `dist/`, keeping their relative paths.

## Replace the collection

Replace the repository's **`demo/`** directory with your new results, keeping this structure. Run `npm run build` locally, or push to `main` to rebuild and deploy automatically on GitHub Pages. The site discovers all song/reference directories; no manually maintained list is needed.

```text
demo/
  song-name/
    gt_full_mix.wav             # optional original mix
    gt_vocal.wav                # source vocals (or use full mix as fallback)
    gt_lyrics.txt               # optional supplied lyrics
    meta.json                  # optional display metadata
    reference-name/
      reference.mp3
      meta.json                # optional display metadata
      ours/
        ours.wav
        melody.mid
        lyrics.json
        legato.json
      SoulX-SVC/               # optional: any number of baseline folders
        output.mp3             # also accepts <folder-name>.mp3 or audio.mp3
        meta.json              # optional title/description
      Vevo2-Style/
        output.mp3
```

Audio may use `.mp3`, `.wav`, `.m4a`, `.ogg`, or `.flac` instead of the example extensions. MP3 is recommended for the final online collection. WAV waveform peaks are computed at build time; other formats use a simple progress track. Browser codec support determines which audio files can play. The build ships the supplied audio without transcoding or changing it.

Folder names become stable case IDs in share links. Optional song metadata:

```json
{
  "title": "Display title",
  "subtitle": "Chorus · Mandarin singing",
  "description": "Optional description",
  "sourceOffset": 0,
  "mixOffset": 0
}
```

Optional reference metadata:

```json
{
  "title": "Reference A",
  "description": "An accurate description of the reference performance.",
  "audioOffset": 0
}
```

Offsets are seconds of leading audio **before score time zero**. The main audio position equals score position plus the selected recording's offset. Zero is the default. If the recordings have local timing differences rather than a simple offset, the visualization still follows the score; it does not claim forced alignment to the generated singing.

### MIDI, syllables, and melisma

`melody.mid` must contain one nonempty melody track. Tempo changes are interpreted from the MIDI, not assumed to be a fixed tempo. Notes are ordered by start time, then pitch for ties.

```json
{
  "legato_flags": "0210",
  "note_pinyin": ["ren", "ren", "ren", "chang"]
}
```

- `0`: an ordinary note; starts a new lyric position.
- `2`: the first note of a melisma; starts a new lyric position.
- `1`: a continuation of the preceding lyric position.

In this example there are four notes but three lyric positions. **Repeated pronunciation alone never merges lyric positions.** The melisma group is defined by the flags.

`lyrics.json` is an ordered list of phrases:

```json
[
  {"text":"人人唱", "pinyin":"ren ren chang", "start_time":0, "end_time":2, "duration":2}
]
```

The supplied format uses one written character per syllable, ignoring whitespace and punctuation. For languages/writing systems requiring another segmentation, provide an explicit `syllables` array in each phrase:

```json
{
  "text": "hello world",
  "start_time": 0,
  "end_time": 2,
  "syllables": [
    {"text":"hel", "pronunciation":"hɛ"},
    {"text":"lo", "pronunciation":"loʊ"},
    {"text":"world", "pronunciation":"wɜːld"}
  ]
}
```

The build validates the note/flag/pronunciation counts, group structure, lyric-group count, and supplied pronunciation correspondence. Inconsistent assignments fail with a useful message instead of fabricating an alignment. `lyrics.json` should contain the **decoded lyric sequence** corresponding to these notes, not any omitted source words.

## Listening controls

- Source vocals, original mix, and S³ output share score time when switching.
- The reference has a separate player. Starting it pauses the main performance; starting the main performance or a baseline stops other players.
- MIDI overlay is off by default. It uses a lightweight local Web Audio synthesizer with its own volume. MIDI-only playback is also available; this is a note preview, not generated singing or a sampled piano.
- Click a lyric syllable or note to select its full note group and seek. Click a phrase timestamp to play that phrase; **Loop phrase** repeats it.
- Pronunciation labels can be hidden. Zoom, pan, follow mode, and the overview support inspecting individual notes or the whole excerpt.
- Space toggles playback when the page/piano roll has focus. Left/right on the piano roll select adjacent lyric groups. Every lyric group also has a keyboard-accessible button.
- Copy a case link to preserve the selected song and reference. Random selection never starts audio without a click.
- Score notation is intentionally pending beat/quantization metadata. No notation or alignment data is invented.

## Applications

Optional examples are discovered under **`applications/`**, separate from the SVC collection:

```text
applications/
  lyric-edit-01/
    meta.json
    before.mp3
    after.mp3
    reference.mp3              # optional
```

```json
{
  "title": "A new verse",
  "type": "Lyric editing",
  "description": "Lyrics edited with GPT-6; singing generated with S³.",
  "prompt": "The actual editing instruction.",
  "beforeText": "Original lyrics or a description of the original melody",
  "afterText": "Edited lyrics or a description of the actual musical changes"
}
```

Only complete examples with both audio files are shown. When there are no examples, the site labels the section as upcoming; it does not present synthetic placeholders as experimental results. Baselines behave similarly.

## GitHub Pages

Repository: `https://github.com/scube2027iclr/demo`

1. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Push to `main`. `.github/workflows/pages.yml` installs pinned dependencies, tests the data parser, builds the static site, and deploys `dist/`.
3. The expected URL is `https://scube2027iclr.github.io/demo/`.

The site uses relative asset paths and works under the `/demo/` project subdirectory. Data replacement triggers the same build workflow. GitHub Pages must be enabled once by an account with repository administration access. Use the anonymous account for publishing/commits if reviewer anonymity is required.

## Dependencies and attribution

- `@tonejs/midi` (MIT) parses MIDI during the build.
- DM Sans and Instrument Serif are distributed via Fontsource under the SIL Open Font License; license files are included in the build.
- All application code is local. Runtime playback makes no requests to third-party CDNs, analytics, or APIs.

The website does not grant a license to the supplied audio or other research data.
