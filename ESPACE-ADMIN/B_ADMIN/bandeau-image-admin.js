(() => {
  'use strict';
  const cfg=window.SITE_CONFIG||{};
  const api=String(cfg.workerEditingAdminUrl||cfg.WORKER_EDITING_ADMIN_URL||window.ADMIN_CONFIG?.API_EDITING_ADMIN||'').replace(/\/+$/,'');
  const $=s=>document.querySelector(s),liste=$('[data-bandeau-liste]'),commandes=$('[data-bandeau-commandes]');
  const ajout=$('[data-bandeau-ajouter]'),remplacement=$('[data-bandeau-remplacer]'),attente=$('[data-bandeau-attente]');
  const preview=$('[data-bandeau-preview]'),previewWrap=$('[data-bandeau-preview-wrap]');
  let images=[],ordre=[],revision='',busy=false,replaceId=null,confirmed=false;
  const saveBandeau=$('[data-bandeau-save]'),saveResult=$('[data-bandeau-save-result]');
  function retourBandeau(message,etat=''){saveResult.textContent=message;saveResult.dataset.state=etat;saveResult.hidden=!message;}
  const preuves=new Map(),vignettes=new Map(),chargements=new Map(),brouillons=new Map(),pending=[];
  const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const status=(msg,etat='')=>{const p=$('[data-bandeau-status]');p.textContent=msg;p.dataset.state=etat;};
  const chemin=i=>'OBJET/IMAG/BANDEAU-IMAGE/IMAG_'+(i+1)+'.webp';
  const shaValide=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
  async function shaBlob(file){
    const buffer=await file.arrayBuffer(),prefix=new TextEncoder().encode('blob '+buffer.byteLength+'\0');
    const bytes=new Uint8Array(prefix.length+buffer.byteLength);bytes.set(prefix);bytes.set(new Uint8Array(buffer),prefix.length);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function appel(form){
    if(!api)throw Error('Service d’édition non configuré.');
    const r=await fetch(api+'/admin/bandeau-image',{method:form?'POST':'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'},body:form||undefined});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.success)throw Error(d?.message||'Service du bandeau image indisponible (HTTP '+r.status+').');
    if(!Array.isArray(d.images)||!d.revision||!Array.isArray(d.verification))throw Error('Le worker doit être remplacé par la version de vérification du bandeau image.');
    if(d.verification.length!==d.images.length||d.images.some((im,i)=>d.verification[i]?.id!==im.id||d.verification[i]?.chemin!==chemin(i)||!shaValide(d.verification[i]?.sha)))throw Error('Les preuves GitHub sont incomplètes.');
    return d;
  }
  function appliquer(d){
    const courant=new Set(d.images.map(im=>im.id));
    ordre=ordre.filter(id=>courant.has(id));
    for(const im of d.images)if(!ordre.includes(im.id))ordre.push(im.id);
    images=d.images;revision=d.revision;confirmed=true;
    preuves.clear();d.verification.forEach(p=>preuves.set(p.id,p.sha));
    for(const [id,v] of vignettes)if(preuves.get(id)!==v.sha){URL.revokeObjectURL(v.url);vignettes.delete(id);}
    for(const id of brouillons.keys())if(!preuves.has(id))brouillons.delete(id);
  }
  function listeOrdonnee(){const map=new Map(images.map(im=>[im.id,im]));return ordre.map(id=>map.get(id)).filter(Boolean);}
  function ordreModifie(){return ordre.join('|')!==images.map(im=>im.id).join('|');}
  function texteModifie(){return images.some(im=>brouillons.has(im.id)&&brouillons.get(im.id).trim()!==im.alt);}
  function imageUrl(id){const v=vignettes.get(id);return v?.sha===preuves.get(id)?v.url:'';}
  function setVignette(id,sha,blob){
    const previous=vignettes.get(id);
    if(previous)URL.revokeObjectURL(previous.url);
    vignettes.set(id,{sha,url:URL.createObjectURL(blob)});
  }
  async function chargerVignette(id){
    const sha=preuves.get(id);if(!sha||imageUrl(id))return;
    const key=id+':'+sha;if(chargements.has(key))return chargements.get(key);
    const charge=(async()=>{
      const r=await fetch(api+'/admin/bandeau-image/image/'+encodeURIComponent(id),{credentials:'include',cache:'no-store'});
      if(!r.ok)throw Error('Vignette indisponible (HTTP '+r.status+').');
      const blob=await r.blob();
      if(await shaBlob(blob)!==sha)throw Error('Le contenu de la vignette a changé.');
      if(preuves.get(id)===sha)setVignette(id,sha,blob);
    })();
    chargements.set(key,charge);try{await charge;}finally{chargements.delete(key);}
  }
  let cycle=0;
  async function chargerVignettes(){
    const run=++cycle,ids=images.map(im=>im.id);let cursor=0,failures=new Set();
    await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
      while(run===cycle&&cursor<ids.length){
        const id=ids[cursor++];
        try{await chargerVignette(id);}catch(e){failures.add(id);console.warn(e);}
        if(run===cycle)actualiserMiniature(id,failures.has(id));
      }
    }));
    if(run===cycle)actualiserPreview();
  }
  function actualiserMiniature(id,failed=false){
    const row=[...liste.children].find(e=>e.dataset.imageId===id);if(!row)return;
    const img=row.querySelector('img'),message=row.querySelector('[data-vignette-message]'),source=imageUrl(id);
    if(source){if(img.src!==source)img.src=source;img.hidden=false;message.hidden=true;}
    else{img.hidden=true;message.hidden=false;message.textContent=failed?'Vignette indisponible':'Chargement…';}
  }
  function actualiserPreview(){
    const source=listeOrdonnee().map(im=>({src:imageUrl(im.id),alt:brouillons.get(im.id)??im.alt})).filter(im=>im.src);
    previewWrap.hidden=!source.length;
    if(window.LCDP_BANDEAU_IMAGE){preview.classList.remove('lcdp-bandeau-preview-secours');window.LCDP_BANDEAU_IMAGE.rendre(preview,source);}
    else{preview.replaceChildren();preview.hidden=!source.length;preview.classList.add('lcdp-bandeau-preview-secours');for(const im of source){const img=el('img');img.src=im.src;img.alt=im.alt;preview.append(img);}}
  }
  function correspond(d,next,shaAttendus){
    return d.images.length===next.length&&next.every((im,i)=>d.images[i]?.id===im.id&&d.images[i]?.alt===im.alt.trim()&&d.verification[i]?.sha===shaAttendus.get(im.id)&&d.verification[i]?.chemin===chemin(i));
  }
  async function enregistrer(next,item=null){
    next=next.map(im=>({id:im.id,alt:im.alt.trim()}));
    const attendus=new Map(next.map(im=>[im.id,preuves.get(im.id)]));
    if(item)attendus.set(item.id,item.sha);
    const form=new FormData();form.set('inventaire',JSON.stringify({revision,images:next}));
    if(item)form.set('image:'+item.id,item.file,item.file.name||'image.webp');
    let result=null,erreur=null;
    try{
      const d=await appel(form);
      if(!correspond(d,next,attendus))throw Error('Le contenu retourné ne correspond pas à l’enregistrement demandé.');
      result=await appel();
      if(!correspond(result,next,attendus))throw Error('La relecture GitHub ne correspond pas à l’enregistrement demandé.');
    }catch(e){
      erreur=e;
      // Une réponse perdue après le commit ne doit pas entraîner un doublon.
      try{result=await appel();}catch(_){confirmed=false;throw Error(e.message+' État GitHub non confirmé : recharge la page avant toute autre modification.');}
      if(!correspond(result,next,attendus)){
        appliquer(result);rendre();throw Error(e.message);
      }
    }
    appliquer(result);
    if(item)setVignette(item.id,item.sha,item.file);
    return erreur?'Enregistrement retrouvé et vérifié dans GitHub.':'Enregistrement vérifié dans GitHub.';
  }
  const LARGEUR=1672,HAUTEUR=941;
  function gabarit(w,h){
    if(!w||!h)throw Error('Dimensions de l’image invalides.');
    const ratio=LARGEUR/HAUTEUR,compatible=Math.abs(w/h/ratio-1)<=0.002;
    const sw=Math.min(w,h*ratio),sh=Math.min(h,w/ratio);
    return {compatible,sw,sh,sx:(w-sw)/2,sy:(h-sh)/2};
  }
  async function preparer(file,id,recadrage=false){
    if(!file.size)throw Error('Le fichier est vide.');
    const nom=file.name;
    if(!/\.(jpe?g|png|webp)$/i.test(nom)&&!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choisis une image JPG, PNG ou WebP.');
    const originalUrl=URL.createObjectURL(file);
    let url='',garderOriginal=false;
    try{
      const img=new Image();img.src=originalUrl;await img.decode();
      const w=img.naturalWidth,h=img.naturalHeight,g=gabarit(w,h);
      const remplacer=images.some(im=>im.id===id);
      if(!g.compatible&&!recadrage){
        garderOriginal=true;
        return {id,file,nom,url:originalUrl,replace:remplacer,recadrage:true,error:'Format '+w+' × '+h+' px : recadrage centré à 1672 × 941 px à confirmer.'};
      }
      if(file.type!=='image/webp'||w!==LARGEUR||h!==HAUTEUR){
        const canvas=document.createElement('canvas');canvas.width=LARGEUR;canvas.height=HAUTEUR;
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('Conversion indisponible.');
        ctx.imageSmoothingQuality='high';
        ctx.drawImage(img,g.sx,g.sy,g.sw,g.sh,0,0,LARGEUR,HAUTEUR);
        const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b&&b.type==='image/webp'?resolve(b):reject(Error('Conversion WebP impossible.')),'image/webp',0.9));
        file=new File([blob],nom.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
      }
      if(file.size>15*1024*1024)throw Error('L’image WebP dépasse la limite technique de 15 Mo.');
      url=URL.createObjectURL(file);
      return {id,file,sha:await shaBlob(file),url,nom,error:'',replace:remplacer};
    }catch(e){if(url)URL.revokeObjectURL(url);throw e;}
    finally{if(!garderOriginal)URL.revokeObjectURL(originalUrl);}
  }
  async function validerRecadrage(item){
    if(busy||!confirmed)return;
    busy=true;commandes.disabled=true;
    let nouveau;
    try{
      nouveau=await preparer(item.file,item.id,true);
      retirerAttente(item);pending.push(nouveau);
    }catch(e){item.error=e.message;status(e.message,'error');}
    finally{busy=false;commandes.disabled=!confirmed;afficherAttente();}
    if(nouveau)await traiter([nouveau]);
  }
  function afficherAttente(){
    attente.hidden=!pending.length;attente.replaceChildren();
    if(!pending.length)return;
    attente.append(el('h2','Images à traiter','lcdp-editeur-contenu__label'));
    for(const item of pending){
      const row=el('section',undefined,'lcdp-editeur-contenu__bloc lcdp-bandeau-admin-image');
      if(!item.url)row.classList.add('lcdp-bandeau-admin-sans-image');
      if(item.url){const img=el('img',undefined,'lcdp-bandeau-admin-miniature');img.src=item.url;img.alt='';row.append(img);}
      const info=el('div',undefined,'lcdp-bandeau-admin-info');info.append(el('strong',item.nom),el('p',item.error||'En attente d’enregistrement…','lcdp-bandeau-admin-erreur'));
      const actions=el('div',undefined,'lcdp-bandeau-admin-actions');
      if(item.recadrage)actions.append(bouton('Recadrer au centre et ajouter',()=>validerRecadrage(item),false));
      else if(item.sha)actions.append(bouton('Réessayer',()=>traiter([item]),false));
      actions.append(bouton('Retirer',()=>{retirerAttente(item);afficherAttente();},false));
      info.append(actions);row.append(info);attente.append(row);
    }
  }
  function retirerAttente(item){const i=pending.indexOf(item);if(i>=0)pending.splice(i,1);if(item.url)URL.revokeObjectURL(item.url);}
  async function operation(fn){
    if(busy||!confirmed)return;
    busy=true;commandes.disabled=true;
    try{await fn();}catch(e){status(e.message,'error');}
    finally{busy=false;commandes.disabled=!confirmed;rendre();}
  }
  async function traiter(items){
    await operation(async()=>{
      let ok=0,fail=0,aRecadrer=0;
      for(const item of items){
        if(!confirmed)break;
        if(!item.sha){if(item.recadrage)aRecadrer++;else fail++;continue;}
        try{
          item.error='';afficherAttente();status('Enregistrement de '+item.nom+'…');
          if(item.replace&&!images.some(im=>im.id===item.id))throw Error('L’image à remplacer n’existe plus.');
          const next=item.replace?images:[...images,{id:item.id,alt:''}];
          await enregistrer(next,item);retirerAttente(item);ok++;rendre();status(item.nom+' : image enregistrée et vérifiée.','success');
        }catch(e){item.error=e.message;fail++;afficherAttente();}
      }
      if(!confirmed){status('État GitHub non confirmé. Recharge la page avant toute autre modification.','error');return;}
      status(ok+' image'+(ok===1?'':'s')+' enregistrée'+(ok===1?'':'s')+' et vérifiée'+(ok===1?'':'s')+(aRecadrer?' · '+aRecadrer+' recadrage(s) à confirmer':'')+(fail?' · '+fail+' échec(s), voir le détail ci-dessous.':'.'),fail?'error':aRecadrer?'':'success');
    });
  }
  async function selection(files,id=null){
    if(busy||!confirmed||!files.length)return;
    const items=[];
    // La validation et la préparation se font fichier par fichier : un rejet ne bloque pas les autres.
    busy=true;commandes.disabled=true;
    try{
      for(const file of files){
        try{const item=await preparer(file,id||crypto.randomUUID());pending.push(item);items.push(item);}
        catch(e){const rejet={nom:file.name,error:e.message};pending.push(rejet);items.push(rejet);}
        afficherAttente();
      }
    }finally{busy=false;commandes.disabled=!confirmed;}
    await traiter(items);
  }
  async function fragment(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-cache'});if(!r.ok)throw Error('Composant admin indisponible.');const t=document.createElement('template');t.innerHTML=await r.text();return t.content;}
  async function confirmerSuppression(titre){
    const slot=document.getElementById('lcdp-lightbox-slot');
    if(!slot)throw Error('Confirmation indisponible. Aucune image supprimée.');
    const avant=document.activeElement;
    try{
      const href=window.LCDP_urlObjet('/CSSBASE/lcdp-lightbox-convergence.css');
      if(!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l=>l.href===new URL(href,document.baseURI).href)){
        await new Promise((resolve,reject)=>{
          const feuille=document.createElement('link');
          feuille.rel='stylesheet';feuille.href=href;
          feuille.onload=resolve;
          feuille.onerror=()=>{feuille.remove();reject(Error('CSS SUPPRESSION indisponible.'));};
          document.head.appendChild(feuille);
        });
      }
      slot.replaceChildren(await fragment(window.LCDP_urlObjet('/HTMLBASE/02-dialogue-reference-suppression.html')));
      const box=slot.querySelector('[data-lcdp-dialogue-reference="suppression"]');
      const heading=slot.querySelector('[data-lcdp-dialogue-titre]');
      const texte=slot.querySelector('[data-lcdp-dialogue-message]');
      const non=slot.querySelector('[data-lcdp-dialogue-action="conserver"]');
      const oui=slot.querySelector('[data-lcdp-dialogue-action="supprimer"]');
      if(!box||!heading||!texte||!non||!oui)throw Error('Confirmation indisponible. Aucune image supprimée.');
      heading.textContent='Supprimer cette image ?';
      texte.textContent='Supprimer « '+titre+' » ? Cette image est supprimée du bandeau GitHub après confirmation.';
      non.textContent='Non';oui.textContent='Oui';
      return await new Promise(resolve=>{
        let termine=false;
        const finir=v=>{
          if(termine)return;
          termine=true;
          document.removeEventListener('keydown',clavier);
          slot.replaceChildren();
          if(avant?.isConnected&&typeof avant.focus==='function')avant.focus({preventScroll:true});
          resolve(v);
        };
        const clavier=e=>{
          if(e.key==='Escape'){e.preventDefault();finir(false);}
          if(e.key==='Tab'){
            if(e.shiftKey&&document.activeElement===non){e.preventDefault();oui.focus();}
            else if(!e.shiftKey&&document.activeElement===oui){e.preventDefault();non.focus();}
          }
        };
        document.addEventListener('keydown',clavier);
        non.addEventListener('click',()=>finir(false),{once:true});
        oui.addEventListener('click',()=>finir(true),{once:true});
        box.addEventListener('click',e=>{if(e.target===box)finir(false);});
        non.focus();
      });
    }catch(error){
      slot.replaceChildren();
      if(avant?.isConnected&&typeof avant.focus==='function')avant.focus({preventScroll:true});
      throw error;
    }
  }


  function bouton(texte,action,disabled=false,aria='',primary=false){
    const b=el('button',texte,'lcdp-button '+(primary?'lcdp-button-orange':'lcdp-button-secondary')+' lcdp-bandeau-admin-bouton');b.type='button';b.disabled=disabled;
    if(aria)b.setAttribute('aria-label',aria);
    b.onclick=()=>{if(!busy)Promise.resolve(action()).catch(e=>status(e.message,'error'));};return b;
  }
  function modifierOrdre(id,delta){
    const i=ordre.indexOf(id),k=i+delta;
    if(busy||!confirmed||i<0||k<0||k>=ordre.length)return;
    [ordre[i],ordre[k]]=[ordre[k],ordre[i]];
    rendre();
    const row=[...liste.children].find(el=>el.dataset.imageId===id);
    const direction=delta<0?'monter':'descendre';
    const action=row?.querySelector('[data-bandeau-ordre="'+direction+'"]');
    const autre=row?.querySelector('[data-bandeau-ordre="'+(delta<0?'descendre':'monter')+'"]');
    (action&&!action.disabled?action:autre)?.focus({preventScroll:true});
    row?.scrollIntoView({block:'nearest',inline:'nearest'});
    const message=ordreModifie()?'Image déplacée en position '+(k+1)+'. Enregistre le bandeau.':'Ordre enregistré.';
    status(message);retourBandeau(message);
  }
  saveBandeau.addEventListener('click',async()=>{
    if(busy||!confirmed)return;
    const next=listeOrdonnee().map(im=>({...im,alt:(brouillons.get(im.id)??im.alt).trim()}));
    const modifie=ordreModifie()||texteModifie();
    busy=true;commandes.disabled=true;saveBandeau.disabled=true;
    saveBandeau.textContent=modifie?'Enregistrement…':'Vérification…';
    status(modifie?'Enregistrement du bandeau…':'Vérification du bandeau…');
    retourBandeau(modifie?'Enregistrement du bandeau…':'Vérification du bandeau…');
    try{
      if(modifie){
        await enregistrer(next);
      }else{
        const d=await appel();
        if(!correspond(d,next,preuves)){
          appliquer(d);
          ordre=images.map(im=>im.id);
          throw Error('Le bandeau a changé dans GitHub. La liste est actualisée.');
        }
        appliquer(d);
      }
      ordre=images.map(im=>im.id);brouillons.clear();
      const message=modifie?'Bandeau enregistré et vérifié dans GitHub.':'Aucune modification : le bandeau est déjà enregistré dans GitHub.';
      retourBandeau(message,'success');status(message,'success');
    }catch(e){
      const message=e?.message||'Enregistrement non confirmé.';
      retourBandeau(message,'error');status(message,'error');
    }finally{
      busy=false;commandes.disabled=!confirmed;saveBandeau.textContent='Enregistrer le bandeau';rendre();
    }
  });
  function supprimer(im,i){
    return operation(async()=>{
      if(await confirmerSuppression('IMAG_'+(images.findIndex(x=>x.id===im.id)+1)+'.webp')){
        status('Suppression de l’image…');status(await enregistrer(images.filter(x=>x.id!==im.id)),'success');brouillons.delete(im.id);
      }
    });
  }
  function rendre(){
    saveBandeau.disabled=busy||!confirmed;
    liste.replaceChildren();$('[data-bandeau-compteur]').textContent=images.length+' image'+(images.length===1?'':'s')+' enregistrée'+(images.length===1?'':'s')+(images.length<8?' · bandeau public masqué':' · bandeau public actif');
    if(!images.length)liste.append(el('p','Aucune image enregistrée. Utilise le bouton Ajouter des images.','lcdp-editeur-contenu__aide'));
    listeOrdonnee().forEach((im,i)=>{
      const box=el('section',undefined,'lcdp-editeur-contenu__bloc lcdp-bandeau-admin-image');box.dataset.imageId=im.id;
      const visuel=el('div',undefined,'lcdp-bandeau-admin-visuel'),img=el('img',undefined,'lcdp-bandeau-admin-miniature');img.alt=im.alt;img.hidden=true;
      const placeholder=el('span','Chargement…','lcdp-bandeau-admin-placeholder');placeholder.dataset.vignetteMessage='';visuel.append(img,placeholder);
      const info=el('div',undefined,'lcdp-bandeau-admin-info');
      const titre=el('div',undefined,'lcdp-bandeau-admin-entete-image');
      titre.append(el('h2','Position '+(i+1)+' · IMAG_'+(images.findIndex(x=>x.id===im.id)+1)+'.webp','lcdp-bandeau-admin-nom'),el('span','Image enregistrée ✓','lcdp-bandeau-admin-confirme'));info.append(titre);
      const label=el('label',undefined,'lcdp-editeur-contenu__titre-zone'),input=el('input',undefined,'lcdp-editeur-contenu__titre');input.type='text';input.value=brouillons.get(im.id)??im.alt;
      label.append(el('span','Texte alternatif (facultatif)','lcdp-editeur-contenu__label'),input);
      const actions=el('div',undefined,'lcdp-bandeau-admin-actions');
      input.oninput=()=>{brouillons.set(im.id,input.value);saveBandeau.disabled=busy||!confirmed;status('Modifications non enregistrées.');retourBandeau('Modifications non enregistrées.');};
      const monter=bouton('↑ Monter',()=>modifierOrdre(im.id,-1),i===0,'Monter l’image');
      const descendre=bouton('↓ Descendre',()=>modifierOrdre(im.id,1),i===ordre.length-1,'Descendre l’image');
      monter.dataset.bandeauOrdre='monter';descendre.dataset.bandeauOrdre='descendre';
      actions.append(monter,descendre,bouton('Remplacer',()=>{replaceId=im.id;remplacement.value='';remplacement.click();}),bouton('Supprimer',()=>supprimer(im,i)));
      info.append(label,actions);box.append(visuel,info);liste.append(box);actualiserMiniature(im.id);
    });
    afficherAttente();actualiserPreview();chargerVignettes();
  }
  ajout.addEventListener('change',()=>{const files=[...ajout.files];ajout.value='';selection(files).catch(e=>status(e.message,'error'));});
  remplacement.addEventListener('change',()=>{const id=replaceId,files=[...remplacement.files].slice(0,1);remplacement.value='';replaceId=null;if(id)selection(files,id).catch(e=>status(e.message,'error'));});
  window.addEventListener('beforeunload',e=>{if(busy||pending.length||ordreModifie()||texteModifie()){e.preventDefault();e.returnValue='';}});
  function chargerPreview(){return new Promise(resolve=>{const script=el('script');script.src=window.LCDP_urlObjet('/JSBASE/bandeau-image.js');script.onload=script.onerror=()=>resolve();document.head.append(script);});}
  async function init(){
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
    await Promise.all([
      fragment(window.LCDP_urlAdmin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html')).then(f=>{const slot=document.getElementById('lcdp-bandeau-slot');slot.replaceChildren(f);slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=e.dataset.space==='admin'?window.LCDP_urlAdmin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));slot.querySelectorAll('[data-site-src]').forEach(e=>{const chemin=String(e.dataset.siteSrc||'').replace(/^\/?OBJET\/?/,'/');e.setAttribute('src',window.LCDP_urlObjet(chemin));});}),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'admin'})
    ]);

    document.getElementById('lcdp-main-admin').hidden=false;
    const [d]=await Promise.all([appel(),chargerPreview()]);appliquer(d);rendre();commandes.disabled=false;status('');
  }
  init().catch(e=>{document.getElementById('lcdp-main-admin').hidden=false;status(e.message,'error');});
})();
