(() => {
  'use strict';
  const cfg=window.SITE_CONFIG||{};
  const api=String(cfg.workerEditingAdminUrl||cfg.WORKER_EDITING_ADMIN_URL||(typeof cfg.apiUrl==='function'?cfg.apiUrl('editing-admin-api'):'')||'').replace(/\/+$/,'');
  const $=s=>document.querySelector(s), liste=$('[data-apropos-liste]'), commandes=$('[data-apropos-commandes]');
  let titres=[],version=1,dirty=false,busy=false;
  const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  function status(text,etat=''){const p=$('[data-apropos-status]');p.textContent=text;p.dataset.state=etat;}
  function modifier(){dirty=true;status('Modifications non enregistrées.','dirty');}
  async function fragment(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-cache'});if(!r.ok)throw Error('Composant admin indisponible.');const t=document.createElement('template');t.innerHTML=await r.text();return t.content;}
  async function appel(body){
    if(!api)throw Error('Service d’édition non configuré.');
    const r=await fetch(api+'/admin/a-propos',{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers:body?{'Content-Type':'application/json',Accept:'application/json'}:{Accept:'application/json'},body:body?JSON.stringify(body):undefined});
    const d=await r.json().catch(()=>null);if(!r.ok||!d?.success)throw Error(d?.message||'Impossible de charger les titres À propos.');return d;
  }
  async function confirmerSuppression(titre){
    const slot=document.getElementById('lcdp-lightbox-slot');slot.replaceChildren(await fragment(window.LCDP_urlObjet('/BOX/02-box-dialogue-bouton.html')));
    const box=slot.querySelector('[data-lcdp-box-dialogue-bouton]'),heading=slot.querySelector('[data-lcdp-dialogue-title]'),text=slot.querySelector('[data-lcdp-dialogue-text]'),actions=slot.querySelector('[data-lcdp-dialogue-actions]');
    if(!box||!heading||!text||!actions){slot.replaceChildren();throw Error('Confirmation indisponible. Aucun titre supprimé.');}
    heading.textContent='Supprimer ce titre ?';text.textContent='Supprimer « '+(titre||'Titre sans texte')+' » ? La suppression sera diffusée après enregistrement.';actions.replaceChildren();
    const avant=document.activeElement;
    return new Promise(resolve=>{
      let termine=false;
      const finir=v=>{if(termine)return;termine=true;document.removeEventListener('keydown',clavier);slot.replaceChildren();avant?.focus({preventScroll:true});resolve(v);};
      const non=element('button','Non','lcdp-button lcdp-button-secondary'),oui=element('button','Oui','lcdp-button lcdp-button-orange');non.type=oui.type='button';non.onclick=()=>finir(false);oui.onclick=()=>finir(true);actions.append(non,oui);
      const clavier=e=>{if(e.key==='Escape'){e.preventDefault();finir(false);}if(e.key==='Tab'){const bs=[...slot.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled);const i=bs.indexOf(document.activeElement);if((e.shiftKey&&i<=0)||(!e.shiftKey&&i===bs.length-1)){e.preventDefault();(e.shiftKey?bs.at(-1):bs[0])?.focus();}}};
      document.addEventListener('keydown',clavier);slot.querySelector('[data-lcdp-dialogue-close]')?.addEventListener('click',()=>finir(false));box.addEventListener('click',e=>{if(e.target===box)finir(false);});non.focus();
    });
  }
  function bouton(label,action){const b=element('button',label,'lcdp-button lcdp-button-secondary lcdp-editeur-contenu__petit-bouton');b.type='button';b.onclick=action;return b;}
  function rendre(){
    liste.replaceChildren();
    if(!titres.length)liste.append(element('p','Aucun titre. Clique sur « Ajouter un titre ».','lcdp-editeur-contenu__aide'));
    titres.forEach((item,index)=>{
      const bloc=element('section',undefined,'lcdp-editeur-contenu__bloc'),zone=element('div',undefined,'lcdp-editeur-contenu__titre-zone');
      const label=element('label','Titre '+(index+1),'lcdp-editeur-contenu__label'),input=element('input',undefined,'lcdp-editeur-contenu__titre');input.id='apropos-'+item.id;label.htmlFor=input.id;input.type='text';input.required=true;input.maxLength=160;input.value=item.titre;
      input.oninput=()=>{item.titre=input.value;modifier();};zone.append(label,input);
      const diffusion=element('label'),active=element('input');active.type='checkbox';active.checked=item.actif;active.onchange=()=>{item.actif=active.checked;modifier();};diffusion.append(active,document.createTextNode(' Diffuser dans le bandeau'));
      const actions=element('div',undefined,'lcdp-editeur-contenu__ordre');
      const monter=bouton('Monter',()=>{[titres[index-1],titres[index]]=[titres[index],titres[index-1]];modifier();rendre();}),descendre=bouton('Descendre',()=>{[titres[index],titres[index+1]]=[titres[index+1],titres[index]];modifier();rendre();});monter.disabled=index===0;descendre.disabled=index===titres.length-1;
      const supprimer=bouton('Supprimer',async()=>{
        if(busy)return;busy=true;
        // Verrouillage de l’édition pendant la confirmation pour garder la sélection stable.
        commandes.disabled=true;
        try{if(await confirmerSuppression(item.titre)){titres=titres.filter(t=>t.id!==item.id);modifier();rendre();}}catch(e){status(e.message,'error');}finally{busy=false;commandes.disabled=false;}
      });actions.append(monter,descendre,supprimer);bloc.append(zone,diffusion,actions);liste.append(bloc);
    });
    $('[data-apropos-ajouter]').disabled=titres.length>=40;
  }
  $('[data-apropos-ajouter]').onclick=()=>{if(busy||titres.length>=40)return;titres.push({id:'titre-'+crypto.randomUUID(),titre:'',actif:false});modifier();rendre();liste.lastElementChild.querySelector('input').focus();};
  $('[data-apropos-enregistrer]').onclick=async()=>{
    if(busy)return;
    for(const i of liste.querySelectorAll('input[type="text"]')){if(!i.value.trim())i.setCustomValidity('Saisis un titre.');else i.setCustomValidity('');if(!i.reportValidity())return;}
    busy=true;commandes.disabled=true;status('Enregistrement en cours…');
    try{const d=await appel({version,titres});titres=d.titres;version=d.version;dirty=false;rendre();status('Titres enregistrés. Les titres activés sont diffusés dans le bandeau.');}catch(e){status(e.message,'error');}finally{busy=false;commandes.disabled=false;}
  };
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  async function init(){
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
    await Promise.all([
      fragment(window.LCDP_urlAdmin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html')).then(f=>{const slot=document.getElementById('lcdp-bandeau-slot');slot.replaceChildren(f);slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=e.dataset.space==='admin'?window.LCDP_urlAdmin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));}),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'admin'})
    ]);
    const d=await appel();titres=d.titres;version=d.version;rendre();commandes.disabled=false;document.getElementById('lcdp-main-admin').hidden=false;
  }
  init().catch(e=>{document.getElementById('lcdp-main-admin').hidden=false;status(e.message,'error');});
})();
