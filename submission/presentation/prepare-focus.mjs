import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const root=import.meta.dirname;
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'__focus__.cjs'));
const sharp=require('sharp');
const directory=path.join(root,'assets/evidence');
const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
// Derive readable excerpts from committed evidence, without needing live data.
for(const [name,source,height] of [['geometry-focus','pinned-geometry.png',102],['weather-focus','pinned-weather.png',138]]){
 const input=await fs.readFile(path.join(directory,source));
 const meta=await sharp(input).metadata();
 const crop={left:0,top:0,width:meta.width,height};
 const file=`${name}.png`;
 const output=await sharp(input).extract(crop).png({compressionLevel:9}).toBuffer();
 await fs.writeFile(path.join(directory,file),output);
 manifest.images=manifest.images.filter(item=>item.name!==name);
 manifest.images.push({name,original:source,file,width:meta.width,height,bytes:output.length,crop,sourceLocation:'assets/evidence',sourceSha256:crypto.createHash('sha256').update(input).digest('hex'),sha256:crypto.createHash('sha256').update(output).digest('hex')});
}
await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared geometry and weather excerpts from frozen evidence.');
