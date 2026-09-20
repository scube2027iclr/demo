import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import midiPackage from '@tonejs/midi';
import {parseScore,buildLibrary,wavInfo} from '../scripts/data.mjs';
const {Midi}=midiPackage;
function midi(){const m=new Midi();m.header.setTempo(90);const t=m.addTrack();for(let i=0;i<4;i++)t.addNote({midi:60+i,time:i*.5,duration:.4});return Buffer.from(m.toArray());}
const lines=[{text:'人人唱',pinyin:'ren ren chang',start_time:0,end_time:2}];
test('melisma flags preserve repeated lyric positions, rather than grouping equal pronunciation',()=>{const s=parseScore(midi(),{legato_flags:'0210',note_pinyin:['ren','ren','ren','chang']},lines);assert.equal(s.groups.length,3);assert.deepEqual(s.groups.map(g=>g.notes),[[0],[1,2],[3]]);assert.equal(s.groups[1].melisma,true);assert.equal(s.notes[3].start,1.5);});
test('invalid lyric assignments fail the build instead of publishing invented alignments',()=>{assert.throws(()=>parseScore(midi(),{legato_flags:'0000'},lines),/note groups/);assert.throws(()=>parseScore(midi(),{legato_flags:'1000'},lines),/continuation/);assert.throws(()=>parseScore(midi(),{legato_flags:'0210',note_pinyin:['ren','wrong','ren','chang']},lines),/pronunciation mismatch/);});
test('explicit syllables support multi-character written forms',()=>{const s=parseScore(midi(),{legato_flags:'0000'},[{text:'hello world again',syllables:[{text:'hel'},{text:'lo'},{text:'world'},{text:'again'}]}]);assert.equal(s.groups[2].text,'world');});
test('empty collections have a usable data shape',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'s3-empty-'));const d=buildLibrary(path.join(root,'demo'),path.join(root,'applications'));assert.deepEqual(d,{version:1,songs:[],applications:[]});fs.rmdirSync(root);});
test('all supplied cases parse with nonnegative duration and existing media',()=>{const root=path.resolve(import.meta.dirname,'..');const d=buildLibrary(path.join(root,'demo'),path.join(root,'applications'));for(const song of d.songs){assert.ok(song.references.length);for(const ref of song.references){assert.ok(ref.score.notes.every(n=>n.end>n.start&&n.start>=0));for(const file of [song.source,ref.reference,ref.ours])assert.ok(fs.existsSync(path.join(root,decodeURIComponent(file.url))));const wav=wavInfo(path.join(root,decodeURIComponent(ref.ours.url)));if(wav)assert.ok(Math.abs(wav.duration-ref.score.duration)<2);}}});
test('directory replacement discovers references, baselines and applications without a manual manifest',()=>{
  const base=os.tmpdir(),root=fs.mkdtempSync(path.join(base,'s3-discovery-'));
  try{
    const song=path.join(root,'demo','song with 空格'),ref=path.join(song,'ref A'),ours=path.join(ref,'ours');fs.mkdirSync(ours,{recursive:true});
    for(const file of [path.join(song,'gt_vocal.mp3'),path.join(ref,'reference.mp3'),path.join(ours,'ours.mp3')])fs.writeFileSync(file,'fixture');
    fs.writeFileSync(path.join(ours,'melody.mid'),midi());fs.writeFileSync(path.join(ours,'legato.json'),JSON.stringify({legato_flags:'0210'}));fs.writeFileSync(path.join(ours,'lyrics.json'),JSON.stringify(lines));
    fs.mkdirSync(path.join(ref,'baseline'));fs.writeFileSync(path.join(ref,'baseline/output.mp3'),'fixture');
    const app=path.join(root,'applications','lyric-edit');fs.mkdirSync(app,{recursive:true});fs.writeFileSync(path.join(app,'meta.json'),JSON.stringify({title:'Edit'}));fs.writeFileSync(path.join(app,'before.mp3'),'fixture');fs.writeFileSync(path.join(app,'after.mp3'),'fixture');
    const d=buildLibrary(path.join(root,'demo'),path.join(root,'applications'));assert.equal(d.songs.length,1);assert.equal(d.songs[0].references[0].baselines.length,1);assert.equal(d.applications.length,1);assert.match(d.songs[0].source.url,/song%20with%20/);assert.equal(d.songs[0].mix,null);
  }finally{if(path.dirname(root)!==path.resolve(base)||!path.basename(root).startsWith('s3-discovery-'))throw new Error('Unsafe test cleanup');fs.rmSync(root,{recursive:true});}
});
