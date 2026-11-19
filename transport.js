const mediaControls=navigator.mediaSession;
function jumpBy(seconds){
  if(Number.isFinite(audio.duration))audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+seconds));
}
$('back15').onclick=()=>jumpBy(-15);
$('ahead30').onclick=()=>jumpBy(30);
function describeEpisode(){
  const title=$('title').textContent;
  const official=Boolean(episodeSelect.value);
  $('dockTitle').textContent=title;
  $('series').textContent=official?'Civics 101 · NHPR':'正在精听';
  $('cover').hidden=!official;
  if(mediaControls&&window.MediaMetadata){
    mediaControls.metadata=new MediaMetadata({
      title,artist:official?'New Hampshire Public Radio':'播客精听室',album:official?'Civics 101':'',
      artwork:official?[{src:new URL('civics/cover.jpg',location.href).href,type:'image/jpeg'}]:[]
    });
  }
}
new MutationObserver(describeEpisode).observe($('title'),{childList:true,characterData:true,subtree:true});
describeEpisode();
function transportState(){
  const valid=Number.isFinite(audio.duration)&&audio.duration>0;
  $('back15').disabled=$('ahead30').disabled=!valid;
  if(!mediaControls)return;
  mediaControls.playbackState=audio.paused?'paused':'playing';
  try{
    if(valid)mediaControls.setPositionState?.({duration:audio.duration,position:Math.min(audio.currentTime,audio.duration),playbackRate:audio.playbackRate});
    else mediaControls.setPositionState?.();
  }catch{}
}
if(mediaControls){
  const actions={
    play:()=>audio.play().catch(()=>{}),pause:()=>audio.pause(),
    seekbackward:e=>jumpBy(-(e.seekOffset||15)),seekforward:e=>jumpBy(e.seekOffset||30),
    seekto:e=>{if(Number.isFinite(e.seekTime)&&Number.isFinite(audio.duration))audio.currentTime=Math.max(0,Math.min(audio.duration,e.seekTime))}
  };
  for(const [name,handler] of Object.entries(actions)){
    try{mediaControls.setActionHandler(name,handler)}catch{}
  }
}
try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch{}
for(const event of ['play','pause','loadedmetadata','emptied','durationchange','ratechange','seeked','ended'])audio.addEventListener(event,transportState);
transportState();
$('playToggle').onclick=()=>{
  if(!audio.paused){audio.pause();return}
  audio.play().catch(()=>{$('notice').textContent='音频尚未就绪，请稍后再点播放。'});
};
function updatePlayButton(){
  const playing=!audio.paused&&!audio.ended;
  $('playToggle').textContent=playing?'Ⅱ 暂停':'▶ 播放';
  $('playToggle').setAttribute('aria-label',playing?'暂停':'播放');
  $('playToggle').disabled=!audio.getAttribute('src');
}
for(const event of ['play','pause','ended','emptied','loadstart','loadedmetadata','error'])audio.addEventListener(event,updatePlayButton);
updatePlayButton();
