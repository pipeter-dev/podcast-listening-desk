function prepareStudy(data,episode={}){
  const paragraphs=[];
  const ends=new Set(episode.paragraphEnds||[]);
  let start=0, length=0;
  for(let i=0;i<data.length;i++){
    length+=data[i].text.length+1;
    const boundary=episode.paragraphEnds?ends.has(i):
      data[i].start===undefined||(length>=420&&/[.!?]["”']?$/.test(data[i].text));
    if(!boundary&&i+1<data.length)continue;
    paragraphs.push({first:start,last:i,text:data.slice(start,i+1).map(c=>c.text).join(' ')});
    start=i+1;length=0;
  }
  const scenes=episode.scenes||paragraphs.flatMap((p,i)=>i%4===0?[[i,'对话片段 '+(1+i/4)]]:[]);
  const splitter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('en',{granularity:'sentence'}):null;
  for(let k=0;k<scenes.length;k++){
    const [begin,sceneTitle]=scenes[k],end=scenes[k+1]?.[0]??paragraphs.length;
    const scene=paragraphs.slice(begin,end).map(p=>p.text).join('\n\n');
    for(let n=begin;n<end;n++){
      const p=paragraphs[n];
      const sentences=splitter?[...splitter.segment(p.text)].map(x=>({at:x.index,text:x.segment})):
        [...p.text.matchAll(/[^.!?]+(?:[.!?]+\s*|$)/g)].map(x=>({at:x.index,text:x[0]}));
      let offset=0;
      for(let j=p.first;j<=p.last;j++){
        data[j].study={paragraph:n,sceneTitle,scene,body:p.text,sentences,offset,sourceRow:j};
        offset+=data[j].text.length+1;
      }
    }
  }
}
