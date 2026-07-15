const BASE='/onix-512/';
const DOCS=[
['01','Control documental','Índice de entrega','Relación de documentos, revisiones y páginas.','documents/00_Indice_de_Entrega_Documental.pdf'],
['02','Resumen ejecutivo','Dossier ejecutivo','Alcance, inversión, plazo, riesgos y ruta de aprobación.','documents/01_Dossier_Ejecutivo_SEINCA_Onix_512.pdf'],
['03','Documento económico','Presupuesto, APU y cómputos métricos','48 partidas, análisis unitarios y trazabilidad de cantidades.','documents/02_Presupuesto_APU_y_Computos_Metricos_SEINCA_Onix_512.pdf'],
['04','Documento técnico','Memoria descriptiva e informe técnico','Justificación integral del alcance, metodología y monto.','documents/03_Memoria_Descriptiva_e_Informe_Tecnico_SEINCA_Onix_512.pdf'],
['05','Anexo técnico','Cómputos métricos','Fórmulas, mediciones y niveles de certeza por partida.','documents/04_Anexo_Computos_Metricos_SEINCA_Onix_512.pdf'],
['06','Control de acabados','Aprobación de acabados','Porcelanato, revestimientos, pinturas, luminarias y paisajismo.','documents/05_Ficha_Seleccion_y_Aprobacion_de_Acabados.pdf'],
['07','Control contractual','Acta de aceptación','Documento para formalizar la aceptación de la propuesta.','documents/06_Acta_de_Aceptacion_Propuesta_SEINCA_Onix_512.pdf']
];
const PLANS=[
['P00','Presentación del proyecto','assets/hero.webp','documents/P00_Presentacion_Proyecto_Onix_512_SEINCA.pdf'],
['P01','Planta general','assets/planta.webp','documents/P01_Planta_General_Onix_512_SEINCA.pdf'],
['P02','Planta de techo','assets/techo.webp','documents/P02_Planta_Techo_Onix_512_SEINCA.pdf'],
['P03','Replanteo, piso y luminarias','assets/luces.webp','documents/P03_Replanteo_Piso_Luminarias_Onix_512_SEINCA.pdf'],
['P04','Cortes A-A y B-B','assets/planta.webp','documents/P04_Cortes_AA_BB_Onix_512_SEINCA.pdf'],
['P05','Revestimientos','assets/render.webp','documents/P05_Revestimientos_Onix_512_SEINCA.pdf']
];
const NARRATION=[
'En SEINCA entendemos que una gran obra comienza mucho antes de la construcción. Hoy presentamos el Proyecto Onix quinientos doce.',
'Una propuesta integral concebida para transformar el área exterior de la residencia en un espacio contemporáneo, funcional y cuidadosamente ejecutado.',
'El diseño integra un área social cubierta, parrillera, entretenimiento, iluminación arquitectónica, acabados premium y paisajismo dentro de una composición coherente.',
'Detrás de la imagen final existe una solución técnica completa: preparación, fundaciones, estructura, cubiertas, impermeabilización, instalaciones, pisos, revestimientos y controles de ejecución.',
'La inversión está respaldada por cuarenta y ocho partidas, análisis de precios unitarios, cómputos métricos, memoria descriptiva, planos y documentos de aprobación.',
'La ejecución se organiza en una ruta referencial de diez a doce semanas, desde la planificación y las adecuaciones iniciales hasta las pruebas y la entrega final.',
'Antes de iniciar deben cerrarse los acabados, las medidas reales, la ingeniería de detalle, los equipos y las condiciones comerciales.',
'La inversión total asciende a cuarenta y cinco mil novecientos diecisiete dólares con ocho centavos, IVA incluido. SEINCA aporta ingeniería, control y calidad para llevar este proyecto del concepto a la realidad.'
];
const SCENE_FOR_LINE=[0,1,1,2,2,3,4,5];
const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>[...c.querySelectorAll(s)];
function buildCards(){
 const dg=$('#doc-grid');
 dg.innerHTML=DOCS.map(d=>`<article class="doc-card reveal"><span class="doc-no">${d[0]}</span><small>${d[1]}</small><h3>${d[2]}</h3><p>${d[3]}</p><div class="doc-actions"><a href="${BASE+d[4]}" target="_blank" rel="noopener">Abrir ↗</a><a href="${BASE+d[4]}" download>Descargar ↓</a></div></article>`).join('');
 const pg=$('#plan-grid');
 pg.innerHTML=PLANS.map(p=>`<article class="plan-card reveal"><img src="${BASE+p[2]}" alt="Vista previa: ${p[1]}" loading="lazy"><div><small>${p[0]}</small><h3>${p[1]}</h3><a href="${BASE+p[3]}" target="_blank" rel="noopener">Abrir plano ↗</a> · <a href="${BASE+p[3]}" download>Descargar ↓</a></div></article>`).join('');
}
function initReveal(){const els=$$('.reveal');if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('in'));return}const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.1});els.forEach(e=>io.observe(e))}
function initNav(){const menu=$('#menu'),nav=$('#nav');menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});$$('#nav a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}));const sections=$$('main section[id]');const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){$$('#nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===`#${e.target.id}`))}}),{rootMargin:'-35% 0px -55%'});sections.forEach(s=>io.observe(s))}
function initLightbox(){const modal=$('#lightbox'),img=$('#lightbox-img'),cap=$('#lightbox-caption');$$('[data-image]').forEach(btn=>btn.addEventListener('click',()=>{img.src=btn.dataset.image;img.alt=btn.dataset.title||'';cap.textContent=btn.dataset.title||'';modal.hidden=false;document.body.style.overflow='hidden'}));const close=()=>{modal.hidden=true;document.body.style.overflow=''};$('[data-close-lightbox]').addEventListener('click',close);modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close()})}
let narrationState={running:false,paused:false,index:0,start:0,timer:null,captions:true};
function spanishVoice(){const voices=speechSynthesis.getVoices().filter(v=>/^es/i.test(v.lang));const preferred=['Jorge','Diego','Carlos','Andres','Andrés','Enrique','Alvaro','Álvaro','Miguel'];return voices.find(v=>preferred.some(n=>v.name.includes(n)))||voices[0]||null}
function setScene(index){$$('.scene').forEach((s,i)=>s.classList.toggle('active',i===index))}
function fmt(seconds){return`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`}
function updateClock(){if(!narrationState.running||narrationState.paused)return;const elapsed=(Date.now()-narrationState.start)/1000;const total=145;$('#progress').style.width=`${Math.min(100,elapsed/total*100)}%`;$('#presentation-time').textContent=`${fmt(elapsed)} / ${fmt(total)}`}
function speakLine(index){if(index>=NARRATION.length){finishPresentation();return}narrationState.index=index;setScene(SCENE_FOR_LINE[index]);const text=NARRATION[index];$('#caption').textContent=narrationState.captions?text:'';if(!('speechSynthesis'in window)){setTimeout(()=>speakLine(index+1),Math.max(7000,text.length*55));return}const u=new SpeechSynthesisUtterance(text);u.lang='es-ES';u.rate=.92;u.pitch=.94;u.volume=1;const voice=spanishVoice();if(voice)u.voice=voice;u.onend=()=>{if(narrationState.running)speakLine(index+1)};u.onerror=()=>{if(narrationState.running)setTimeout(()=>speakLine(index+1),500)};speechSynthesis.speak(u)}
function startPresentation(){const modal=$('#presentation');if('speechSynthesis'in window)speechSynthesis.cancel();modal.hidden=false;document.body.style.overflow='hidden';narrationState={running:true,paused:false,index:0,start:Date.now(),timer:setInterval(updateClock,250),captions:true};$('#play-pause').textContent='Pausar';$('#captions').setAttribute('aria-pressed','true');$('#progress').style.width='0';$('#presentation-time').textContent='0:00 / 2:25';speakLine(0)}
function finishPresentation(){narrationState.running=false;clearInterval(narrationState.timer);$('#play-pause').textContent='Reproducir';$('#progress').style.width='100%';$('#presentation-time').textContent='2:25 / 2:25'}
function closePresentation(){if('speechSynthesis'in window)speechSynthesis.cancel();clearInterval(narrationState.timer);narrationState.running=false;$('#presentation').hidden=true;document.body.style.overflow='';setScene(0);$('#caption').textContent=''}
function initPresentation(){$$('[data-presentation]').forEach(b=>b.addEventListener('click',startPresentation));$('[data-close-presentation]').addEventListener('click',closePresentation);$('#play-pause').addEventListener('click',()=>{if(!narrationState.running){startPresentation();return}if(!('speechSynthesis'in window))return;if(narrationState.paused){speechSynthesis.resume();narrationState.paused=false;narrationState.start=Date.now()-parseFloat($('#progress').style.width||0)/100*145000;$('#play-pause').textContent='Pausar'}else{speechSynthesis.pause();narrationState.paused=true;$('#play-pause').textContent='Continuar'}});$('#captions').addEventListener('click',e=>{narrationState.captions=!narrationState.captions;e.currentTarget.setAttribute('aria-pressed',String(narrationState.captions));$('#caption').hidden=!narrationState.captions});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#presentation').hidden)closePresentation()});if('speechSynthesis'in window)speechSynthesis.getVoices()}
function validateAssets(){$$('img').forEach(img=>img.addEventListener('error',()=>{img.style.visibility='hidden';console.error('Recurso no disponible:',img.src)}))}
buildCards();initReveal();initNav();initLightbox();initPresentation();validateAssets();
