(()=>{
 const isMobile=window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
 if(!isMobile) return;
 const viewerUrl=id=>`/onix-512/pdf-viewer.html?id=${encodeURIComponent(id)}`;
 const driveIdFrom=href=>{
  try{
   const url=new URL(href,window.location.href);
   if(url.hostname!=='drive.google.com') return '';
   if(url.pathname.includes('/drive/folders/')) return '';
   if(url.searchParams.get('export')==='download') return '';
   const pathMatch=url.pathname.match(/\/file\/d\/([^/]+)/);
   return pathMatch?.[1]||url.searchParams.get('id')||'';
  }catch{return ''}
 };
 const rewrite=link=>{
  const id=driveIdFrom(link.href);
  if(!id) return;
  link.href=viewerUrl(id);
  link.removeAttribute('target');
  link.removeAttribute('rel');
 };
 const rewriteAll=()=>document.querySelectorAll('a[href]').forEach(rewrite);
 rewriteAll();
 requestAnimationFrame(rewriteAll);
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(!link) return;
  const id=driveIdFrom(link.href);
  if(!id) return;
  event.preventDefault();
  window.location.assign(viewerUrl(id));
 },true);
})();
