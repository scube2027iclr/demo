import fs from 'node:fs';
import path from 'node:path';
import midiPackage from '@tonejs/midi';
const { Midi } = midiPackage;

export const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
export function readJSON(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
export function audioIn(dir, stem) {
  return audioExtensions.map(ext => path.join(dir, stem + ext)).find(file => fs.existsSync(file));
}
export function subdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter(x => x.isDirectory() && !x.name.startsWith('.')).map(x => x.name).sort((a,b) => a.localeCompare(b, 'en', { numeric: true }));
}
export function wavInfo(file) {
  if (!file || path.extname(file).toLowerCase() !== '.wav') return null;
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF') return null;
  let fmt, data;
  for (let p = 12; p + 8 <= b.length;) {
    const tag = b.toString('ascii', p, p + 4), length = b.readUInt32LE(p + 4);
    if (tag === 'fmt ') fmt = { type: b.readUInt16LE(p+8), channels: b.readUInt16LE(p+10), rate: b.readUInt32LE(p+12), block: b.readUInt16LE(p+20), bits: b.readUInt16LE(p+22) };
    if (tag === 'data') data = { start: p + 8, length: Math.min(length, b.length-p-8) };
    p += 8 + length + (length % 2);
  }
  if (!fmt || !data) return null;
  const frames = Math.floor(data.length / fmt.block);
  const sample = i => {
    const p = data.start + i * fmt.block;
    if (fmt.type === 3 && fmt.bits === 32) return b.readFloatLE(p);
    if (fmt.type === 1 && fmt.bits === 16) return b.readInt16LE(p) / 32768;
    if (fmt.type === 1 && fmt.bits === 24) return b.readIntLE(p, 3) / 8388608;
    if (fmt.type === 1 && fmt.bits === 32) return b.readInt32LE(p) / 2147483648;
    return 0;
  };
  const peaks = Array.from({ length: 192 }, (_, j) => {
    const start = Math.floor(j * frames / 192), end = Math.floor((j + 1) * frames / 192);
    let peak = 0;
    for (let i = start; i < end; i += Math.max(1, Math.floor((end-start)/250))) peak = Math.max(peak, Math.abs(sample(i)));
    return Number(Math.min(1, peak).toFixed(4));
  });
  return { duration: frames / fmt.rate, peaks };
}

export function parseScore(midiBytes, legato, lines, label = 'score') {
  const midi = new Midi(midiBytes);
  const tracks = midi.tracks.filter(t => t.notes.length);
  if (tracks.length !== 1) throw new Error(`${label}: expected one melody track, found ${tracks.length}.`);
  const notes = [...tracks[0].notes].sort((a,b) => a.time-b.time || a.midi-b.midi);
  const flags = Array.from(legato.legato_flags || '').map(Number);
  if (notes.length !== flags.length || (legato.note_pinyin && notes.length !== legato.note_pinyin.length)) throw new Error(`${label}: MIDI, legato_flags and note_pinyin must have equal note counts.`);
  const syllables = lines.flatMap((line, lineIndex) => {
    const chars = Array.from(line.text || '').filter(c => !/[\s\p{P}\p{S}]/u.test(c));
    const pron = (line.pinyin || '').trim().split(/\s+/).filter(Boolean);
    // The supplied data uses one written character per pronunciation token.
    // For other languages, an optional syllables array explicitly defines tokenization.
    const explicit = line.syllables;
    const items = explicit || chars.map((text, i) => ({ text, pronunciation: pron[i] || '' }));
    if (!explicit && pron.length && chars.length !== pron.length) throw new Error(`${label}: lyric characters and pronunciations differ; provide lyrics[].syllables for explicit tokenization.`);
    return items.map(s => ({ text: typeof s === 'string' ? s : s.text, pronunciation: typeof s === 'string' ? '' : (s.pronunciation || ''), line: lineIndex }));
  });
  const groups = [];
  const mapped = notes.map((n, i) => {
    if (![0,1,2].includes(flags[i])) throw new Error(`${label}: unsupported legato flag at note ${i}.`);
    if (flags[i] === 1 && (!i || flags[i-1] === 0)) throw new Error(`${label}: continuation without melisma start at note ${i}.`);
    if (flags[i] === 2 && flags[i+1] !== 1) throw new Error(`${label}: melisma start without continuation at note ${i}.`);
    if (flags[i] !== 1) groups.push({ id: groups.length, notes: [], ...syllables[groups.length] });
    const group = groups.at(-1);
    group.notes.push(i);
    return { pitch: n.midi, start: +n.time.toFixed(5), end: +(n.time+n.duration).toFixed(5), velocity: n.velocity, group: group.id, flag: flags[i], pronunciation: legato.note_pinyin?.[i] || group.pronunciation || '' };
  });
  if (groups.length !== syllables.length) throw new Error(`${label}: ${groups.length} note groups but ${syllables.length} lyric syllables. Fix assignments before publishing.`);
  for (const group of groups) {
    group.start = mapped[group.notes[0]].start;
    group.end = mapped[group.notes.at(-1)].end;
    group.melisma = group.notes.length > 1;
    const pinyin = group.notes.map(i => mapped[i].pronunciation).filter(Boolean);
    if (group.pronunciation && pinyin.some(p => p !== group.pronunciation)) throw new Error(`${label}: pronunciation mismatch in lyric group ${group.id}.`);
  }
  return { notes: mapped, groups, lines, duration: Math.max(...mapped.map(n=>n.end)), tempos: midi.header.tempos, pitchMin: Math.min(...mapped.map(n=>n.pitch)), pitchMax: Math.max(...mapped.map(n=>n.pitch)) };
}

