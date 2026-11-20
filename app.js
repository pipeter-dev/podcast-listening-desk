const $ = id => document.getElementById(id);
const audio = $('audio'), rows = $('rows');
let cues = [], active = -1, chosen = '', context = '', objectURL = '', revision = 0;
function pref(key, fallback) {
  try { return localStorage.getItem('reader.'+key) ?? fallback; } catch { return fallback; }
}
function save(key,value) { try {localStorage.setItem('reader.'+key,value)} catch {} }
for (const speed of [0.5,0.75,0.9,1,1.1,1.25,1.5,1.75,2]) $('speed').add(new Option(speed+'×',speed));
$('speed').value = pref('speed','1');
$('follow').checked = pref('follow','true') === 'true';
$('showChinese').checked=pref('showChinese','true')==='true';
rows.classList.toggle('englishOnly',!$('showChinese').checked);
$('showChinese').onchange=()=>{
  rows.classList.toggle('englishOnly',!$('showChinese').checked);
  save('showChinese',$('showChinese').checked);
};
function rate(){audio.defaultPlaybackRate = audio.playbackRate = Number($('speed').value)||1}
rate();
$('speed').onchange = () => { rate();save('speed',$('speed').value) };
$('follow').onchange=()=>{
  save('follow',$('follow').checked);
  manualUntil=0;followActive();
};
function parse(raw, bilingual=false) {
  const input = raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if (!input) throw Error('请提供文稿。');
  if (!/^WEBVTT\b/.test(input) && !input.includes('-->'))
    return input.split(/\n+/).map(text=>({text:text.trim()})).filter(c=>c.text);
  const result=[];
  const seconds = str => str.replace(',','.').split(':').reduce((sum,v)=>sum*60+Number(v),0);
  for(const block of input.split(/\n[ \t]*\n/)){
    if(/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(block)) continue;
    const lines=block.split('\n'), index=lines.findIndex(line=>line.includes('-->'));
    const times=lines[index]?.match(/^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s|$)/);
    if(!times) throw Error('字幕时间格式有误，请检查 VTT 或 SRT 文件。');
    const start=seconds(times[1]), end=seconds(times[2]);
    const body=lines.slice(index+1);
    const clean=line=>line.replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
    const dual=body.length===2&&(bilingual||(/[a-z]/i.test(body[0])&&!/[\u3400-\u9fff]/.test(body[0])&&/[\u3400-\u9fff]/.test(body[1])));
    const text=clean(dual?body[0]:body.join(' '));
    if(end<=start || !text) throw Error('字幕条目缺少正文或有效的结束时间。');
    result.push(dual?{start,end,text,zh:clean(body[1])}:{start,end,text});
  }
  if(!result.length) throw Error('没有找到可显示的字幕。');
  return result.sort((a,b)=>a.start-b.start);
}
let selectedCharacter=0;
let selectedFirst = 0, selectedLast = 0;
function select(text,sentence,first=0,last=first){
  selectedCharacter=0;
  selectedFirst=first; selectedLast=last;
  chosen=text;context=sentence;
  $('excerpt').textContent=text||'点击正文，或拖选一段文字。';
  $('copy').disabled=$('ask').disabled=!text;
  $('fallback').hidden=true;$('notice').textContent='';
  for(const b of document.querySelectorAll('[data-scope]'))b.disabled=!text||(b.dataset.scope==='word'&&!/^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u.test(text));
  $('markCue').disabled=!text;$('alignCue').disabled=!text||cues[first]?.start===undefined;
  const group=cues[first]?.study;
  $('scopeInfo').textContent=text&&group?'第 '+(group.paragraph+1)+' 段 · '+group.sceneTitle:'';
}
async function copy(text){
  try{
    if(navigator.clipboard) await navigator.clipboard.writeText(text);
    else throw Error();
    $('notice').textContent='已复制。'; return true;
  }catch{
    const box=$('fallback');box.hidden=false;box.value=text;box.focus();box.select();
    if(document.execCommand('copy')){$('notice').textContent='已复制。';box.hidden=true;return true}
    $('notice').textContent='请手动复制框中所选文字。';return false;
  }
}
$('copy').onclick=()=>copySelection();
$('ask').onclick=async()=>{
  const tab=window.open('about:blank','_blank');
  if(tab) tab.opener=null;
  const ok=await copySelection(true);
  if(tab && ok){tab.location.href='https://chatgpt.com/';$('notice').textContent='已复制提问，请在 ChatGPT 中粘贴。'}
  else {tab?.close();const link=document.createElement('a');link.href='https://chatgpt.com/';link.target='_blank';link.rel='noopener';link.textContent='打开 ChatGPT';$('notice').append(' ',link)}
};
let cueOffset=0;
function setCueOffset(value){
  cueOffset=value;
  $('offset').textContent='字幕偏移 '+(value>=0?'+':'')+value.toFixed(1)+' 秒';
  $('alignment').hidden=value===0;
  audio.ontimeupdate?.();
}
$('resetOffset').onclick=()=>setCueOffset(0);
function seek(cue){audio.currentTime=Math.max(0,cue.start+cueOffset);audio.play().catch(()=>{$('notice').textContent='请使用播放器的播放键。'})}
function display(data, append=false){
  const start=append?cues.length:0;
  if(data.length&&!data[0].study)prepareStudy(data);
  cues=data;
  $('bilingualControl').hidden=!data.some(c=>c.zh);
  if(!append){active=-1;select('','');rows.replaceChildren()}
  $('follow').disabled=cues[0]?.start===undefined;
  for(let index=start;index<cues.length;index++){
    const cue=cues[index];
    const row=document.createElement('div'); row.className='row';row.dataset.index=index;
    if(cue.start!==undefined){
      const t=document.createElement('button'); t.className='time';
      t.textContent=Math.floor(cue.start/60)+':'+String(Math.floor(cue.start%60)).padStart(2,'0');
      t.title='从此句播放';t.onclick=()=>seek(cue);row.append(t);
    }
    const sentence=document.createElement('span');sentence.className='sentence';sentence.tabIndex=0;
    for(const token of cue.text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu)||[]){
      const word=document.createElement('span');word.textContent=token;
      if(/[\p{L}\p{N}]/u.test(token))word.className='word';sentence.append(word);
    }
    sentence.onclick=e=>{
      if(getSelection().toString().trim()) return;
      const word=e.target.closest('.word');
      select(word?.textContent||cue.text,cue.text,index);
      if(word){const r=document.createRange();r.selectNodeContents(sentence);r.setEndBefore(word);selectedCharacter=r.toString().length}

    };
    sentence.onkeydown=e=>{if(e.key==='Enter')sentence.click()};
    if(cue.zh){
      const lines=document.createElement('div'),chinese=document.createElement('div');
      chinese.className='chinese-line';chinese.lang='zh-CN';chinese.textContent=cue.zh;
      lines.append(sentence,chinese);row.append(lines);
    }else row.append(sentence);
    rows.append(row);
  }
}
document.addEventListener('selectionchange',()=>{
  const s=getSelection(),selection=s.toString().trim();
  if(!selection||!rows.contains(s.anchorNode)||!rows.contains(s.focusNode))return;
  const range=s.getRangeAt(0);
  const sentences=[...rows.querySelectorAll('.sentence')].filter(el=>range.intersectsNode(el));
  if(sentences.length){
    select(selection,sentences.map(el=>el.textContent).join(' '),Number(sentences[0].closest('.row').dataset.index),Number(sentences.at(-1).closest('.row').dataset.index));
    if(sentences[0].contains(range.startContainer)){const before=range.cloneRange();before.selectNodeContents(sentences[0]);before.setEnd(range.startContainer,range.startOffset);selectedCharacter=before.toString().length}
  }
});
let manualUntil=0, pointerHeld=false, drag=null, suppressClick=false;
function holdScroll(){manualUntil=performance.now()+3500}
function followActive(){
  if(!$('follow').checked||$('captionPanel').hidden||pointerHeld||performance.now()<manualUntil)return;
  const row=rows.children[active];
  if(!row)return;
  const box=rows.getBoundingClientRect(),rect=row.getBoundingClientRect();
  const margin=Math.min(32,rows.clientHeight/8);
  if(rect.top<box.top+margin||rect.bottom>box.bottom-margin){
    rows.scrollTop+=rect.top-box.top-(rows.clientHeight-Math.min(rect.height,rows.clientHeight))/2;
  }
}
rows.addEventListener('wheel',holdScroll,{passive:true});
rows.addEventListener('keydown',e=>{
  if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key))holdScroll();
});
rows.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0)return;
  suppressClick=false;pointerHeld=true;
  if(e.pointerType==='mouse'&&!e.target.closest('.sentence')&&
     e.clientX<rows.getBoundingClientRect().left+rows.clientWidth)
    drag={id:e.pointerId,y:e.clientY,top:rows.scrollTop,moved:false};
});
rows.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dy=e.clientY-drag.y;
  if(!drag.moved&&Math.abs(dy)<5)return;
  if(!drag.moved){rows.setPointerCapture(e.pointerId);drag.moved=true}
  e.preventDefault();rows.scrollTop=drag.top-dy;holdScroll();
});
function finishDrag(e){
  if(!pointerHeld||!e.isPrimary)return;
  pointerHeld=false;
  if(drag?.moved){suppressClick=true;holdScroll()}
  drag=null;
}
window.addEventListener('pointerup',finishDrag,true);
window.addEventListener('pointercancel',finishDrag,true);
window.addEventListener('blur',()=>{pointerHeld=false;drag=null});
rows.addEventListener('touchmove',holdScroll,{passive:true});
rows.addEventListener('scroll',()=>{if(pointerHeld||performance.now()<manualUntil)holdScroll()},{passive:true});
rows.addEventListener('click',e=>{
  if(suppressClick){e.stopImmediatePropagation();e.preventDefault();suppressClick=false}
},true);
audio.ontimeupdate=()=>{
  const next=cues.findIndex(c=>c.start<=audio.currentTime-cueOffset && audio.currentTime-cueOffset<c.end);
  if(next!==active){
    rows.children[active]?.classList.remove('active');active=next;
    rows.children[active]?.classList.add('active');
  }
  followActive();
};
audio.onerror=()=>{$('notice').textContent='音频无法播放，请检查是否为可访问的音频直链，或导入本机文件。'};
function httpURL(value){const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw Error('请输入 HTTP 或 HTTPS 直链。');return u.href}
async function readURL(url){const r=await fetch(url);if(!r.ok)throw Error('文稿链接读取失败。');return r.text()}
$('form').onsubmit=async e=>{
  e.preventDefault();const current=++revision;$('problem').textContent='';
  try{
    const file=$('file').files[0], url=file?'':httpURL($('url').value.trim());
    const script=$('scriptFile').files[0],raw=$('raw').value.trim();
    const data=parse(script?await script.text():raw||await readURL(httpURL($('scriptUrl').value.trim())),/\.en-zh\.srt(?:$|[?#])/i.test(script?.name||$('scriptUrl').value));
    if(current!==revision)return;
    const source=file?URL.createObjectURL(file):url, previous=objectURL;
    audio.src=source;objectURL=file?source:'';if(previous)URL.revokeObjectURL(previous);
    clearLibrarySelection();setCueOffset(0);display(data);rate();
    $('title').textContent=file?.name||new URL(url).pathname.split('/').filter(Boolean).pop()||'我的播客';
    $('origin').textContent=data[0].start===undefined?'纯文稿 · 可选词摘句':'同步文稿 · '+data.length+' 条字幕';
    $('importer').open=false;
  }catch(err){if(current===revision)$('problem').textContent='导入失败。请提供音频和文稿。文稿直链需允许跨域读取，也可以粘贴内容。\n'+err.message}
};
const sample='WEBVTT\n\n00:00:00.000 --> 00:00:02.859\nCould you walk me through the test results?\n\n00:00:02.859 --> 00:00:06.998\nOf course. The camera worked well in daylight.\n\n00:00:06.998 --> 00:00:09.547\nWhat should we focus on next?\n\n00:00:09.547 --> 00:00:13.001\nLet us take a closer look at the low-light tests.';
display(parse(sample));

function toggleCaptions(show){
  $('captionPanel').hidden=!show;
  $('toggleCaptions').textContent=show?'收起字幕':'展开字幕';
  $('toggleCaptions').setAttribute('aria-expanded',String(show));
  if(show){manualUntil=0;followActive()}
}
toggleCaptions(pref('showCaptions','true')==='true');
$('toggleCaptions').onclick=()=>{
  const show=$('captionPanel').hidden;
  toggleCaptions(show);save('showCaptions',show);
};
