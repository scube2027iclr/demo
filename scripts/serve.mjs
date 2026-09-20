import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {build,root} from './build.mjs';
build();
const dist=path.join(root,'dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.mid':'audio/midi'};
http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end('Not found');return;}
  const stat=fs.statSync(file),headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
  const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if(range){const start=+range[1],end=Math.min(range[2]?+range[2]:stat.size-1,stat.size-1);if(start>end){res.writeHead(416).end();return;}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res);}
  else{res.writeHead(200,{...headers,'Content-Length':stat.size});fs.createReadStream(file).pipe(res);}
}).listen(4173,'127.0.0.1',()=>console.log('S3 listening room: http://127.0.0.1:4173'));
let pending;
for(const dir of ['site','demo','applications'])if(fs.existsSync(path.join(root,dir)))fs.watch(path.join(root,dir),{recursive:true},()=>{clearTimeout(pending);pending=setTimeout(()=>{try{build();}catch(e){console.error(e.message);}},200);});
