(() => {
  'use strict';
  const cfg=window.SITE_CONFIG||{};
  const api=String(cfg.workerEditingAdminUrl||cfg.WORKER_EDITING_ADMIN_URL||window.ADMIN_CONFIG?.API_EDITING_ADMIN||'').replace(/\/+$/,'');
  const $=s=>document.querySelector(s), liste=$('[data-carrousels-liste]'), commandes=$('[data-carrousels-commandes]'), editeur=$('[data-carrousels-editeur]');
  let carrousels=[], version='', revision='', selected=null, previewIndex=0, dirty=false, busy=false;
  const fichiers=new Map(), originaux=new Map();
  const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const status=(text,etat='')=>{const p=$('[data-carrousels-status]');p.textContent=text;p.dataset.state=etat;};
  const modifier=()=>{dirty=true;status('Modifications non enregistrées.','dirty');};
  const id=()=>crypto.randomUUID();
  const path=(c,i)=>'/IMAG/CARROUSEL/'+c.dossier+'/IMAG_'+(i+1)+'.webp';
  const urlImage=im=>fichiers.get(im.id)?.url||originaux.get(im.id)||'';
  const selectedCarrousel=()=>carrousels.find(c=>c.id===selected);
  const move=(arr,i,delta)=>{const j=i+delta;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];modifier();rendre();};
  function clearFile(id){const f=fichiers.get(id);if(f)URL.revokeObjectURL(f.url);fichiers.delete(id);}
  function hydrate(d){
    for(const k of fichiers.keys())clearFile(k);
    originaux.clear();carrousels=d.carrousels;version=d.version;revision=d.revision;
    for(const c of carrousels)c.images.forEach((im,i)=>originaux.set(im.id,window.LCDP_urlObjet(path(c,i))+'?v='+encodeURIComponent(revision)));
    if(!selectedCarrousel())selected=null;
    previewIndex=0;dirty=false;
  }
  async function appel(form){
    if(!api)throw Error('Service d’édition non configuré.');
    const r=await fetch(api+'/admin/carrousels',{method:form?'POST':'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'},body:form||undefined});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.success){
      if(r.status===404)throw Error('Le worker w-editing-admin doit être mis à jour pour activer les carrousels.');
      throw Error((d?.message||'Service carrousels indisponible.')+(d?.detail?' '+d.detail:''));
    }
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
      return {file,url};
    }catch(e){URL.revokeObjectURL(url);throw e;}
  }
  function choisirFichier(c,im){
    const i=element('input');i.type='file';i.accept='image/webp,.webp';i.hidden=true;document.body.append(i);
    i.addEventListener('cancel',()=>i.remove(),{once:true});
    i.addEventListener('change',async()=>{
      const file=i.files?.[0];i.remove();if(!file||busy)return;
      busy=true;commandes.disabled=true;
      try{
        const data=await verifierFichier(file);
        if(!im){im={id:id(),titre:'',legende:'',alt:''};c.images.push(im);}
        clearFile(im.id);fichiers.set(im.id,data);modifier();rendre();
      }catch(e){status(e.message,'error');}finally{busy=false;commandes.disabled=false;}
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
    const image=zone.querySelector('img');image.src=src;image.alt=im.alt;
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
      img.src=urlImage(im);img.alt=im.alt;
      infos.append(element('h3','IMAG_'+(i+1)+'.webp','lcdp-carrousel-nom'),champ('Titre de l’image (6 mots maximum)',im.titre,160,v=>im.titre=v),champ('Légende de l’image',im.legende,250,v=>im.legende=v),champ('Texte alternatif',im.alt,250,v=>{im.alt=v;img.alt=v;}));
      const actions=ordre(c.images,i,'l’image '+(i+1));actions.append(bouton('Remplacer',()=>choisirFichier(c,im)),bouton('Supprimer',()=>supprimer('IMAG_'+(i+1)+'.webp','cette image',()=>{clearFile(im.id);c.images=c.images.filter(x=>x.id!==im.id);})));
      infos.append(actions);box.append(img,infos);images.append(box);
    });
    editeur.append(images,bouton('Ajouter une image',()=>choisirFichier(c,null),{disabled:c.images.length>=40,primary:true}),construirePreview(),bouton('Fermer l’éditeur',()=>{selected=null;rendre();}));
    actualiserPreview();
  }
  function rendre(){rendreListe();rendreEditeur();$('[data-carrousels-ajouter]').disabled=carrousels.length>=40;}
  $('[data-carrousels-ajouter]').onclick=()=>{
    if(busy||carrousels.length>=40)return;
    const c={id:id(),nom:'',dossier:'',titre:'',images:[]};carrousels.push(c);selected=c.id;previewIndex=0;modifier();rendre();editeur.scrollIntoView({block:'start',behavior:'smooth'});editeur.querySelector('input')?.focus();
  };
  $('[data-carrousels-enregistrer]').onclick=async()=>{
    if(busy)return;
    try{
      const dossiers=new Set();
      for(const c of carrousels){
        if(!c.nom.trim())throw Error('Le nom de chaque carrousel est obligatoire.');
        if(!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(c.dossier)||dossiers.has(c.dossier))throw Error('Nom de dossier invalide ou déjà utilisé : '+c.dossier);
        dossiers.add(c.dossier);
        if(!c.images.length)throw Error('Ajoute au moins une image au carrousel « '+c.nom+' ».');
        for(const im of c.images){if(im.titre.trim()&&im.titre.trim().split(/\s+/u).filter(mot=>/[\p{L}\p{N}]/u.test(mot)).length>6)throw Error('Un titre d’image dépasse six mots dans « '+c.nom+' ».');}
      }
      const total=[...fichiers.values()].reduce((s,f)=>s+f.file.size,0);
      if(total>30*1024*1024)throw Error('Maximum 30 Mo de nouvelles images par enregistrement.');
      busy=true;commandes.disabled=true;status('Enregistrement dans GitHub…');
      const form=new FormData();form.set('inventaire',JSON.stringify({version,carrousels}));
      for(const [key,f] of fichiers)form.append('image:'+key,f.file,f.file.name);
      const d=await appel(form);hydrate(d);rendre();status(d.message+' La publication sur le site dépend du déploiement GitHub Pages.');
    }catch(e){status(e.message,'error');}finally{busy=false;commandes.disabled=false;}
  };
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
