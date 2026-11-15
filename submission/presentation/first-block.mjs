// Visual checkpoint: the original wording, with a new typographic hierarchy.
export async function drawFirstBlock({base,text,rect,image,sections,snapshot,T}){
 const C=T.colors,S=T.sizes;
 {
  const s=base(0,true),b=sections[0].blocks;
  s.background.fill=C.deep;s._scene.background=C.deep;
  await image(s,'assets/screenshots/cover-sensors.png',862,52,690,690,'Earth Fire Calendar globe with live detections coloured by sensor. Later illustration, not the count snapshot on slide 2.',{circle:true,fit:'cover'});
  text(s,b[2],88,52,1100,48,S.small,{color:C.onDarkMuted});
  text(s,sections[0].title.replace(' Calendar','\nCalendar'),88,145,850,268,S.cover,{font:'Overpass',bold:true,name:'headline'});
  text(s,b[0],88,462,710,128,S.lead,{color:C.yellow});
  text(s,b[1],88,624,710,110,S.body,{color:C.onDarkBody});
  rect(s,0,762,1600,138,C.deep);
  rect(s,88,762,1424,1,C.ruleDark);
  text(s,b[3],88,796,480,65,S.small,{color:C.onDarkMuted});
  text(s,b[4],650,796,862,78,S.small,{color:C.onDarkMuted});
  s.speakerNotes.text+='\nCover provenance: assets/screenshots/capture-scenes.json. Data: NASA FIRMS. Basemap: EOX / Copernicus Sentinel-2. Later illustration than the count snapshot.';
 }
 {
  const s=base(1),b=sections[1].blocks;
  text(s,sections[1].title.replace(', ', ',\n'),88,69,805,174,S.heading,{font:'Overpass',bold:true,name:'headline'});
  text(s,b[0],925,80,587,123,S.body);
  const items=b[1].split('\n').map(x=>x.replace(/^- /,''));
  text(s,items[2],925,225,587,84,S.small,{color:C.muted});
  const rows=[{label:'MODIS',value:snapshot.modisCount,x:88,copy:items[0]},{label:'VIIRS',value:snapshot.viirsCount,x:850,copy:items[1]}];
  rows.forEach(row=>{
   text(s,row.label,row.x,344,640,39,S.body,{color:C.electric,bold:true});
   text(s,row.value.toLocaleString('en-US'),row.x-3,382,650,162,S.metric,{font:'Overpass',name:'count'});
   const alt=`${row.label}: ${row.value.toLocaleString('en-US')} worldwide detections. Shared scale 0–100,000. Snapshot 15 November 2026, 08:36 UTC.`;
   s.charts.add('bar',{position:{left:row.x,top:536,width:640,height:34},categories:[row.label],series:[{name:'Worldwide detections in 24 hours',values:[row.value],fill:C.electric}],barOptions:{direction:'bar',grouping:'clustered',gapWidth:100},hasLegend:false,chartFill:'none',plotAreaFill:'none',chartLine:{fill:'none',width:0,style:'solid'},xAxis:{visible:false},yAxis:{visible:false,min:0,max:100000,majorGridlines:null},dataLabels:{showValue:false}});
   s._scene.elements.push({kind:'mini-bar',x:row.x,y:548,w:640,h:12,value:row.value,max:100000,color:C.electric,alt});
   text(s,row.copy,row.x,600,640,110,S.body);
  });
  text(s,b[3],88,736,1424,32,S.small,{align:'center',color:C.muted});
  rect(s,88,782,1424,1,C.rule);
  text(s,b[2],88,804,1424,70,S.body);
  s.speakerNotes.text+='\nValues and fixed 0–100,000 range: assets/data/firms-snapshot-2026-11-15T0836Z.json. Both native chart workbooks contain the frozen values.';
 }
}
