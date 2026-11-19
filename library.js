const episodeSelect=$('episodes');
const episodes=new Map();
const feedURL='https://feeds.megaphone.fm/TPG3969164236';
function changeEpisodeURL(id){
  const url=new URL(location.href);
  if(id)url.searchParams.set('episode',id);else url.searchParams.delete('episode');
  history.replaceState(null,'',url);
}
function clearLibrarySelection(){
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
  audio.src=e.audio;rate();setCueOffset(0);display([]);changeEpisodeURL(id);
  $('title').textContent=e.title;$('importer').open=false;$('downloads').hidden=true;
  $('origin').textContent=e.date+(e.subtitle?' · 正在读取字幕':' · 官方音频 · 字幕待补');
  if(!e.subtitle)return;
  $('srtLink').href=e.subtitle;$('txtLink').href=e.text;$('downloads').hidden=false;
  try{
    const data=parse(await readURL(e.subtitle));
    if(revision!==job)return;
    display(data);$('origin').textContent=e.date+' · 官方音频 · '+data.length+' 条自动转录字幕';
  }catch{if(revision===job)$('origin').textContent='字幕暂时读取失败，可重新选择本集重试。'}
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
