const DOCS=[
 ['01','Control documental','Índice de entrega','Relación de documentos, revisiones y páginas.','1Bcj7V59afMCXICGGPwL-7vfmircg7f3-'],
 ['02','Resumen ejecutivo','Dossier ejecutivo','Alcance, inversión, plazo, riesgos y ruta de aprobación.','1w5gyygDTzk_4NLO7gKRzvVk_lg--ipuZ'],
 ['03','Documento económico','Presupuesto, APU y cómputos métricos','48 partidas, análisis unitarios y trazabilidad de cantidades.','1AGFoyQOhE5-qc8Uz_vOlx5XnEPEaO2Ue'],
 ['04','Documento técnico','Memoria descriptiva e informe técnico','Justificación integral del alcance, metodología y monto.','12T2Wz7Ji8JvsqgdtQJolPeBZvM0TxIFK'],
 ['05','Anexo técnico','Cómputos métricos','Fórmulas, mediciones y niveles de certeza por partida.','1gNANfC8OJhgb9gwvBEKRqKAvnWxrwOnQ'],
 ['06','Control de acabados','Aprobación de acabados','Porcelanato, revestimientos, pinturas, luminarias y paisajismo.','1mkuniCmJhhVjpB3s2wBhF1aIcy9hNASj'],
 ['07','Control contractual','Acta de aceptación','Documento para formalizar la aceptación de la propuesta.','1ptAIFm4U6U3ajVgY8edcyrVPJiEttbSU']
];

const PLANS=[
 ['P00','Presentación del proyecto','hero','1d0Uk9tBzM96bXZov34C0fb0T2ifhC6c-'],
 ['P01','Planta general','planta','1keFABVLuOirLPQ_OXh63wq8vA9aRlIpe'],
 ['P02','Planta de techo','techo','1Wb641QTvAFNAn67vuOceSdZeS2q7Odhw'],
 ['P03','Replanteo, piso y luminarias','luces','18Sn0W2JUKofsbC3U0FrNA5zO1dCZhT-j'],
 ['P04','Cortes A-A y B-B','planta','1KMU8AzvL7rh-oYFj30uBoAcKNcksLjTq'],
 ['P05','Revestimientos','render','1tuKJBKQYZnNdIGJNdVPH7gHaP_X5F6-F']
];

const captions=[
 'Proyecto Onix 512: presentación ejecutiva desarrollada por Seinca para la Familia Rivas.',
 'Una propuesta integral que combina arquitectura, funcionalidad y una estética contemporánea.',
 'El expediente reúne 48 partidas, APU, cómputos métricos, planos y criterios de acabados.',
 'La ejecución se organiza en un plazo estimado de 10 a 12 semanas.',
 'Las decisiones técnicas y los riesgos se validan antes de iniciar la obra.',
 'Seinca: ingeniería, control y calidad para convertir el proyecto en realidad.'
];

const $=(selector,context=document)=>context.querySelector(selector);
const $$=(selector,context=document)=>[...context.querySelectorAll(selector)];
const mediaUrl=key=>`/api/onix-media?key=${encodeURIComponent(key)}&v=18`;
const ASSETS={
 logo:mediaUrl('logo'),
 hero:mediaUrl('hero'),
 render:mediaUrl('render'),
 planta:mediaUrl('planta'),
 luces:mediaUrl('luces'),
 techo:mediaUrl('techo'),
 audio:mediaUrl('audio')
};
const isMobilePdfDevice=()=>window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
const driveView=id=>`https://drive.google.com/file/d/${id}/view?usp=sharing`;
const driveDirectView=id=>`https://drive.google.com/file/d/${id}/view?usp=drivesdk`;
const driveDownload=id=>`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
const pdfOpenUrl=id=>isMobilePdfDevice()?driveDirectView(id):driveView(id);
const pdfTargetAttributes=()=> ' target="_blank" rel="noopener"';

function buildCards(){
 const dg=$('#doc-grid'),pg=$('#plan-grid');
 dg.innerHTML=DOCS.map(d=>`<article class="doc-card reveal"><span class="doc-no">${d[0]}</span><small>${d[1]}</small><h3>${d[2]}</h3><p>${d[3]}</p><div class="doc-actions"><a href="${pdfOpenUrl(d[4])}"${pdfTargetAttributes()}>Abrir ↗</a><a href="${driveDownload(d[4])}" target="_blank" rel="noopener">Descargar ↓</a></div></article>`).join('');
 pg.innerHTML=PLANS.map(p=>`<article class="plan-card reveal"><img data-asset="${p[2]}" alt="Vista previa: ${p[1]}" loading="lazy"><div><small>${p[0]}</small><h3>${p[1]}</h3><a href="${pdfOpenUrl(p[3])}"${pdfTargetAttributes()}>Abrir plano ↗</a> · <a href="${driveDownload(p[3])}" target="_blank" rel="noopener">Descargar ↓</a></div></article>`).join('');
}

function initMobilePdfLinks(){
 if(!isMobilePdfDevice()) return;
 $$('a[href*="drive.google.com/file/d/"]').forEach(link=>{
  const match=link.href.match(/\/file\/d\/([^/]+)/);
  if(!match) return;
  link.href=driveDirectView(match[1]);
  link.setAttribute('target','_blank');
  link.setAttribute('rel','noopener');
 });
}

function hydrateAssets(){
 $$('img[data-asset]').forEach(img=>{img.src=ASSETS[img.dataset.asset]||''});
 $$('img[data-logo]').forEach(img=>{img.src=ASSETS.logo});
}

function initReveal(){
 const els=$$('.reveal');
 if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){entry.target.classList.add('in');observer.unobserve(entry.target)}
 }),{threshold:.1});
 els.forEach(e=>observer.observe(e));
}

function initNav(){
 const menu=$('#menu'),nav=$('#nav');
 menu.addEventListener('click',()=>nav.classList.toggle('open'));
 $$('#nav a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
 const sections=$$('main section[id]');
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting) $$('#nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===`#${entry.target.id}`));
 }),{rootMargin:'-35% 0px -55%'});
 sections.forEach(section=>observer.observe(section));
}

