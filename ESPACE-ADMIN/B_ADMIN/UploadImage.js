(() => {
  'use strict';
  const $=id=>document.getElementById(id),cfg=window.SITE_CONFIG||{};
  const api=String(cfg.workerEditingAdminUrl||cfg.WORKER_EDITING_ADMIN_URL||window.ADMIN_CONFIG?.API_EDITING_ADMIN||'').replace(/\/+$/,'');
  const nav=$('upload-navigation'),repo=$('upload-repo'),levels=$('upload-levels'),refresh=$('upload-refresh');
  const form=$('upload-form'),confirm=$('upload-confirm'),input=$('upload-files'),submit=$('upload-submit');
  const max=15*1024*1024,ext=/\.(?:jpe?g|png|webp|gif|avif)$/i;
  let folder=null,selected=[],busy=false,sequence=0,tab='upload';
  const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  function status(message,error=false){const e=$('upload-status');e.textContent=message;e.setAttribute('role',error?'alert':'status');}
  function taille(n){return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(n>=1048576?n/1048576:n>=1024?n/1024:n)+(n>=1048576?' Mio':n>=1024?' Kio':' o');}
  async function appel(path,body){
    if(!api)throw Error('Service d’édition non configuré.');
    const r=await fetch(api+'/admin/upload-image/'+path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'},body});
    const d=await r.json().catch(()=>null);
    if(r.status===404&&!d?.message?.includes('Dépôt'))throw Error('Service Upload Image indisponible : vérifier le déploiement de w-editing-admin.');
    if(!r.ok||d?.success!==true)throw Error(d?.message||'Service indisponible (HTTP '+r.status+').');
    return d;
  }
  function actions(){
    form.hidden=!folder||folder.archive||!folder.dossier;
    $('upload-fields').disabled=busy;
    nav.disabled=busy;
    refresh.disabled=!folder;
    submit.disabled=busy||!folder||folder.archive||!folder.dossier||!confirm.checked||!selected.length;
    document.querySelectorAll('[data-tab]').forEach(b=>b.disabled=busy);
  }
  function changerTab(n){
    if(busy)return;tab=n;
    document.querySelectorAll('[data-tab]').forEach(b=>{
      const active=b.dataset.tab===n;b.setAttribute('aria-pressed',String(active));
      b.classList.toggle('lcdp-button-primary',active);b.classList.toggle('lcdp-button-secondary',!active);
    });
    $('upload-panel').hidden=n!=='upload';$('upload-follow').hidden=n!=='suivi';
  }
  function dessinerSelection(){
    const list=$('upload-selection');list.replaceChildren();
    for(const [i,file] of selected.entries()){
      const ligne=el('li'),bouton=el('button','Retirer');
      bouton.type='button';bouton.className='lcdp-button lcdp-button-secondary';bouton.disabled=busy;
      bouton.onclick=()=>{selected.splice(i,1);confirm.checked=false;dessinerSelection();};
      ligne.append(el('span',file.name+' · '+taille(file.size)),bouton);list.append(ligne);
    }
    actions();
  }
  function viderSelection(){selected=[];input.value='';confirm.checked=false;dessinerSelection();}
  function afficherDossier(d){
    $('upload-path').textContent='Destination : '+d.repo+' / '+d.branche+' / '+(d.dossier||'(racine — navigation uniquement)');
    $('upload-count').textContent=d.nombre+' image'+(d.nombre===1?'':'s');
    const frag=document.createDocumentFragment();
    for(const image of d.images){const tr=el('tr');tr.append(el('td',image.nom),el('td',taille(image.octets)));frag.append(tr);}
    $('upload-inventory').replaceChildren(frag);
  }
  function invalider(){
    folder=null;$('upload-path').textContent='Aucun dossier sélectionné.';
    $('upload-count').textContent='—';$('upload-inventory').replaceChildren();actions();
  }
  function ajouterNiveau(d){
    if(!d.dossiers.length)return;
    const wrap=el('div'),label=el('label','Sous-dossier'),select=el('select');
    select.id='upload-level-'+levels.children.length;label.htmlFor=select.id;
    const empty=el('option','Rester dans ce dossier');empty.value='';select.append(empty);
    for(const child of d.dossiers){const o=el('option',child.nom);o.value=child.chemin;select.append(o);}
    select.addEventListener('change',()=>{
      while(wrap.nextElementSibling)wrap.nextElementSibling.remove();
      viderSelection();$('upload-results').replaceChildren();
      choisir(repo.value,select.value||d.dossier,true);
    });
    wrap.append(label,select);levels.append(wrap);
  }
  async function choisir(nom,path,ajoutNiveau){
    const run=++sequence;
    invalider();if(!nom)return;
    status('Lecture du dossier GitHub…');
    try{
      const params=new URLSearchParams({repo:nom,dossier:path});
      const d=await appel('folder?'+params);
      if(run!==sequence)return;
      if(!Array.isArray(d.dossiers)||!Array.isArray(d.images)||d.nombre!==d.images.length||d.dossier!==path||d.repo.toLowerCase()!==nom.toLowerCase())throw Error('Destination GitHub non confirmée.');
      folder=d;afficherDossier(d);
      if(ajoutNiveau&&(!levels.lastElementChild||levels.lastElementChild.querySelector('select').value))ajouterNiveau(d);
      status(d.archive?'Dépôt archivé : consultation uniquement.':d.dossier?'Dossier confirmé dans GitHub.':'Choisis un dossier existant.');
    }catch(e){if(run===sequence){invalider();status(e.message,true);}}
    finally{if(run===sequence)actions();}
  }
  repo.addEventListener('change',()=>{levels.replaceChildren();viderSelection();$('upload-results').replaceChildren();choisir(repo.value,'',true);});
  refresh.addEventListener('click',()=>{if(folder&&!busy){const {repo:nom,dossier:path}=folder;confirm.checked=false;choisir(nom,path,false);}});
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>changerTab(b.dataset.tab));
  input.addEventListener('change',()=>{
    const erreurs=[];
    for(const f of input.files){
      if(!ext.test(f.name)||!f.size||f.size>max){erreurs.push(f.name+' : format ou taille invalide.');continue;}
      if(selected.some(x=>x.name.toLowerCase()===f.name.toLowerCase())){erreurs.push(f.name+' : déjà sélectionné.');continue;}
      selected.push(f);
    }
    input.value='';confirm.checked=false;dessinerSelection();
    if(erreurs.length)status(erreurs.join(' '),true);
  });
  confirm.addEventListener('change',actions);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(busy||!folder||folder.archive||!folder.dossier||!confirm.checked||!selected.length)return;
    const cible={repo:folder.repo,dossier:folder.dossier},files=selected.slice(),rejets=[];
    busy=true;confirm.checked=false;actions();dessinerSelection();
    const result=$('upload-results');result.replaceChildren();
    let ok=0,deja=0;
    try{
      for(const [i,file] of files.entries()){
        status('Import '+(i+1)+' / '+files.length+' : '+file.name);
        const ligne=el('li',file.name+' : en cours…');result.append(ligne);
        try{
          const body=new FormData();body.set('repo',cible.repo);body.set('dossier',cible.dossier);body.set('image',file,file.name);
          const d=await appel('file',body);
          if(d.chemin!==cible.dossier+'/'+file.name||typeof d.sha!=='string'||!/^[a-f0-9]{40}$/.test(d.sha))throw Error('Chemin ou preuve GitHub non confirmé.');
          ligne.textContent=file.name+' : '+(d.dejaPresent?'déjà présente, contenu identique.':'enregistrée et vérifiée.');ligne.dataset.etat='ok';
          if(d.dejaPresent)deja++;else ok++;
        }catch(err){ligne.textContent=file.name+' : '+err.message;ligne.dataset.etat='error';rejets.push(file);}
      }
      selected=rejets;
      await choisir(cible.repo,cible.dossier,false);
      const message=ok+' image(s) ajoutée(s), '+deja+' déjà présente(s), '+rejets.length+' non confirmée(s).';
      status(message+(folder?'':' Inventaire non actualisé.'),!!rejets.length||!folder);
    }finally{busy=false;dessinerSelection();actions();}
  });
  async function fragment(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-cache'});if(!r.ok)throw Error('Composant admin indisponible.');const t=el('template');t.innerHTML=await r.text();return t.content;}
  async function init(){
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
    await Promise.all([
      fragment(window.LCDP_urlAdmin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html')).then(f=>{const slot=$('lcdp-bandeau-slot');slot.replaceChildren(f);slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=e.dataset.space==='admin'?window.LCDP_urlAdmin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));slot.querySelectorAll('[data-site-src]').forEach(e=>{const chemin=String(e.dataset.siteSrc||'').replace(/^\/?OBJET\/?/,'/');e.setAttribute('src',window.LCDP_urlObjet(chemin));});}),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'admin'})
    ]);
    $('lcdp-main-admin').hidden=false;
    const data=await appel('repos');
    if(!Array.isArray(data.repos))throw Error('Liste de dépôts invalide.');
    for(const r of data.repos){const o=el('option',r.nom+(r.archive?' (archivé)':''));o.value=r.nom;repo.append(o);}
    nav.disabled=false;status(data.repos.length?'Choisis un dépôt GitHub.':'Aucun dépôt LCDP accessible.');
  }
  init().catch(e=>{$('lcdp-main-admin').hidden=false;status(e.message,true);});
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
})();
