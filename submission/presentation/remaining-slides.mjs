// Current source copy, kept verbatim; screenshots are frozen evidence crops.
export async function drawRemainingSlides({base,title,text,rect,dot,image,sections,T,textHeight,flowList}){
 const C=T.colors,S=T.sizes;
 {
  const s=base(2),b=sections[2].blocks;title(s,sections[2].title);
  text(s,b[0],88,176,1424,100,S.lead);
  let y=320;
  for(const line of b[1].split('\n')){const h=textHeight(line,510,S.body);text(s,line,88,y,510,h,S.body);y+=h+24;}
  await image(s,'assets/evidence/regional-sensors.jpg',680,320,832,440,'Frozen northern India view with detections coloured by sensor. Map controls have been cropped away.',{fit:'cover'});
  const key=[['Both sensors',T.sensorColors.both,680,792],['Single detection',T.sensorColors.single,1082,792],['MODIS only (2+)',T.sensorColors.modis,680,830],['VIIRS only (2+)',T.sensorColors.viirs,1082,830]];
  for(const [label,color,x,yy] of key){dot(s,x,yy+5,13,color);text(s,label,x+26,yy,360,32,S.small);}
  text(s,b[2],88,805,510,58,S.small,{color:C.muted});
 }
 {
  const s=base(3),b=sections[3].blocks;title(s,sections[3].title);
  const items=b[0].split('\n').map(v=>v.replace(/^- /,''));
  const columns=[88,576,1064],width=448;
  let y=192;
  for(let row=0;row<2;row++){
   let tallest=0;
   for(let col=0;col<3;col++){const value=items[row*3+col],h=textHeight(value,width,S.body);text(s,value,columns[col],y,width,h,S.body);tallest=Math.max(tallest,h);}
   y+=tallest+34;
  }
  // A single large crop shows actual weather values; the full capture is retained.
  rect(s,88,618,1424,194,C.white,C.rule,'weather-proof');
  await image(s,'assets/evidence/weather-focus.png',112,642,1376,146,'Frozen weather comparison: MODIS and VIIRS air temperature, dew point and relative humidity. Cropped from the complete recorded weather panel.');
  text(s,b[1],88,842,1424,40,S.small,{color:C.muted});
 }
 {
  const s=base(4),b=sections[4].blocks;title(s,sections[4].title);
  await image(s,'assets/evidence/step-modis.jpg',88,194,320,132,'MODIS detections in the frozen regional view.',{fit:'cover'});
  await image(s,'assets/evidence/step-viirs.jpg',460,194,320,132,'VIIRS detections in the same region and same frozen snapshot.',{fit:'cover'});
  text(s,b[0],88,342,320,84,S.small);
  text(s,b[1],460,342,320,84,S.small);
  text(s,b[2],850,194,662,178,S.body);
  text(s,b[3],850,386,662,34,S.small,{color:C.electric});
  rect(s,88,438,1424,274,C.white,C.rule,'timeline-proof');
  await image(s,'assets/evidence/pinned-timeline.png',112,458,1376,234,'The pinned group 24-hour timeline, with observed detections and estimated passes. Full time axis and legend retained.');
  rect(s,88,730,1424,144,C.white,C.rule,'geometry-proof');
  await image(s,'assets/evidence/geometry-focus.png',112,746,1376,112,'Pinned MODIS and VIIRS columns: satellite off-nadir angle and satellite distance. This is estimated geometry. Cropped from the complete recorded panel.');
 }
 {
  const s=base(5),b=sections[5].blocks;title(s,sections[5].title);
  text(s,b[0],88,184,1424,110,S.body);
  text(s,b[1],88,306,1424,126,S.body);
  text(s,'**Planned pipeline:**',88,448,1424,35,S.small);
  const steps=b[2].replace(/^\*\*Planned pipeline:\*\* /,'').split(' → ');
  const widths=[178,282,246,298,174,96];let x=88;
  steps.forEach((value,i)=>{
   rect(s,x,496,widths[i],3,C.electric);
   text(s,value,x,514,widths[i],95,S.small);
   if(i<steps.length-1)text(s,'→',x+widths[i]+1,530,28,44,S.lead,{color:C.electric});
   x+=widths[i]+30;
  });
  text(s,b[3],88,650,662,40,S.body);
  flowList(s,b[4].split('\n').map(v=>v.replace(/^- /,'')),88,700,662,S.small,15);
  text(s,b[5],850,650,662,104,S.small);
  text(s,b[6],850,770,662,100,S.body,{bold:true});
 }
 {
  const s=base(6,true),b=sections[6].blocks;title(s,sections[6].title);
  text(s,b[0],88,180,1424,100,S.lead);
  text(s,b[1],88,296,1424,90,S.lead,{color:C.yellow});
  const links=[...b[2].matchAll(/\[[^\]]+\]\([^)]+\)/g)].map(m=>m[0]);
  text(s,'**Links:**',88,410,105,44,S.lead);
  text(s,links[0],218,410,64,44,S.lead);
  text(s,'·',308,410,20,44,S.lead);
  text(s,links[1],352,410,82,44,S.lead);
  text(s,'·',460,410,20,44,S.lead);
  text(s,links[2],505,410,270,44,S.lead);
  rect(s,88,480,1424,1,C.ruleDark);
  const [sources,rights]=b[3].split('\n');
  text(s,sources,88,510,1424,140,S.small,{color:C.onDarkBody});
  text(s,rights.replace(' · ','\u00a0\u00a0·\u00a0\u00a0'),88,670,1424,36,S.small,{color:C.onDarkBody});
  text(s,b[4],88,732,1424,36,S.small,{color:C.onDarkMuted});
  text(s,b[5],88,790,1424,50,S.small,{color:C.onDarkMuted});
 }
}
