(() => {
'use strict';
const config=window.SITE_CONFIG||{};
const base=String(config.workerParcPlanningAdminUrl||config.WORKER_PARC_PLANNING_ADMIN_URL||window.ADMIN_CONFIG?.API_PARC_PLANNING_ADMIN||'').replace(/\/+$/,'');
const $=id=>document.getElementById(id), ia=document.body.dataset.mode==='ia';
let jours=[], parc=null, onglet='duo', dirty=new Set(), saving=null, busy=false, operations=[], proposition=null;
let joursInitialementCharges=[];
const modificationsCellules=new Set();
// Brouillons non enregistrés, isolés par parc et par mois pendant cette session.
const brouillonsMois=new Map();
const cleBrouillon=()=>`${selected.idparc}|${selected.mois}`;
function memoriserBrouillon(){
  if(!selected.idparc||!selected.mois)return;
  if(!dirty.size){brouillonsMois.delete(cleBrouillon());return;}
  brouillonsMois.set(cleBrouillon(),{
    jours:JSON.parse(JSON.stringify(jours)),
    dates:[...dirty],cellules:[...modificationsCellules]
  });
}
function restaurerBrouillon(){
  const brouillon=brouillonsMois.get(cleBrouillon());
  if(!brouillon)return false;
  jours=JSON.parse(JSON.stringify(brouillon.jours));
  dirty=new Set(brouillon.dates);
  modificationsCellules.clear();
  brouillon.cellules.forEach(c=>modificationsCellules.add(c));
  return true;
}
function existeBrouillon(){return [...brouillonsMois.values()].some(b=>b.dates.length>0);}

const cleCellule=(date,k,i)=>`${date}|${k}|${i}`;
let bases=[],moisOuverts=[],baseBrouillon=null,baseDirty=false;
let recorder=null, stream=null, recordTimer=null;
const selected={dptmt:'',idparc:'',mois:''};
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function statut(msg,erreur=false){$('status').textContent=msg;$('status').dataset.error=String(erreur);}
function boutons(){
  document.querySelectorAll('[data-save]').forEach(b=>b.disabled=busy||!!saving||!parc||(ia?!proposition:onglet==='base'?!baseBrouillon:!dirty.size));
  const etat=$('etat-save');
  etat.textContent=saving?'Enregistrement…':busy?'Traitement en cours…':ia&&proposition?'Proposition non enregistrée':baseDirty?'Nouvelle base non enregistrée':dirty.size?'Modifications non enregistrées':parc?'Enregistré':'';
  etat.dataset.nonEnregistre=String(Boolean(dirty.size||baseDirty||proposition));
  const shell=document.querySelector('.planning-shell');if(shell)shell.classList.toggle('planning-modifie',Boolean(dirty.size||baseDirty||proposition));
}
async function api(path,body,method){
  if(!base) throw Error('API Planning parc non configurée.');
  const response=await fetch(base+path,{credentials:'include',cache:'no-store',method:method||(body?'POST':'GET'),headers:body instanceof FormData?{Accept:'application/json'}:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const d=await response.json().catch(()=>null);if(!response.ok||!d?.success)throw Error(d?.message||'Connexion impossible.');return d;
}
const contexte=()=>({idparc:selected.idparc,dptmt:selected.dptmt,mois:selected.mois});
function apres(d){if(d.jours)jours=d.jours;if(d.operations)operations=d.operations;if(d.bases)bases=d.bases;if(d.moisOuverts)moisOuverts=d.moisOuverts;if(d.parc)parc=d.parc;$('identite').textContent=parc?parc.nom+' — Département '+parc.dptmt:'Choisir un département et un parc';}
// Ne jamais annoncer une sauvegarde réussie sans vérifier les valeurs relues.
const CHAMPS_A_VERIFIER=['capacite','capacite_lcdp','ferme','ouvert','demi','hiver','famille','coach'];
function valeursIdentiques(attendu,relus){return CHAMPS_A_VERIFIER.every(k=>JSON.stringify(attendu[k])===JSON.stringify(relus[k]));}
async function enregistrer(){
  if(saving)return saving;
  if(!dirty.size)return;
  const dates=[...dirty], snapshot=jours.filter(j=>dirty.has(j.date)).map(j=>JSON.parse(JSON.stringify(j)));
  saving=(async()=>{
    busy=true;bloquer(true);boutons();statut('Enregistrement et vérification des modifications…');
    try{
      const d=await api('/enregistrer',{...contexte(),jours:snapshot});
      if(!Array.isArray(d.jours))throw Error('Le serveur ne confirme pas les journées enregistrées. Vérification impossible.');
      const manquantes=snapshot.filter(l=>{
        const retour=d.jours.find(r=>r.date===l.date);
        return !retour||!valeursIdentiques(l.jour,retour.jour);
      });
      if(manquantes.length){
        throw Error('Enregistrement non confirmé pour '+manquantes.map(j=>j.date).join(', ')+'. Les modifications restent à l’écran et doivent être contrôlées.');
      }
      apres(d);
      dates.forEach(date=>dirty.delete(date));
      brouillonsMois.delete(cleBrouillon());
      joursInitialementCharges=JSON.parse(JSON.stringify(jours));
      modificationsCellules.clear();afficher();
      statut('Modifications enregistrées et vérifiées.'+(d.annulations?' '+d.annulations+' réservation(s) annulée(s).':'')+(d.emailsEnAttente?' Des emails d’annulation sont en attente d’envoi.':''));
    }catch(e){statut(e.message+' Aucune modification locale n’a été effacée.',true);throw e;}
    finally{busy=false;saving=null;bloquer(false);boutons();}
  })();return saving;
}
function bloquer(on){document.querySelectorAll('#tableau input,#departement,#parc,#mois,[data-tab]').forEach(e=>{if(on){e.dataset.disabledBefore=e.disabled?'1':'0';e.disabled=true;}else if(e.dataset.disabledBefore!==undefined){e.disabled=e.dataset.disabledBefore==='1';delete e.dataset.disabledBefore;}});}
function demanderSortieSansEnregistrer() {
  const dialogue=$('planning-sortie');
  if(!dialogue||typeof dialogue.showModal!=='function')return Promise.resolve('rester');
  $('planning-sortie-description').textContent=dirty.size
    ? `${dirty.size} journée(s) du mois ${selected.mois} modifiée(s). Souhaitez-vous les enregistrer avant de continuer ?`
    : baseDirty ? 'Une nouvelle base n’a pas été enregistrée. Souhaitez-vous l’enregistrer ?'
    : 'Une opération n’a pas été enregistrée. Souhaitez-vous l’enregistrer ?';
  return new Promise(resolve=>{
    let fini=false;
    const handlers=[];
    const terminer=choix=>{
      if(fini)return;fini=true;
      for(const [id,fn] of handlers)$(id).removeEventListener('click',fn);
      dialogue.removeEventListener('cancel',annuler);dialogue.removeEventListener('close',fermer);
      if(dialogue.open)dialogue.close();resolve(choix);
    };
    const annuler=e=>{e.preventDefault();terminer('rester');};
    const fermer=()=>terminer('rester');
    for(const [id,choix] of [['planning-sortie-rester','ignorer'],['planning-sortie-enregistrer','enregistrer']]){
      const fn=()=>terminer(choix);handlers.push([id,fn]);$(id).addEventListener('click',fn);
    }
    dialogue.addEventListener('cancel',annuler);dialogue.addEventListener('close',fermer);
    dialogue.showModal();$('planning-sortie-enregistrer').focus();
  });
}
function abandonnerModifications(){
  if(dirty.size)memoriserBrouillon(); // Ne jamais effacer le mois non sauvegardé.
  if(baseDirty)annulerBase();
  if(ia&&proposition)effacerProposition();
  boutons();
}
async function navigation(action){
  if(busy||saving)throw Error('Une opération est en cours.');
  if(dirty.size||baseDirty||(ia&&proposition)){
    const choix=await demanderSortieSansEnregistrer();
    if(choix==='rester')return;
    if(choix==='ignorer'){
      if(baseDirty||(ia&&proposition))return; // Pas de brouillon multi-mois pour les bases/IA.
      memoriserBrouillon();
    }
    if(choix==='enregistrer'){
      if(dirty.size)await enregistrer();
      if(baseDirty)await enregistrerBase();
      if(ia&&proposition)await appliquerIA();
      if(dirty.size||baseDirty||(ia&&proposition))return;
    }
  }
  await action();
}
function entete(){return '<thead><tr><th scope="col">'+esc(selected.mois)+'</th>'+jours.map(j=>{const dt=new Date(j.date+'T12:00:00Z');return '<th scope="col" class="'+([0,6].includes(dt.getUTCDay())?'weekend':'')+'">'+dt.getUTCDate()+(j.jour.ancien?' *':'')+'<br>'+dt.toLocaleDateString('fr-FR',{weekday:'short',timeZone:'UTC'})+'</th>';}).join('')+'</tr></thead>';}
const horaires=['6 h – 10 h','10 h – 13 h','13 h – 17 h','17 h – 21 h','21 h – 2 h'];
function chk(ligne,k,index,checked,disabled,raison=''){
  const marque=modificationsCellules.has(cleCellule(ligne.date,k,index));
  const titre=raison?` title="${esc(raison)}"`:'';
  return '<input type="checkbox" data-date="'+ligne.date+'" data-key="'+k+'" data-index="'+index+'" '+(checked?'checked ':'')+(disabled?'disabled ':'')+(marque?'class="planning-case-modifiee" ':'')+titre+' aria-label="'+esc(k+' '+(index>=0?index+1:'')+' le '+ligne.date+(raison?' — '+raison:''))+'">';
}
function ligne(label,fn,classe=''){return '<tr class="'+classe+'"><th scope="row">'+esc(label)+'</th>'+jours.map(j=>'<td class="'+(j.jour.ferme?'closed':'')+'">'+fn(j)+'</td>').join('')+'</tr>';}
function afficher(){
  if(!parc)return;
  reglerVue();if(onglet==='base'&&!ia){afficherBases();return;}
  let html=entete()+'<tbody>';
  const lecture=onglet!=='duo';
  html+=ligne('Capacité parc',j=>'<input aria-label="Capacité le '+j.date+'" type="number" min="1" max="100000" data-date="'+j.date+'" data-key="capacite" value="'+j.jour.capacite+'" '+(lecture||j.date<today?'disabled':'')+'>');
  html+=ligne('Capacité LCDP',j=>'<input aria-label="Capacité LCDP le '+j.date+'" type="number" min="1" max="100000" data-date="'+j.date+'" data-key="capacite_lcdp" value="'+(j.jour.capacite_lcdp??3)+'" '+(lecture||j.date<today?'disabled':'')+'>');
  html+=ligne('Accueil IA',j=>esc(j.jour.operations.filter(o=>o.type==='boost').map(o=>'P'+o.plages.join(', P')+' → '+o.capacite).join(' · ')||'—'));
  html+=ligne('Privatisé',j=>esc(j.jour.operations.filter(o=>o.type==='privatisation').map(o=>'P'+o.plages.join(', P')).join(' · ')||(j.jour.ancien && Object.values(j.jour.ancien.PRIVATISATION||{}).some(Boolean)?'Ancien planning':'—')));
  html+=ligne('Fermé',j=>chk(j,'ferme',-1,j.jour.ferme,lecture||j.date<today));
  // Une plage complète et sa version à 50 % sont deux choix exclusifs.
  // Le mode Hiver réduit P1/P4 uniquement lorsqu'elles sont ouvertes.
  const estDemi=(j,p)=>(p===0&&(j.jour.demi[0]||j.jour.hiver))||(p===3&&(j.jour.demi[1]||j.jour.hiver))||(p===4&&j.jour.demi[2]);
  for(let p=0;p<5;p++)html+=ligne('Plage '+(p+1)+' · '+horaires[p],j=>chk(j,'ouvert',p,j.jour.ouvert[p]&&!estDemi(j,p),lecture||j.date<today));
  for(const [i,p] of [[0,0],[1,3],[2,4]])html+=ligne('50 % plage '+(p+1),j=>chk(j,'demi',i,j.jour.ouvert[p]&&estDemi(j,p),lecture||j.date<today));
  html+=ligne('Hiver',j=>chk(j,'hiver',-1,j.jour.hiver,lecture||j.date<today),'winter');
  if(lecture)for(const mode of ['partage','exclusif']){
    html+='<tr class="group"><th scope="row">'+(mode==='partage'?'Partagé':'Exclusif')+' '+(onglet==='famille'?'Famille':'Coach')+'</th><td colspan="'+jours.length+'" aria-hidden="true"></td></tr>';
    for(let p=0;p<5;p++)html+=ligne('Plage '+(p+1)+' · '+horaires[p],j=>{
      const other=onglet==='famille'?'coach':'famille';
      const interdit=j.jour[other][p]==='exclusif';
      const prive=j.jour.operations.some(o=>o.type==='privatisation'&&o.plages.includes(p+1));
      // Les accès Famille et Coach héritent exclusivement de l'ouverture Duo,
      // y compris lorsque Duo a choisi la variante à 50 %.
      const raison=interdit?`Exclusivité ${other==='famille'?'Famille':'Coach'}`:
        j.date<today?'Date passée':j.jour.ferme?'Parc fermé':prive?'Plage privatisée':!j.jour.ouvert[p]?'Plage fermée dans Duo':'';
      return interdit ? '<span class="planning-exclusivite" title="'+esc(raison)+'" aria-label="'+esc(raison)+'">'+esc(other==='famille'?'Famille excl.':'Coach excl.')+'</span>' :
        chk(j,mode,p,j.jour[onglet][p]===mode,Boolean(raison),raison);
    });
  }
  const zone=$('tableau').closest('.planning-scroll');const x=zone?.scrollLeft||0,y=zone?.scrollTop||0;
  $('tableau').innerHTML=html+'</tbody>';if(zone){zone.scrollLeft=x;zone.scrollTop=y;}boutons();
}
function confirmerAncienneJournee(date) {
  const dialogue = $('planning-confirmation-ancien');
  const dateCible = $('planning-confirmation-date');
  if (!dialogue || typeof dialogue.showModal !== 'function') {
    // Ne jamais modifier un ancien planning sans confirmation explicite.
    return Promise.resolve(false);
  }
  dateCible.textContent = dateLisible(date);
  return new Promise(resolve => {
    const annuler = $('planning-confirmation-annuler');
    const confirmer = $('planning-confirmation-valider');
    let termine = false;
    const terminer = accepte => {
      if (termine) return;
      termine = true;
      dialogue.removeEventListener('cancel', surAnnulation);
      dialogue.removeEventListener('close', surFermeture);
      annuler.removeEventListener('click', surRefus);
      confirmer.removeEventListener('click', surAccord);
      if (dialogue.open) dialogue.close();
      resolve(accepte);
    };
    const surAnnulation = event => { event.preventDefault(); terminer(false); };
    const surFermeture = () => terminer(false);
    const surRefus = () => terminer(false);
    const surAccord = () => terminer(true);
    dialogue.addEventListener('cancel', surAnnulation);
    dialogue.addEventListener('close', surFermeture);
    annuler.addEventListener('click', surRefus);
    confirmer.addEventListener('click', surAccord);
    dialogue.showModal();
    annuler.focus();
  });
}

async function changement(e){
  const el=e.target;if(!el.matches('input[data-date]'))return;
  const ligne=jours.find(j=>j.date===el.dataset.date),j=ligne.jour,k=el.dataset.key,i=Number(el.dataset.index);
  if(j.ancien){if(!await confirmerAncienneJournee(ligne.date)){afficher();return;}delete j.ancien;}
  if(k==='capacite'||k==='capacite_lcdp'){const n=Number(el.value);if(!Number.isInteger(n)||n<1||n>100000){statut('Capacité entière entre 1 et 100000.',true);afficher();return;}j[k]=n;}
  else if(k==='partage'||k==='exclusif'){
    j[onglet][i]=el.checked?k:'';
    // Famille/Coach ne sont jamais autorisés à ouvrir une plage.
    if(!j.ouvert[i]){afficher();return;}
    if(el.checked&&k==='exclusif')j[onglet==='famille'?'coach':'famille'][i]='';
  } else if(k==='demi' && i>=0){
    const plage=[0,3,4][i];
    j.demi[i]=el.checked;
    // Cocher 50 % dans Duo ouvre directement cette plage en durée réduite.
    // Décocher 50 % ferme cette plage ; la plage complète reste un choix séparé.
    j.ouvert[plage]=el.checked;
  } else if(k==='ouvert' && i>=0){
    j.ouvert[i]=el.checked;
    const demiIndex=({0:0,3:1,4:2})[i];
    if(demiIndex!==undefined)j.demi[demiIndex]=false;
  } else if(i>=0)j[k][i]=el.checked;else j[k]=el.checked;
  dirty.add(ligne.date);modificationsCellules.add(cleCellule(ligne.date,k,i));
  // Le changement de version 50 % / entière affecte également la case jumelle.
  if(k==='ouvert' || k==='demi'){const p=k==='demi'?[0,3,4][i]:i;const di=({0:0,3:1,4:2})[p];modificationsCellules.add(cleCellule(ligne.date,'ouvert',p));if(di!==undefined)modificationsCellules.add(cleCellule(ligne.date,'demi',di));}
  memoriserBrouillon();
  afficher();statut('Modifications non enregistrées (conservées dans ce navigateur tant que la page reste ouverte).');
  // Aucun enregistrement automatique : validation explicite par l'utilisateur.
}
function options(el,items,empty){el.innerHTML=empty?'<option value="">'+empty+'</option>':'';for(const [v,t]of items)el.add(new Option(t,v));}
async function chargerMois(){
  if(!selected.idparc)return;statut('Chargement du planning…');busy=true;boutons();
  try{const q=new URLSearchParams(contexte());const d=await api('/mois?'+q);apres(d);dirty.clear();joursInitialementCharges=JSON.parse(JSON.stringify(jours));modificationsCellules.clear();const repris=restaurerBrouillon();$('edition').hidden=ia;$('ia').hidden=!ia;afficher();afficherOperations();statut(repris?'Brouillon non enregistré retrouvé pour ce mois. Cliquez sur Enregistrer pour le sauvegarder.':d.emailsEnAttente?'Des emails d’annulation sont en attente d’envoi.':'Planning chargé.');}
  finally{busy=false;boutons();}
}
function reglerVue(){
  $('base-panel').hidden=ia||onglet!=='base';$('nouvelle-base').hidden=ia||onglet!=='base';$('planning-mensuel').hidden=ia||onglet==='base';$('mois-zone').hidden=ia||onglet==='base';
}
function semaineInitiale(){return Array.from({length:7},()=>[false,true,true,false,false]);}
function basesTriees(){return [...bases].sort((a,b)=>b.applicable.localeCompare(a.applicable)||Number(b.id)-Number(a.id));}
function baseActuelle(){return basesTriees().find(b=>b.applicable<=today);}
function tableSemaine(semaine,editable=false){
  const joursSemaine=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  let html='<thead><tr><th scope="col">Plage</th>'+joursSemaine.map(j=>'<th scope="col">'+j+'</th>').join('')+'</tr></thead><tbody>';
  for(let p=0;p<5;p++)html+='<tr><th scope="row">Plage '+(p+1)+' · '+horaires[p]+'</th>'+semaine.map((j,d)=>'<td><input type="checkbox" data-base-jour="'+d+'" data-base-plage="'+p+'" '+(j[p]?'checked ':'')+(editable?'':'disabled ')+'aria-label="Plage '+(p+1)+' '+joursSemaine[d]+'"></td>').join('')+'</tr>';
  return html+'</tbody>';
}
function dateLisible(date){return new Date(date+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});}
function afficherBases(){
  const active=baseActuelle(),triees=basesTriees();
  $('base-courante').innerHTML='<h2>Base actuelle</h2>'+(active?'<p>Applicable depuis le '+esc(dateLisible(active.applicable))+'</p><div class="planning-scroll"><table class="planning-table">'+tableSemaine(active.semaine)+'</table></div>':'<p>Aucune référence disponible.</p>');
  $('base-historique').innerHTML=triees.map(b=>{
    const remplacee=triees.some(a=>a.applicable===b.applicable&&Number(a.id)>Number(b.id));
    const etat=remplacee?'Remplacée':active?.id===b.id?'Actuelle':b.applicable>today?'Programmée':'Historique';
    return '<details class="operation"><summary>'+esc(etat+' · À compter du '+dateLisible(b.applicable))+'</summary><div class="planning-scroll"><table class="planning-table">'+tableSemaine(b.semaine)+'</table></div></details>';
  }).join('');
  const ouverts=moisOuverts.filter(m=>m.mois.slice(0,7)>=today.slice(0,7)).map(m=>m.mois.slice(0,7)).sort();
  $('base-mois-ouverts').textContent=ouverts.length?'Mois déjà ouverts, non modifiés par une nouvelle base — '+ouverts.join(', '):'Aucun mois ouvert recensé pour ce parc.';
  $('base-courante').hidden=!!baseBrouillon;
  $('base-editeur').hidden=!baseBrouillon;
  if(baseBrouillon){$('base-date').value=baseBrouillon.applicable.slice(0,7);$('base-tableau').innerHTML=tableSemaine(baseBrouillon.semaine,true);}
  boutons();
}
async function chargerBases(){
  if(!selected.idparc)return;busy=true;boutons();statut('Chargement des références du parc…');
  try{const d=await api('/bases?'+new URLSearchParams(contexte()));apres(d);$('edition').hidden=false;$('ia').hidden=true;reglerVue();afficherBases();statut('Références chargées. Les mois déjà ouverts restent inchangés.');}
  finally{busy=false;boutons();}
}
async function chargerSelection(){return !ia&&onglet==='base'?chargerBases():chargerMois();}
function annulerBase(){baseBrouillon=null;baseDirty=false;$('base-editeur').hidden=true;$('base-courante').hidden=false;boutons();}
function nouvelleBase(){
  if(busy||!parc)return;
  if(baseDirty&&!confirm('Abandonner la nouvelle base en cours ?'))return;
  const prochain=new Date(today.slice(0,7)+'-01T12:00:00Z');prochain.setUTCMonth(prochain.getUTCMonth()+1);
  const applicable=prochain.toISOString().slice(0,10);
  // Préremplir avec la référence prévue à la date choisie, ou l'actuelle.
  const reference=basesTriees().find(b=>b.applicable<=applicable);
  baseBrouillon={semaine:JSON.parse(JSON.stringify(reference?.semaine||semaineInitiale())),applicable,requete:crypto.randomUUID(),derniere:Math.max(0,...bases.map(b=>Number(b.id)))};
  baseDirty=true;$('base-date').min=applicable.slice(0,7);afficherBases();$('base-date').focus();statut('Nouvelle base à vérifier puis enregistrer.');
}
async function enregistrerBase(){
  if(!baseBrouillon||busy)return;
  const applicable=$('base-date').value+'-01';
  if(!/^\d{4}-\d{2}-01$/.test(applicable)||applicable<=today.slice(0,7)+'-01')throw Error('Choisissez un mois à venir.');
  baseBrouillon.applicable=applicable;
  const remplace=bases.some(b=>b.applicable===applicable);
  if(!confirm('Enregistrer cette nouvelle base pour '+parc.nom+' — Département '+parc.dptmt+', à compter du '+dateLisible(applicable)+' ? Les mois déjà ouverts restent inchangés.'+(remplace?' Une référence est déjà programmée à cette date ; elle reste en historique et cette nouvelle version la remplace.':'')))return;
  busy=true;bloquer(true);$('nouvelle-base').disabled=true;$('base-date').disabled=true;$('base-tableau').querySelectorAll('input').forEach(e=>e.disabled=true);boutons();
  try{const d=await api('/base',{...contexte(),...baseBrouillon});apres(d);annulerBase();afficherBases();statut('Nouvelle base enregistrée. Elle sert uniquement à créer de nouveaux mois à partir du '+dateLisible(applicable)+'.');}
  catch(e){statut(e.message+' La nouvelle base reste à l’écran.',true);throw e;}
  finally{busy=false;bloquer(false);$('nouvelle-base').disabled=false;$('base-date').disabled=false;$('base-tableau').querySelectorAll('input').forEach(e=>e.disabled=false);boutons();}
}
async function chargerParcs(dptmt){const d=await api('/parcs?'+new URLSearchParams({dptmt}));options($('parc'),d.parcs.map(p=>[p.idparc,p.nom]),'Choisir un parc');$('parc').disabled=false;}
function afficherOperations(){
  $('operations').innerHTML=operations.length?operations.map(o=>'<div class="operation"><button type="button" data-delete="'+esc(o.id)+'">Supprimer</button>'+esc(o.type==='boost'?'Boost à '+o.capacite+' personnes':'Privatisation')+'<br>'+esc(o.date_debut+' → '+o.date_fin+' · Plages '+o.plages.join(', '))+'</div>').join(''):'<p>Aucune opération ponctuelle.</p>';
}
function effacerProposition(){proposition=null;$('transcription').textContent='';$('proposition').textContent='';$('rejeter').hidden=true;boutons();}
async function appliquerIA(){
  if(!proposition||busy)return;
  if(!confirm('Enregistrer cette opération pour '+parc.nom+' — département '+parc.dptmt+' ? Une réduction d’accès annule les réservations concernées.'))return;
  busy=true;boutons();
  try{const d=await api('/operation',{...contexte(),operation:proposition});apres(d);effacerProposition();afficherOperations();statut('Opération enregistrée.'+(d.annulations?' '+d.annulations+' réservation(s) annulée(s).':'')+(d.emailsEnAttente?' Des emails d’annulation sont en attente d’envoi.':''));}
  finally{busy=false;boutons();}
}
async function micro(){
  if(recorder?.state==='recording'){clearTimeout(recordTimer);recorder.stop();return;}
  if(!parc)throw Error('Choisir un parc.');if(busy)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('La dictée audio n’est pas disponible dans ce navigateur.');
  effacerProposition();stream=await navigator.mediaDevices.getUserMedia({audio:true});
  try{recorder=new MediaRecorder(stream);}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
  const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=async()=>{
    stream.getTracks().forEach(t=>t.stop());$('micro').textContent='Démarrer la dictée';$('micro').disabled=true;statut('Transcription et analyse de la dictée…');
    try{
      const form=new FormData();const type=recorder.mimeType||'audio/webm';form.append('audio',new Blob(chunks,{type}),type.includes('mp4')?'dictee.mp4':'dictee.webm');
      const d=await api('/dictee?'+new URLSearchParams(contexte()),form);
      $('transcription').textContent=d.texte||'';
      if(d.question){$('proposition').textContent=d.question+' Recommencez la dictée complète.';}
      else{proposition=d.operation;$('proposition').textContent=(proposition.type==='boost'?'Capacité portée à '+proposition.capacite+' personnes':'Privatisation')+'\n'+proposition.date_debut+' → '+proposition.date_fin+'\nPlages '+proposition.plages.join(', ')+'\n'+parc.nom+' — Département '+parc.dptmt;}
      $('rejeter').hidden=false;statut(proposition?'Vérifier puis enregistrer la proposition.':'Une précision est nécessaire.');
    }catch(e){statut(e.message,true);}finally{busy=false;$('micro').disabled=false;boutons();}
  };
  recorder.onerror=()=>{clearTimeout(recordTimer);stream.getTracks().forEach(t=>t.stop());busy=false;$('micro').textContent='Démarrer la dictée';statut('Enregistrement interrompu. Réessayez.',true);boutons();};
  recorder.start();busy=true;boutons();$('micro').textContent='Terminer la dictée';statut('Dictée en cours…');recordTimer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},120000);
}
async function initialiser(){
  if(!window.LCDP_GUARD_ADMIN)throw Error('Contrôle d’accès admin indisponible.');
  if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin())return;
  $('lcdp-main-admin').hidden=false;
  $('titre-page').textContent=ia?'Accueil IA':'Planning parc';$('mois-zone').hidden=ia;
  const d=new Date(today.slice(0,7)+'-01T12:00:00Z');for(let i=0;i<13;i++){const x=new Date(d);x.setUTCMonth(x.getUTCMonth()+i);$('mois').add(new Option(x.toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}),x.toISOString().slice(0,7)));}
  selected.mois=$('mois').value;
  const initialTab=new URLSearchParams(location.search).get('onglet');
  if(['base','duo','famille','coach'].includes(initialTab)){onglet=initialTab;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===onglet)));}
  $('tableau').addEventListener('change',changement);
  // Toute la cellule est une cible de clic, pas uniquement le petit carré.
  $('tableau').addEventListener('click',e=>{
    if(e.target.closest('input,button,a,label'))return;
    const cellule=e.target.closest('td');if(!cellule)return;
    const caseCoche=cellule.querySelector('input[type=checkbox][data-date]');
    if(caseCoche&&!caseCoche.disabled)caseCoche.click();
  });
  $('nouvelle-base').addEventListener('click',nouvelleBase);
  $('annuler-base').addEventListener('click',()=>{if(!busy&&confirm('Abandonner la nouvelle base ?'))annulerBase();});
  $('base-tableau').addEventListener('change',e=>{if(!baseBrouillon||busy)return;const el=e.target;if(el.dataset.baseJour===undefined)return;baseBrouillon.semaine[Number(el.dataset.baseJour)][Number(el.dataset.basePlage)]=el.checked;baseDirty=true;boutons();});
  $('base-date').addEventListener('change',()=>{if(baseBrouillon){baseBrouillon.applicable=$('base-date').value+'-01';baseDirty=true;boutons();}});

  document.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',()=>{(ia?appliquerIA():onglet==='base'?enregistrerBase():enregistrer()).catch(e=>statut(e.message,true));}));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>navigation(async()=>{const precedent=onglet;onglet=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));if(onglet==='base')await chargerBases();else if(precedent==='base'||!jours.length)await chargerMois();else afficher();}).catch(e=>statut(e.message,true))));
  $('mois').addEventListener('change',()=>{const next=$('mois').value;$('mois').value=selected.mois;navigation(async()=>{selected.mois=next;$('mois').value=next;await chargerMois();}).catch(e=>statut(e.message,true));});
  $('departement').addEventListener('change',()=>{const next=$('departement').value;$('departement').value=selected.dptmt;navigation(async()=>{selected.dptmt=next;selected.idparc='';parc=null;jours=[];$('departement').value=next;$('edition').hidden=true;$('ia').hidden=true;$('identite').textContent='Choisir un parc — Département '+next;options($('parc'),[],'Choisir un parc');$('parc').disabled=true;if(next)await chargerParcs(next);boutons();}).catch(e=>statut(e.message,true));});
  $('parc').addEventListener('change',()=>{const next=$('parc').value;$('parc').value=selected.idparc;navigation(async()=>{selected.idparc=next;$('parc').value=next;selected.mois=today.slice(0,7);$('mois').value=selected.mois;parc=null;jours=[];bases=[];moisOuverts=[];$('edition').hidden=true;$('ia').hidden=true;$('identite').textContent=next?'Chargement du parc…':'Choisir un parc';boutons();if(next)await chargerSelection();else{parc=null;$('edition').hidden=true;$('ia').hidden=true;$('identite').textContent='Choisir un parc';boutons();}}).catch(e=>statut(e.message,true));});
  $('micro').addEventListener('click',()=>micro().catch(e=>statut(e.message,true)));$('rejeter').addEventListener('click',effacerProposition);
  $('operations').addEventListener('click',async e=>{const id=e.target.dataset.delete;if(!id||busy)return;if(!confirm('Supprimer cette opération pour '+parc.nom+' ? Les réservations annulées restent annulées.'))return;busy=true;boutons();try{const d=await api('/supprimer-operation',{...contexte(),id});apres(d);afficherOperations();statut('Opération supprimée.'+(d.annulations?' '+d.annulations+' réservation(s) annulée(s).':''));}catch(e){statut(e.message,true);}finally{busy=false;boutons();}});
  document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||a.target==='_blank'||(!dirty.size&&!existeBrouillon()&&!saving&&!proposition&&!baseDirty&&!busy))return;
    e.preventDefault();e.stopImmediatePropagation();navigation(async()=>{if(existeBrouillon()){statut('Des modifications non enregistrées restent dans un autre mois. Enregistrez-les avant de quitter cette page.',true);return;}location.href=a.href;}).catch(e=>statut(e.message,true));},true);
  window.addEventListener('beforeunload',e=>{if(dirty.size||existeBrouillon()||saving||proposition||baseDirty||busy){e.preventDefault();e.returnValue='';}});
  // Ne jamais enregistrer implicitement lors d'un changement d'onglet ou d'une mise en arrière-plan.
  const deps=await api('/departements');options($('departement'),deps.departements.map(d=>[d,d]),'Choisir un département');
  const params=new URLSearchParams(location.search);if(params.get('dptmt')&&deps.departements.includes(params.get('dptmt'))){selected.dptmt=params.get('dptmt');$('departement').value=selected.dptmt;await chargerParcs(selected.dptmt);if([...$('parc').options].some(o=>o.value===params.get('idparc'))){selected.idparc=params.get('idparc');$('parc').value=selected.idparc;await chargerSelection();}}
  if(window.LCDP_MENU_GAUCHE_ADMIN)await window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:'lcdp-menu-gauche-admin-slot',categorieActive:'parcs'});
  const slot=$('lcdp-bandeau-slot');if(window.LCDP_urlAdmin){const r=await fetch(window.LCDP_urlAdmin('/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html'));if(r.ok){slot.innerHTML=await r.text();slot.querySelectorAll('[data-site-href]').forEach(e=>e.href=(e.dataset.space==='admin'?window.LCDP_urlAdmin:window.LCDP_urlPublic)(e.dataset.siteHref));slot.querySelectorAll('[data-site-src]').forEach(e=>e.src=window.LCDP_urlObjet(e.dataset.siteSrc.replace(/^\/?OBJET\/?/,'/')));}}
}
initialiser().catch(e=>statut(e.message,true));
})();
