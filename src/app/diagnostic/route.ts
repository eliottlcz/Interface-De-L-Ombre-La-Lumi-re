import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Page de test publique : chronomètre, depuis le navigateur, les étapes qui précèdent l'affichage de l'application. Aucune donnée affichée. */
const HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Diagnostic</title>
<style>body{margin:0;background:#000;color:#f4efe0;font:17px/1.5 system-ui,sans-serif;padding:20px}h1{font-size:22px}li{margin:10px 0;list-style:none;padding:10px 12px;border:1px solid #333;border-radius:10px;background:#111}b.ok{color:#7ddc8a}b.ko{color:#ff7b6b}b.wait{color:#dfc662}small{color:#aaa;display:block}button{height:46px;padding:0 22px;border:0;border-radius:99px;background:#dfc662;color:#000;font-weight:700;font-size:16px}</style></head><body>
<h1>Diagnostic du QG</h1><p>Appuyez sur le bouton et attendez la fin (30 s max). Puis faites une capture d'écran.</p>
<button id="go">Lancer le test</button><ul id="out" style="padding:0;margin-top:16px"></ul>
<script>
const out=document.getElementById("out");
function line(t){const li=document.createElement("li");li.innerHTML="<b class=wait>…</b> "+t+"<small></small>";out.appendChild(li);return li}
function done(li,ok,txt){li.querySelector("b").className=ok?"ok":"ko";li.querySelector("b").textContent=ok?"OK":"ÉCHEC";li.querySelector("small").textContent=txt}
async function test(titre,url,opt={},max=20000){
  const li=line(titre);const t=performance.now();const c=new AbortController();const to=setTimeout(()=>c.abort(),max);
  try{const r=await fetch(url,{...opt,signal:c.signal,cache:"no-store",credentials:"include",redirect:"follow"});const t1=performance.now();const buf=await r.arrayBuffer();const t2=performance.now();
    done(li,r.ok||r.status===401,"HTTP "+r.status+" · premier octet "+Math.round(t1-t)+" ms · total "+Math.round(t2-t)+" ms · "+Math.round(buf.byteLength/1024)+" Ko");}
  catch(e){done(li,false,(e&&e.name==="AbortError"?"Aucune réponse après "+(max/1000)+" s":"Erreur : "+(e&&e.message))+" ("+Math.round(performance.now()-t)+" ms)");}
  finally{clearTimeout(to)}
}
document.getElementById("go").onclick=async()=>{
  out.innerHTML="";
  await test("1. Santé du serveur et de la base","/api/sante");
  await test("2. Page de connexion","/connexion");
  await test("3. Tableau de bord (page complète, avec votre session si connecté)","/");
  await test("4. Tableau de bord (données de navigation interne)","/",{headers:{RSC:"1"}});
  await test("5. Mes missions","/missions");
  await test("6. Synchronisation (compteur de modifications)","/api/sync");
  const f=line("Fin du test");done(f,true,"Navigateur : "+navigator.userAgent.slice(0,90));
};
</script></body></html>`;

export async function GET() {
  return new NextResponse(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
