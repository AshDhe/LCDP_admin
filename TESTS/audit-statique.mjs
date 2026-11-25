#!/usr/bin/env node
// ADMIN 13 — audit statique multi-dépôts. Ne fait aucun appel Stripe, Supabase ou Resend.
import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { resolve, join, dirname, sep } from "node:path";
import { spawnSync } from "node:child_process";

const depot = process.argv[2];
const racine = resolve(process.argv[3] || "./verification");
const attendus = Object.freeze({
  LCDP_public: "ESPACE-PUBLIC/hello.html",
  LCDP_membre: "ESPACE-MEMBRE/accueil-membre.html",
  LCDP_parc: "ESPACE-PARC",
  LCDP_coach: "ESPACE-COACH",
  LCDP_admin: "ESPACE-ADMIN/accueil-admin.html"
});
if (!Object.hasOwn(attendus, depot)) {
  console.error("Dépôt non reconnu.");
  process.exit(2);
}
const erreurs = [];
const compteurs = { javascript: 0, html: 0, liensScripts: 0, structure: 0 };
function controle(condition, description) {
  if (!condition) erreurs.push(description);
}
function explorer(dossier, resultats = []) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", ".next"].includes(entree.name)) continue;
    const nom = join(dossier, entree.name);
    if (entree.isDirectory()) explorer(nom, resultats);
    else if (entree.isFile()) resultats.push(nom);
  }
  return resultats;
}
for (const chemin of ["config.js", "index.html", attendus[depot]]) {
  compteurs.structure++;
  controle(existsSync(join(racine, chemin)), "Fichier ou répertoire attendu absent : " + chemin);
}
if (!existsSync(racine) || !statSync(racine).isDirectory()) {
  console.error("Dossier de vérification absent.");
  process.exit(2);
}
for (const fichier of explorer(racine)) {
  if (fichier.endsWith(".js") || fichier.endsWith(".mjs") || fichier.endsWith(".cjs")) {
    compteurs.javascript++;
    const resultat = spawnSync(process.execPath, ["--check", fichier], {
      encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 256
    });
    if (resultat.status !== 0) {
      erreurs.push("Syntaxe JS : " + fichier.slice(racine.length + 1) +
        " — " + String(resultat.stderr || resultat.error?.message || "erreur").slice(0, 220));
    }
  }
  if (!fichier.endsWith(".html")) continue;
  compteurs.html++;
  const contenu = readFileSync(fichier, "utf8");
  const pattern = /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1/gi;
  for (const correspondance of contenu.matchAll(pattern)) {
    const src = correspondance[2].split(/[?#]/)[0];
    if (!src.startsWith("./") && !src.startsWith("../")) continue;
    if (src.includes("{{") || src.includes("\${")) continue;
    const local = resolve(dirname(fichier), src);
    compteurs.liensScripts++;
    controle(local.startsWith(racine + sep) && existsSync(local),
      "Script local absent : " + fichier.slice(racine.length + 1) + " → " + src);
  }
}
controle(compteurs.javascript > 0, "Aucun fichier JavaScript vérifié.");
controle(compteurs.html > 0, "Aucun fichier HTML vérifié.");
async function verifierRegressionsMembre(lire) {
  const resultats=[];
  const verifier=async (nom,fn)=>{try{await fn();resultats.push({nom,ok:true});}catch(e){resultats.push({nom,ok:false,erreur:String(e?.message||e)});}};
  const exige=(condition,message)=>{if(!condition)throw Error(message);};
  const plan=lire("reserver-membre.js");
  const compte=lire("mes-informations.js");
  const acces=lire("planning-membre.js");
  const extrait=(debut,fin)=>{
    const a=plan.indexOf(debut),b=plan.indexOf(fin,a+debut.length);
    exige(a>=0&&b>a,"Fonction métier introuvable : "+debut);
    return plan.slice(a,b);
  };
  const compiler=(code,env,nom)=>new Function(...Object.keys(env),code+"\nreturn "+nom+";")(...Object.values(env));
  const choixCode=extrait("  async function afficherDialogueAbonnementPlanning(","  async function requeteDuoActif(");
  const situations=[
    ["DA absente : demande",null,"jour",true,"demande",false],
    ["DA absente : DUO",null,"jour",false,"invitation",false],
    ["DA en cours : DUO","encours","jour","invitation","invitation",true],
    ["DA refusée : DUO sans rappel du refus","non","jour","invitation","invitation",false],
    ["DA valide : abonnement","oui","jour",true,"abonnement",true],
    ["DA valide : DUO même avec abonnement","oui","jour",false,"invitation",true],
    ["DA absente : horizon",null,"mois","demande","demande",false],
    ["DA en cours : horizon","encours","mois","fermer",null,false],
    ["DA refusée : horizon","non","mois","fermer",null,false],
    ["DA valide : horizon","oui","mois","abonnement","abonnement",true],
    ["DA valide : fermeture sans action","oui","jour",null,null,true],
    ["Plafond absolu M+9","oui","mois","fermer",null,true,{moisCible:"2027-09"}],
    ["Compte suspendu : horizon M+2","oui","mois","fermer",null,true,{},true]
  ];
  for(const [nom,statut,type,ret,attendu,avecParc,contexte={},suspendu=false] of situations){
    await verifier(nom,async()=>{
      const dialogues=[],actions=[];
      const parc=avecParc?{idparc:"parc-test"}:null;
      const env={
        etatPage:{calendrierMoisActif:{parc}},statutDaPourPlanning:()=>statut,
        afficherDialogueInformationPlanifier:async o=>{dialogues.push(o);return ret;},
        afficherChoixPlanifier:async (message,o)=>{dialogues.push({...o,message});return ret;},
        ouvrirDemandeAbonnementDepuisPlanning:async()=>actions.push("demande"),
        proposerDuoActif:async()=>actions.push("invitation"),
        ouvrirAbonnementDepuisPlanning:async o=>{actions.push("abonnement");if(type==="mois")exige(o.dureeMinimumMois===3,"Minimum d'extension modifié");}
      };
      await compiler(choixCode,env,"afficherDialogueAbonnementPlanning")(type,{
        moisMaximum:"2027-01",moisMaximumAbsolu:"2027-08",compteSuspendu:suspendu,
        abonnements:statut==="oui"?[{idabo:"test"}]:[]
      },{dateIso:type==="jour"?"2026-12-15":"",moisCible:type==="mois"?"2027-02":"",...contexte});
      exige(actions.length===(attendu?1:0)&&(!attendu||actions[0]===attendu),"Action inattendue : "+actions.join(", "));
      const dialogue=dialogues[0]||{};
      const boutons=[dialogue.libelleAction,dialogue.libelleAnnuler,dialogue.libelleConfirmer];
      if(type==="mois")exige(!boutons.includes("Demande DUO ACTIF"),"DUO proposé sans journée");
      if(type==="jour"&&statut==="non")exige(!boutons.includes("Faire ma demande")&&!/refus/i.test(dialogue.message),"DA refusée exposée ou redemandée");
      if(type==="jour"&&dialogue.libelleAnnuler==="Demande DUO ACTIF")exige(dialogue.principalEnPremier===true,"DUO ne figure pas en dernier");
      if(contexte.moisCible==="2027-09")exige(/M\+9/.test(dialogue.message),"Plafond absent");
      if(suspendu)exige(/M\+2/.test(dialogue.message),"Limitation suspension absente");
    });
  }
  const duoCode=extrait("  let choixParcDuoActif = false;","  let modeCoachPlanifierActif");
  const mois=["2026-11","2026-12","2027-01"];
  const parcours=[
    {nom:"DUO : sélection parc général",general:true},
    {nom:"DUO : annulation du mois",choix:null},
    {nom:"DUO : confirmation refusée",choix:mois[1],confirme:false},
    {nom:"DUO : M",choix:mois[0],confirme:true},
    {nom:"DUO : M+1",choix:mois[1],confirme:true},
    {nom:"DUO : M+2 et passage d’année",choix:mois[2],confirme:true},
    {nom:"DUO : mois hors horizon",choix:"2027-02",confirme:true},
    {nom:"DUO : habilitation contrôlée seulement au POST",choix:mois[0],confirme:true,erreur:"DUO_HABILITATION"},
    {nom:"DUO : quota refusé",choix:mois[0],confirme:true,erreur:"DUO_QUOTA"},
    {nom:"DUO : doublon refusé",choix:mois[0],confirme:true,erreur:"DUO_DOUBLON"},
    {nom:"DUO : ancien Worker incompatible",ancien:true},
    {nom:"DUO : confirmation serveur du mois incorrecte",choix:mois[0],confirme:true,incoherent:true},
    {nom:"DUO : session expirée",choix:mois[0],confirme:true,erreur:"session"}
  ];
  for(const c of parcours)await verifier(c.nom,async()=>{
    const journal={get:0,post:[],information:[],confirmation:[],erreurs:[],filtre:0,connexion:0};
    const env={
      etatPage:{calendrierMoisActif:{parc:c.general?null:{idparc:"parc-test"}}},
      filtreParcOuvert:false,ouvrirFiltreParcPlanifier:async()=>{journal.filtre++;},
      requeteDuoActif:async(methode="GET",corps)=>{
        if(methode==="GET"){journal.get++;return c.ancien?{}:{moisAutorises:mois,habilitation:{eligible:false}};}
        journal.post.push(corps);
        if(c.erreur){const e=Error("Refus test");e.code=c.erreur;e.sessionExpiree=c.erreur==="session";throw e;}
        return {demande:{mois_cible:(c.incoherent?"2027-02":corps.mois)+"-01"}};
      },
      afficherDialogueInformationPlanifier:async o=>{journal.information.push(o);return c.choix;},
      afficherChoixPlanifier:async (message,o)=>{journal.confirmation.push({message,...o});return c.confirme;},
      afficherErreurPlanifier:async (message,o)=>journal.erreurs.push({message,...o}),
      redirigerConnexionMembre:()=>{journal.connexion++;}
    };
    await compiler(duoCode,env,"proposerDuoActif")();
    if(c.general){exige(journal.filtre===1&&journal.get===0&&journal.post.length===0,"Sélecteur de parc contourné");return;}
    if(c.ancien){exige(journal.post.length===0&&journal.erreurs.length===1,"Ancien Worker non bloqué");return;}
    const info=journal.information[0];
    exige(info?.message==="Pour quel mois demandez-vous une invitation ?","Libellé modifié");
    exige(JSON.stringify(info.actions?.map(a=>a.label))===JSON.stringify(["Ce mois-ci","Le mois prochain","Janvier"]),"Choix des mois incorrect");
    const depot=mois.includes(c.choix)&&c.confirme===true;
    exige(journal.post.length===(depot?1:0),"POST inattendu ou manquant");
    if(depot)exige(journal.post[0].mois===c.choix&&journal.post[0].idparc==="parc-test","Mois ou parc transmis incorrect");
    if(c.erreur==="session"){exige(journal.connexion===1&&journal.information.length===1,"Session expirée mal gérée");return;}
    if(c.erreur||c.incoherent){
      exige(journal.erreurs.length===1&&journal.information.length===1,"Faux succès ou refus non affiché");
      exige(journal.erreurs[0].lienInvitation===(c.erreur==="DUO_HABILITATION"),"Lien Invitation incorrect");
    }else exige(journal.information.length===(depot?2:1),"Confirmation de succès incorrecte");
  });
  await verifier("Mon compte : pictogrammes imbriqués",()=>exige(/modifier-telephone-membre"\s*\|\|\s*champ\.classList\.contains\("lcdp-compte-equipement-temoin"\)\)\s*zoneControl\.appendChild\(bouton\)/.test(compte),"Ancrage générique du pictogramme absent"));
  await verifier("Mon compte : mois cible affiché",()=>exige(compte.includes("demande.mois_cible")&&compte.includes("nomParc+\" — \"+mois"),"Affichage du mois absent"));
  await verifier("Mes accès : demandes séparées",()=>exige(acces.includes("chargerDemandesDuoActifMesAcces")&&acces.includes('ENDPOINT_MON_COMPTE_MEMBRE+"/duoactif"')&&acces.includes("etat.slotPlanning.before(section)"),"Section DUO ACTIF absente"));
  await verifier("Planifier : lien règlement au singulier",()=>exige(plan.includes("Règlement de l'application — Invitation")&&plan.includes("/ESPACE-PUBLIC/reglement-app.html"),"Lien réglementaire absent"));
  return resultats;
}
async function verifierAbonnementCompte(compte){
  const a=compte.indexOf("  function libelleCompteurCompte("),b=compte.indexOf("  // Deux raccourcis dans Statut membre",a);
  if(a<0||b<a)throw Error("Fonctions Abonnement introuvables");
  const results=[];
  const cas=[
    {nom:"DA valide sans abonnement",da:"oui",abonnements:[],message:"Aucun abonnement souscrit",label:"Souscrire",href:"/ESPACE-MEMBRE/reserver-membre.html?mode=aboreza",fetches:1},
    {nom:"DA absente",da:null,message:"Vous ne pouvez pas encore souscrire d’abonnement",label:"Être invité(e)",href:"/ESPACE-MEMBRE/reserver-membre.html",fetches:0},
    {nom:"DA en cours",da:"encours",message:"Vous ne pouvez pas encore souscrire d’abonnement",label:"Être invité(e)",href:"/ESPACE-MEMBRE/reserver-membre.html",fetches:0},
    {nom:"DA refusée",da:"non",message:"Vous ne pouvez pas encore souscrire d’abonnement",label:"Être invité(e)",href:"/ESPACE-MEMBRE/reserver-membre.html",fetches:0},
    {nom:"Abonnement existant",da:"oui",abonnements:[{}],count:1,message:"1 abonnement souscrit",fetches:1},
    {nom:"Historique indisponible",da:"oui",echec:true,message:"Impossible de charger les abonnements.",fetches:1}
  ];
  for(const c of cas){
    try{
      const classes=new Set();
      const resume={classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}};
      const bouton={setAttribute(){}},nombre={},action={removeAttribute(k){delete this[k];}},liste={replaceChildren(){}};
      const map={"#lcdp-compte-abonnement-resume":resume,"#lcdp-compte-abonnement-nombre":nombre,"#lcdp-compte-abonnement-compteur":bouton,"#lcdp-compte-abonnement-liste":liste,"#lcdp-compte-abonnement-action":action};
      const section={querySelector:k=>map[k]};
      let fetches=0,history=0;
      const env={document:{getElementById:()=>section},normaliserStatudaCompte:x=>String(x||"").trim().toLowerCase(),construireUrlMembre:x=>x,ENDPOINT_ABONNEMENTS_COMPTE:"https://test.invalid",fetch:async()=>{fetches++;return {status:c.echec?503:200,ok:!c.echec,json:async()=>c.echec?{}:{ok:true,abonnements:c.abonnements}};},trierAbonnementsCompte:x=>x,rangAbonnementCompte:()=>2,remplirHistoriqueAbonnementsCompte:()=>{history++;},console:{error(){}}};
      const fn=new Function(...Object.keys(env),"let versionChargementAbonnementsCompte=0;\n"+compte.slice(a,b)+"\nreturn actualiserBlocAbonnementCompte;")(...Object.values(env));
      await fn({statuda:c.da});
      if(section.hidden!==false||resume.textContent!==c.message||fetches!==c.fetches||bouton.hidden!==!c.count||bouton.disabled!==!c.count||action.hidden!==!c.label||classes.has("lcdp-compte-placeholder-da")===Boolean(c.count)||history!==(c.count?1:0))throw Error("Etat ou compteur incorrect");
      if(c.label&&(action.textContent!==c.label||action.href!==c.href))throw Error("Action incorrecte");
      results.push({nom:"Abonnement : "+c.nom,ok:true});
    }catch(e){results.push({nom:"Abonnement : "+c.nom,ok:false,erreur:String(e.message||e)});}
  }
  results.push({nom:"Services : typographie commune et alerte vide",ok:compte.includes('texte.className="lcdp-compte-alertes-vide lcdp-compte-placeholder-da";')&&compte.includes('afficherSlotService(liste,"Aucune alerte planifiée");')});
  return results;
}

async function verifierRetractationPaiement(lire) {
  const paiement=lire("paiement-membre.js"), compte=lire("mes-informations.js");
  const resultats=[];
  const test=(nom,fn)=>{try{fn();resultats.push({nom,ok:true});}catch(e){resultats.push({nom,ok:false,erreur:String(e.message||e)});}};
  const exige=(condition,message)=>{if(!condition)throw Error(message);};
  const extrait=(source,debut,fin)=>{
    const a=source.indexOf(debut), b=source.indexOf(fin,a+debut.length);
    exige(a>=0&&b>a,"Fonction de rétractation introuvable");
    return source.slice(a,b);
  };
  const cas=[
    ["1J : régime propre","1J","2026-12-01","jour"],
    ["1M : dans le délai","1M","2026-12-01","pendant"],
    ["3M : J+14 inclus","3M","2026-12-08","pendant"],
    ["5M : J+15 hors délai","5M","2026-12-09","apres"],
    ["12M : début après le délai","12M","2027-01-01","apres"],
    ["Date absente","3M","","invalide"]
  ];
  for(const [nom,formule,debut,attendu] of cas) test("Rétractation Paiement : "+nom,()=>{
    class DateFixe extends Date {constructor(...args){super(...(args.length?args:["2026-11-24T12:00:00Z"]));}}
    const fn=new Function("Date",extrait(paiement,"  function chevaucheRetractation(","  function dateCourteJJMMAAAA(")+"\nreturn chevaucheRetractation;")(DateFixe);
    exige((fn(formule,debut)??"invalide")===attendu,"Profil de rétractation inattendu");
  });
  test("Rétractation Paiement : souscription sans option obsolète",()=>{
    const expression=paiement.match(/apiPaiement\('\/valider',\s*\{method:'POST',\s*body:JSON\.stringify\((\{[^}]+\})\)/);
    exige(expression,"Corps de souscription introuvable");
    const body=new Function("panier","echeancier","return "+expression[1])({idpanier:"test"},"echeances");
    exige(Object.keys(body).sort().join(",")==="echeancier,idpanier"&&body.idpanier==="test"&&body.echeancier==="echeances","Choix obsolète ou contrat altéré");
  });
  test("Rétractation Paiement : information pivot 1M sans extension",()=>{
    exige(paiement.includes("1M standard, sans extension")&&paiement.includes("Votre formule complète s’applique ensuite"),"Mention contractuelle absente");
  });
  for(const [nom,instant,possible,attendu] of [
    ["J+14","2026-12-08T22:59:59Z",true,0],
    ["J+15","2026-12-08T23:00:00Z",true,null],
    ["Droit refusé par serveur","2026-11-25T12:00:00Z",false,null]
  ])test("Rétractation Mon compte : "+nom,()=>{
    const fn=new Function(extrait(compte,"  function joursRestantsRetractationCompte(","  function libellesExtensionsCompte(")+"\nreturn joursRestantsRetractationCompte;")();
    exige(fn({dateSouscription:"2026-11-24T10:00:00Z",retractationPossible:possible},new Date(instant))===attendu,"Décompte erroné");
  });
  return resultats;
}

function verifierAvoirComptable(lire) {
  const source=lire("avoir-abonnement.js");
  const resultats=[];
  const test=(nom,fn)=>{try{fn();resultats.push({nom:"Avoir : "+nom,ok:true});}catch(e){resultats.push({nom:"Avoir : "+nom,ok:false,erreur:String(e.message||e)});}};
  const exige=(v,m)=>{if(!v)throw Error(m);};
  const a=source.indexOf("  function construireLignesComptablesAvoir(");
  const b=source.indexOf("  function creerBlocComptableAvoir(",a);
  const fn=()=>{exige(a>=0&&b>a,"Fonction comptable introuvable");return new Function("formaterMontant",source.slice(a,b)+"\nreturn construireLignesComptablesAvoir;")(v=>Number(v).toFixed(2));};
  const arrondi=v=>Math.round(v*100)/100;
  for(const [jours,consomme,encaisse,net] of [[0,0,200,-200],[1,90,200,-110],[2,180,200,-20],[3,190,200,-10],[10,190,190,0],[0,0,0,0]]){
    test(jours+" jour(s), encaissement "+encaisse,()=>{
      const ht=arrondi(consomme/1.10),tva=arrondi(consomme-ht);
      const blocs=fn()({joursConsommes:jours,tarif:{quantite:jours<=2?jours:1,prix_unitaire_ttc:jours<=2?90:190,reference:jours<=2?"1J":"1M"},
        annulation:{ttc:-390,ht:-354.55,tva:-35.45},consommation:{ttc:consomme,ht,tva},
        net:{ttc:consomme-390,ht:arrondi(ht-354.55),tva:arrondi(tva-35.45)},
        remboursement:{encaisse_commande_ttc:-encaisse,facture_retractation_ttc:consomme,net_ttc:net}});
      exige(blocs.length===4,"Ordre des blocs incomplet");
      exige(blocs.slice(0,3).every(b=>b.lignes.map(x=>x[0]).join(",")==="Montant TTC,Montant HT,TVA"),"Ventilation absente");
      exige(Number(blocs[0].lignes[0][1])===-390&&Number(blocs[1].lignes[0][1])===consomme&&Number(blocs[2].lignes[0][1])===consomme-390,"Avoir comptable incorrect");
      exige(Number(blocs[3].lignes[0][1])===-encaisse&&Number(blocs[3].lignes[1][1])===consomme&&Number(blocs[3].lignes[2][1])===net,"Remboursement incorrect");
      exige(net===0?blocs[3].mention==="Aucun remboursement dû.":blocs[3].mention.includes("14 jours calendaires"),"Mention de remboursement incorrecte");
    });
  }
  test("Net positif bloqué",()=>{
    let bloque=false;try{fn()({joursConsommes:0,remboursement:{net_ttc:1}});}catch(e){bloque=/positif/.test(e.message);}
    exige(bloque,"Remboursement positif accepté");
  });
  test("Projet non émis identifié",()=>exige(source.includes("PROJET D’AVOIR — NON ÉMIS"),"Projet non identifié"));
  return resultats;
}

function verifierJournalDocuments(source) {
  const tests=[];const test=(nom,fn)=>{try{fn();tests.push({nom:"Archives : "+nom,ok:true});}catch(e){tests.push({nom:"Archives : "+nom,ok:false,erreur:String(e.message||e)});}};
  const exige=(v,m)=>{if(!v)throw Error(m);};
  const a=source.indexOf("  function construireLignesDocuments("),b=source.indexOf("  function libellePaiement(",a);
  const fonctions=()=>{
    exige(a>=0&&b>a,"Fonctions d’archive introuvables");
    return new Function("formaterMontant","document","ENDPOINT_FACTUPAIEMENT",source.slice(a,b)+"\nreturn {construireLignesDocuments,creerLienDocumentArchive};")(v=>String(v),{createElement:()=>({}),createTextNode:t=>({textContent:t})},"https://test.invalid");
  };
  const facture={typeDocument:"facture",orderid:"CMD-TEST",numeroDocument:"FAC-TEST",dateDocument:"2026-11-10",etat:"emise",montantTtc:390,documentDisponible:true};
  const avoir={typeDocument:"avoir",orderid:"CMD-TEST",idavoir:"AV-TEST",numeroDocument:"AVO-TEST",dateDocument:"2026-11-20",etat:"emise",montantTtc:-210,documentDisponible:true};
  test("Tri commun et montant signé",()=>{const l=fonctions().construireLignesDocuments({documents:[facture,avoir]});exige(l.length===2&&l[0].nature==="Avoir"&&l[0].montant==="-210"&&l[1].nature==="Facture","Tri incorrect");});
  test("Liens vers les HTML archivés",()=>{const f=fonctions(),l=f.construireLignesDocuments({documents:[facture,avoir]});exige(f.creerLienDocumentArchive(l[0].document).href.endsWith("/avoir-document?idavoir=AV-TEST")&&f.creerLienDocumentArchive(l[1].document).href.endsWith("/facture-document?orderid=CMD-TEST"),"Route d’archive incorrecte");});
  test("Documents test identifiés",()=>{const l=fonctions().construireLignesDocuments({documents:[{...avoir,etat:"test",numeroDocument:null}]});exige(l[0].nature==="Avoir — Test"&&fonctions().creerLienDocumentArchive(l[0].document).textContent==="Document test","Test présenté comme émis");});
  test("Document non archivé non ouvrable",()=>exige(fonctions().creerLienDocumentArchive({...avoir,documentDisponible:false}).textContent==="Non archivé","Document non archivé ouvrable"));
  return tests;
}
function verifierJournalComptableAdmin(source) {
  const tests=[];const test=(nom,fn)=>{try{fn();tests.push({nom:"Journal comptable : "+nom,ok:true});}catch(e){tests.push({nom:"Journal comptable : "+nom,ok:false,erreur:String(e.message||e)});}};
  const exige=(v,m)=>{if(!v)throw Error(m);};
  const a=source.indexOf("  const colonnesDeclaratif ="),b=source.indexOf("  async function chargerDeclaratif(",a);
  const fn=()=>{exige(a>=0&&b>a,"Tableau comptable introuvable");return new Function(source.slice(a,b)+"\nreturn lignesDeclaratif;")();};
  const l={mois:"2026-11-01",taux:10,ca_facture_ht:163.64,ca_annule_ht:354.55,tva_facturee:16.36,tva_deduite_avoir:35.45,ca_net_ht:-190.91,tva_nette:-19.09,total_net_ttc:-210};
  test("CA et TVA séparés, signes préservés",()=>{const x=fn()([l])[0];exige(x.join("|")==="2026-11|10|163.64|354.55|16.36|35.45|-190.91|-19.09|-210","Montants incorrects");});
  test("Absence de documents émis",()=>exige(fn()([]).length===0,"Écriture inventée"));
  test("Montant manquant refusé",()=>{let bloque=false;try{fn()([{...l,tva_facturee:null}]);}catch(e){bloque=true;}exige(bloque,"Montant non vérifié");});
  return tests;
}

async function verifierRemboursementsAdmin(lire) {
  const resultats=[],test=async(nom,fn)=>{try{await fn();resultats.push({nom:"ADMIN 15 : "+nom,ok:true});}catch(e){resultats.push({nom:"ADMIN 15 : "+nom,ok:false,erreur:String(e.message||e)});}};
  const exige=(v,m)=>{if(!v)throw Error(m);};
  const js=lire("ESPACE-ADMIN/C_MEMBRES/Remboursements.js");
  const partie=(source,a,b)=>{const x=source.indexOf(a),y=b?source.indexOf(b,x+a.length):source.length;exige(x>=0&&y>x,"Fonction absente : "+a);return source.slice(x,y);};
  const front=new Function(partie(js,"  function montantDu(","  function fermer(")+partie(js,"  function construireConfirmation(","  async function confirmer(")+"return {estConfirmable,construireConfirmation};")();
  const row={idavoir:"00000000-0000-4000-8000-000000000002",statutremboursement:"a_payer",environnement:"direct",mode_initial:"stripe",montant_ttc:20,datedemande:"2020-01-01",iban:"FICTIF",titulaire:"TEST"};
  const valid={montant:20,date:"2020-01-02",mode:"stripe",reference:"re_TEST",confirmation:true};
  await test("Confirmation du montant exact",()=>exige(front.construireConfirmation(row,valid).montant===20,"Montant incorrect"));
  for(const [nom,r,v] of [["Test non confirmable",{...row,environnement:"test"},valid],["Montant incorrect",row,{...valid,montant:21}],["Changement de moyen sans accord",row,{...valid,mode:"virement"}],["Référence Stripe invalide",row,{...valid,reference:"xxx"}],["Absence de confirmation",row,{...valid,confirmation:false}]]) await test(nom,()=>{let bloque=false;try{front.construireConfirmation(r,v);}catch{bloque=true;}exige(bloque,"Opération acceptée");});
  // Les workers sont conservés hors GitHub et testés séparément avant livraison.
  const ventes=lire("ESPACE-ADMIN/C_MEMBRES/VentesAbo.js");
  await test("Cumul annuel comptable",()=>{const fn=new Function(partie(ventes,"  const colonnesDeclaratif =","  async function chargerDeclaratif(")+"return lignesDeclaratifAnnuel;")();const l={annee:2026,taux:10,ca_facture_ht:100,ca_annule_ht:80,tva_facturee:10,tva_deduite_avoir:8,ca_net_ht:20,tva_nette:2,total_net_ttc:22};exige(fn([l])[0].join("|")==="2026|10|100|80|10|8|20|2|22","Cumul non réconcilié");});
  return resultats;
}
const regressions = depot === "LCDP_membre"
  ? [...await verifierRegressionsMembre(nom => readFileSync(join(racine,"ESPACE-MEMBRE",nom),"utf8")), ...await verifierAbonnementCompte(readFileSync(join(racine,"ESPACE-MEMBRE","mes-informations.js"),"utf8")), ...await verifierRetractationPaiement(nom => readFileSync(join(racine,"ESPACE-MEMBRE",nom),"utf8")), ...verifierAvoirComptable(nom => readFileSync(join(racine,"ESPACE-MEMBRE",nom),"utf8")), ...verifierJournalDocuments(readFileSync(join(racine,"ESPACE-MEMBRE","mes-factures-membre.js"),"utf8"))]
  : depot === "LCDP_admin" ? [...verifierJournalComptableAdmin(readFileSync(join(racine,"ESPACE-ADMIN","C_MEMBRES","VentesAbo.js"),"utf8")), ...await verifierRemboursementsAdmin(nom => readFileSync(join(racine,nom),"utf8"))] : [];
compteurs.regressionsMetier = regressions.length;
for (const test of regressions) {
  console.log((test.ok ? "OK " : "ECHEC ") + test.nom + (test.ok ? "" : " : " + test.erreur));
  controle(test.ok, "Régression métier : " + test.nom + " — " + (test.erreur || ""));
}
const date = new Date().toISOString();
const resultat = {
  depot, date, statut: erreurs.length ? "echec" : "reussi",
  compteurs, regressions, anomalies: erreurs
};
console.log(JSON.stringify(resultat, null, 2));
const resume = [
  "### " + depot + " — " + (erreurs.length ? "Échec" : "Succès"),
  "Audit statique et, pour MEMBRE, scénarios métier simulés. Aucun appel aux services de production ; pas de validation Cloudflare, Supabase, Stripe ou Resend.",
  "",
  "| Contrôle | Nombre |", "| --- | ---: |",
  "| Fichiers JS analysés | " + compteurs.javascript + " |",
  "| Pages HTML inspectées | " + compteurs.html + " |",
  "| Références de scripts vérifiées | " + compteurs.liensScripts + " |",
  "| Éléments structurels vérifiés | " + compteurs.structure + " |",
  "| Scénarios métier simulés | " + regressions.filter(t=>t.ok).length + " / " + regressions.length + " |",
  "| Anomalies | " + erreurs.length + " |",
  ...regressions.map(t => "- " + (t.ok ? "OK : " : "Échec : ") + t.nom),
  "",
  ...erreurs.slice(0, 30).map(e => "- " + e),
  ""
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, resume + "\n");
}
if (erreurs.length) process.exitCode = 1;
