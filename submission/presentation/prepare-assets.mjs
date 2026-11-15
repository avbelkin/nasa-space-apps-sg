import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const root=import.meta.dirname;
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'__assets__.cjs'));
const sharp=require('sharp');
const specs=[
 ['cover-sensors',1440,1440,'jpg',false],
 ['regional-sensors',1800,1020,'jpg',true],
 ['step-modis',860,390,'jpg',true],
 ['step-viirs',860,390,'jpg',true],
 ['pinned-summary',1880,220,'png',false],
 ['pinned-timeline',1880,440,'png',false],
 ['pinned-geometry',1880,540,'png',false],
 ['pinned-weather',1800,1100,'png',false],
 ['sensor-key',1120,120,'png',false],
];
const out=path.join(root,'assets/evidence');await fs.mkdir(out,{recursive:true});
const manifest={capture:'../screenshots/capture-scenes.json',processing:'Layout crops and resizing only; original capture data is unchanged.',images:[]};
for(const [name,width,height,format,map] of specs){
 const input=await fs.readFile(path.join(root,'assets/screenshots',`${name}.png`));
 const meta=await sharp(input).metadata();let pipeline=sharp(input);
 const crop=map?{left:0,top:0,width:meta.width-80,height:meta.height}:null;
 if(crop)pipeline=pipeline.extract(crop);
 pipeline=pipeline.resize(width,height,{fit:map?'cover':'inside',withoutEnlargement:true});
 const file=`${name}.${format}`;
 const output=await (format==='jpg'?pipeline.jpeg({quality:92,chromaSubsampling:'4:4:4',mozjpeg:true}):pipeline.png({compressionLevel:9,palette:false})).toBuffer();
 const finalMeta=await sharp(output).metadata();
 await fs.writeFile(path.join(out,file),output);
 manifest.images.push({name,original:`${name}.png`,file,width:finalMeta.width,height:finalMeta.height,bytes:output.length,crop,sourceSha256:crypto.createHash('sha256').update(input).digest('hex'),sha256:crypto.createHash('sha256').update(output).digest('hex')});
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({images:manifest.images.length,totalBytes:manifest.images.reduce((n,x)=>n+x.bytes,0)}));
