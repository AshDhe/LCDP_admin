(() => {
  'use strict';
  const config=window.SITE_CONFIG||{};
  const route='/ESPACE-ADMIN/C_MEMBRES/suspension-membres.html';
  const api=String(config.workerAdminDataUrl||config.WORKER_ADMIN_DATA_URL||window.ADMIN_CONFIG?.API_ADMIN_DATA||'').replace(/\/+$/,'');
  let racine, pageRecherche=0, pageListe=0, terme='', verrou=false, sequence=0;
  const zones={};
  const admin=p=>window.LCDP_urlAdmin(p), objet=p=>window.LCDP_urlObjet(p);
  const el=(tag,texte,classe)=>{const e=document.createElement(tag);if(texte!==undefined)e.textContent=texte;if(classe)e.className=classe;return e;};
  const bouton=(label,action)=>{const b=el('button',label,'lcdp-button lcdp-button-secondary');b.type='button';b.addEventListener('click',action);return b;};
  const nom=m=>[m.nommembre,m.prenommembre].filter(Boolean).join(' ')||'Nom non renseigné';
  const date=d=>d?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}).format(new Date(d)):'Date non renseignée';
  function duree(d,maintenant){if(!d)return 'Durée inconnue';const h=Math.max(0,Math.floor((Date.parse(maintenant)-Date.parse(d))/3600000));return h<1?'Moins d’une heure':Math.floor(h/24)+' jour(s) et '+(h%24)+' heure(s)';}
  function statut(message){document.getElementById('lcdp-suspension-statut').textContent=message;}
  async function fragment(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-cache'});if(!r.ok)throw Error('Impossible de charger un composant de la page.');const t=document.createElement('template');t.innerHTML=await r.text();return t.content;}
  async function appel(params,body){
    if(!api)throw Error('Service admin non configuré.');
    const r=await fetch(api+'/membres/suspensions'+(params?'?'+new URLSearchParams(params):''),{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers:body?{'Content-Type':'application/json',Accept:'application/json'}:{Accept:'application/json'},body:body?JSON.stringify(body):undefined});
    const d=await r.json().catch(()=>null);if(!r.ok||!d?.success)throw Error(d?.message||'Impossible de joindre le service des suspensions.');return d;
  }
  async function confirmer(m,suspendre){
    const slot=document.getElementById('lcdp-lightbox-slot');slot.replaceChildren(await fragment(objet('/BOX/02-box-dialogue-bouton.html')));
    const box=slot.querySelector('[data-lcdp-box-dialogue-bouton]'),titre=slot.querySelector('[data-lcdp-dialogue-title]'),texte=slot.querySelector('[data-lcdp-dialogue-text]'),actions=slot.querySelector('[data-lcdp-dialogue-actions]');
    if(!box||!titre||!texte||!actions){slot.replaceChildren();throw Error('Confirmation indisponible. Aucune modification effectuée.');}
    titre.textContent=suspendre?'Suspendre ce membre ?':'Lever la suspension ?';
    texte.textContent=(suspendre?'Confirmer la suspension disciplinaire de ':'Confirmer la levée de suspension de ')+nom(m)+' (ID : '+m.idmembre+') ?';actions.replaceChildren();
    const avant=document.activeElement;
    return new Promise(resolve=>{
      let fini=false;
      const terminer=v=>{if(fini)return;fini=true;document.removeEventListener('keydown',clavier);slot.replaceChildren();avant?.focus({preventScroll:true});resolve(v);};
      const non=bouton('Non',()=>terminer(false)),oui=bouton('Oui',()=>terminer(true));oui.className='lcdp-button lcdp-button-orange';actions.append(non,oui);
      const clavier=e=>{if(e.key==='Escape'){e.preventDefault();terminer(false);}if(e.key==='Tab'){const c=[...slot.querySelectorAll('button:not([disabled])')].filter(b=>!b.hidden);if(!c.length)return;const i=c.indexOf(document.activeElement);if((!e.shiftKey&&i===c.length-1)||(e.shiftKey&&i<=0)){e.preventDefault();(e.shiftKey?c.at(-1):c[0]).focus();}}};
      document.addEventListener('keydown',clavier);slot.querySelector('[data-lcdp-dialogue-close]')?.addEventListener('click',()=>terminer(false));box.addEventListener('click',e=>{if(e.target===box)terminer(false);});non.focus();
    });
  }
  function fiche(m,zone,maintenant){
    zone.replaceChildren();const card=el('section',undefined,'lcdp-suspension-admin__fiche');card.append(el('h2',nom(m),'lcdp-suspension-admin__fiche-titre'));
    const dl=el('dl',undefined,'lcdp-suspension-admin__fiche-donnees');
    for(const [k,v] of [['ID membre',m.idmembre],['État',m.suspension?'Suspendu pour raison disciplinaire':'Non suspendu'],...(m.suspension?[['Date de suspension',date(m.datesuspension)],['Durée écoulée',duree(m.datesuspension,maintenant)]]:[])]){const ligne=el('div',undefined,'lcdp-suspension-admin__fiche-ligne');ligne.append(el('dt',k),el('dd',v));dl.append(ligne);}card.append(dl);
    const action=bouton(m.suspension?'Lever la suspension':'Suspendre',async()=>{
      if(verrou)return;verrou=true;action.disabled=true;
      try{if(!await confirmer(m,!m.suspension))return;
        const d=await appel(null,{idmembre:m.idmembre,suspension:!m.suspension,attendue:m.suspension,dateAttendue:m.datesuspension});
        statut(d.membre.suspension?'Membre suspendu.':'Suspension levée.');
        await chargerListe();
        // Toute ancienne fiche est retirée pour éviter une action sur un état périmé.
        zones.suspendre.querySelector('[data-fiche]')?.replaceChildren();
      }catch(e){statut(e.message);}finally{verrou=false;action.disabled=false;}
    });card.append(action);zone.append(card);
  }
  function resultats(d,zone,changerPage){
    zone.replaceChildren();if(!d.membres.length){zone.append(el('p','Aucun membre trouvé.'));return;}
    const liste=el('div',undefined,'lcdp-suspension-admin__resultats'),detail=el('div');detail.dataset.fiche='';
    for(const m of d.membres){let label=nom(m)+' — '+m.idmembre;if(m.suspension)label+=' — '+date(m.datesuspension)+' — '+duree(m.datesuspension,d.maintenant);liste.append(bouton(label,()=>{if(!verrou)fiche(m,detail,d.maintenant);}));}
    zone.append(liste,detail);const nav=el('div',undefined,'lcdp-suspension-admin__actions');
    if(d.page>0)nav.append(bouton('Précédent',()=>changerPage(d.page-1)));
    if(d.suivante)nav.append(bouton('Suivant',()=>changerPage(d.page+1)));zone.append(nav);
  }
  async function rechercher(page=0){
    const seq=++sequence;statut('Recherche en cours…');
    try{const d=await appel({q:terme,page});if(seq!==sequence)return;pageRecherche=page;resultats(d,zones.resultats,rechercher);statut('');}catch(e){if(seq===sequence)statut(e.message);}
  }
  async function chargerListe(page=0){
    const d=await appel({liste:'suspendus',page});pageListe=page;resultats(d,zones.liste,p=>chargerListe(p).catch(e=>statut(e.message)));
  }
  function activer(index){
    const bs=[...racine.querySelectorAll('[data-lcdp-onglet]')],ps=[...racine.querySelectorAll('[data-lcdp-panneau-onglet]')];
    bs.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});ps.forEach((p,i)=>p.hidden=i!==index);
    if(index===1)chargerListe().catch(e=>statut(e.message));
  }
  async function initialiser(){
    if(!window.LCDP_GUARD_ADMIN)throw Error('Contrôle d’accès admin indisponible.');
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
    await Promise.all([
      fragment(admin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html')).then(f=>{const slot=document.getElementById('lcdp-bandeau-slot');slot.replaceChildren(f);slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=e.dataset.space==='admin'?admin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));}),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'membres'})
    ]);
    const slot=document.getElementById('lcdp-suspension-onglets-slot');slot.replaceChildren(await fragment(objet('/BOX/05-wraper-onglets.html')));
    racine=slot.querySelector('[data-lcdp-wraper-onglets]');if(!racine)throw Error('Composant onglets indisponible.');
    const bs=[...racine.querySelectorAll('[data-lcdp-onglet]')],ps=[...racine.querySelectorAll('[data-lcdp-panneau-onglet]')];if(bs.length<2||ps.length<2)throw Error('Structure des onglets incomplète.');
    for(let i=2;i<bs.length;i++)bs[i].remove();for(let i=2;i<ps.length;i++)ps[i].remove();
    ['Suspendre','Membres suspendus'].forEach((label,i)=>{bs[i].textContent=label;bs[i].id='suspension-tab-'+i;ps[i].id='suspension-panel-'+i;bs[i].setAttribute('aria-controls',ps[i].id);ps[i].setAttribute('aria-labelledby',bs[i].id);bs[i].addEventListener('click',()=>{if(!verrou)activer(i);});bs[i].addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();bs[1-i].click();bs[1-i].focus();}});});
    zones.suspendre=ps[0].querySelector('[data-lcdp-contenu-onglet]');zones.liste=ps[1].querySelector('[data-lcdp-contenu-onglet]');if(!zones.suspendre||!zones.liste)throw Error('Contenu des onglets indisponible.');zones.suspendre.replaceChildren();zones.liste.replaceChildren();
    const status=el('p');status.id='lcdp-suspension-statut';status.setAttribute('role','status');slot.before(status);
    const form=el('form',undefined,'lcdp-suspension-admin__recherche'),label=el('label','ID membre ou nom et prénom'),input=el('input');input.id='suspension-recherche';input.type='search';input.required=true;input.maxLength=100;label.htmlFor=input.id;
    const chercher=el('button','Rechercher','lcdp-button lcdp-button-primary');chercher.type='submit';form.append(label,input,chercher);zones.resultats=el('div');zones.suspendre.append(form,zones.resultats);
    form.addEventListener('submit',e=>{e.preventDefault();if(verrou)return;terme=input.value.trim();void rechercher();});activer(0);document.getElementById('lcdp-main-admin').hidden=false;
  }
  initialiser().catch(e=>{const main=document.getElementById('lcdp-main-admin');const p=el('p',e.message,'lcdp-page-container');p.setAttribute('role','alert');main.before(p);});
})();
