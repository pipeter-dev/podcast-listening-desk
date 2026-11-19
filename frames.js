/* MPEG Layer III frame anchors preserve the publisher's clock through ad insertions. */
function frameAnchors(bytes, visit) {
  const rates1=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
  const rates2=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
  let pos=0, time=0, count=0;
  if(bytes[0]===73&&bytes[1]===68&&bytes[2]===51)
    pos=10+((bytes[6]&127)<<21)+((bytes[7]&127)<<14)+((bytes[8]&127)<<7)+(bytes[9]&127);
  while(pos+4<bytes.length){
    const ver=(bytes[pos+1]>>3)&3, layer=(bytes[pos+1]>>1)&3;
    const rateIdx=(bytes[pos+2]>>2)&3, bitrateIdx=bytes[pos+2]>>4;
    if(bytes[pos]!==255||(bytes[pos+1]&224)!==224||ver===1||layer!==1||rateIdx===3||!bitrateIdx||bitrateIdx===15){pos++;continue}
    const rate=[44100,48000,32000][rateIdx]/(ver===3?1:ver===2?2:4);
    const size=Math.floor((ver===3?144000:72000)*(ver===3?rates1:rates2)[bitrateIdx]/rate)+((bytes[pos+2]>>1)&1);
    if(pos+size>bytes.length)break;
    let h=2166136261;
    for(let k=4;k<size;k+=7)h=Math.imul(h^bytes[pos+k],16777619);
    visit(h>>>0,time,count++);
    pos+=size;time+=(ver===3?1152:576)/rate;
  }
  return time;
}
function alignFrames(bytes, anchors, subtitles){
  const lookup=new Map();
  for(let i=0;i<anchors.length;i+=2){
    const key=anchors[i], t=anchors[i+1]/1000;
    if(lookup.has(key))lookup.get(key).push(t);else lookup.set(key,[t]);
  }
  const spans=[];
  let run=null;
  function finish(){
    if(run&&run.count>=5)spans.push(run);
    run=null;
  }
  let identical=true, checked=0;
  const duration=frameAnchors(bytes,(key,live,n)=>{
    if(n%16===0){
      const idx=n/8;
      identical=identical&&anchors[idx]===key&&Math.abs(anchors[idx+1]/1000-live)<.002;
      checked++;
    }
    const times=lookup.get(key);
    if(!times)return;
    const ref=times.length===1?times[0]:run?times.find(t=>Math.abs(live-run.shift-t)<.008):undefined;
    if(ref===undefined)return;
    const shift=live-ref;
    if(run&&Math.abs(shift-run.shift)<0.055&&ref>run.last&&ref-run.last<3){
      run.last=ref;run.count++;
    }else{
      finish();run={first:ref,last:ref,shift,count:1};
    }
  });
  finish();
  if(identical&&checked>=5){
    return {cues:subtitles.filter(c=>c.end<=duration+.002),duration,spans};
  }
  const result=[];
  for(const span of spans){
    const lo=Math.max(0,span.first-.4),hi=span.last+.4;
    for(const cue of subtitles){
      if(cue.start>=hi)break;
      if(cue.start<lo-.12||cue.end>hi+.12)continue;
      const start=Math.max(0,cue.start+span.shift);
      const end=Math.min(duration,cue.end+span.shift);
      if(end>start&&(!result.length||result.at(-1).end<=start+.002))
        result.push({...cue,start,end});
    }
  }
  return {cues:result,duration,spans};
}
function subtitleFile(data){
  const clock=t=>new Date(Math.round(t*1000)).toISOString().slice(11,23).replace('.',',');
  return new Blob([data.map((c,i)=>(i+1)+'\n'+clock(c.start)+' --> '+clock(c.end)+'\n'+c.text+'\n').join('\n')],{type:'application/x-subrip;charset=utf-8'});
}
