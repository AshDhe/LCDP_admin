(() => {
  'use strict';
  const CHEMIN='/ESPACE-ADMIN/C_MEMBRES/SuiviPaiements.html';
  const config=window.SITE_CONFIG||{};
  const endpoint=String(config.workerSuiviPaiementsAdminUrl||config.WORKER_SUIVI_PAIEMENTS_ADMIN_URL||
    'https://ad-suivi-paiements-api.lacleduparc.fr').replace(/\/+$/,'');
  const $=id=>document.getElementById(id);
  let commandes=[];let commandeSelectionnee='';let occupe=false;
  const date=v=>v?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Paris'}).format(new Date(v)):'—';
  const euros=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v)):'—';
  const texte=v=>v===null||v===undefined||v===''?'—':String(v);
  const statuts={
    conforme:'Paiement et accès confirmés',stripe_paye_non_finalise:'ALERTE : payé chez Stripe, non finalisé',
    acces_provisoires_apres_paiement:'ALERTE : accès encore provisoires',
    supabase_paye_stripe_non_confirme:'ALERTE : statuts contradictoires',
    references_incoherentes:'ALERTE : références incohérentes',
    reference_stripe_invalide:'ALERTE : référence Stripe invalide',
    erreur_lecture_stripe:'Contrôle Stripe impossible',
    sans_session_stripe:'Session Stripe non créée',session_expiree:'Session Stripe expirée',
    paiement_non_confirme:'Paiement non confirmé',paiement_en_cours:'Paiement en cours',
    verification_incomplete:'Vérification incomplète'
  };
  function libelleDiagnostic(d){return statuts[d]||texte(d);}
  function message(s){$('paiements-statut').textContent=s;}
  function element(tag,t){const e=document.createElement(tag);if(t!==undefined)e.textContent=texte(t);return e;}
  function cellule(t){return element('td',t);}
  function estAlerte(c){const d=c.dernierControle?.diagnostic||'';
    return Boolean(c.erreurWebhook)||d.startsWith('stripe_paye_non_finalise')||d.startsWith('acces_provisoires')||
      d.startsWith('supabase_paye')||d==='references_incoherentes'||d==='reference_stripe_invalide'||
      d==='erreur_lecture_stripe';}
  function etatStripe(c){if(c.erreurWebhook)return 'Webhook en erreur';
    if(!c.dernierControle)return 'Non contrôlé';
    return libelleDiagnostic(c.dernierControle.diagnostic);
  }
  async function requete(path,body){
    const opts={method:body?'POST':'GET',credentials:'include',cache:'no-store',
      headers:{Accept:'application/json'}};
    if(body){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
    const r=await fetch(endpoint+path,opts);const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.success)throw new Error(d?.message||'Suivi des paiements indisponible.');
    return d;
  }
  function rendreListe(){
    const cherche=$('paiements-recherche').value.trim().toLowerCase();
    const filtre=$('paiements-filtre').value;
    const visibles=commandes.filter(c=>(!cherche||c.orderid.toLowerCase().includes(cherche)||
      String(c.formule).toLowerCase().includes(cherche))&&(
        filtre==='tous'||(filtre==='alerte'&&estAlerte(c))||
        (filtre==='attente'&&c.statut!=='paye')||(filtre==='paye'&&c.statut==='paye')));
    const tbody=$('paiements-lignes');tbody.replaceChildren();
    visibles.forEach(c=>{
      const tr=element('tr');
      [date(c.dateCreation),c.orderid,euros(c.montant),
       c.statut==='paye'?'Payée':c.statut==='attente'?'En attente':texte(c.statut),
       etatStripe(c),estAlerte(c)?'À vérifier':'—'].forEach(v=>tr.appendChild(cellule(v)));
      const td=element('td'),b=element('button','Détails');b.type='button';b.className='lcdp-button lcdp-button-secondary';
      b.addEventListener('click',()=>ouvrirDetails(c.orderid));td.appendChild(b);tr.appendChild(td);tbody.appendChild(tr);
    });
    $('paiements-vide').hidden=visibles.length>0;
    $('paiements-synthese').textContent=commandes.length+' commande(s) · '+
      commandes.filter(estAlerte).length+' alerte(s) · '+
      commandes.filter(c=>c.statut==='paye').length+' confirmée(s)';
  }
  async function chargerListe(){
    if(occupe)return;occupe=true;$('paiements-rafraichir').disabled=true;message('Actualisation…');
    try{const d=await requete('/liste');commandes=d.commandes||[];
      rendreListe();message('Liste actualisée le '+date(d.consulteLe)+'.');}
    catch(e){message(e.message);}
    finally{occupe=false;$('paiements-rafraichir').disabled=false;}
  }
  function insererInfo(tbody,nom,valeur){const tr=element('tr');tr.appendChild(element('th',nom));tr.appendChild(cellule(valeur));tbody.appendChild(tr);}
  function rendreDetails(d){
    const c=d.commande;
    $('paiements-detail-titre').textContent='Commande '+c.orderid;
    const id=$('paiements-identite');id.replaceChildren();
    [
      ['Formule',c.formule],['Montant de la première échéance',euros(c.montant)],
      ['Montant total',euros(c.total)],['Statut Supabase',c.statut],
      ['Création',date(c.dateCreation)],['Fin de validité',date(c.dateLimite)],
      ['Paiement enregistré',date(c.datePaiement)],['Session Checkout',c.checkoutId],
      ['PaymentIntent enregistré',c.intentId],['Abonnement',c.idabo],
      ['Accès provisoires',d.acces.provisoires],['Accès confirmés',d.acces.confirmes]
    ].forEach(([n,v])=>insererInfo(id,n,v));
    const hist=$('paiements-controles');hist.replaceChildren();
    (d.controles||[]).forEach(v=>{const tr=element('tr');
      [date(v.datecontrole),v.origine,v.paiement_statut||'—',
        libelleDiagnostic(v.diagnostic)+(v.detail_erreur?' — '+v.detail_erreur:''),
        texte(v.acces_provisoires)+' provisoire(s), '+texte(v.acces_confirmes)+' confirmés']
      .forEach(x=>tr.appendChild(cellule(x)));hist.appendChild(tr);});
    if(!d.controles?.length){const tr=element('tr');const td=cellule('Aucun contrôle enregistré.');td.colSpan=5;tr.appendChild(td);hist.appendChild(tr);}
    const ev=$('paiements-evenements');ev.replaceChildren();
    (d.evenements||[]).forEach(v=>{const tr=element('tr');
      [date(v.date_reception),v.type_evenement,v.statut_traitement,v.tentatives,
        v.detail_erreur||v.code_erreur||'—']
      .forEach(x=>tr.appendChild(cellule(x)));ev.appendChild(tr);});
    if(!d.evenements?.length){const tr=element('tr');const td=cellule('Aucun webhook enregistré depuis la mise en place du journal.');td.colSpan=5;tr.appendChild(td);ev.appendChild(tr);}
  }
  async function ouvrirDetails(orderid){
    commandeSelectionnee=orderid;$('paiements-detail').hidden=false;
    $('paiements-detail-message').textContent='Chargement des détails…';
    try{const d=await requete('/detail?orderid='+encodeURIComponent(orderid));
      if(commandeSelectionnee!==orderid)return;
      rendreDetails(d);$('paiements-detail-message').textContent='Consultation en lecture seule.';}
    catch(e){$('paiements-detail-message').textContent=e.message;}
    $('paiements-detail').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function verifierStripe(){
    if(occupe||!commandeSelectionnee)return;
    occupe=true;$('paiements-verifier').disabled=true;
    $('paiements-detail-message').textContent='Vérification directe chez Stripe…';
    try{const orderid=commandeSelectionnee;
      const d=await requete('/verifier',{orderid});
      $('paiements-detail-message').textContent=libelleDiagnostic(d.controle.diagnostic)+
        ' · Contrôle enregistré le '+date(d.controle.datecontrole)+'.';
      await ouvrirDetails(orderid);occupe=false;await chargerListe();
      $('paiements-detail-message').textContent=libelleDiagnostic(d.controle.diagnostic)+
        ' · Contrôle enregistré le '+date(d.controle.datecontrole)+'.';
    }catch(e){$('paiements-detail-message').textContent=e.message;}
    finally{occupe=false;$('paiements-verifier').disabled=false;}
  }
  async function chargerFragment(path){const url=window.LCDP_urlAdmin(path);
    const r=await fetch(url,{cache:'no-cache',credentials:'same-origin'});if(!r.ok)throw Error('Bandeau admin indisponible.');
    const t=element('template');t.innerHTML=(await r.text()).trim();return t.content.cloneNode(true);
  }
  async function initialiserBandeau(){
    const slot=$('lcdp-bandeau-slot');if(!slot)return;
    const fragment=await chargerFragment('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html');
    slot.appendChild(fragment);
    slot.querySelectorAll('[data-site-href]').forEach(el=>{
      const path=el.dataset.siteHref||'';
      const c=window.SITE_CONFIG||{};
      const isAdmin=el.dataset.space==='admin';
      const cb=isAdmin?c.adminUrl:c.publicUrl;
      const base=isAdmin?(c.adminBaseUrl||c.ADMIN_BASE||''):(c.publicBaseUrl||c.PUBLIC_BASE||'');
      const url=typeof cb==='function'?cb(path):String(base).replace(/\/+$/,'')+'/'+path.replace(/^\/+/, '');
      el.setAttribute('href',url);
    });
    slot.querySelectorAll('[data-site-src]').forEach(el=>{
      const src=String(el.dataset.siteSrc||'').replace(/^\/?OBJET\/?/,'/');
      el.setAttribute('src',window.LCDP_urlObjet(src));
    });
  }
  async function initialiser(){
    const guard=window.LCDP_GUARD_ADMIN;
    if(!guard||!await guard.verifierAccesPageAdmin({path:CHEMIN}))return;
    if(window.LCDP_ADMIN_AUTORISATION?.admin?.type!=='root')return;
    $('lcdp-main-admin').hidden=false;
    const menu=window.LCDP_MENU_GAUCHE_ADMIN;
    Promise.allSettled([
      initialiserBandeau(),
      menu?.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'membres'})
    ]).then(resultats=>resultats.forEach(x=>{if(x.status==='rejected')console.warn('Composant admin indisponible.');}));
    $('paiements-recherche').addEventListener('input',rendreListe);
    $('paiements-filtre').addEventListener('change',rendreListe);
    $('paiements-rafraichir').addEventListener('click',chargerListe);
    $('paiements-retour').addEventListener('click',()=>{$('paiements-detail').hidden=true;commandeSelectionnee='';});
    $('paiements-verifier').addEventListener('click',verifierStripe);
    await chargerListe();
  }
  initialiser().catch(e=>{console.error('SUIVI_PAIEMENTS',e);message('Impossible de charger le suivi des paiements.');});
})();
