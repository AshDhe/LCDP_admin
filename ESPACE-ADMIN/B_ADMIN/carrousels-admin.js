(() => {
  'use strict';
  const cfg=window.SITE_CONFIG||{};
  const api=String(cfg.workerEditingAdminUrl||cfg.WORKER_EDITING_ADMIN_URL||window.ADMIN_CONFIG?.API_EDITING_ADMIN||'').replace(/\/+$/,'');
  const $=s=>document.querySelector(s), liste=$('[data-carrousels-liste]'), commandes=$('[data-carrousels-commandes]'), editeur=$('[data-carrousels-editeur]');
  let carrousels=[], version='', revision='', selected=null, previewIndex=0, dirty=false, busy=false;
  const fichiers=new Map(), originaux=new Map(), preuves=new Map(), charges=new Map();
  let enregistre=[], generation=0;
  const copie=v=>JSON.parse(JSON.stringify(v));
  const normalise=v=>v.map(c=>({id:c.id,nom:c.nom.trim(),dossier:c.dossier,titre:c.titre.trim(),images:c.images.map(im=>({id:im.id,titre:im.titre.trim(),legende:im.legende.trim(),alt:im.alt.trim()}))}));
  const chemin=(c,i)=>'OBJET'+path(c,i);
  const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const status=(text,etat='')=>{const p=$('[data-carrousels-status]');p.textContent=text;p.dataset.state=etat;const q=$('[data-carrousels-resultat]');q.textContent=text;q.dataset.state=etat;q.hidden=!text;};
  const modifier=()=>{dirty=true;status('Modifications non enregistrées.','dirty');};
  const id=()=>crypto.randomUUID();
  const path=(c,i)=>'/IMAG/CARROUSEL/'+c.dossier+'/IMAG_'+(i+1)+'.webp';
  const urlImage=im=>fichiers.get(im.id)?.url||originaux.get(im.id)?.url||'';
  const selectedCarrousel=()=>carrousels.find(c=>c.id===selected);
  const move=(arr,i,delta)=>{const j=i+delta;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];modifier();rendre();};
  function clearFile(id){const f=fichiers.get(id);if(f)URL.revokeObjectURL(f.url);fichiers.delete(id);}
  async function shaBlob(file){
    const buffer=await file.arrayBuffer(),prefix=new TextEncoder().encode('blob '+buffer.byteLength+'\0');
    const bytes=new Uint8Array(prefix.length+buffer.byteLength);bytes.set(prefix);bytes.set(new Uint8Array(buffer),prefix.length);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  }
  function memoriser(id,sha,file){
    const old=originaux.get(id);if(old)URL.revokeObjectURL(old.url);
    originaux.set(id,{sha,url:URL.createObjectURL(file)});
  }
  function appliquer(d){
    enregistre=copie(d.carrousels);version=d.version;revision=d.revision;
    preuves.clear();d.verification.forEach(p=>preuves.set(p.id,p.sha));
    for(const [id,v] of originaux)if(preuves.get(id)!==v.sha){URL.revokeObjectURL(v.url);originaux.delete(id);}
  }
  function hydrate(d){
    appliquer(d);carrousels=copie(enregistre);
    for(const k of [...fichiers.keys()])clearFile(k);
    if(!selectedCarrousel())selected=null;
    previewIndex=0;dirty=false;
  }
  function actualiserDirty(){dirty=fichiers.size>0||JSON.stringify(normalise(carrousels))!==JSON.stringify(enregistre);}
  async function chargerImage(id){
    const sha=preuves.get(id);if(!sha||originaux.get(id)?.sha===sha)return;
    const key=id+':'+sha;if(charges.has(key))return charges.get(key);
    const task=(async()=>{
      const r=await fetch(api+'/admin/carrousels/image/'+encodeURIComponent(id),{credentials:'include',cache:'no-store'});
      if(!r.ok)throw Error('Image indisponible (HTTP '+r.status+').');
      const file=await r.blob();if(await shaBlob(file)!==sha)throw Error('Intégrité de l’image non confirmée.');
      if(preuves.get(id)===sha)memoriser(id,sha,file);
    })();
    charges.set(key,task);try{await task;}finally{charges.delete(key);}
  }
  async function chargerVignettes(){
    const c=selectedCarrousel(),run=++generation;
    if(!c)return;
    const ids=c.images.filter(im=>!fichiers.has(im.id)).map(im=>im.id);
    let i=0;
    await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
      while(run===generation&&i<ids.length){
        const id=ids[i++];
        let erreur=false;try{await chargerImage(id);}catch(e){erreur=true;console.warn(e);}
        if(run!==generation)continue;
        const row=[...editeur.querySelectorAll('[data-carrousel-image-id]')].find(el=>el.dataset.carrouselImageId===id);
        const img=row?.querySelector('img'),label=row?.querySelector('[data-image-message]'),im=c.images.find(x=>x.id===id);
        if(img&&im&&urlImage(im)){img.src=urlImage(im);img.hidden=false;if(label)label.hidden=true;}
        else if(label&&erreur){label.textContent='Image non chargée';}
      }
    }));
    if(run===generation)actualiserPreview();
  }
  async function appel(form){
    if(!api)throw Error('Service d’édition non configuré.');
    const r=await fetch(api+'/admin/carrousels',{method:form?'POST':'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'},body:form||undefined});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.success){
      if(r.status===404)throw Error('Le worker w-editing-admin doit être mis à jour pour activer les carrousels.');
      throw Error((d?.message||'Service carrousels indisponible.')+(d?.detail?' '+d.detail:''));
    }
    if(!Array.isArray(d.carrousels)||!Array.isArray(d.verification)||!d.revision||!d.version)throw Error('Le worker doit être mis à jour pour vérifier les uploads de carrousels.');
    const expected=d.carrousels.flatMap(c=>c.images.map((im,i)=>({id:im.id,chemin:chemin(c,i)})));
    if(expected.length!==d.verification.length||expected.some((e,i)=>d.verification[i]?.id!==e.id||d.verification[i]?.chemin!==e.chemin||!/^[a-f0-9]{40}$/.test(d.verification[i]?.sha||'')))throw Error('Vérification GitHub incomplète.');
    return d;
  }
  async function fragment(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-cache'});if(!r.ok)throw Error('Composant admin indisponible.');const t=document.createElement('template');t.innerHTML=await r.text();return t.content;}
  async function confirmerSuppression(titre,type){
    const slot=document.getElementById('lcdp-lightbox-slot');
    if(!slot)throw Error('Confirmation indisponible. Aucun élément supprimé.');
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
      if(!box||!heading||!texte||!non||!oui)throw Error('Confirmation indisponible. Aucun élément supprimé.');
      heading.textContent='Supprimer '+type+' ?';
      texte.textContent='Supprimer « '+titre+' » ? La suppression dans GitHub prend effet à l’enregistrement.';
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

  function bouton(label,action,{disabled=false,primary=false,aria=''}={}){
    const b=element('button',label,'lcdp-button '+(primary?'lcdp-button-orange':'lcdp-button-secondary')+' lcdp-editeur-contenu__petit-bouton');
    b.type='button';b.disabled=disabled;if(aria)b.setAttribute('aria-label',aria);
    b.onclick=()=>{if(!busy)Promise.resolve(action()).catch(e=>status(e.message,'error'));};return b;
  }
  function champ(label,value,max,change,required=false){
    const wrap=element('label',undefined,'lcdp-editeur-contenu__titre-zone');
    const t=element('span',label,'lcdp-editeur-contenu__label'),i=element('input',undefined,'lcdp-editeur-contenu__titre');
    i.type='text';i.maxLength=max;i.required=required;i.value=value;
    i.oninput=()=>{change(i.value);modifier();actualiserPreview();};
    wrap.append(t,i);return wrap;
  }
  async function supprimer(label,type,action){
    if(busy)return;busy=true;commandes.disabled=true;
    try{if(await confirmerSuppression(label,type)){action();modifier();rendre();}}
    finally{busy=false;commandes.disabled=false;}
  }
  function ordre(arr,i,nom){
    const box=element('div',undefined,'lcdp-editeur-contenu__ordre');
    box.append(bouton('↑',()=>move(arr,i,-1),{disabled:i===0,aria:'Monter '+nom}),bouton('↓',()=>move(arr,i,1),{disabled:i===arr.length-1,aria:'Descendre '+nom}));
    return box;
  }
  function rendreListe(){
    liste.replaceChildren();
    if(!carrousels.length)liste.append(element('p','Aucun carrousel.','lcdp-editeur-contenu__aide'));
    carrousels.forEach((c,i)=>{
      const box=element('section',undefined,'lcdp-editeur-contenu__bloc');
      if(selected===c.id)box.classList.add('lcdp-carrousel-selected');
      const entete=element('div',undefined,'lcdp-carrousel-entete'),infos=element('div',undefined,'lcdp-carrousel-infos');
      infos.append(element('h2',c.nom||'Nouveau carrousel','lcdp-carrousel-nom'),element('p','OBJET/IMAG/CARROUSEL/'+(c.dossier||'…')+'/','lcdp-editeur-contenu__aide'));
      const actions=ordre(carrousels,i,'le carrousel '+(c.nom||''));
      actions.append(bouton('Modifier',()=>{selected=c.id;previewIndex=0;rendre();editeur.scrollIntoView({block:'start',behavior:'smooth'});}),bouton('Supprimer',()=>supprimer(c.nom||'Nouveau carrousel','ce carrousel',()=>{c.images.forEach(im=>clearFile(im.id));carrousels=carrousels.filter(x=>x.id!==c.id);if(selected===c.id)selected=null;})));
      entete.append(infos,actions);box.append(entete);liste.append(box);
    });
  }
  async function verifierFichier(file){
    if(!file||file.type!=='image/webp'||!file.size||file.size>15*1024*1024)throw Error('Choisis une image WebP de 15 Mo maximum.');
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;
      await img.decode();
      if(img.naturalWidth!==1672||img.naturalHeight!==941)throw Error('Dimensions requises : 1672 × 941 pixels.');
      return {file,url,sha:await shaBlob(file)};
    }catch(e){URL.revokeObjectURL(url);throw e;}
  }
  function valider(next){
    const dossiers=new Set();
    for(const c of next){
      if(!c.nom.trim())throw Error('Le nom de chaque carrousel est obligatoire.');
      if(!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(c.dossier)||dossiers.has(c.dossier))throw Error('Nom de dossier invalide ou déjà utilisé : '+c.dossier);
      dossiers.add(c.dossier);
      if(!c.images.length)throw Error('Ajoute au moins une image au carrousel « '+c.nom+' ».');
    }
  }
  function correspond(d,next,attendus){
    return JSON.stringify(d.carrousels)===JSON.stringify(next)&&d.verification.length===attendus.size&&d.verification.every(p=>attendus.get(p.id)===p.sha);
  }
  async function persister(next,uploads){
    next=normalise(next);valider(next);
    const total=[...uploads.values()].reduce((sum,f)=>sum+f.file.size,0);
    if(total>30*1024*1024)throw Error('Maximum 30 Mo de nouvelles images par enregistrement.');
    const attendus=new Map();
    for(const c of next)for(const im of c.images){
      const sha=uploads.get(im.id)?.sha||preuves.get(im.id);
      if(!sha)throw Error('Image en attente d’upload : '+im.id);
      attendus.set(im.id,sha);
    }
    const form=new FormData();form.set('inventaire',JSON.stringify({version,revision,carrousels:next}));
    for(const [key,f] of uploads)form.append('image:'+key,f.file,f.file.name);
    let d,err;
    try{
      d=await appel(form);
      if(!correspond(d,next,attendus))throw Error('La réponse GitHub ne correspond pas aux fichiers envoyés.');
      d=await appel();
      if(!correspond(d,next,attendus))throw Error('Les images relues ne correspondent pas aux fichiers envoyés.');
    }catch(e){
      err=e;
      try{d=await appel();}catch(_){throw Error(e.message+' Enregistrement non confirmé : les fichiers restent en attente.');}
      if(!correspond(d,next,attendus))throw Error(e.message+' Enregistrement non confirmé : les fichiers restent en attente.');
    }
    appliquer(d);
    for(const [id,f] of uploads){memoriser(id,f.sha,f.file);if(fichiers.get(id)===f)clearFile(id);}
    return err?'Enregistrement retrouvé et vérifié dans GitHub.':'Enregistrement vérifié dans GitHub.';
  }
  async function uploadIndividuel(c,im){
    const upload=fichiers.get(im.id);if(!upload)return;
    const next=copie(enregistre);
    let cible=next.find(x=>x.id===c.id);
    if(!cible){
      if(!c.nom.trim()||!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(c.dossier))throw Error('Renseigne le nom et le dossier GitHub avant d’ajouter une image.');
      cible={id:c.id,nom:c.nom,dossier:c.dossier,titre:c.titre,images:[]};next.push(cible);
    }
    if(!cible.images.some(x=>x.id===im.id)){
      const pos=c.images.findIndex(x=>x.id===im.id);
      const avant=c.images.slice(0,pos).reverse().find(x=>cible.images.some(y=>y.id===x.id));
      const apres=c.images.slice(pos+1).find(x=>cible.images.some(y=>y.id===x.id));
      const index=avant?cible.images.findIndex(x=>x.id===avant.id)+1:apres?cible.images.findIndex(x=>x.id===apres.id):cible.images.length;
      cible.images.splice(index,0,copie(im));
    }
    await persister(next,new Map([[im.id,upload]]));
    actualiserDirty();
  }
  async function retenter(c,im){
    if(busy||!fichiers.has(im.id))return;
    busy=true;commandes.disabled=true;status('Upload de l’image…');
    try{await uploadIndividuel(c,im);status('Image enregistrée et vérifiée dans GitHub.','success');}
    catch(e){status(e.message,'error');}
    finally{busy=false;commandes.disabled=false;rendre();}
  }
  function choisirFichier(c,im){
    if(!enregistre.some(x=>x.id===c.id)&&(!c.nom.trim()||!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(c.dossier))){status('Renseigne le nom et le dossier GitHub avant d’ajouter une image.','error');return;}
    const i=element('input');i.type='file';i.accept='image/webp,.webp';i.hidden=true;document.body.append(i);
    i.addEventListener('cancel',()=>i.remove(),{once:true});
    i.addEventListener('change',async()=>{
      const file=i.files?.[0];i.remove();if(!file||busy)return;
      busy=true;commandes.disabled=true;status('Vérification du fichier…');
      try{
        const data=await verifierFichier(file);
        if(!im){im={id:id(),titre:'',legende:'',alt:''};c.images.push(im);}
        clearFile(im.id);fichiers.set(im.id,data);modifier();rendre();
        status('Upload de '+file.name+'…');
        await uploadIndividuel(c,im);
        status(file.name+' : image enregistrée et vérifiée dans GitHub.','success');
      }catch(e){status(e.message,'error');}
      finally{busy=false;commandes.disabled=false;rendre();}
    },{once:true});i.click();
  }
  function actualiserPreview(){
    const c=selectedCarrousel(),zone=editeur.querySelector('[data-preview]');if(!c||!zone)return;
    if(!c.images.length){zone.hidden=true;return;}zone.hidden=false;
    previewIndex=Math.min(Math.max(previewIndex,0),c.images.length-1);
    const im=c.images[previewIndex],src=urlImage(im);
    zone.querySelector('[data-preview-general]').textContent=c.titre;
    zone.querySelector('[data-preview-titre]').textContent=im.titre;
    zone.querySelector('[data-preview-legende]').textContent=im.legende;
    const image=zone.querySelector('img');if(src)image.src=src;else image.removeAttribute('src');image.alt=im.alt;
    zone.querySelector('[data-preview-prev]').disabled=previewIndex===0;
    zone.querySelector('[data-preview-next]').disabled=previewIndex===c.images.length-1;
  }
  function construirePreview(){
    const box=element('section',undefined,'lcdp-carrousel-preview');box.dataset.preview='';
    box.append(element('h3','Prévisualisation','lcdp-editeur-contenu__label'));
    const general=element('h3',''),titre=element('h4',''),img=element('img'),legende=element('p','');
    general.dataset.previewGeneral='';titre.dataset.previewTitre='';legende.dataset.previewLegende='';legende.className='lcdp-image-legend';
    const nav=element('div',undefined,'lcdp-editeur-contenu__ordre'),prev=bouton('‹',()=>{previewIndex--;actualiserPreview();},{aria:'Image précédente'}),next=bouton('›',()=>{previewIndex++;actualiserPreview();},{aria:'Image suivante'});
    prev.dataset.previewPrev='';next.dataset.previewNext='';nav.append(prev,next);box.append(general,titre,img,legende,nav);return box;
  }
  function rendreEditeur(){
    const c=selectedCarrousel();editeur.replaceChildren();editeur.hidden=!c;if(!c)return;
    editeur.append(element('h2','Modifier le carrousel','lcdp-carrousel-nom'));
    editeur.append(champ('Nom du carrousel',c.nom,160,v=>{c.nom=v;rendreListe();},true),champ('Nom du dossier GitHub (majuscules, chiffres, _ ou -)',c.dossier,64,v=>{c.dossier=v;rendreListe();},true),champ('Titre général du carrousel',c.titre,160,v=>c.titre=v));
    editeur.append(element('p','Images WebP : 1672 × 941 pixels. Noms attribués automatiquement à l’enregistrement.','lcdp-editeur-contenu__aide'));
    const images=element('div',undefined,'lcdp-editeur-contenu__blocs');
    c.images.forEach((im,i)=>{
      const box=element('section',undefined,'lcdp-editeur-contenu__bloc lcdp-carrousel-image'),img=element('img',undefined,'lcdp-carrousel-thumbnail'),infos=element('div',undefined,'lcdp-carrousel-champs');
      box.dataset.carrouselImageId=im.id;const src=urlImage(im);if(src)img.src=src;else img.hidden=true;img.alt=im.alt;
      const visuel=element('div',undefined,'lcdp-carrousel-visuel');const placeholder=element('p','Chargement…','lcdp-editeur-contenu__aide');placeholder.dataset.imageMessage='';placeholder.hidden=!!src;visuel.append(img,placeholder);
      const etat=element('p',fichiers.has(im.id)?'Upload non confirmé — à réessayer':preuves.has(im.id)?'Image enregistrée dans GitHub':'Image non enregistrée','lcdp-carrousel-upload-etat');etat.dataset.state=fichiers.has(im.id)?'error':'success';
      infos.append(element('h3','IMAG_'+(i+1)+'.webp','lcdp-carrousel-nom'),etat,champ('Titre de l’image',im.titre,160,v=>im.titre=v),champ('Légende de l’image',im.legende,250,v=>im.legende=v),champ('Texte alternatif',im.alt,250,v=>{im.alt=v;img.alt=v;}));
      const actions=ordre(c.images,i,'l’image '+(i+1));actions.append(bouton('Remplacer',()=>choisirFichier(c,im)),bouton('Supprimer',()=>supprimer('IMAG_'+(i+1)+'.webp','cette image',()=>{clearFile(im.id);c.images=c.images.filter(x=>x.id!==im.id);})));
      if(fichiers.has(im.id))actions.append(bouton('Réessayer l’upload',()=>retenter(c,im),{primary:true}));
      infos.append(actions);box.append(visuel,infos);images.append(box);
    });
    editeur.append(bouton('Ajouter une image',()=>choisirFichier(c,null),{disabled:c.images.length>=40,primary:true}),bouton('Enregistrer le carrousel',()=>enregistrerTout(),{primary:true}),images,construirePreview(),bouton('Fermer l’éditeur',()=>{selected=null;rendre();}));
    actualiserPreview();chargerVignettes();
  }
  function rendre(){rendreListe();rendreEditeur();$('[data-carrousels-ajouter]').disabled=carrousels.length>=40;}
  $('[data-carrousels-ajouter]').onclick=()=>{
    if(busy||carrousels.length>=40)return;
    const c={id:id(),nom:'',dossier:'',titre:'',images:[]};carrousels.push(c);selected=c.id;previewIndex=0;modifier();rendre();editeur.scrollIntoView({block:'start',behavior:'smooth'});editeur.querySelector('input')?.focus();
  };
  async function enregistrerTout(){
    if(busy)return;
    busy=true;commandes.disabled=true;
    try{
      status('Enregistrement des carrousels…');
      await persister(carrousels,new Map(fichiers));
      carrousels=copie(enregistre);actualiserDirty();rendre();
      status('Carrousels enregistrés et vérifiés dans GitHub.','success');
    }catch(e){status(e.message,'error');}
    finally{busy=false;commandes.disabled=false;}
  }
  $('[data-carrousels-enregistrer]').onclick=enregistrerTout;
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  async function init(){
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
    await Promise.all([
      fragment(window.LCDP_urlAdmin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html')).then(f=>{const slot=document.getElementById('lcdp-bandeau-slot');slot.replaceChildren(f);slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=e.dataset.space==='admin'?window.LCDP_urlAdmin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));slot.querySelectorAll('[data-site-src]').forEach(e=>{const chemin=String(e.dataset.siteSrc||'').replace(/^\/?OBJET\/?/,'/');e.setAttribute('src',window.LCDP_urlObjet(chemin));});}),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'admin'})
    ]);

    document.getElementById('lcdp-main-admin').hidden=false;
    const d=await appel();hydrate(d);rendre();commandes.disabled=false;status('');
  }
  init().catch(e=>{document.getElementById('lcdp-main-admin').hidden=false;status(e.message,'error');});
})();
