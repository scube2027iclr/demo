"""Package the built demo for offline review, using only Python's standard library."""
import hashlib
import json
from pathlib import Path
import tempfile
from urllib.parse import unquote
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
RELEASE = ROOT / "release"
PREFIX = "s3-demo"


def main():
    data_text = (DIST / "data.js").read_text(encoding="utf-8")
    library = json.loads(data_text.removeprefix("window.S3_DATA = ").rstrip(";\n"))
    cases = sum(len(song["references"]) for song in library["songs"])
    baselines = sum(len(ref["baselines"]) for song in library["songs"] for ref in song["references"])
    files = sorted(p for p in DIST.rglob("*") if p.is_file() and not p.is_symlink()
                   and p.name not in {".DS_Store", "Thumbs.db", "README.md"})
    paths = {p.relative_to(DIST).as_posix() for p in files}

    def verify_media(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"url", "midiUrl"}:
                    if unquote(item) not in paths:
                        raise ValueError(f"Missing packaged media: {item}")
                else:
                    verify_media(item)
        elif isinstance(value, list):
            for item in value:
                verify_media(item)

    verify_media(library)
    readme = f"""S3 — Offline audio supplement

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
All audio is preserved as supplied, without trimming or lossy re-encoding.
Baseline recordings play independently; their durations may differ.

ONLINE VERSION
https://scube2027iclr.github.io/demo/

The online page can change; this archive is a standalone snapshot.
Font licenses are included in fonts/.
"""
    RELEASE.mkdir(exist_ok=True)
    destination = RELEASE / "s3-demo-supplement.zip"
    with tempfile.NamedTemporaryFile(dir=RELEASE, suffix=".zip", delete=False) as tmp:
        temporary = Path(tmp.name)
    try:
        with ZipFile(temporary, "w", ZIP_DEFLATED, compresslevel=6) as archive:
            for file in files:
                archive.write(file, f"{PREFIX}/{file.relative_to(DIST).as_posix()}")
            archive.writestr(f"{PREFIX}/README.txt", readme)
        with ZipFile(temporary) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"Archive integrity check failed: {bad}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    digest = hashlib.sha256()
    with destination.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    destination.with_suffix(".zip.sha256").write_text(
        f"{digest.hexdigest()}  {destination.name}\n", encoding="ascii")
    print(f"Packaged {cases} cases / {baselines} baseline outputs: {destination}")
    print(f"ZIP size: {destination.stat().st_size / 1024**2:.1f} MiB; integrity verified.")


if __name__ == "__main__":
    main()