export function buildLibrary(demoDir, applicationsDir) {
  const url = file => path.relative(path.dirname(demoDir), file).split(path.sep).map(encodeURIComponent).join('/');
  const media = (file, offset = 0) => file ? { url: url(file), offset, ...(wavInfo(file) || {}) } : null;
  const songs = [];
  for (const id of subdirs(demoDir)) {
    const dir = path.join(demoDir, id), meta = readJSON(path.join(dir, 'meta.json'), {});
    const source = audioIn(dir, 'gt_vocal'), mix = audioIn(dir, 'gt_full_mix');
    if (!source && !mix) continue;
    const references = [];
    for (const refId of subdirs(dir)) {
      const refDir = path.join(dir, refId), oursDir = path.join(refDir, 'ours');
      const referenceFile = audioIn(refDir, 'reference'), oursFile = audioIn(oursDir, 'ours');
      if (!referenceFile || !oursFile) continue;
      const refMeta = readJSON(path.join(refDir, 'meta.json'), {});
      const score = parseScore(fs.readFileSync(path.join(oursDir, 'melody.mid')), readJSON(path.join(oursDir, 'legato.json')), readJSON(path.join(oursDir, 'lyrics.json')), `${id}/${refId}`);
      const baselines = subdirs(refDir).filter(x => x !== 'ours').flatMap(name => {
        const bd = path.join(refDir, name), bm = readJSON(path.join(bd, 'meta.json'), {});
        const file = audioIn(bd, name) || audioIn(bd, 'output') || audioIn(bd, 'audio') || fs.readdirSync(bd).filter(f => audioExtensions.includes(path.extname(f).toLowerCase())).map(f=>path.join(bd,f))[0];
        return file ? [{ id: name, name: bm.title || name.replace(/[-_]/g, ' '), description: bm.description || '', audio: media(file, bm.audioOffset || 0) }] : [];
      });
      references.push({ id: refId, title: refMeta.title || (/^referencename\d+$/i.test(refId) ? `Reference ${references.length+1}` : refId.replace(/[-_]/g, ' ')), description: refMeta.description || '', reference: media(referenceFile), ours: media(oursFile, refMeta.audioOffset || 0), score, baselines, midiUrl: url(path.join(oursDir, 'melody.mid')) });
    }
    if (!references.length) continue;
    const displayOrder = new Map(references.map(ref => [ref.id, readJSON(path.join(dir, ref.id, 'meta.json'), {}).order]));
    references.sort((a, b) => (Number.isFinite(displayOrder.get(a.id)) ? displayOrder.get(a.id) : Infinity) - (Number.isFinite(displayOrder.get(b.id)) ? displayOrder.get(b.id) : Infinity));
    songs.push({ id, title: meta.title || (/^songname\d+$/i.test(id) ? references[0].score.lines[0]?.text || `Song ${songs.length+1}` : id.replace(/[-_]/g, ' ')), subtitle: meta.subtitle || '', description: meta.description || '', source: media(source || mix, meta.sourceOffset || 0), mix: media(mix, meta.mixOffset || 0), lyrics: fs.existsSync(path.join(dir, 'gt_lyrics.txt')) ? fs.readFileSync(path.join(dir,'gt_lyrics.txt'),'utf8').trim() : '', references });
  }
  const applications = [];
  for (const id of subdirs(applicationsDir)) {
    const dir = path.join(applicationsDir,id), meta=readJSON(path.join(dir,'meta.json'));
    if (!meta) continue;
    const before=audioIn(dir,'before'),after=audioIn(dir,'after');
    if (!before || !after) continue;
    applications.push({ id, title:meta.title||id, type:meta.type||'Score editing', description:meta.description||'', prompt:meta.prompt||'', beforeText:meta.beforeText||'', afterText:meta.afterText||'', before:media(before),after:media(after), reference:media(audioIn(dir,'reference')) });
  }
  return { version: 1, songs, applications };
}
