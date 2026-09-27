
(function(){
  'use strict';

  const STORAGE_KEY='italiano-mariana-b1-v1';
  const roadmapData=[
    {id:'fondamenti',n:'01',title:'A / IN base',sub:'Fondamenti',status:'done',score:'Dominato'},
    {id:'da',n:'02',title:'DA + articolo',sub:'dal · dallo · dalla…',status:'done',score:'19/20'},
    {id:'a-art',n:'03',title:'A articolata',sub:'al · allo · alla…',status:'done',score:'Dominato'},
    {id:'di-art',n:'04',title:'DI articolata',sub:'del · dello · della…',status:'done',score:'19/20'},
    {id:'in-art',n:'05',title:'IN articolata',sub:'nel · nello · nella…',status:'current',score:'Adesso'},
    {id:'misto',n:'06',title:'Preposizioni miste',sub:'A · IN · DA · DI',status:'locked',score:'Bloccato'},
    {id:'pronomi',n:'07',title:'Pronomi',sub:'diretti · indiretti',status:'locked',score:'B1'},
    {id:'passato',n:'08',title:'Passato',sub:'prossimo · imperfetto',status:'locked',score:'B1'},
    {id:'futuro',n:'09',title:'Futuro + condizionale',sub:'forme e uso',status:'locked',score:'B1'},
    {id:'connettivi',n:'10',title:'Connettivi',sub:'perché · quindi · mentre…',status:'locked',score:'B1'},
    {id:'produzione',n:'11',title:'Produzione B1',sub:'scrittura · parlato',status:'locked',score:'B1'},
    {id:'simulazioni',n:'12',title:'Simulazioni',sub:'esame completo',status:'locked',score:'Finale'}
  ];

  const bank=[
    {q:'Sono ___ supermercato e sto cercando il latte.',a:'nel',o:['nel','nello','nella','nei'],rule:'in + il = nel'},
    {q:'Studio ___ studio di mio padre.',a:'nello',o:['nello','nel','nell\'','negli'],rule:'in + lo = nello'},
    {q:'C'è una biblioteca ___ scuola nuova.',a:'nella',o:['nella','nel','nelle','in'],rule:'in + la = nella'},
    {q:'Lavoro ___ ufficio vicino a casa.',a:'nell\'',o:['nell\'','nello','nel','negli'],rule:'in + l’ = nell’'},
    {q:'Compro spesso ___ negozi del centro.',a:'nei',o:['nei','negli','nel','nelle'],rule:'in + i = nei'},
    {q:'Dormiamo ___ alberghi vicino alla stazione.',a:'negli',o:['negli','nei','nell\'','nello'],rule:'in + gli = negli'},
    {q:'Gli studenti sono ___ aule.',a:'nelle',o:['nelle','nei','negli','nella'],rule:'in + le = nelle'},
    {q:'La macchina è ___ garage.',a:'nel',o:['nel','nello','nella','in'],rule:'garage usa il: nel garage'},
    {q:'Il documento è ___ zaino nero.',a:'nello',o:['nello','nel','nell\'','nei'],rule:'zaino usa lo: nello zaino'},
    {q:'Metto il latte ___ frigorifero.',a:'nel',o:['nel','nello','nella','nei'],rule:'frigorifero usa il'},
    {q:'C'è una fontana ___ piazza principale.',a:'nella',o:['nella','nel','nelle','in'],rule:'in + la'},
    {q:'I libri sono ___ scaffali.',a:'negli',o:['negli','nei','nelle','nello'],rule:'scaffali usa gli'},
    {q:'Le chiavi sono ___ borse.',a:'nelle',o:['nelle','nei','nella','negli'],rule:'borse usa le'},
    {q:'Mangiamo ___ ristorante dell\'hotel.',a:'nel',o:['nel','al','in','nello'],rule:'qui indica dentro uno specifico ristorante'},
    {q:'Vivo ___ Italia.',a:'in',o:['in','nell\'','a','nel'],rule:'paese senza articolo: in Italia'},
    {q:'Sono ___ Roma per lavoro.',a:'a',o:['a','in','nella','alla'],rule:'città: a Roma'},
    {q:'Domani vado ___ medico.',a:'dal',o:['dal','nel','al','di'],rule:'persona/professionista: dal medico'},
    {q:'Quando viaggio, preferisco stare ___ hotel.',a:'in',o:['in','nell\'','al','nel'],rule:'espressione comune: in hotel'},
    {q:'Stasera siamo ___ cinema.',a:'al',o:['al','nel','in','dal'],rule:'espressione comune: al cinema'},
    {q:'Mariana è ___ farmacia del quartiere.',a:'nella',o:['nella','in','alla','dalla'],rule:'farmacia specifica: nella farmacia'},
    {q:'Ci sono molti turisti ___ musei italiani.',a:'nei',o:['nei','negli','nelle','nel'],rule:'musei usa i'},
    {q:'Abbiamo cenato ___ sale interne.',a:'nelle',o:['nelle','nei','negli','nella'],rule:'sale usa le'},
    {q:'Lui lavora ___ ospedale centrale.',a:'nell\'',o:['nell\'','nel','nello','in'],rule:'ospedale con articolo: nell’ospedale'},
    {q:'I ragazzi giocano ___ parchi pubblici.',a:'nei',o:['nei','negli','nel','nelle'],rule:'parchi usa i'},
    {q:'Conservo le foto ___ album di famiglia.',a:'negli',o:['negli','nei','nell\'','nelle'],rule:'album plurale usa gli: negli album'}
  ];

  const micro=[
    {q:'Sono ___ ufficio.',a:'nell\'',o:['nel','nello','nell\'']},
    {q:'I bambini sono ___ giardini.',a:'nei',o:['nei','negli','nelle']},
    {q:'Metto tutto ___ zaino.',a:'nello',o:['nel','nello','nell\'']},
    {q:'Le sedie sono ___ sale.',a:'nelle',o:['nei','nelle','negli']},
    {q:'Siamo ___ Italia, ma oggi andiamo ___ Roma.',a:'in / a',o:['in / a','a / in','nell\' / a']}
  ];

  const examClosed=[
    bank[0],bank[1],bank[2],bank[3],bank[4],bank[5],bank[6],bank[12],bank[14],bank[15],bank[16],bank[18]
  ];

  const openTasks=[
    {
      prompt:'Scrivi tre frasi naturali usando tre forme diverse di IN articolata.',
      hint:'No copies los ejemplos de la teoría. Usa vocabulario propio y al menos tres formas entre nel, nello, nella, nell’, nei, negli, nelle.',
      max:4
    },
    {
      prompt:'Spiega in italiano la differenza tra “in Italia”, “a Roma”, “nel ristorante dell’hotel” e “dal medico”. Aggiungi un esempio tuo.',
      hint:'No hace falta una explicación académica. Quiero comprobar que entiendes cuándo cambia la preposición.',
      max:4
    }
  ];

  let state=loadState();
  let practiceSet=[];
  let practiceAnswers={};
  let practiceLocked=false;
  let examAnswers={};
  let microAnswered={};
  let lastExamResult=null;

  function defaultState(){
    return {
      history:[],
      practiceBest:0,
      confirmedAdvance:false,
      mastered:['fondamenti','da','a-art','di-art'],
      lastScore:19
    };
  }
  function loadState(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      return Object.assign(defaultState(),saved||{});
    }catch(e){return defaultState();}
  }
  function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
  function qs(s){return document.querySelector(s);}
  function qsa(s){return Array.from(document.querySelectorAll(s));}
  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function shuffle(a){
    const arr=a.slice();
    for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=arr[i];arr[i]=arr[j];arr[j]=t;}
    return arr;
  }
  function toast(msg){
    const el=qs('#toast');el.textContent=msg;el.classList.add('show');
    clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('show');},2300);
  }
  function showView(name){
    qsa('.view').forEach(function(v){v.classList.toggle('active',v.id===name+'View');});
    qsa('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.view===name);});
    window.scrollTo({top:70,behavior:'smooth'});
    if(name==='history') renderHistory();
  }
  function renderRoadmap(){
    const mastered=new Set(state.mastered||[]);
    const data=roadmapData.map(function(x){return Object.assign({},x);});
    if(state.confirmedAdvance){
      data.find(function(x){return x.id==='in-art';}).status='done';
      data.find(function(x){return x.id==='misto';}).status='current';
    }
    qs('#roadmap').innerHTML=data.map(function(x){
      let status=x.status;
      if(mastered.has(x.id)) status='done';
      return '<div class="road-step '+status+'"><span class="n">'+x.n+'</span><b>'+escapeHtml(x.title)+'</b><small>'+escapeHtml(status==='done'?'✓ '+x.score:x.sub)+'</small></div>';
    }).join('');
    const completed=(state.mastered||[]).length;
    qs('#roadmapSummary').textContent=completed+' / '+data.length+' metas';
    qs('#masteryPct').textContent=Math.round((completed/data.length)*100)+'%';
  }
  function renderMicro(){
    qs('#microPractice').innerHTML=micro.map(function(item,i){
      return '<div class="micro-row"><p><b>'+(i+1)+'.</b> '+escapeHtml(item.q)+'</p><div class="choice-row">'+item.o.map(function(o){
        return '<button class="choice" data-micro="'+i+'" data-value="'+escapeHtml(o)+'" type="button">'+escapeHtml(o)+'</button>';
      }).join('')+'</div></div>';
    }).join('');
    qsa('[data-micro]').forEach(function(btn){
      btn.addEventListener('click',function(){
        const i=Number(btn.dataset.micro);
        if(microAnswered[i]!=null)return;
        microAnswered[i]=btn.dataset.value;
        const good=btn.dataset.value===micro[i].a;
        btn.classList.add(good?'correct':'wrong');
        qsa('[data-micro="'+i+'"]').forEach(function(b){if(b.dataset.value===micro[i].a)b.classList.add('correct');});
        qs('#microScore').textContent=Object.keys(microAnswered).filter(function(k){return micro[Number(k)].a===microAnswered[k];}).length+'/5';
      });
    });
  }
  function makePractice(){
    practiceSet=shuffle(bank).slice(0,20);
    practiceAnswers={};practiceLocked=false;
    renderPractice();
  }
  function renderPractice(){
    const area=qs('#practiceArea');
    area.innerHTML=practiceSet.map(function(item,i){
      return '<div class="question-card"><span class="qnum">DOMANDA '+String(i+1).padStart(2,'0')+'</span><h4>'+escapeHtml(item.q)+'</h4><div class="options">'+shuffle(item.o).map(function(o){
        return '<button type="button" class="option" data-practice="'+i+'" data-value="'+escapeHtml(o)+'">'+escapeHtml(o)+'</button>';
      }).join('')+'</div><small class="explain" id="pex'+i+'"></small></div>';
    }).join('')+'<div class="practice-result hidden" id="practiceResult"></div>';
    qsa('[data-practice]').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(practiceLocked)return;
        const i=Number(btn.dataset.practice);
        practiceAnswers[i]=btn.dataset.value;
        qsa('[data-practice="'+i+'"]').forEach(function(b){b.classList.toggle('selected',b===btn);});
        qs('#practiceProgress i').style.width=Math.round(Object.keys(practiceAnswers).length/practiceSet.length*100)+'%';
        if(Object.keys(practiceAnswers).length===practiceSet.length) gradePractice();
      });
    });
  }
  function gradePractice(){
    practiceLocked=true;
    let score=0;
    practiceSet.forEach(function(item,i){
      const chosen=practiceAnswers[i];
      const good=chosen===item.a;if(good)score++;
      qsa('[data-practice="'+i+'"]').forEach(function(b){
        if(b.dataset.value===item.a)b.classList.add('correct');
        if(b.dataset.value===chosen&&!good)b.classList.add('wrong');
        b.disabled=true;
      });
      const e=qs('#pex'+i);e.textContent=good?'✓ Correcto':'→ '+item.rule;e.style.color=good?'#7de2ae':'#ff9aa5';
    });
    state.practiceBest=Math.max(state.practiceBest||0,score);saveState();
    const box=qs('#practiceResult');box.classList.remove('hidden');
    box.innerHTML='<strong>'+score+'/20</strong><p>'+(score>=18?'Muy bien. Ya estás en zona de dominio; el examen decide si esta meta queda superada.':'Todavía conviene otra ronda. La meta es 18/20 antes de considerar dominio.')+'</p>';
  }
  function renderExam(){
    examAnswers={};
    const closed=examClosed.map(function(item,i){
      return '<div class="question-card"><span class="qnum">'+(i+1)+'/12</span><h4>'+escapeHtml(item.q)+'</h4><div class="options">'+shuffle(item.o).map(function(o){
        return '<label class="option"><input type="radio" name="e'+i+'" value="'+escapeHtml(o)+'"> '+escapeHtml(o)+'</label>';
      }).join('')+'</div></div>';
    }).join('');
    const open=openTasks.map(function(t,i){
      return '<div class="open-answer"><label>'+(13+i)+'. '+escapeHtml(t.prompt)+' <span>('+t.max+' pt)</span></label><small>'+escapeHtml(t.hint)+'</small><textarea id="open'+i+'" placeholder="Scrivi qui in italiano…"></textarea><div class="answer-tools"><button type="button" class="speak-btn" data-speak="'+i+'">🎙 Dictar en italiano</button></div></div>';
    }).join('');
    qs('#examArea').innerHTML=closed+open;
    qsa('#examArea input[type=radio]').forEach(function(input){
      input.addEventListener('change',function(){
        const idx=Number(input.name.slice(1));examAnswers[idx]=input.value;
      });
    });
    qsa('[data-speak]').forEach(function(btn){
      btn.addEventListener('click',function(){startDictation(Number(btn.dataset.speak),btn);});
    });
  }
  function startDictation(i,btn){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){toast('Este navegador no ofrece dictado web. Puedes usar el micrófono del teclado o escribir.');return;}
    const rec=new SR();rec.lang='it-IT';rec.interimResults=false;rec.continuous=false;
    btn.classList.add('listening');btn.textContent='● Ascoltando…';
    rec.onresult=function(ev){
      const text=ev.results[0][0].transcript;
      const box=qs('#open'+i);box.value=(box.value?box.value+' ':'')+text;
    };
    rec.onerror=function(){toast('No pude captar el audio. Revisa el permiso del micrófono.');};
    rec.onend=function(){btn.classList.remove('listening');btn.textContent='🎙 Dictar en italiano';};
    rec.start();
  }
  async function evaluateOpen(task,answer){
    const r=await fetch('/api/italiano-eval',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({topic:'IN articolata e contrasto A/IN/DA/DI',level:'A2 alto verso B1',task:task.prompt,answer:answer,maxPoints:task.max})
    });
    const data=await r.json();
    if(!r.ok||!data.ok)throw new Error(data.error||'No se pudo corregir con IA');
    return data.evaluation;
  }
  async function submitExam(){
    const button=qs('#submitExamBtn');
    if(Object.keys(examAnswers).length<examClosed.length){toast('Faltan respuestas objetivas. Completa las 12.');return;}
    const answers=openTasks.map(function(_,i){return (qs('#open'+i).value||'').trim();});
    if(answers.some(function(x){return x.length<15;})){toast('Completa las dos respuestas abiertas antes de corregir.');return;}
    button.disabled=true;button.classList.add('loading');button.textContent='Corrigiendo con Gemini';
    qs('#examStatusText').textContent='Revisando gramática, reglas y producción…';
    try{
      let closedScore=0;
      examClosed.forEach(function(item,i){if(examAnswers[i]===item.a)closedScore++;});
      const evaluations=await Promise.all(openTasks.map(function(t,i){return evaluateOpen(t,answers[i]);}));
      const aiScore=evaluations.reduce(function(sum,e){return sum+Number(e.points||0);},0);
      const total=Math.round((closedScore+aiScore)*2)/2;
      const conceptualError=evaluations.some(function(e){return e.conceptualError;});
      const passed=total>=18&&!conceptualError;
      lastExamResult={score:total,closedScore:closedScore,aiScore:aiScore,passed:passed,conceptualError:conceptualError,evaluations:evaluations,date:new Date().toISOString()};
      state.lastScore=total;
      state.history.unshift({topic:'IN articolata',score:total,passed:passed,conceptualError:conceptualError,date:lastExamResult.date,closed:closedScore,open:aiScore});
      state.history=state.history.slice(0,30);
      saveState();
      renderExamResult();
      renderHistory();
    }catch(err){
      qs('#examStatusText').textContent='No pude completar la corrección inteligente.';
      qs('#aiFeedback').innerHTML='<div class="feedback-item"><b>Error de corrección</b><p>'+escapeHtml(err.message)+'</p></div>';
      toast('La IA no respondió correctamente. El examen no fue guardado.');
    }finally{
      button.disabled=false;button.classList.remove('loading');button.textContent='Corregir examen';
    }
  }
  function renderExamResult(){
    if(!lastExamResult)return;
    const r=lastExamResult;
    qs('#examScore').textContent=String(r.score).replace('.5',',5');
    qs('#examStatusText').textContent=r.passed?'Meta alcanzada. Puedes confirmar el avance al siguiente bloque.':(r.conceptualError?'Hay un error conceptual que conviene corregir antes de avanzar.':'Aún no llega al umbral de 18/20. Repasa y vuelve a intentarlo.');
    qs('#advanceBtn').classList.toggle('hidden',!r.passed);
    qs('#aiFeedback').innerHTML=
      '<div class="feedback-item"><b>Parte objetiva: '+r.closedScore+'/12</b><p>Corrección determinística de preposiciones y artículos.</p></div>'+
      r.evaluations.map(function(e,i){
        return '<div class="feedback-item"><b>Producción '+(i+1)+': '+e.points+'/'+openTasks[i].max+'</b><p>'+escapeHtml(e.feedback)+'</p><p class="correction"><strong>Correzione:</strong> '+escapeHtml(e.correction)+'</p><p><strong>Punto forte:</strong> '+escapeHtml(e.strength)+'</p></div>';
      }).join('');
    qs('#lastScore').textContent=String(r.score).replace('.5',',5')+'/20';
  }
  function advance(){
    if(!lastExamResult||!lastExamResult.passed)return;
    state.confirmedAdvance=true;
    if(state.mastered.indexOf('in-art')<0)state.mastered.push('in-art');
    saveState();renderRoadmap();
    qs('#advanceBtn').classList.add('hidden');
    toast('IN articolata marcada como dominada. Siguiente meta: práctica mixta A · IN · DA · DI.');
    showView('dashboard');
  }
  function renderHistory(){
    const list=qs('#historyList');const h=state.history||[];
    if(!h.length){list.innerHTML='<div class="empty">Todavía no hay exámenes hechos desde esta página.</div>';qs('#bestScorePill').textContent='Mejor —';return;}
    const best=Math.max.apply(null,h.map(function(x){return Number(x.score)||0;}));
    qs('#bestScorePill').textContent='Mejor '+String(best).replace('.5',',5')+'/20';
    list.innerHTML=h.map(function(x){
      const d=new Date(x.date);const date=isNaN(d)?'':d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
      return '<div class="history-item"><div class="score '+(x.passed?'pass':'fail')+'">'+String(x.score).replace('.5',',5')+'/20</div><div><b>'+escapeHtml(x.topic)+'</b><small>'+date+' · objetiva '+x.closed+'/12 · producción '+x.open+'/8</small></div><span class="'+(x.passed?'pass':'fail')+'">'+(x.passed?'Dominado':'Reforzar')+'</span></div>';
    }).join('');
  }
  function surprise(){
    const sample=shuffle(bank).slice(0,5);let score=0;let ix=0;
    showView('practice');
    practiceSet=sample;practiceAnswers={};practiceLocked=false;renderPractice();
    qs('#practiceArea').insertAdjacentHTML('afterbegin','<div class="practice-result"><strong>Prueba sorpresa · 5</strong><p>Sin teoría delante. Cinco preguntas rápidas para comprobar memoria real.</p></div>');
    toast('Sorpresa activada: 5 preguntas.');
  }
  function resetData(){
    if(!window.confirm('¿Reiniciar prácticas e historial creados en esta web? El avance histórico del curso hasta DI articolata se conserva.'))return;
    state=defaultState();saveState();lastExamResult=null;microAnswered={};renderAll();toast('Datos de la web reiniciados.');
  }
  function renderAll(){
    renderRoadmap();renderMicro();makePractice();renderExam();renderHistory();
    qs('#lastScore').textContent=String(state.lastScore||19).replace('.5',',5')+'/20';
    qs('#syncPill').textContent='Guardado en este dispositivo';
  }

  qsa('.tab').forEach(function(t){t.addEventListener('click',function(){showView(t.dataset.view);});});
  qsa('[data-jump]').forEach(function(t){t.addEventListener('click',function(){showView(t.dataset.jump);});});
  qs('#continueBtn').addEventListener('click',function(){showView('lesson');});
  qs('#surpriseBtn').addEventListener('click',surprise);
  qs('#newPracticeBtn').addEventListener('click',makePractice);
  qs('#submitExamBtn').addEventListener('click',submitExam);
  qs('#advanceBtn').addEventListener('click',advance);
  qs('#resetBtn').addEventListener('click',resetData);

  renderAll();
})();
