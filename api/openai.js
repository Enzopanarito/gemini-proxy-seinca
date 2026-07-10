const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-sol';
const SCHEMA = {
  type:'object', additionalProperties:false,
  properties:{
    covenin:{type:'string'}, covenin_verificado:{type:'boolean'}, criterio_covenin:{type:'string'},
    unidad:{type:'string'}, cantidad:{type:'number'}, rendimiento:{type:'number'}, fcas:{type:'number'},
    descripcion_tecnica:{type:'string'}, memoria_calculo:{type:'string'}, justificacion_rendimiento:{type:'string'},
    criterio_ejecucion:{type:'string'}, supuestos:{type:'array',items:{type:'string'}},
    exclusiones:{type:'array',items:{type:'string'}}, advertencias:{type:'array',items:{type:'string'}},
    materiales:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      desc:{type:'string'},und:{type:'string'},cant:{type:'number'},precio:{type:'number'},fuente_precio:{type:'string'}
    },required:['desc','und','cant','precio','fuente_precio']}},
    equipos:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      desc:{type:'string'},cant:{type:'number'},tarifa:{type:'number'},fuente_precio:{type:'string'}
    },required:['desc','cant','tarifa','fuente_precio']}},
    mo:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      cargo:{type:'string'},cant:{type:'number'},jornal:{type:'number'},fuente_precio:{type:'string'}
    },required:['cargo','cant','jornal','fuente_precio']}}
  },
  required:['covenin','covenin_verificado','criterio_covenin','unidad','cantidad','rendimiento','fcas','descripcion_tecnica',
    'memoria_calculo','justificacion_rendimiento','criterio_ejecucion','supuestos','exclusiones','advertencias','materiales','equipos','mo']
};
const clean=(v,m=12000)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,m);
const num=(v,d=0)=>Number.isFinite(Number.parseFloat(v))?Number.parseFloat(v):d;
function cors(req,res){const allowed=clean(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),origin=req.headers.origin;
 const ok=!origin||!allowed.length||allowed.includes(origin);if(ok&&origin)res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');return ok}
function instruction(tipo,altura,review=false){
 return `Actúas como un comité senior de ingeniería de costos venezolano: ingeniero civil calculista, jefe de obra, planificador y auditor de licitaciones.
Tu tarea es ${review?'auditar dos APU candidatos, detectar contradicciones y producir una versión final superior':'producir un APU profesional, completo, trazable y auditable'} para una obra en Venezuela, expresado en USD.
Cliente: ${tipo}. Altura de ejecución: ${altura.toFixed(2)} m. Jornada: 8 horas.
REGLAS OBLIGATORIAS:
1. Respeta exactamente las medidas explícitas y demuestra el cómputo en memoria_calculo.
2. La cantidad general es el cómputo total. Los materiales son consumos POR UNIDAD de partida.
3. Equipos y mano de obra representan una cuadrilla diaria; el sistema divide sus costos entre el rendimiento.
4. FCAS es porcentaje sobre jornal directo, editable y no debe presentarse como tasa legal universal.
5. No inventes códigos COVENIN. Sin certeza usa "POR VERIFICAR", covenin_verificado=false y explica la verificación requerida.
6. Usa terminología venezolana y separa actividades que deban medirse como partidas distintas.
7. Incluye desperdicios, acarreo interno, seguridad, andamios e izaje solo cuando sean técnicamente aplicables.
8. No dupliques recursos. Si usas concreto premezclado, no incluyas sus componentes para el mismo volumen.
9. Los precios son referencias editables, nunca cotizaciones vigentes. fuente_precio debe indicarlo.
10. No inventes materiales en demoliciones ni mano de obra en suministros puros.
11. Verifica coherencia de unidad, cantidades, cuadrilla, rendimiento, descripción y tablas.
12. Para cliente Estado adopta trazabilidad, controles, seguridad y logística conservadora sin inflar arbitrariamente.
13. Máximo 12 materiales, 4 equipos y 4 cargos; si excede, advierte que debe dividirse en partidas.
14. Devuelve exclusivamente el objeto JSON requerido.`;
}
function outputText(j){if(typeof j.output_text==='string')return j.output_text;let s='';for(const item of j.output||[])for(const c of item.content||[])if(c.type==='output_text')s+=c.text||'';return s}
function normalize(a){
 const positive=(v,d=0)=>Math.max(d,num(v,d));
 const mapMat=(a.materiales||[]).slice(0,12).map(x=>({desc:clean(x.desc,250),und:clean(x.und,30)||'und',cant:positive(x.cant,.000001),precio:positive(x.precio,0),fuente_precio:clean(x.fuente_precio,250)||'Referencia IA editable - verificar cotización local'}));
 const mapEq=(a.equipos||[]).slice(0,4).map(x=>({desc:clean(x.desc,250),cant:positive(x.cant,.000001),tarifa:positive(x.tarifa,0),fuente_precio:clean(x.fuente_precio,250)||'Referencia IA editable - verificar cotización local'}));
 const mapMo=(a.mo||[]).slice(0,4).map(x=>({cargo:clean(x.cargo,250),cant:positive(x.cant,.000001),jornal:positive(x.jornal,0),fuente_precio:clean(x.fuente_precio,250)||'Referencia IA editable - verificar cotización local'}));
 if(!mapMat.length&&!mapEq.length&&!mapMo.length)throw new Error('La IA no devolvió recursos');
 return {...a,covenin:clean(a.covenin,80)||'POR VERIFICAR',unidad:clean(a.unidad,20)||'und',cantidad:positive(a.cantidad,.0001),
 rendimiento:positive(a.rendimiento,.0001),fcas:Math.min(1000,positive(a.fcas,0)),descripcion_tecnica:clean(a.descripcion_tecnica,5000),
 memoria_calculo:clean(a.memoria_calculo,5000),materiales:mapMat,equipos:mapEq,mo:mapMo};
}
async function requestOpenAI({prompt,tipo,altura,mode,candidates,key}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),52000);
 try{
  const input=mode==='REVIEW'
   ? `Alcance original:\n${prompt}\n\nCANDIDATO A:\n${JSON.stringify(candidates?.[0]||{})}\n\nCANDIDATO B:\n${JSON.stringify(candidates?.[1]||{})}\n\nGenera el APU final corregido, no un informe comparativo.`
   : `Elabora el APU del siguiente alcance:\n\n${prompt}`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
   body:JSON.stringify({model:MODEL,instructions:instruction(tipo,altura,mode==='REVIEW'),input,reasoning:{effort:'xhigh'},text:{verbosity:'high',format:{type:'json_schema',name:'seinca_apu',schema:SCHEMA,strict:true}},store:false,max_output_tokens:16000}),signal:controller.signal});
  const raw=await r.text();let j;try{j=JSON.parse(raw)}catch{j=null}if(!r.ok)throw new Error(j?.error?.message||raw||`HTTP ${r.status}`);
  const text=outputText(j);if(!text)throw new Error('OpenAI devolvió una respuesta vacía');return {data:normalize(JSON.parse(text)),usage:j.usage};
 }finally{clearTimeout(timer)}
}
export default async function handler(req,res){
 const ok=cors(req,res);if(req.method==='OPTIONS')return res.status(ok?204:403).end();if(!ok)return res.status(403).json({ok:false,error:'Origen no autorizado'});
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'Solo POST'});
 const key=process.env.OPENAI_API_KEY;if(!key)return res.status(503).json({ok:false,error:'OPENAI_API_KEY no está configurada en Vercel'});
 const prompt=clean(req.body?.prompt);if(prompt.length<10)return res.status(400).json({ok:false,error:'Descripción insuficiente'});
 const tipo=clean(req.body?.tipoCliente).toUpperCase()==='ESTADO'?'ESTADO':'PRIVADO',altura=Math.max(0,Math.min(300,num(req.body?.altura,0)));
 const mode=req.body?.mode==='REVIEW'?'REVIEW':'GENERATE';
 try{const result=await requestOpenAI({prompt,tipo,altura,mode,candidates:req.body?.candidates,key});res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,data:result.data,modelo:MODEL,proveedor:'OPENAI',modo:mode,usage:result.usage})}
 catch(e){console.error('[SEINCA OpenAI]',e);return res.status(502).json({ok:false,error:'No fue posible generar el APU con OpenAI',detalle:clean(e.message,1000)})}
}