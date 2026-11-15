import fs from 'node:fs';

// Original, deterministic mechanical-keyboard foley. No recording or API input.
export function writeKeyboardFoley(filename) {
  const rate=48000, frames=rate, channels=2;
  const samples=new Float64Array(frames*channels);
  let seed=1739;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const events=[0.035,0.116,0.186,0.312,0.397,0.461,0.604,0.686,0.803,0.886];
  for(const [key,at] of events.entries()) {
    const pitch=0.87+random()*0.27, gain=0.68+random()*0.32;
    const pan=0.40+random()*0.2;
    for(const [delay,releaseGain] of [[0,1],[0.031+random()*0.018,0.32]]) {
      let low=0, previous=0;
      for(let n=0;n<rate*0.09;n++) {
        const t=n/rate, i=Math.round((at+delay)*rate)+n;
        if(i>=frames)break;
        const noise=random()*2-1;
        low+=0.24*(noise-low);
        const high=noise-previous; previous=noise;
        const attack=Math.min(t/0.0005,1);
        const click=high*Math.exp(-t/0.0015)*0.22;
        const texture=low*Math.exp(-t/0.009)*0.58;
        const body=(Math.sin(2*Math.PI*540*pitch*t)*0.20+Math.sin(2*Math.PI*1320*pitch*t)*0.09)*Math.exp(-t/0.005);
        const value=(click+texture+body)*attack*gain*releaseGain;
        samples[i*2]+=value*(1-pan);
        samples[i*2+1]+=value*pan;
      }
    }
  }
  const peak=Math.max(...samples.map(Math.abs));
  const pcm=Buffer.alloc(frames*channels*2);
  for(let i=0;i<frames;i++) {
    const fade=Math.min(1,(frames-1-i)/(rate*0.035));
    for(let channel=0;channel<2;channel++)pcm.writeInt16LE(Math.round(samples[i*2+channel]/peak*0.34*fade*32767),(i*2+channel)*2);
  }
  const header=Buffer.alloc(44);
  header.write('RIFF',0);header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);
  header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*channels*2,28);header.writeUInt16LE(channels*2,32);header.writeUInt16LE(16,34);
  header.write('data',36);header.writeUInt32LE(pcm.length,40);
  fs.writeFileSync(filename,Buffer.concat([header,pcm]));
  return {duration:1,sampleRate:rate,channels,events,provenance:'Original deterministic local synthesis; no third-party sample or generative API'};
}
