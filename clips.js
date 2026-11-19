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
$('markCue').onclick=()=>rows.children[selectedFirst]?.classList.toggle('marked');
$('alignCue').onclick=()=>{
  if(audio.readyState>=1&&cues[selectedFirst]?.start!==undefined)setCueOffset(audio.currentTime-cues[selectedFirst].start);
  else $('notice').textContent='请先载入音频。';
};
const studyPrompts={
  word:'请用中文解析所选英文词在原句里的含义、搭配和语气，再给一个可替换的表达。',
  sentence:'请用中文解析这句英文。先说明说话者的意思，再拆解句子结构，解释关键表达。',
  paragraph:'请用中文解析这段英文。梳理主旨、句与句的逻辑，以及值得学习的表达。',
  scene:'请用中文解析这段对话情境。依据原文说明话题、发言目的、回应和转折，并指出可复用的对话表达。'
};
function studyPayload(scope){
  const cue=cues[selectedFirst],g=cue.study;
  const at=g.offset+selectedCharacter;
  const line=(g.sentences.find(s=>s.at<=at&&at<s.at+s.text.length)?.text||cue.text).trim();
  if(scope==='plain')return g.body;
  const parts=[studyPrompts[scope],'节目：'+$('title').textContent];
  if(episodeSelect.value)parts.push('节目链接：'+locationURL());
  parts.push('文稿位置：第 '+(g.paragraph+1)+' 段 · '+g.sceneTitle+' · 原稿字幕 '+(g.sourceRow+1));
  if(cue.start!==undefined)parts.push('所选位置播放时间：'+Math.floor(cue.start/60)+':'+String(Math.floor(cue.start%60)).padStart(2,'0'));
  if(scope==='word')parts.push('所选词：'+chosen,'原句：'+line);
  else parts.push('英文原文：'+({sentence:line,paragraph:g.body,scene:g.scene}[scope]));
  return parts.join('\n\n');
}
$('analysisActions').onclick=async e=>{
  const button=e.target.closest('[data-scope]');
  if(!button||button.disabled||!chosen)return;
  const scope=button.dataset.scope, text=studyPayload(scope);
  if(scope==='plain'){await copy(text);return}
  const tag='#clip-'+crypto.randomUUID(), payload=text+'\n\n'+tag;
  const ok=await copy(payload);
  if(ok){
    $('notice').textContent='已复制，可粘贴到你的 GPT 项目。';
    if(contextOption.checked){
      try{localStorage.setItem(clipPrefix+tag,JSON.stringify({tag,text:payload,created:Date.now()}));if($('library').open)renderClips()}
      catch{$('notice').textContent+=' 本机摘录未保存。'}
    }
  }
};
