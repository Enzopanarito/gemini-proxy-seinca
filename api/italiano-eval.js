
const MODEL_LIST = [
  process.env.ITALIANO_GEMINI_MODEL,
  ...(String(process.env.GEMINI_MODELS || '').split(',')),
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash'
].map(function(v){return String(v || '').trim();}).filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;});

function cleanJson(text){
  const raw=String(text || '').trim();
  try{return JSON.parse(raw);}catch(e){}
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a>=0&&b>a)return JSON.parse(raw.slice(a,b+1));
  throw new Error('Respuesta IA no interpretable');
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

async function callModel(model,key,prompt){
  const controller=new AbortController();
  const timer=setTimeout(function(){controller.abort();},22000);
  try{
    const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key);
    const response=await fetch(url,{
      method:'POST',
      signal:controller.signal,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:prompt}]}],
        generationConfig:{temperature:0.15,maxOutputTokens:900,responseMimeType:'application/json'}
      })
    });
    const payload=await response.json();
    if(!response.ok){
      const err=new Error((payload && payload.error && payload.error.message) || ('Gemini HTTP '+response.status));
      err.status=response.status;throw err;
    }
    const txt=((((payload||{}).candidates||[])[0]||{}).content||{}).parts || [];
    return cleanJson(txt.map(function(p){return p.text || '';}).join(''));
  }finally{clearTimeout(timer);}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Italiano-Evaluator','mariana-b1-v1');
  const key=process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY;
  if(req.method==='GET'){
    return res.status(200).json({ok:Boolean(key),service:'Italiano Mariana B1 evaluator',models:MODEL_LIST.slice(0,4)});
  }
  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({ok:false,error:'Método no permitido'});
  }
  if(!key)return res.status(503).json({ok:false,error:'Gemini no está configurado en el servidor.'});

  const answer=String((req.body||{}).answer || '').trim().slice(0,5000);
  const task=String((req.body||{}).task || '').trim().slice(0,2500);
  const topic=String((req.body||{}).topic || 'IN articolata').trim().slice(0,180);
  const level=String((req.body||{}).level || 'A2 alto verso B1').trim().slice(0,100);
  const maxPoints=clamp(Number((req.body||{}).maxPoints) || 4,1,10);
  if(answer.length<10 || task.length<10)return res.status(400).json({ok:false,error:'Respuesta o consigna insuficiente.'});

  const prompt=[
    'Actúa como examinador profesional de italiano L2.',
    'La alumna es hispanohablante y se prepara para nivel B1.',
    'Nivel actual: '+level+'. Tema evaluado: '+topic+'.',
    'Consigna: '+task,
    'Respuesta de la alumna: '+answer,
    'Califica de 0 a '+maxPoints+' puntos, admitiendo medios puntos.',
    'Evalúa corrección gramatical, preposiciones, artículos, concordancia, naturalidad, claridad y cumplimiento de la consigna.',
    'conceptualError debe ser true SOLO si la respuesta demuestra una regla central equivocada. Un typo menor no es error conceptual.',
    'Da feedback breve en español, una versión corregida en italiano y un punto fuerte concreto.',
    'Devuelve únicamente JSON válido con esta estructura:',
    '{"points":3.5,"conceptualError":false,"feedback":"...","correction":"...","strength":"..."}'
  ].join('\n');

  const errors=[];
  for(const model of MODEL_LIST.slice(0,4)){
    try{
      const data=await callModel(model,key,prompt);
      const evaluation={
        points:Math.round(clamp(Number(data.points)||0,0,maxPoints)*2)/2,
        conceptualError:Boolean(data.conceptualError),
        feedback:String(data.feedback || '').slice(0,1200),
        correction:String(data.correction || '').slice(0,1200),
        strength:String(data.strength || '').slice(0,600)
      };
      return res.status(200).json({ok:true,evaluation:evaluation,model:model});
    }catch(err){
      errors.push({model:model,status:Number(err.status)||0,message:String(err.message||'Error').slice(0,180)});
    }
  }
  return res.status(502).json({ok:false,error:'Gemini no pudo completar la corrección.',attempts:errors});
}
