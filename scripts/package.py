"""Package the built demo; MP3 conversion affects only the archive, never dist/demo."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import quote, unquote
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
RELEASE = ROOT / "release"
PREFIX = "s3-demo"
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac"}


def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mp3_copy(file, cache):
    target = cache / f"{sha256(file)}-192k.mp3"
    if not target.exists():
        with tempfile.NamedTemporaryFile(dir=cache, suffix=".mp3", delete=False) as tmp:
            temporary = Path(tmp.name)
        try:
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-i", str(file), "-map", "0:a:0", "-vn", "-map_metadata", "-1",
                "-c:a", "libmp3lame", "-b:a", "192k", "-id3v2_version", "0",
                str(temporary),
            ], check=True)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-format", choices=("mp3", "original"), default="mp3")
    args = parser.parse_args()
    if args.audio_format == "mp3" and not shutil.which("ffmpeg"):
        parser.error("MP3 packaging requires ffmpeg with libmp3lame; install ffmpeg or use --audio-format original.")
    data_text = (DIST / "data.js").read_text(encoding="utf-8")
    library = json.loads(data_text.removeprefix("window.S3_DATA = ").rstrip(";\n"))
    cases = sum(len(song["references"]) for song in library["songs"])
    baselines = sum(len(ref["baselines"]) for song in library["songs"] for ref in song["references"])
    files = sorted(p for p in DIST.rglob("*") if p.is_file() and not p.is_symlink()
                   and p.name not in {".DS_Store", "Thumbs.db", "README.md"})
    RELEASE.mkdir(exist_ok=True)
    packaged = {p.relative_to(DIST).as_posix(): p for p in files}
    replacements = {}
    if args.audio_format == "mp3":
        cache = RELEASE / ".mp3-cache"
        cache.mkdir(exist_ok=True)
        to_encode = [p for p in files if p.suffix.lower() in AUDIO_EXTENSIONS - {".mp3"}]
        print(f"Encoding {len(to_encode)} audio files as 192 kbps MP3 (cached on later runs)...", flush=True)
        with ThreadPoolExecutor(max_workers=4) as workers:
            for source, encoded in zip(to_encode, workers.map(lambda p: mp3_copy(p, cache), to_encode)):
                old = source.relative_to(DIST).as_posix()
                new = str(Path(old).with_suffix(".mp3"))
                if new in packaged:
                    raise ValueError(f"Audio filename collision: {new}")
                replacements[old] = new
                del packaged[old]
                packaged[new] = encoded
    paths = set(packaged)

    def verify_media(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"url", "midiUrl"}:
                    original = unquote(item)
                    value[key] = quote(replacements.get(original, original), safe="/")
                    if unquote(value[key]) not in paths:
                        raise ValueError(f"Missing packaged media: {item}")
                else:
                    verify_media(item)
        elif isinstance(value, list):
            for item in value:
                verify_media(item)

    verify_media(library)
    audio_note = ("WAV and other non-MP3 audio are encoded as 192 kbps MP3 for this archive.\n"
                  "Existing MP3 files are copied without re-encoding. The online demo retains\n"
                  "the original audio. No excerpts are trimmed or time-stretched."
                  if args.audio_format == "mp3" else
                  "All audio is preserved as supplied, without trimming or lossy re-encoding.")
    readme = f"""S3 — Offline audio supplement
Zero-Shot Singing Style Transfer via a Structured Lyrics–Melody Bottleneck

OPEN THE DEMO
1. Extract the entire ZIP file. Do not open index.html inside the ZIP viewer.
2. Open s3-demo/index.html in a modern browser.
3. Choose a source song and a target voice, then play S3 or a baseline.

No internet access, package installation, or model download is needed.
Keep all files and subdirectories together. The audio, fonts, MIDI files,
lyrics, and interface are included locally.

If your browser restricts local-file playback, run this command from the
extracted s3-demo directory (requires Python 3):

    python3 -m http.server 8000 --bind 127.0.0.1

Then visit http://127.0.0.1:8000/ in your browser. On Windows, use
"py -3" instead of "python3" if needed. Press Ctrl+C to stop the server.

CONTENTS
{len(library['songs'])} source songs; {cases} song/reference cases; {cases} S3 outputs;
{baselines} baseline outputs, plus source vocals, original mixes, references,
predicted MIDI, lyrics, and note-lyric alignment data.
Baseline names: soulx-melody, soulx-svc, Vevo2-Style, Vevo2-FM.
{audio_note}
Baseline recordings play independently; their durations may differ.

ONLINE VERSION
https://scube2027iclr.github.io/demo/

The online page can change; this archive is a standalone snapshot.
Font licenses are included in fonts/.
"""
    suffix = "" if args.audio_format == "mp3" else "-original"
    destination = RELEASE / f"s3-demo-supplement{suffix}.zip"
    with tempfile.NamedTemporaryFile(dir=RELEASE, suffix=".zip", delete=False) as tmp:
        temporary = Path(tmp.name)
    try:
        with ZipFile(temporary, "w", ZIP_DEFLATED, compresslevel=6) as archive:
            for relative, file in sorted(packaged.items()):
                if relative == "data.js":
                    js = "window.S3_DATA = " + json.dumps(library, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c") + ";\n"
                    archive.writestr(f"{PREFIX}/data.js", js)
                else:
                    archive.write(file, f"{PREFIX}/{relative}")
            archive.writestr(f"{PREFIX}/README.txt", readme)
        with ZipFile(temporary) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"Archive integrity check failed: {bad}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    destination.with_suffix(".zip.sha256").write_text(
        f"{sha256(destination)}  {destination.name}\n", encoding="ascii")
    print(f"Packaged {cases} cases / {baselines} baseline outputs: {destination}")
    print(f"ZIP size: {destination.stat().st_size / 1024**2:.1f} MiB; integrity verified.")


if __name__ == "__main__":
    main()
