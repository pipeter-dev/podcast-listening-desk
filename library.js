const episodeSelect=$('episodes');
const episodes=new Map();
const feedURL='https://feeds.megaphone.fm/TPG3969164236';
function changeEpisodeURL(id){
  const url=new URL(location.href);
  if(id)url.searchParams.set('episode',id);else url.searchParams.delete('episode');
  history.replaceState(null,'',url);
}
let alignmentRequest, subtitleURL;
function stopMatching(){
  alignmentRequest?.abort();
  if(subtitleURL){URL.revokeObjectURL(subtitleURL);subtitleURL=''}
}
function clearLibrarySelection(){
  stopMatching();
  episodeSelect.value='';$('downloads').hidden=true;changeEpisodeURL('');
}
function showOptions(){
  const current=episodeSelect.value;
  episodeSelect.replaceChildren(new Option('选择节目',''));
  for(const e of [...episodes.values()].sort((a,b)=>b.date.localeCompare(a.date))){
    episodeSelect.add(new Option(e.date+' · '+e.title+(e.subtitle?'':' · 字幕待补'),e.id));
  }
  episodeSelect.value=current;episodeSelect.disabled=false;
}
async function openEpisode(id){
  const e=episodes.get(id);
  if(!e)return;
  const job=++revision;
  audio.pause();if(objectURL){URL.revokeObjectURL(objectURL);objectURL=''}
  stopMatching();audio.removeAttribute('src');audio.load();
  rate();setCueOffset(0);display([]);changeEpisodeURL(id);
  $('title').textContent=e.title;$('importer').open=false;$('downloads').hidden=true;
  $('origin').textContent=e.date+' · 正在连接官方音频';
  if(!e.subtitle){audio.src=e.audio;$('origin').textContent=e.date+' · 官方音频 · 字幕待补';return}
  const ctl=new AbortController();alignmentRequest=ctl;
  const opts={signal:ctl.signal};
  $('txtLink').href=e.text;$('srtLink').hidden=true;$('downloads').hidden=false;
  let started=false;
  try{
    const [raw,anchors,first]=await Promise.all([
      readURL(e.subtitle),fetch('civics/'+encodeURIComponent(id)+'.anchors.json',opts).then(r=>r.json()),
      fetch(e.audio,{...opts,headers:{Range:'bytes=0-1048575'}})
    ]);
    if(job!==revision)return;
    if(!first.ok)throw Error('audio');
    // The final CDN URL pins the ad rendition returned by this request.
    const pinned=first.url;audio.src=pinned;started=true;
    const source=parse(raw);
    let capacity=new Uint8Array(2097152),used=0,response=first,ask=1048576;
    while(true){
      const block=new Uint8Array(await response.arrayBuffer());
      if(job!==revision||ctl.signal.aborted)return;
      if(used+block.length>capacity.length){
        const grown=new Uint8Array(Math.max(used+block.length,capacity.length*2));
        grown.set(capacity.subarray(0,used));capacity=grown;
      }
      capacity.set(block,used);used+=block.length;
      const complete=response.status===200||block.length<ask;
      const matched=alignFrames(capacity.subarray(0,used),anchors,source);
      if(matched.cues.length>cues.length){
        const samePrefix=cues.every((c,i)=>c.start===matched.cues[i].start&&c.end===matched.cues[i].end&&c.text===matched.cues[i].text);
        display(matched.cues,samePrefix);audio.ontimeupdate();
      }
      $('origin').textContent=e.date+' · 正在按本次官方音频匹配字幕 · 已匹配 '+cues.length+' 条';
      if(complete)break;
      ask=4194304;
      response=await fetch(pinned,{...opts,headers:{Range:'bytes='+used+'-'+(used+ask-1)}});
      if(response.status===416)break;
      if(response.status!==206)throw Error('range');
    }
    if(job!==revision)return;
    if(!cues.length)throw Error('no match');
    subtitleURL=URL.createObjectURL(subtitleFile(cues));
    $('srtLink').href=subtitleURL;$('srtLink').download=e.title+'.srt';$('srtLink').hidden=false;
    $('origin').textContent=e.date+' · 官方音频 · 已对齐 '+cues.length+' 条字幕，未匹配片段留白';
  }catch{
    if(job!==revision||ctl.signal.aborted)return;
    if(!started)audio.src=e.audio;
    $('origin').textContent=cues.length?'音频匹配中断，已对齐的部分可使用。':'可收听官方音频，当前版本暂未匹配字幕。';
  }
}
episodeSelect.onchange=()=>{if(episodeSelect.value)openEpisode(episodeSelect.value)};
async function loadLibrary(){
  const wanted=new URL(location.href).searchParams.get('episode'),initialRevision=revision;
  let opened=false;
  try{
    const r=await fetch('civics/episodes.json');if(!r.ok)throw Error();
    for(const e of await r.json())episodes.set(e.id,e);
    showOptions();$('feedStatus').textContent='正在核对官方订阅源…';
    if(wanted&&episodes.has(wanted)&&revision===initialRevision){episodeSelect.value=wanted;openEpisode(wanted);opened=true}
  }catch{$('feedStatus').textContent='字幕目录暂时无法读取。'}
  try{
    const r=await fetch(feedURL,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error();
    const xml=new DOMParser().parseFromString(await r.text(),'application/xml');
    const items=[...xml.querySelectorAll('channel > item')];if(!items.length)throw Error();
    for(const item of items.slice(0,10)){
      const value=tag=>item.querySelector(tag)?.textContent.trim();
      const id=value('guid'),title=value('title'),source=item.querySelector('enclosure')?.getAttribute('url');
      if(!id||!title||!source)continue;
      const url=new URL(source);if(!['https:','http:'].includes(url.protocol))continue;
      const direct=source.match(/(?:^https:\/\/|\/)(traffic\.megaphone\.fm\/[A-Za-z0-9_-]+\.mp3)(?:\?|$)/i);
      const audio=direct?'https://'+direct[1]:source;
      episodes.set(id,{...episodes.get(id),id,title,audio,date:new Date(value('pubDate')).toISOString().slice(0,10)});
    }
    showOptions();$('feedStatus').textContent='已同步官方最近 10 集';
    if(wanted&&!opened&&revision===initialRevision&&episodes.has(wanted)){episodeSelect.value=wanted;openEpisode(wanted)}
  }catch{$('feedStatus').textContent=episodes.size?'官方订阅源暂时无法连接，已显示已收录节目。':'节目目录暂时无法读取。'}
}
loadLibrary();
