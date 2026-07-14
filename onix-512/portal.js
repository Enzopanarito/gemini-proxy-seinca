(function(){
  const assets=window.SEINCA_ASSETS||{};
  document.querySelectorAll('[data-asset]').forEach(img=>{const value=assets[img.dataset.asset];if(value)img.src=value;});
  window.addEventListener('load',async()=>{
    const imgs=[...document.images];
    await Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true});})));
    const bad=imgs.filter(i=>!i.complete||i.naturalWidth<2);
    console.info('SEINCA_PORTAL_HEALTH',{release:'ONIX-V13-GITHUB-VERCEL-BACKUP-20260714',images:imgs.length,failedImages:bad.length,openButtons:document.querySelectorAll('.seinca-open').length,downloadButtons:document.querySelectorAll('.seinca-download').length});
    if(bad.length){const n=document.createElement('div');n.className='asset-error';n.textContent='Aviso técnico: no se pudo cargar un recurso visual. Recargue la página antes de iniciar la presentación.';document.body.appendChild(n);}
  });
})();
