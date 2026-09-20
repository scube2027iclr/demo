import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLibrary } from './data.mjs';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function build() {
  const out = path.resolve(root, 'dist');
  if (path.dirname(out) !== root || path.basename(out) !== 'dist' || (fs.existsSync(out) && fs.lstatSync(out).isSymbolicLink())) throw new Error('Unsafe build output path');
  const library = buildLibrary(path.join(root,'demo'),path.join(root,'applications'));
  if (fs.existsSync(out)) fs.rmSync(out,{recursive:true});
  fs.mkdirSync(out,{recursive:true});
  fs.cpSync(path.join(root,'site'),out,{recursive:true});
  const filter = src => !['.DS_Store','Thumbs.db'].includes(path.basename(src)) && !fs.lstatSync(src).isSymbolicLink();
  for (const dir of ['demo','applications']) if (fs.existsSync(path.join(root,dir))) fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true,filter});
  fs.mkdirSync(path.join(out,'fonts'),{recursive:true});
  for (const [pkg,file,target] of [
    ['@fontsource-variable/dm-sans','dm-sans-latin-wght-normal.woff2','dm-sans.woff2'],
    ['@fontsource/instrument-serif','instrument-serif-latin-400-normal.woff2','instrument-serif.woff2'],
    ['@fontsource/instrument-serif','instrument-serif-latin-400-italic.woff2','instrument-serif-italic.woff2']
  ]) fs.copyFileSync(path.join(root,'node_modules',pkg,'files',file),path.join(out,'fonts',target));
  fs.copyFileSync(path.join(root,'node_modules/@fontsource-variable/dm-sans/LICENSE'),path.join(out,'fonts/DM-Sans-LICENSE.txt'));
  fs.copyFileSync(path.join(root,'node_modules/@fontsource/instrument-serif/LICENSE'),path.join(out,'fonts/Instrument-Serif-LICENSE.txt'));
  fs.copyFileSync(path.join(root,'README.md'),path.join(out,'README.md'));
  fs.writeFileSync(path.join(out,'data.js'),`window.S3_DATA = ${JSON.stringify(library).replace(/</g,'\\u003c')};\n`);
  fs.writeFileSync(path.join(out,'.nojekyll'),'');
  console.log(`Built ${library.songs.length} song(s), ${library.songs.reduce((n,s)=>n+s.references.length,0)} reference(s), ${library.applications.length} application(s).`);
  return library;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
