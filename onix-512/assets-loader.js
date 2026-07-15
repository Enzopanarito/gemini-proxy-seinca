document.addEventListener('DOMContentLoaded',()=>{
  const A=window.SEINCA_ASSETS||{};
  document.querySelectorAll('img').forEach(img=>{
    const s=img.getAttribute('src')||'';
    if(s.endsWith('hero.webp')||s.endsWith('render.webp')) img.src=A.render||img.src;
    else if(s.endsWith('planta.webp')||s.endsWith('luces.webp')) img.src=A.planta||img.src;
    else if(s.endsWith('techo.webp')) img.src=A.techo||img.src;
  });
  document.querySelectorAll('[data-lightbox]').forEach(b=>{
    const s=b.dataset.lightbox||'';
    if(s.endsWith('hero.webp')||s.endsWith('render.webp')) b.dataset.lightbox=A.render||s;
    else if(s.endsWith('planta.webp')||s.endsWith('luces.webp')) b.dataset.lightbox=A.planta||s;
    else if(s.endsWith('techo.webp')) b.dataset.lightbox=A.techo||s;
  });
});
