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
    const slot=document.getElementById('lcdp-lightbox-slot');
    if(!slot)throw Error('Conteneur de confirmation indisponible. Aucune modification effectuée.');
    const hrefCss=objet('/CSSBASE/lcdp-lightbox-convergence.css');
    if(!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l=>l.href===hrefCss)){
      await new Promise((resolve,reject)=>{
        const lien=document.createElement('link');lien.rel='stylesheet';lien.href=hrefCss;
        lien.onload=resolve;lien.onerror=()=>{lien.remove();reject(Error('CSS de confirmation indisponible.'));};
        document.head.appendChild(lien);
      });
    }
    slot.replaceChildren(await fragment(objet('/HTMLBASE/02-dialogue-reference-choix.html')));
    const box=slot.querySelector('[data-lcdp-dialogue-reference="choix"]'),
      titre=slot.querySelector('[data-lcdp-dialogue-titre]'),
      texte=slot.querySelector('[data-lcdp-dialogue-message]'),
      non=slot.querySelector('[data-lcdp-dialogue-action="annuler"]'),
      oui=slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
    if(!box||!titre||!texte||!non||!oui){slot.replaceChildren();throw Error('Confirmation indisponible. Aucune modification effectuée.');}
    titre.textContent=suspendre?'Suspendre ce membre ?':'Lever la suspension ?';
    texte.textContent=(suspendre?'Confirmer la suspension administrative de ':'Confirmer la levée de suspension de ')+nom(m)+' (ID : '+m.idmembre+') ?';
    non.textContent='Non';oui.textContent='Oui';
    const avant=document.activeElement;
    return new Promise(resolve=>{
      let fini=false;
      const terminer=v=>{
        if(fini)return;fini=true;document.removeEventListener('keydown',clavier);
        slot.replaceChildren();avant?.focus({preventScroll:true});resolve(v);
      };
      const clavier=e=>{
        if(e.key==='Escape'){e.preventDefault();terminer(false);}
        if(e.key==='Tab'){const c=[non,oui].filter(b=>!b.disabled);const i=c.indexOf(document.activeElement);
          if(c.length&&((!e.shiftKey&&i===c.length-1)||(e.shiftKey&&i<=0))){e.preventDefault();(e.shiftKey?c.at(-1):c[0]).focus();}
        }
      };
      document.addEventListener('keydown',clavier);
      non.addEventListener('click',()=>terminer(false),{once:true});
      oui.addEventListener('click',()=>terminer(true),{once:true});
      box.addEventListener('click',e=>{if(e.target===box)terminer(false);});
      non.focus();
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

  // Slot 34 : liste des comptes avec statut effectif et décision administrative motivée.
  const MOTIFS_ADMIN = [
    ['sanction','Sanction'],['enquete','Enquête'],
    ['signalement_police','Signalement de police'],
    ['non_respect_engagements','Non-respect des engagements'],
    ['utilisation_non_conforme','Utilisation non conforme de l’application'],
    ['pret_compte','Prêt de compte'],['faux_email','Faux e-mail'],
    ['risque_pour_club','Risque pour le club'],
    ['preparation_fermeture','Préparation de la fermeture'],
    ['autre','Autre motif']
  ];
  let capaciteV2=false;
  const cheminTable='/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.html';
  const cheminScript='/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js';
  async function capacitesV2(){
    if(!api)return false;
    try{
      const r=await fetch(api+'/membres/suspensions/v2/capabilities',{
        method:'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'}
      });
      const d=await r.json().catch(()=>null);
      return r.ok&&d?.success===true&&d.suspensionMotivee===true;
    }catch{return false;}
  }
  function chargerScript(path){
    const src=admin(path);
    const url=new URL(src,document.baseURI).href;
    if([...document.scripts].some(s=>s.src===url))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=url;s.onload=resolve;
      s.onerror=()=>reject(Error('Tableau administrateur indisponible.'));
      document.body.append(s);
    });
  }
  async function soumettreV2(b){
    if(!capaciteV2)throw Error('Écriture motivée indisponible.');
    const r=await fetch(api+'/membres/suspensions/v2',{
      method:'POST',credentials:'include',cache:'no-store',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(b)
    });
    const d=await r.json().catch(()=>null);
    if(!r.ok||d?.success!==true||d?.membre?.success!==true)
      throw Error(d?.message||'Décision non enregistrée.');
    return d.membre;
  }
  function ficheNouvelle(m){
    const zone=document.getElementById('lcdp-suspension-fiche-v2');
    if(!zone)return;
    zone.replaceChildren();
    const card=el('section',undefined,'lcdp-suspension-admin__fiche');
    card.append(el('h2',nom(m),'lcdp-suspension-admin__fiche-titre'));
    const dl=el('dl',undefined,'lcdp-suspension-admin__fiche-donnees');
    const lignes=[
      ['E-mail',m.emailmembre||'—'],
      ['Statut',m.statut||'—'],
      ['Causes',m.causes||'Aucune'],
      ['Motif administratif',m.motif_admin||'Aucun'],
      ['Date suspension',date(m.datesuspension)]
    ];
    lignes.forEach(([key,val])=>{
      const ligne=el('div',undefined,'lcdp-suspension-admin__fiche-ligne');
      ligne.append(el('dt',key),el('dd',val));dl.append(ligne);
    });
    card.append(dl);
    const ferme=['ferme','supprime'].includes(String(m.statut||'').toLowerCase());
    if(ferme){card.append(el('p','Aucune suspension administrative supplémentaire sur ce compte.'));}
    else{
      const aSuspendu=!!String(m.motif_admin||'').trim();
      const form=el('form',undefined,'lcdp-suspension-admin__decision');
      const lab=el('label','Motif de la suspension administrative');
      const sel=el('select');sel.id='lcdp-suspension-motif-admin';sel.required=!aSuspendu;
      const defaut=el('option','Sélectionner un motif');defaut.value='';sel.append(defaut);
      MOTIFS_ADMIN.forEach(([code,label])=>{const opt=el('option',label);opt.value=code;sel.append(opt);});
      if(aSuspendu)sel.value=m.motif_admin||'';
      sel.disabled=aSuspendu;lab.htmlFor=sel.id;
      const labTxt=el('label','Précision (facultative)');
      const txt=el('textarea');txt.id='lcdp-suspension-precision-admin';txt.maxLength=1000;txt.rows=2;
      txt.disabled=aSuspendu;labTxt.htmlFor=txt.id;
      const btn=el('button',aSuspendu?'Lever la suspension du club':'Suspendre le compte','lcdp-button lcdp-button-primary');
      btn.type='submit';btn.disabled=!capaciteV2;
      form.append(lab,sel,labTxt,txt,btn);
      if(!capaciteV2)form.append(el('p','Écriture désactivée : Worker non raccordé.','lcdp-suspension-admin__avertissement'));
      form.addEventListener('submit',async e=>{
        e.preventDefault();if(verrou||!capaciteV2)return;
        const motif=aSuspendu?null:sel.value;
        if(!aSuspendu&&!MOTIFS_ADMIN.some(([code])=>code===motif)){
          statut('Choisissez un motif de suspension.');return;
        }
        verrou=true;btn.disabled=true;
        try{
          const ok=await confirmer(m,!aSuspendu);
          if(!ok)return;
          const result=await soumettreV2({
            idmembre:m.idmembre,action:aSuspendu?'lever':'suspendre',
            motif,precision:aSuspendu?null:txt.value.trim(),
            attendue:aSuspendu,dateAttendue:m.datesuspension||null
          });
          zone.replaceChildren();
          statut('Décision enregistrée. Statut effectif : '+(result.statut_effectif||'inconnu')+'.');
          await window.LCDP_TABLE_LECTURE_ADMIN.recharger('lcdp-suspension-liste-v2');
        }catch(err){statut(String(err?.message||'Décision indisponible.'));}
        finally{verrou=false;btn.disabled=!capaciteV2;}
      });
      card.append(form);
    }
    zone.append(card);
  }
  async function initialiser(){
    if(!window.LCDP_GUARD_ADMIN?.verifierAccesPageAdmin)
      throw Error('Contrôle d’accès admin indisponible.');
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
    await Promise.all([
      fragment(admin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html')).then(f=>{
        const slot=document.getElementById('lcdp-bandeau-slot');slot.replaceChildren(f);
        slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=e.dataset.space==='admin'?admin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));
      }),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'membres'})
    ]);
    const titre=document.querySelector('.lcdp-suspension-admin__titre');
    if(titre)titre.textContent='Suspension';
    const slot=document.getElementById('lcdp-suspension-onglets-slot');
    if(!slot)throw Error('Conteneur Suspension absent.');
    slot.replaceChildren();
    slot.append(el('p','Comptes inscrits dont l’e-mail est validé, y compris lorsque la sécurisation est incomplète.'));
    const message=el('p');message.id='lcdp-suspension-statut';message.setAttribute('role','status');slot.append(message);
    const table=el('div');table.id='lcdp-suspension-liste-v2';slot.append(table);
    const fiche=el('div');fiche.id='lcdp-suspension-fiche-v2';slot.append(fiche);
    document.getElementById('lcdp-main-admin').hidden=false;
    capaciteV2=await capacitesV2();
    if(!capaciteV2)statut('Consultation seule : décisions administratives indisponibles.');
    table.replaceChildren(await fragment(admin(cheminTable)));
    await chargerScript(cheminScript);
    if(!window.LCDP_TABLE_LECTURE_ADMIN?.initialiser)throw Error('Tableau indisponible.');
    const ok=await window.LCDP_TABLE_LECTURE_ADMIN.initialiser({
      slotId:'lcdp-suspension-liste-v2',endpoint:api,resource:'membres-suspensions',
      interactiveColumns:['nommembre'],interactiveLabel:'Consulter le compte',
      initialSortKey:'datecreation',initialSortDirection:'desc',
      filterOptions:{statut:[{value:'',label:'Tous'},{value:'actif',label:'Actif'},
        {value:'suspendu',label:'Suspendu'},{value:'ferme',label:'Fermé'},{value:'supprime',label:'Supprimé'}]},
      onCellActivate:({row})=>ficheNouvelle(row)
    });
    if(!ok)statut('Chargement de la liste non confirmé.');
  }
  initialiser().catch(error=>{
    console.error('Suspension slot 34',error);
    const main=document.getElementById('lcdp-main-admin');
    if(main)main.hidden=false;
    const p=el('p',String(error?.message||'Page indisponible.'));
    p.setAttribute('role','alert');
    (document.getElementById('lcdp-suspension-onglets-slot')||main)?.prepend(p);
  });
})();