function initLightbox(){
 const modal=$('#lightbox'),img=$('#lightbox-img'),caption=$('#lightbox-caption');
 $$('[data-lightbox-key]').forEach(button=>button.addEventListener('click',()=>{
  const source=ASSETS[button.dataset.lightboxKey];
  if(!source){showToast('La vista no está disponible.');return}
  img.src=source;img.alt=button.dataset.caption||'';caption.textContent=button.dataset.caption||'';
  modal.hidden=false;document.body.style.overflow='hidden';
 }));
 const close=()=>{modal.hidden=true;document.body.style.overflow=''};
 $('[data-close]').addEventListener('click',close);
 modal.addEventListener('click',event=>{if(event.target===modal)close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)close()});
}

function initPresentation(){
 const modal=$('#presentation');
 const scenes=$$('.scene',modal);
 const play=$('#play-pause');
 const bar=$('#progress');
 const time=$('#time');
 const caption=$('#caption');
 const capBtn=$('#captions-toggle');
 const audioBtn=$('#audio-toggle');
 const audio=new Audio(ASSETS.audio);
 audio.preload='auto';
 let captionsEnabled=true;
 let muted=false;
 let currentScene=-1;
 const fallbackDuration=30.984;
 // Transiciones ubicadas después de pausas reales detectadas en la pista de voz.
 const sceneStarts=[0,5.285,7.677,16.358,21.284,27.678];

 const fmt=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
 const duration=()=>Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:fallbackDuration;
 const sceneFor=t=>{
  let index=0;
  for(let i=0;i<sceneStarts.length;i+=1){if(t>=sceneStarts[i]) index=i}
  return Math.min(index,scenes.length-1);
 };
 const render=()=>{
  const d=duration();
  const t=Math.min(audio.currentTime||0,d);
  const index=sceneFor(t);
  if(index!==currentScene){scenes.forEach((scene,i)=>scene.classList.toggle('active',i===index));currentScene=index}
  bar.style.width=`${Math.min(100,(t/d)*100)}%`;
  time.textContent=`${fmt(t)} / ${fmt(d)}`;
  caption.textContent=captionsEnabled?captions[index]:'';
  play.textContent=audio.paused?'Reproducir':'Pausar';
 };
 const start=async()=>{
  try{await audio.play();render()}catch(error){console.error('ONIX_AUDIO_PLAY_ERROR',error);showToast('Pulsa nuevamente Reproducir para activar el audio.')}
 };
 const pause=()=>{audio.pause();render()};
 const open=()=>{
  modal.hidden=false;document.body.style.overflow='hidden';
  audio.currentTime=0;currentScene=-1;render();start();
 };
 const close=()=>{
  audio.pause();audio.currentTime=0;currentScene=-1;
  modal.hidden=true;document.body.style.overflow='';render();
 };

 audio.addEventListener('loadedmetadata',render);
 audio.addEventListener('timeupdate',render);
 audio.addEventListener('play',render);
 audio.addEventListener('pause',render);
 audio.addEventListener('ended',()=>{render();play.textContent='Reproducir'});
 audio.addEventListener('error',()=>{console.error('ONIX_AUDIO_LOAD_ERROR',audio.error);showToast('No fue posible cargar el audio de la presentación.')});

 $$('[data-presentation]').forEach(button=>button.addEventListener('click',open));
 $('[data-close-presentation]').addEventListener('click',close);
 play.addEventListener('click',()=>audio.paused?start():pause());
 capBtn.addEventListener('click',()=>{
  captionsEnabled=!captionsEnabled;
  capBtn.setAttribute('aria-pressed',String(captionsEnabled));
  caption.hidden=!captionsEnabled;
  render();
 });
 audioBtn.addEventListener('click',()=>{
  muted=!muted;audio.muted=muted;
  audioBtn.setAttribute('aria-pressed',String(!muted));
  audioBtn.textContent=muted?'Audio: silenciado':'Audio: activo';
 });
 $('.progress').addEventListener('click',event=>{
  const rect=event.currentTarget.getBoundingClientRect();
  audio.currentTime=Math.max(0,Math.min(duration(),((event.clientX-rect.left)/rect.width)*duration()));
  render();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!modal.hidden) close();
  if(event.code==='Space'&&!modal.hidden){event.preventDefault();play.click()}
 });
 render();
}

function validateAssets(){
 $$('img').forEach(img=>img.addEventListener('error',()=>{img.classList.add('asset-error');console.error('Recurso no disponible:',img.currentSrc||img.src)}));
}
function initDownloads(){
 $$('.doc-actions a:last-child,.plan-card a:last-child').forEach(a=>a.addEventListener('click',()=>showToast('Descarga iniciada desde la entrega oficial.')));
}
function showToast(text){
 const toast=$('#toast');toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600);
}

buildCards();initMobilePdfLinks();hydrateAssets();initReveal();initNav();initLightbox();initPresentation();validateAssets();initDownloads();