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
 'Bienvenidos a la presentación ejecutiva del Proyecto Onix 512, desarrollado por SEINCA para transformar integralmente el área exterior de la Familia Rivas.',
 'El diseño integra arquitectura, funcionalidad y una estética contemporánea, creando un espacio exterior elegante, cómodo y plenamente aprovechable.',
 'El expediente reúne 48 partidas, APU, cómputos métricos, planos y criterios de acabados, garantizando trazabilidad técnica y control económico.',
 'La ejecución se organiza en un plazo estimado de 10 a 12 semanas, desde la planificación y procura hasta las terminaciones, pruebas y entrega.',
 'Antes de iniciar se validarán iluminación, materiales, ubicación de luminarias y fecha de arranque, reduciendo riesgos y manteniendo el alcance bajo control.',
 'La inversión total es de USD 45.917,08, IVA incluido. SEINCA: ingeniería, control y calidad para convertir este proyecto en realidad.'
];

const narration=[
 'Bienvenidos a la presentación ejecutiva del Proyecto Onix quinientos doce, desarrollado por SEINCA para transformar integralmente el área exterior de la Familia Rivas.',
 'El diseño integra arquitectura, funcionalidad y una estética contemporánea, creando un espacio exterior elegante, cómodo y plenamente aprovechable.',
 'El expediente reúne cuarenta y ocho partidas, análisis de precios unitarios, cómputos métricos, planos y criterios de acabados, garantizando trazabilidad técnica y control económico.',
 'La ejecución se organiza en un plazo estimado de diez a doce semanas, desde la planificación y procura hasta las terminaciones, pruebas y entrega.',
 'Antes de iniciar se validarán iluminación, materiales, ubicación de luminarias y fecha de arranque, reduciendo riesgos y manteniendo el alcance bajo control.',
 'La inversión total es de cuarenta y cinco mil novecientos diecisiete dólares con ocho centavos, IVA incluido. SEINCA: ingeniería, control y calidad para convertir este proyecto en realidad.'
];

const $=(selector,context=document)=>context.querySelector(selector);
const $$=(selector,context=document)=>[...context.querySelectorAll(selector)];
const driveImage=id=>`https://drive.google.com/uc?export=view&id=${id}`;
const ASSETS={
 logo:driveImage('1e1czm5osM-c_tFblB8QCbKG1rkyufA_j'),
 hero:driveImage('1_8vdhSzANaG4cWXiYMmSblDuKrhG-pi9'),
 render:driveImage('1b4Sgq2BJMWzEdN3Cm7MReUu0YizwdV00'),
 planta:driveImage('1Sl9I4VflEnWoIpGoaVhVCbZSHHOvsI0s'),
 luces:driveImage('1JsEuHkLszeQ_9yUEbwu6DQQvOQlrvT5L'),
 techo:driveImage('1K74S40jEMayDBdMDFugRDC900XsRN1Rl')
};
const driveView=id=>`https://drive.google.com/file/d/${id}/view?usp=sharing`;
const driveDownload=id=>`https://drive.google.com/uc?export=download&id=${id}`;

function buildCards(){
 const dg=$('#doc-grid'),pg=$('#plan-grid');
 dg.innerHTML=DOCS.map(d=>`<article class="doc-card reveal"><span class="doc-no">${d[0]}</span><small>${d[1]}</small><h3>${d[2]}</h3><p>${d[3]}</p><div class="doc-actions"><a href="${driveView(d[4])}" target="_blank" rel="noopener">Abrir ↗</a><a href="${driveDownload(d[4])}" target="_blank" rel="noopener">Descargar ↓</a></div></article>`).join('');
 pg.innerHTML=PLANS.map(p=>`<article class="plan-card reveal"><img data-asset="${p[2]}" alt="Vista previa: ${p[1]}" loading="lazy"><div><small>${p[0]}</small><h3>${p[1]}</h3><a href="${driveView(p[3])}" target="_blank" rel="noopener">Abrir plano ↗</a> · <a href="${driveDownload(p[3])}" target="_blank" rel="noopener">Descargar ↓</a></div></article>`).join('');
}

