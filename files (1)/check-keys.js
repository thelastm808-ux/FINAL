// Tells you which keys in api_keys.txt actually work, and through which route. Run: node check-keys.js
const fs=require('fs'),M=process.env.GEMINI_MODEL||'gemini-3.8-flash';
const ks=[...new Set((fs.existsSync('api_keys.txt')?fs.readFileSync('api_keys.txt','utf8'):'').match(/AIza[\w-]{30,}|AQ\.[\w.-]{20,}/g)||[])];
const R={'gemini-api':`https://generativelanguage.googleapis.com/v1beta/models/${M}:generateContent`,'vertex-express':`https://aiplatform.googleapis.com/v1/publishers/google/models/${M}:generateContent`};
(async()=>{console.log(ks.length+' key(s) found in api_keys.txt, model '+M);let ok=0;
for(const [i,k] of ks.entries()){let line='';for(const n of k.startsWith('AQ.')?['vertex-express','gemini-api']:['gemini-api','vertex-express']){
 try{const r=await fetch(R[n]+'?key='+k,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Reply with the single word OK'}]}]})}),j=await r.json();
  if(r.ok){line='WORKS via '+n;ok++;break}line+=`${n}: ${r.status} ${(j.error?.message||'').slice(0,70)} | `}catch(e){line+=n+': '+e.message+' | '}}
 console.log(`key ${i+1} (${k.slice(0,5)}...${k.slice(-3)}): ${line}`)}
console.log(ok+'/'+ks.length+' keys work')})();
