(() => {
  'use strict';
  const cfg=window.SITE_CONFIG||{};
  const api=String(cfg.workerEditingAdminUrl||cfg.WORKER_EDITING_ADMIN_URL||window.ADMIN_CONFIG?.API_EDITING_ADMIN||'').replace(/\/+$/,'');
  const $=s=>document.querySelector(s),liste=$('[data-bandeau-liste]'),commandes=$('[data-bandeau-commandes]');
  const preview=$('[data-bandeau-preview]'),previewWrap=$('[data-bandeau-preview-wrap]');
  let images=[],revision='',dirty=false,busy=false;
  const fichiers=new Map(),originaux=new Map();
  const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const status=(text,etat='')=>{const p=$('[data-bandeau-status]');p.textContent=text;p.dataset.state=etat;};
  const modifier=()=>{dirty=true;status('Modifications non enregistrées.','dirty');};
  const urlImage=im=>fichiers.get(im.id)?.url||originaux.get(im.id)||'';
  function clearFile(id){const f=fichiers.get(id);if(f)URL.revokeObjectURL(f.url);fichiers.delete(id);}
  async function hydrate(d){
    for(const id of fichiers.keys())clearFile(id);
    originaux.clear();images=d.images;revision=d.revision;
    images.forEach((im,i)=>originaux.set(im.id,window.LCDP_urlObjet('/IMAG/BANDEAU-IMAGE/IMAG_'+(i+1)+'.webp')));
    dirty=false;
  }
  async function appel(form){
    if(!api)throw Error('Service d’édition non configuré.');
    const r=await fetch(api+'/admin/bandeau-image',{method:form?'POST':'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'},body:form||undefined});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.success){
      if(r.status===404)throw Error('Le worker w-editing-admin doit être mis à jour pour activer le bandeau image.');
      throw Error(d?.message||'Service du bandeau image indisponible.');
    }
    return d;
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

  function bouton(label,action,disabled=false,aria=''){
    const b=element('button',label,'lcdp-button lcdp-button-secondary lcdp-editeur-contenu__petit-bouton');
    b.type='button';b.disabled=disabled;if(aria)b.setAttribute('aria-label',aria);
    b.onclick=()=>{if(!busy)Promise.resolve(action()).catch(e=>status(e.message,'error'));};return b;
  }
  function move(i,delta){
    const k=i+delta;if(k<0||k>=images.length)return;
    [images[i],images[k]]=[images[k],images[i]];modifier();rendre();
  }
  async function supprimer(im,i){
    busy=true;commandes.disabled=true;
    try{if(await confirmerSuppression('IMAG_'+(i+1)+'.webp')){clearFile(im.id);images=images.filter(x=>x.id!==im.id);modifier();rendre();}}
    finally{busy=false;commandes.disabled=false;}
  }
  async function verifierFichier(file){
    if(file.type!=='image/webp'||!file.size||file.size>15*1024*1024)throw Error(file.name+' : choisir une image WebP de 15 Mo maximum.');
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;await img.decode();
      if(!img.naturalWidth||img.naturalWidth!==img.naturalHeight)throw Error(file.name+' : l’image doit être carrée.');
      return {file,url};
    }catch(e){URL.revokeObjectURL(url);throw e;}
  }
  function choisir(im=null){
    const input=element('input');input.type='file';input.accept='image/webp,.webp';input.multiple=!im;input.hidden=true;document.body.append(input);
    input.addEventListener('cancel',()=>input.remove(),{once:true});
    input.addEventListener('change',async()=>{
      const chosen=[...(input.files||[])];input.remove();if(!chosen.length||busy)return;
      busy=true;commandes.disabled=true;const stage=[];
      try{
        for(const file of chosen)stage.push(await verifierFichier(file));
        const total=[...fichiers.entries()].filter(([id])=>id!==im?.id).reduce((s,[,f])=>s+f.file.size,0)+stage.reduce((s,f)=>s+f.file.size,0);
        if(total>30*1024*1024)throw Error('Maximum 30 Mo par enregistrement. Enregistre les images en plusieurs fois.');
        for(const f of stage){const item=im||{id:crypto.randomUUID(),alt:''};if(!im)images.push(item);clearFile(item.id);fichiers.set(item.id,f);}
        stage.length=0;modifier();rendre();
      }catch(e){for(const f of stage)URL.revokeObjectURL(f.url);status(e.message,'error');}
      finally{busy=false;commandes.disabled=false;}
    },{once:true});input.click();
  }
  function actualiserPreview(){
    previewWrap.hidden=!images.length;
    if(window.LCDP_BANDEAU_IMAGE)window.LCDP_BANDEAU_IMAGE.rendre(preview,images.map(im=>({src:urlImage(im),alt:im.alt})));
    else{
      preview.replaceChildren();preview.hidden=!images.length;preview.classList.add('lcdp-bandeau-preview-secours');
      for(const im of images){const img=element('img');img.src=urlImage(im);img.alt=im.alt;preview.append(img);}
    }
  }
  function rendre(){
    liste.replaceChildren();
    if(!images.length)liste.append(element('p','Aucune image enregistrée.','lcdp-editeur-contenu__aide'));
    images.forEach((im,i)=>{
      const box=element('section',undefined,'lcdp-editeur-contenu__bloc lcdp-bandeau-admin-image');
      const img=element('img',undefined,'lcdp-bandeau-admin-miniature');img.src=urlImage(im);img.alt=im.alt;
      const info=element('div',undefined,'lcdp-bandeau-admin-info');
      info.append(element('h2','IMAG_'+(i+1)+'.webp','lcdp-bandeau-admin-nom'));
      const label=element('label',undefined,'lcdp-editeur-contenu__titre-zone'),input=element('input',undefined,'lcdp-editeur-contenu__titre');
      label.append(element('span','Texte alternatif (facultatif)','lcdp-editeur-contenu__label'),input);input.type='text';input.value=im.alt;
      input.oninput=()=>{im.alt=input.value;img.alt=input.value;modifier();};input.onchange=actualiserPreview;
      const actions=element('div',undefined,'lcdp-editeur-contenu__ordre');
      actions.append(bouton('↑',()=>move(i,-1),i===0,'Monter l’image'),bouton('↓',()=>move(i,1),i===images.length-1,'Descendre l’image'),bouton('Remplacer',()=>choisir(im)),bouton('Supprimer',()=>supprimer(im,i)));
      info.append(label,actions);box.append(img,info);liste.append(box);
    });
    actualiserPreview();
  }
  $('[data-bandeau-ajouter]').onclick=()=>{if(!busy)choisir();};
  $('[data-bandeau-enregistrer]').onclick=async()=>{
    if(busy)return;
    busy=true;commandes.disabled=true;status('Enregistrement dans GitHub…');
    try{
      const form=new FormData();form.set('inventaire',JSON.stringify({revision,images}));
      for(const [id,f] of fichiers)form.append('image:'+id,f.file,f.file.name);
      const d=await appel(form);await hydrate(d);rendre();status(d.message+' La diffusion dépend de la publication GitHub Pages.');
    }catch(e){status(e.message,'error');}finally{busy=false;commandes.disabled=false;}
  };
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  function chargerPreview(){
    return new Promise(resolve=>{
      const script=element('script');script.src=window.LCDP_urlObjet('/JSBASE/bandeau-image.js');
      script.onload=script.onerror=()=>resolve();document.head.append(script);
    });
  }
  async function init(){
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
    await Promise.all([
      fragment(window.LCDP_urlAdmin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html')).then(f=>{const slot=document.getElementById('lcdp-bandeau-slot');slot.replaceChildren(f);slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=e.dataset.space==='admin'?window.LCDP_urlAdmin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));slot.querySelectorAll('[data-site-src]').forEach(e=>{const chemin=String(e.dataset.siteSrc||'').replace(/^\/?OBJET\/?/,'/');e.setAttribute('src',window.LCDP_urlObjet(chemin));});}),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'admin'})
    ]);

    document.getElementById('lcdp-main-admin').hidden=false;
    const [d]=await Promise.all([appel(),chargerPreview()]);
    await hydrate(d);rendre();commandes.disabled=false;status(d.actif?'':'Le bandeau reste masqué sur l’accueil public tant qu’il contient moins de huit images.');
  }
  init().catch(e=>{document.getElementById('lcdp-main-admin').hidden=false;status(e.message,'error');});
})();