function hydrateAssets(){
 const missing=[];
 $$('img[data-asset]').forEach(img=>{
  const key=img.dataset.asset,source=ASSETS[key];
  if(source) img.src=source; else {img.classList.add('asset-error');missing.push(key)}
 });
 $$('img[data-logo]').forEach(img=>{
  if(ASSETS.logo) img.src=ASSETS.logo; else {img.classList.add('asset-error');missing.push('logo')}
 });
 if(missing.length) console.error('Recursos no disponibles:',[...new Set(missing)]);
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
 const modal=$('#presentation'),scenes=$$('.scene',modal),play=$('#play-pause'),bar=$('#progress'),time=$('#time'),caption=$('#caption'),capBtn=$('#captions-toggle'),audioBtn=$('#audio-toggle');
 const synth='speechSynthesis' in window?window.speechSynthesis:null;
 let t=0,running=false,timer=null,caps=true,audioEnabled=true,lastScene=-1,voice=null;
 const duration=72,sceneDuration=12;
 const fmt=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

 function chooseVoice(){
  if(!synth) return null;
  const voices=synth.getVoices();
  const priorities=['es-VE','es-419','es-US','es-MX','es-CO','es-ES'];
  for(const lang of priorities){
   const exact=voices.find(v=>v.lang.toLowerCase()===lang.toLowerCase()&&v.localService);
   if(exact) return exact;
   const any=voices.find(v=>v.lang.toLowerCase()===lang.toLowerCase());
   if(any) return any;
  }
  return voices.find(v=>v.lang.toLowerCase().startsWith('es'))||null;
 }
 function refreshVoice(){voice=chooseVoice()}
 if(synth){refreshVoice();synth.addEventListener?.('voiceschanged',refreshVoice)}

 function speakScene(index,force=false){
  if(!synth||!audioEnabled||!running) return;
  if(index===lastScene&&!force) return;
  synth.cancel();
  const utterance=new SpeechSynthesisUtterance(narration[index]);
  utterance.lang=voice?.lang||'es-419';
  if(voice) utterance.voice=voice;
  utterance.rate=.92;utterance.pitch=.96;utterance.volume=1;
  synth.speak(utterance);
  lastScene=index;
 }

 function update(forceVoice=false){
  const index=Math.min(scenes.length-1,Math.floor(t/sceneDuration));
  scenes.forEach((scene,i)=>scene.classList.toggle('active',i===index));
  bar.style.width=`${t/duration*100}%`;
  time.textContent=`${fmt(t)} / ${fmt(duration)}`;
  caption.textContent=caps?captions[index]:'';
  if(running) speakScene(index,forceVoice);
 }

 function pause(){
  clearInterval(timer);timer=null;running=false;play.textContent='Reproducir';
  if(synth?.speaking) synth.pause();
 }
 function start(){
  if(running) return;
  running=true;play.textContent='Pausar';
  if(synth?.paused) synth.resume(); else speakScene(Math.min(scenes.length-1,Math.floor(t/sceneDuration)),true);
  timer=setInterval(()=>{
   t+=.1;
   if(t>=duration){t=duration;update();clearInterval(timer);timer=null;running=false;play.textContent='Reproducir';synth?.cancel();return}
   update();
  },100);
 }
 function open(){
  modal.hidden=false;document.body.style.overflow='hidden';t=0;lastScene=-1;update();start();
  if(!synth) showToast('Este navegador no ofrece narración automática; los subtítulos permanecen activos.');
 }
 function close(){
  clearInterval(timer);timer=null;running=false;t=0;lastScene=-1;synth?.cancel();modal.hidden=true;document.body.style.overflow='';play.textContent='Pausar';
 }

 $$('[data-presentation]').forEach(button=>button.addEventListener('click',open));
 $('[data-close-presentation]').addEventListener('click',close);
 play.addEventListener('click',()=>running?pause():start());
 capBtn.addEventListener('click',()=>{caps=!caps;capBtn.setAttribute('aria-pressed',String(caps));caption.hidden=!caps;update()});
 audioBtn.addEventListener('click',()=>{
  audioEnabled=!audioEnabled;audioBtn.setAttribute('aria-pressed',String(audioEnabled));audioBtn.textContent=audioEnabled?'Audio: activo':'Audio: silenciado';
  if(!audioEnabled){synth?.cancel();lastScene=-1}else if(running){speakScene(Math.min(scenes.length-1,Math.floor(t/sceneDuration)),true)}
 });
 $('.progress').addEventListener('click',event=>{
  const rect=event.currentTarget.getBoundingClientRect();
  t=Math.max(0,Math.min(duration,(event.clientX-rect.left)/rect.width*duration));lastScene=-1;update(true);
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!modal.hidden) close();
  if(event.code==='Space'&&!modal.hidden){event.preventDefault();play.click()}
 });
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

buildCards();hydrateAssets();initReveal();initNav();initLightbox();initPresentation();validateAssets();initDownloads();
