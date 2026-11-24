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
const regressions = depot === "LCDP_membre"
  ? await verifierRegressionsMembre(nom => readFileSync(join(racine,"ESPACE-MEMBRE",nom),"utf8"))
  : [];
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
