const clipPrefix = 'reader.clip.';
const contextOption = $('withContext');
contextOption.checked = pref('withContext','true') === 'true';
contextOption.onchange = () => save('withContext',contextOption.checked);

function locationURL(){return window.location.origin+window.location.pathname+'?episode='+encodeURIComponent($('episodes').value)}
function makeClip(){
  const tag = '#clip-' + crypto.randomUUID();
  const first = selectedFirst, last = selectedLast;
  const title = $('title').textContent;
  const cue = cues[first];
  const clock = cue.start === undefined ? '' : ' · '+Math.floor(cue.start/60)+':'+String(Math.floor(cue.start%60)).padStart(2,'0');
  const location = title+' · 第 '+(first+1)+(last===first?'':'–'+(last+1))+' 条'+clock;
  const parts = [tag,location];
  if($('episodes').value)parts.push('节目：'+locationURL());
  parts.push('所选：'+chosen);
  if(first>0) parts.push('上文：'+cues[first-1].text);
  parts.push('原文：'+context);
  if(last+1<cues.length) parts.push('下文：'+cues[last+1].text);
  return {tag, text:parts.join('\n'), created:Date.now()};
}
async function copySelection(question=false){
  if(!chosen)return false;
  if(!question && !contextOption.checked)return copy(chosen);
  const clip=makeClip();
  let stored=true;
  try { localStorage.setItem(clipPrefix+clip.tag,JSON.stringify(clip)); }
  catch {stored=false;}
  const prompt='请解释所选词句在这段对话中的含义和用法，并保留摘录标签，方便我回查。\n\n';
  const ok=await copy((question?prompt:'')+clip.text);
  if(!stored)$('notice').textContent+=' 浏览器存储不可用，此条未保存到文本库。';
  if($('library').open)renderClips();
  return ok;
}
function renderClips(){
  const container=$('entries');container.replaceChildren();
  const query=$('lookup').value.trim().toLowerCase();
  let entries;
  try{
    entries=Object.keys(localStorage).filter(k=>k.startsWith(clipPrefix)).map(k=>JSON.parse(localStorage.getItem(k))).filter(c=>c?.text?.toLowerCase().includes(query)).sort((a,b)=>b.created-a.created);
  }catch{container.textContent='无法读取此浏览器的文本库。';return;}
  if(!entries.length){container.textContent=query?'未找到匹配的摘录。':'用播放器复制一段词句，摘录就会保存在此浏览器中。';return;}
  for(const clip of entries){
    const item=document.createElement('article'), body=document.createElement('pre'), button=document.createElement('button');
    body.textContent=clip.text;button.textContent='复制这条摘录';
    button.onclick=async()=>{if(await copy(clip.text))button.textContent='已复制'};
    item.append(body,button);container.append(item);
  }
}
$('library').ontoggle=()=>{if($('library').open)renderClips()};
$('lookup').oninput=renderClips;
window.addEventListener('storage',e=>{if($('library').open&&(!e.key||e.key.startsWith(clipPrefix)))renderClips()});
