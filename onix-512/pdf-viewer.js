(()=>{
 const ALLOWED_IDS=new Set([
  '1Bcj7V59afMCXICGGPwL-7vfmircg7f3-',
  '1w5gyygDTzk_4NLO7gKRzvVk_lg--ipuZ',
  '1AGFoyQOhE5-qc8Uz_vOlx5XnEPEaO2Ue',
  '12T2Wz7Ji8JvsqgdtQJolPeBZvM0TxIFK',
  '1gNANfC8OJhgb9gwvBEKRqKAvnWxrwOnQ',
  '1mkuniCmJhhVjpB3s2wBhF1aIcy9hNASj',
  '1ptAIFm4U6U3ajVgY8edcyrVPJiEttbSU',
  '1d0Uk9tBzM96bXZov34C0fb0T2ifhC6c-',
  '1keFABVLuOirLPQ_OXh63wq8vA9aRlIpe',
  '1Wb641QTvAFNAn67vuOceSdZeS2q7Odhw',
  '18Sn0W2JUKofsbC3U0FrNA5zO1dCZhT-j',
  '1KMU8AzvL7rh-oYFj30uBoAcKNcksLjTq',
  '1tuKJBKQYZnNdIGJNdVPH7gHaP_X5F6-F'
 ]);
 const params=new URLSearchParams(window.location.search);
 const id=params.get('id')||'';
 const frame=document.getElementById('pdf-frame');
 const loading=document.getElementById('loading');
 const error=document.getElementById('viewer-error');
 const back=document.getElementById('back-button');
 const fail=()=>{
  frame.hidden=true;
  loading.hidden=true;
  error.hidden=false;
 };
 back.addEventListener('click',()=>history.length>1?history.back():location.assign('/onix-512/'));
 if(!ALLOWED_IDS.has(id)){
  fail();
  return;
 }
 frame.addEventListener('load',()=>{loading.hidden=true});
 frame.addEventListener('error',fail);
 frame.src=`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
})();
