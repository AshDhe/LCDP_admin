(() => {
  "use strict";

  const CHEMIN = "/ESPACE-ADMIN/C_MEMBRES/VentesAbo.html";
  const cfg = window.SITE_CONFIG || {};
  const BASE = String(cfg.workerAdminDataUrl || cfg.WORKER_ADMIN_DATA_URL ||
    window.ADMIN_CONFIG?.API_ADMIN_DATA || "").replace(/\/+$/, "");
  const $ = id => document.getElementById("lcdp-ventesabo-" + id);
  const vue = new URLSearchParams(window.location.search).get("vue") === "euros"
    ? "euros" : "quantites";
  const devise = new Intl.NumberFormat("fr-FR", {
    style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const entier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const mois = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin",
    "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
  const ordre = new Map([
    ["1J", 1], ["1M", 2], ["3M", 3], ["5M", 4],
    ["6M", 5], ["10M", 6], ["11M", 7], ["1A", 8]
  ]);
  let chargement = false, chargementSynthese = null;
  const onglets = [["abo","Abo"],["duoseul","Duo"],["duoplus","Duo+"],
    ["frecdp","FqDuo+"],["maxduo","MaxDuo"],["fam","FAM"]];
  let ongletActif = "abo";
  const boutonsOnglets = new Map();
  const filtresPivots = new Map();
  let lignesActives = [];
  const refPivot = l => String(l.idprixabo || l.reference_pivot || "");
  const famillePivot = l => String(l.typeabo || l.formule || "");
  const datePivot = l => {
    const d = String(l.debut_pivot || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : "";
  };
  let pageDetail = 0, selectionDetail = null, requeteDetail = null;
  let boutonDetailActif = null;
  const tailleDetail = 100;

  const urlAdmin = path => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(path) : path;
  const urlPublic = path => typeof window.LCDP_urlPublic === "function"
    ? window.LCDP_urlPublic(path) : path;
  const urlObjet = path => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(path) : path;

  function etat(message, erreur = false) {
    const zone = $("statut");
    zone.textContent = message;
    zone.hidden = !message;
    zone.setAttribute("role", erreur ? "alert" : "status");
  }

  function cellule(tag, texte, classe) {
    const el = document.createElement(tag);
    el.textContent = String(texte);
    if (classe) el.className = classe;
    return el;
  }

  function boutonQuantite(n, selection, texte = entier.format(n)) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-table-lecture-admin__cell-action lcdp-ventesabo__quantite";
    bouton.textContent = texte;
    bouton.setAttribute("aria-label", selection.libelle + " : " + n + (selection.categorie ? " extension(s)" : " abonnement(s)") + ", afficher le détail");
    bouton.setAttribute("aria-controls","lcdp-ventesabo-detail");
    bouton.setAttribute("aria-pressed","false");
    bouton.title = "Afficher le détail — " + selection.libelle;
    bouton.addEventListener("click", () => ouvrirDetail({...selection, attendu:n}, bouton));
    return bouton;
  }

  function celluleQuantite(n, selection, classe) {
    const td = cellule("td", "", classe);
    td.appendChild(boutonQuantite(n, selection));
    return td;
  }

  function tableau12(valeur) {
    const t = typeof valeur === "string" ? JSON.parse(valeur) : valeur;
    if (!Array.isArray(t) || t.length !== 12 ||
        t.some(v => v === null || !Number.isFinite(Number(v)))) {
      throw new Error("Données mensuelles incomplètes.");
    }
    return t.map(Number);
  }

  async function bandeauMenu() {
    const r = await fetch(urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), {
      credentials: "same-origin", cache: "no-cache"
    });
    if (!r.ok) throw new Error("Bandeau administrateur indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await r.text()).trim();
    const zone = document.getElementById("lcdp-bandeau-slot");
    zone.replaceChildren(template.content.cloneNode(true));
    zone.querySelectorAll("[data-site-href]").forEach(el => {
      el.href = el.dataset.space === "admin"
        ? urlAdmin(el.dataset.siteHref) : urlPublic(el.dataset.siteHref);
    });
    zone.querySelectorAll("[data-site-src]").forEach(el => {
      el.src = urlObjet(String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu || typeof menu.initialiser !== "function") {
      throw new Error("Menu administrateur indisponible.");
    }
    await menu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot", categorieActive: "membres"
    });
  }

  async function obtenirVentes(resource = "membres-ventes-abo", filtres = {}, signal) {
    if (!BASE) throw new Error("Service de données administratives non configuré.");
    const lignes = [];
    let offset = 0;
    for (let page = 0; page < 30; page += 1) {
      const url = new URL(BASE + "/read");
      url.searchParams.set("resource", resource);
      url.searchParams.set("limit", "100");
      url.searchParams.set("offset", String(offset));
      for (const [k,v] of Object.entries(filtres)) url.searchParams.set("filter_"+k,v);
      const response = await fetch(url.toString(), {
        signal, credentials: "include", cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        window.location.replace(urlAdmin("/ESPACE-ADMIN/connexion-admin.html"));
        throw new Error("Session administrateur expirée.");
      }
      if (!response.ok || data?.success !== true || !Array.isArray(data.rows)) {
        throw new Error(data?.message || "Lecture des ventes impossible.");
      }
      lignes.push(...data.rows);
      if (data.rows.length < 100) return lignes;
      offset += data.rows.length;
    }
    throw new Error("Trop de formules pour cette consultation.");
  }

  function preparer() {
    const euros = vue === "euros";
    $("titre").textContent = euros ? "VT Abo — Montants en euros" : "VT Abo — Quantités vendues";
    $("sous-titre").textContent = euros
      ? "Factures émises par mois, montants TTC nets des remises, avant avoirs."
      : "Abonnements principaux vendus par pivot tarifaire et par mois.";
    $("actualiser").addEventListener("click", charger);
    if (euros) preparerDeclaratif();
    else {
      $("note").hidden = true;
      preparerDetail();
      preparerOnglets();
    }
  }

  function preparerOnglets() {
    const nav=$("onglets"), wrapper=$("wraper-onglets");
    wrapper.hidden=false;
    for (const [code,nom] of onglets) {
      const b=document.createElement("button");
      b.type="button";b.id="lcdp-ventesabo-tab-"+code;
      b.className="lcdp-wraper-onglets__tab";
      b.textContent=nom;b.setAttribute("role","tab");
      b.setAttribute("aria-controls","lcdp-ventesabo-panel");
      b.setAttribute("aria-selected",String(code===ongletActif));
      b.tabIndex=code===ongletActif?0:-1;
      b.addEventListener("click",()=>activerOnglet(code));
      b.addEventListener("keydown",ev=>{
        const i=onglets.findIndex(x=>x[0]===code);
        let prochain;
        if(ev.key==="ArrowRight") prochain=(i+1)%onglets.length;
        else if(ev.key==="ArrowLeft") prochain=(i+onglets.length-1)%onglets.length;
        else if(ev.key==="Home") prochain=0;
        else if(ev.key==="End") prochain=onglets.length-1;
        else return;
        ev.preventDefault();const c=onglets[prochain][0];activerOnglet(c);boutonsOnglets.get(c).focus();
      });
      boutonsOnglets.set(code,b);nav.appendChild(b);
    }
    $("panel").setAttribute("aria-labelledby","lcdp-ventesabo-tab-abo");
  }

  function activerOnglet(code) {
    if(code===ongletActif||!boutonsOnglets.has(code))return;
    ongletActif=code;
    for(const [k,b] of boutonsOnglets){
      b.setAttribute("aria-selected",String(k===code));b.tabIndex=k===code?0:-1;
    }
    $("panel").setAttribute("aria-labelledby","lcdp-ventesabo-tab-"+code);
    $("entetes").replaceChildren();$("lignes").replaceChildren();$("totaux").replaceChildren();
    $("filtres").hidden=true;$("filtre-slot").replaceChildren();lignesActives=[];
    reinitialiserDetail();actualiserEntetesDetail(code!=="abo");
    void charger();
  }

  function nomPivot(ligne) {
    let nom=String(ligne.formule || ligne.nom_pivot || ligne.typeabo || "").trim();
    if(ligne.categorie) return nom;
    const duree=String(ligne.typeabo||"").trim();
    if(!duree||nom.toUpperCase()===duree.toUpperCase())return nom;
    const suffixe=new RegExp("\\s+"+duree.replace(/[^a-z0-9]/gi,"")+"$","i");
    nom=nom.replace(suffixe,"").trim();
    return nom+" ("+duree+")";
  }

  function libellePivot(ligne) {
    const date=datePivot(ligne);
    return nomPivot(ligne)+(date?" — "+date:"");
  }

  function selectionPivots() {
    if(!filtresPivots.has(ongletActif))filtresPivots.set(ongletActif,new Map());
    return filtresPivots.get(ongletActif);
  }

  function referencesSelectionnees() {
    return new Set([...selectionPivots().values()].flatMap(x=>x.ids));
  }

  function pivotsFiltres() {
    const selection=referencesSelectionnees();
    return selection.size && selection.size<lignesActives.length ? [...selection] : undefined;
  }

  function actualiserTableauFiltre() {
    const selection=referencesSelectionnees();
    const lignes=lignesActives.filter(l=>!selection.size||selection.has(refPivot(l)));
    reinitialiserDetail();
    if(ongletActif==="abo")rendre(lignes);else rendreExtensions(lignes,ongletActif);
  }

  function preparerFiltrePivots() {
    const slot=$("filtre-slot"), selection=selectionPivots();
    slot.replaceChildren();$("filtres").hidden=!lignesActives.length;
    const groupes=new Map();
    for(const l of lignesActives){
      const k=famillePivot(l);
      if(!groupes.has(k))groupes.set(k,[]);
      groupes.get(k).push(l);
    }
    const trier=(a,b)=>a.localeCompare(b,"fr",{numeric:true,sensitivity:"base"});
    const options=[];
    for(const [famille,lignes] of groupes){
      if(lignes.length>1)options.push({key:"fam:"+famille,label:famille+" — tous les pivots",ids:lignes.map(refPivot),recherche:famille});
      for(const l of lignes)options.push({key:"pivot:"+refPivot(l),label:libellePivot(l),ids:[refPivot(l)],recherche:[famille,libellePivot(l),l.groupeabo,l.typeabo].filter(Boolean).join(" ")});
    }
    options.sort((a,b)=>trier(a.label,b.label));
    const index=new Map(options.map(x=>[x.key,x]));
    for(const key of selection.keys()){
      if(index.has(key))selection.set(key,index.get(key));else selection.delete(key);
    }
    if(!lignesActives.length)return;
    const cont=document.createElement("div");cont.className="lcdp-ventesabo__recherche-pivots";
    const chercher=document.createElement("input");chercher.type="search";
    chercher.className="lcdp-table-lecture-admin__filter-input";chercher.placeholder="Rechercher un pivot";
    chercher.autocomplete="off";
    chercher.setAttribute("aria-label","Rechercher une famille ou un pivot");
    chercher.setAttribute("role","combobox");chercher.setAttribute("aria-autocomplete","list");
    chercher.setAttribute("aria-controls","lcdp-ventesabo-suggestions");chercher.setAttribute("aria-expanded","false");
    const liste=document.createElement("div");liste.id="lcdp-ventesabo-suggestions";
    liste.className="lcdp-ventesabo__suggestions";liste.setAttribute("role","listbox");liste.hidden=true;
    const tags=document.createElement("div");tags.className="lcdp-ventesabo__filtres-actifs";
    tags.setAttribute("aria-label","Filtres sélectionnés");
    let suggestions=[], actif=-1;
    const normaliser=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr");
    function fermer(){
      liste.hidden=true;liste.replaceChildren();suggestions=[];actif=-1;
      chercher.setAttribute("aria-expanded","false");chercher.removeAttribute("aria-activedescendant");
    }
    function afficherTags(){
      tags.replaceChildren();
      for(const [key,option] of selection){
        const retirer=cellule("button",option.label+" ×","lcdp-table-lecture-admin__pagination-button");
        retirer.type="button";retirer.setAttribute("aria-label","Retirer le filtre "+option.label);
        retirer.addEventListener("click",()=>{selection.delete(key);afficherTags();actualiserTableauFiltre();afficher();});
        tags.appendChild(retirer);
      }
    }
    function ajouter(option){
      if(!option||selection.has(option.key))return;
      selection.set(option.key,option);chercher.value="";fermer();
      afficherTags();actualiserTableauFiltre();chercher.focus();
    }
    function choisirActif(i){
      if(!suggestions.length)return;
      actif=(i+suggestions.length)%suggestions.length;
      for(let j=0;j<liste.children.length;j++)liste.children[j].setAttribute("aria-selected",String(j===actif));
      chercher.setAttribute("aria-activedescendant","lcdp-ventesabo-suggestion-"+actif);
      liste.children[actif].scrollIntoView?.({block:"nearest"});
    }
    function afficher(){
      fermer();
      const mots=normaliser(chercher.value).trim().split(/\s+/).filter(Boolean);
      if(!mots.length)return;
      suggestions=options.filter(x=>!selection.has(x.key)&&mots.every(m=>normaliser(x.label+" "+x.recherche).includes(m))).slice(0,8);
      if(!suggestions.length)return;
      suggestions.forEach((option,i)=>{
        const b=cellule("div",option.label,"lcdp-ventesabo__suggestion");
        b.id="lcdp-ventesabo-suggestion-"+i;b.setAttribute("role","option");b.setAttribute("aria-selected","false");
        b.addEventListener("mousedown",e=>e.preventDefault());b.addEventListener("click",()=>ajouter(option));
        liste.appendChild(b);
      });
      liste.hidden=false;chercher.setAttribute("aria-expanded","true");
    }
    chercher.addEventListener("input",afficher);
    chercher.addEventListener("focus",afficher);
    chercher.addEventListener("blur",fermer);
    chercher.addEventListener("keydown",ev=>{
      if(ev.key==="Escape"){fermer();return;}
      if(!suggestions.length)return;
      if(ev.key==="ArrowDown"){ev.preventDefault();choisirActif(actif+1);}
      else if(ev.key==="ArrowUp"){ev.preventDefault();choisirActif(actif<0?suggestions.length-1:actif-1);}
      else if(ev.key==="Enter"){ev.preventDefault();ajouter(suggestions[actif<0?0:actif]);}
    });
    cont.append(chercher,liste,tags);slot.appendChild(cont);afficherTags();
  }

  function rendre(lignes) {
    if (!lignes.length) throw new Error("Aucune formule disponible dans le catalogue.");
    const annee = Number(lignes[0].annee);
    if (!Number.isInteger(annee) || lignes.some(l => Number(l.annee) !== annee)) {
      throw new Error("L'année de référence est incohérente.");
    }

    const euro = vue === "euros";
    $("titre").textContent = (euro ? "VT Abo — Montants en euros" : "VT Abo — Quantités vendues") + " · " + annee;
    $("legende").textContent = (euro ? "Montants TTC" : "Quantités") +
      " d'abonnements vendus par mois en " + annee;
    const entetes = $("entetes");
    entetes.replaceChildren(cellule("th", "Abonnement"));
    mois.forEach(n => entetes.appendChild(cellule("th", n)));
    entetes.appendChild(cellule("th", "Total annuel", "lcdp-ventesabo__cumul"));

    const moisTotal = Array(12).fill(0);
    let total = 0;
    let montantsManquants = 0;
    let tests = 0, production = 0, nonConfirmes = 0, factures = 0;
    const corps = $("lignes");
    corps.replaceChildren();
    lignes.sort((a,b) => {
      const ka = ordre.get(String(a.typeabo)) || 100;
      const kb = ordre.get(String(b.typeabo)) || 100;
      return ka-kb || String(a.typeabo).localeCompare(String(b.typeabo), "fr") ||
        String(a.debut_pivot||"").localeCompare(String(b.debut_pivot||"")) ||
        String(a.idprixabo||"").localeCompare(String(b.idprixabo||""));
    });

    lignes.forEach(ligne => {
      const valeurs = tableau12(euro ? ligne.montants : ligne.quantites);
      const tr = document.createElement("tr");
      if (ligne.ancienne) tr.classList.add("lcdp-ventesabo__ancienne");
      const nom = document.createElement("th");
      nom.scope = "row";
      const fort = document.createElement("strong");
      fort.textContent = euro ? String(ligne.formule || ligne.typeabo) : nomPivot(ligne);
      nom.appendChild(fort);
      if(euro)nom.appendChild(cellule("small",ligne.typeabo));
      else {
        const date=datePivot(ligne);
        if(date)nom.appendChild(cellule("small",date));
        nom.title="Référence pivot : "+ligne.idprixabo;
      }
      tr.appendChild(nom);
      valeurs.forEach((n,i) => {
        const centimes = euro ? Math.round(n * 100) : n;
        moisTotal[i] += centimes;
        const selection = {annee, mois:i+1, pivot:ligne.idprixabo,
          libelle: libellePivot(ligne) + " — " + mois[i] + " " + annee};
        tr.appendChild(euro ? cellule("td", devise.format(n)) : celluleQuantite(n, selection));
      });
      const valTotal = Number(euro ? ligne.total_montant : ligne.total_quantite);
      if (!Number.isFinite(valTotal)) throw new Error("Total de formule invalide.");
      total += euro ? Math.round(valTotal * 100) : valTotal;
      montantsManquants += Number(ligne.montants_manquants) || 0;
      if (!euro) {
        tests += Number(ligne.tests);
        production += Number(ligne.production);
        nonConfirmes += Number(ligne.non_confirmes);
        factures += Number(ligne.factures);
      }
      tr.appendChild(euro ? cellule("td", devise.format(valTotal), "lcdp-ventesabo__cumul")
        : celluleQuantite(valTotal, {annee, pivot:ligne.idprixabo,
          libelle:libellePivot(ligne) + " — année " + annee}, "lcdp-ventesabo__cumul"));
      corps.appendChild(tr);
    });

    const pied = $("totaux");
    pied.replaceChildren(cellule("th", "TOTAL"));
    const pivots=euro?undefined:pivotsFiltres();
    const titreTotal=pivots?"Pivots sélectionnés":"Toutes les formules";
    moisTotal.forEach((n,i) => pied.appendChild(euro ? cellule("td",devise.format(n / 100))
      : celluleQuantite(n,{annee,mois:i+1,pivots,libelle:titreTotal+" — "+mois[i]+" "+annee})));
    const annuel={annee,pivots,libelle:titreTotal+" — année "+annee};
    pied.appendChild(euro ? cellule("td",devise.format(total / 100),"lcdp-ventesabo__cumul")
      : celluleQuantite(total,annuel,"lcdp-ventesabo__cumul"));
    const avertissement = montantsManquants
      ? " Attention : " + entier.format(montantsManquants) +
        " vente(s) sans montant net enregistré."
      : "";
    if (!euro) {
      if (![tests,production,nonConfirmes,factures].every(Number.isSafeInteger) ||
          tests + production + nonConfirmes !== total || factures > total) {
        throw Error("Volumes de vente incohérents.");
      }
      $("sous-titre").textContent = "Abonnements principaux vendus par pivot et par mois" + (tests ? " · Tests inclus" : "");
    }
    etat(avertissement.trim(), montantsManquants > 0 && euro);
  }

  function rendreExtensions(lignes, categorie) {
    const label=onglets.find(x=>x[0]===categorie)[1];
    const annee=lignes.length?Number(lignes[0].annee):Number(new Intl.DateTimeFormat("fr-FR",{year:"numeric",timeZone:"Europe/Paris"}).format(new Date()));
    if(!Number.isInteger(annee)||lignes.some(l=>Number(l.annee)!==annee||l.categorie!==categorie))throw Error("Données d’extension incohérentes.");
    const colonnes=mois.map((label,i)=>({label,mois:i+1}));
    const entetes=$("entetes");entetes.replaceChildren(cellule("th","Variante"));
    for(const c of colonnes)entetes.appendChild(cellule("th",c.label));
    entetes.appendChild(cellule("th","Total annuel","lcdp-ventesabo__cumul"));
    $("titre").textContent="VT Abo — Quantités vendues · "+annee;
    $("legende").textContent=label+" — extensions souscrites en "+annee;
    const corps=$("lignes");corps.replaceChildren();
    const totaux=colonnes.map(()=>0);let total=0,tests=0;
    lignes.sort((a,b)=>(categorie==="frecdp" ? String(a.rythme||"").localeCompare(String(b.rythme||"")) || Number(a.frequence||0)-Number(b.frequence||0) : 0) ||
      String(a.groupeabo||"").localeCompare(String(b.groupeabo||""),"fr",{numeric:true})||
      String(a.formule||"").localeCompare(String(b.formule||""),"fr",{numeric:true})||
      String(a.debut_pivot||"").localeCompare(String(b.debut_pivot||""))||
      String(a.reference_pivot||"").localeCompare(String(b.reference_pivot||"")));
    for(const l of lignes){
      const n=Number(l.total_quantite), valeurs=tableau12(l.quantites);
      if(!Number.isSafeInteger(n)||n<0||valeurs.some(x=>!Number.isSafeInteger(x)||x<0)||valeurs.reduce((a,b)=>a+b,0)!==n)throw Error("Quantités d’extension incohérentes.");
      if(typeof l.reference_pivot!=="string"||!l.reference_pivot)throw Error("Référence d’extension absente.");
      const tr=document.createElement("tr");if(l.ancienne)tr.classList.add("lcdp-ventesabo__ancienne");
      const th=document.createElement("th");th.scope="row";th.title="Référence pivot : "+l.reference_pivot;
      th.appendChild(cellule("strong",nomPivot(l)));
      const date=datePivot(l);if(date)th.appendChild(cellule("small",date));
      tr.appendChild(th);
      const base={annee,categorie,pivot:l.reference_pivot};
      const titre=libellePivot(l);
      colonnes.forEach((c,i)=>{
        const v=valeurs[i];
        totaux[i]+=v;
        tr.appendChild(celluleQuantite(v,{...base,mois:c.mois,libelle:titre+" — "+c.label+" "+annee}));
      });
      tr.appendChild(celluleQuantite(n,{...base,libelle:titre+" — année "+annee},"lcdp-ventesabo__cumul"));
      total+=n;tests+=Number(l.tests)||0;corps.appendChild(tr);
    }
    const pied=$("totaux");pied.replaceChildren(cellule("th","TOTAL"));
    const pivots=pivotsFiltres(),titreTotal=label+(pivots?" — Pivots sélectionnés":"");
    colonnes.forEach((c,i)=>pied.appendChild(celluleQuantite(totaux[i],{annee,categorie,pivots,mois:c.mois,libelle:titreTotal+" — "+c.label+" "+annee})));
    pied.appendChild(celluleQuantite(total,{annee,categorie,pivots,libelle:titreTotal+" — année "+annee},"lcdp-ventesabo__cumul"));
    $("sous-titre").textContent=label+" — extensions souscrites par variante et par mois"+(tests?" · Tests inclus":"");
    etat(lignes.length?"":"Aucun pivot ni vente enregistré pour cette extension.");
  }

  async function charger() {
    if (vue==="euros" && chargement) return;
    chargementSynthese?.abort();
    const controle=new AbortController();chargementSynthese=controle;
    const categorie=ongletActif;
    chargement = true;
    $("actualiser").disabled = true;
    etat("Actualisation des ventes…");
    try {
      if (vue === "euros") await Promise.all([obtenirVentes().then(rendre), chargerDeclaratif()]);
      else {
        const lignes = categorie==="abo"
          ? await obtenirVentes("membres-ventes-abo-quantites",{},controle.signal)
          : await obtenirVentes("membres-ventes-extensions-quantites",{categorie},controle.signal);
        if(controle.signal.aborted||chargementSynthese!==controle)return;
        lignesActives=lignes;
        preparerFiltrePivots();
        actualiserTableauFiltre();
      }
    }
    catch (err) { if(!controle.signal.aborted&&chargementSynthese===controle)etat(err.message || "Impossible d'afficher les ventes.", true); }
    finally { if(chargementSynthese===controle){chargementSynthese=null;chargement=false;$("actualiser").disabled=false;} }
  }


  function preparerDetail() {
    const section = document.createElement("section");
    section.id = "lcdp-ventesabo-detail";
    section.className = "lcdp-ventesabo__detail";
    section.setAttribute("aria-labelledby","lcdp-ventesabo-detail-titre");
    const entete = document.createElement("header");
    entete.className = "lcdp-ventesabo__entete";
    const titres = document.createElement("div");
    const titre = document.createElement("h2");
    titre.id = "lcdp-ventesabo-detail-titre";
    titre.textContent = "Détail des abonnements vendus";
    const filtre = document.createElement("p");
    filtre.id = "lcdp-ventesabo-detail-filtre";
    filtre.textContent = "Filtre : aucun";
    titres.append(titre,filtre);
    const effacer = document.createElement("button");
    effacer.type="button";effacer.className="lcdp-button lcdp-button-secondary";
    effacer.id="lcdp-ventesabo-detail-effacer";
    effacer.textContent="Effacer le filtre";effacer.disabled=true;
    effacer.addEventListener("click",reinitialiserDetail);
    entete.append(titres,effacer);
    const statut = document.createElement("p");
    statut.id = "lcdp-ventesabo-detail-statut";
    statut.setAttribute("role","status");
    statut.setAttribute("aria-live","polite");
    statut.textContent="Cliquez sur un chiffre du tableau supérieur.";
    const wrap = document.createElement("div");
    wrap.className = "lcdp-table-lecture-admin lcdp-ventesabo__tableau";
    const scroll = document.createElement("div");
    scroll.className = "lcdp-table-lecture-admin__scroll";
    scroll.tabIndex = 0;
    const table = document.createElement("table");
    table.className = "lcdp-table-lecture-admin__table";
    table.style.minWidth = "760px";
    const caption = document.createElement("caption");
    caption.textContent = "Liste nominative des abonnements vendus";
    const thead = document.createElement("thead"), tr = document.createElement("tr"), tbody = document.createElement("tbody");
    tbody.id = "lcdp-ventesabo-detail-lignes";
    tr.id="lcdp-ventesabo-detail-entetes";
    thead.appendChild(tr);table.append(caption,thead,tbody);scroll.appendChild(table);wrap.appendChild(scroll);
    const nav = document.createElement("nav");
    nav.id = "lcdp-ventesabo-detail-pagination";
    nav.className = "lcdp-ventesabo__vues";
    nav.hidden = true;
    nav.setAttribute("aria-label","Pagination du détail des ventes");
    for (const [id,label,delta] of [["precedent","Précédent",-1],["suivant","Suivant",1]]) {
      const bouton = document.createElement("button");
      bouton.type="button"; bouton.id="lcdp-ventesabo-detail-"+id;
      bouton.className="lcdp-button lcdp-button-secondary"; bouton.textContent=label;
      bouton.disabled=true;
      bouton.addEventListener("click",()=>chargerDetail(pageDetail+delta));
      nav.appendChild(bouton);
    }
    section.append(entete,statut,wrap,nav); $("note").after(section);
    actualiserEntetesDetail(false);
  }

  function actualiserEntetesDetail(extension) {
    $("detail-titre").textContent=extension?"Détail des extensions vendues":"Détail des abonnements vendus";
    const noms=extension?["Nom","Prénom","Pivot","Début pivot","Date","Abonnement lié","Unités facturées","Statut","Mode","Facture TVA"]
      :["Nom","Prénom","Pivot","Début pivot","Date","Origine date","Statut","Mode","Facture TVA"];
    $("detail-entetes").replaceChildren(...noms.map(n=>{const th=cellule("th",n);th.scope="col";return th;}));
  }

  function reinitialiserDetail() {
    requeteDetail?.abort();requeteDetail=null;selectionDetail=null;pageDetail=0;
    boutonDetailActif?.setAttribute("aria-pressed","false");boutonDetailActif=null;
    $("detail-lignes").replaceChildren();
    $("detail-filtre").textContent="Filtre : aucun";
    const statut=$("detail-statut");
    statut.setAttribute("role","status");
    statut.textContent="Cliquez sur un chiffre du tableau supérieur.";
    $("detail-pagination").hidden=true;
    $("detail-precedent").disabled=$("detail-suivant").disabled=$("detail-effacer").disabled=true;
  }

  function ouvrirDetail(selection, bouton) {
    if (!Number.isInteger(selection.annee) ||
        (selection.categorie && selection.categorie!==ongletActif) ||
        (selection.pivot !== undefined && !(selection.categorie
          ? /^[0-9a-f-]{36}$|^sans-ref-[0-9a-f]{32}$/i.test(selection.pivot)
          : /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(selection.pivot)))) {
      etat("Référence de vente invalide. Actualisez le tableau.",true);
      return;
    }
    selectionDetail = selection;
    pageDetail=0;
    boutonDetailActif?.setAttribute("aria-pressed","false");
    boutonDetailActif=bouton;
    boutonDetailActif?.setAttribute("aria-pressed","true");
    $("detail-filtre").textContent="Filtre : "+selection.libelle;
    $("detail-effacer").disabled=false;
    chargerDetail(0);
  }

  async function chargerDetail(page) {
    if (!selectionDetail || page < 0) return;
    requeteDetail?.abort();
    const controle = new AbortController();
    requeteDetail=controle;
    const selection=selectionDetail;
    const statut=$("detail-statut"), corps=$("detail-lignes");
    const precedent=$("detail-precedent"), suivant=$("detail-suivant");
    precedent.disabled=suivant.disabled=true;
    $("detail-pagination").hidden=true;
    corps.replaceChildren();
    statut.setAttribute("role","status");statut.textContent="Chargement du détail…";
    try {
      const url=new URL(BASE+"/read");
      url.searchParams.set("resource",selection.categorie?"membres-ventes-extensions-detail":"membres-ventes-abo-detail");
      if(selection.categorie)url.searchParams.set("filter_categorie",selection.categorie);
      if(selection.frequence)url.searchParams.set("filter_cle_frequence",selection.frequence);
      url.searchParams.set("limit",String(tailleDetail));
      url.searchParams.set("offset",String(page*tailleDetail));
      const periode=String(selection.annee)+"-"+(selection.mois?String(selection.mois).padStart(2,"0"):"");
      url.searchParams.set("filter_periode_vente",periode);
      if (selection.pivot) url.searchParams.set("filter_reference_pivot",selection.pivot);
      else if(selection.pivots?.length)url.searchParams.set("filter_reference_pivot",selection.pivots.join("|"));
      const response=await fetch(url.toString(),{signal:controle.signal,credentials:"include",cache:"no-store",headers:{Accept:"application/json"}});
      const data=await response.json().catch(()=>null);
      if (response.status===401) {
        window.location.replace(urlAdmin("/ESPACE-ADMIN/connexion-admin.html"));
        throw Error("Session administrateur expirée.");
      }
      if (!response.ok || data?.success!==true || !Array.isArray(data.rows) ||
          !Number.isSafeInteger(Number(data.total))) throw Error(data?.message||"Détail des ventes indisponible.");
      if (controle.signal.aborted || requeteDetail!==controle) return;
      if (data.rows.some(l=>!String(l.periode_vente||"").startsWith(periode) ||
          (selection.pivot && l.reference_pivot!==selection.pivot) ||
          (selection.pivots?.length && !selection.pivots.includes(l.reference_pivot)) ||
          (selection.categorie && l.categorie!==selection.categorie) ||
          (selection.frequence && l.cle_frequence!==selection.frequence))) {
        throw Error("Le détail reçu ne correspond pas à la sélection.");
      }
      const fragment=document.createDocumentFragment();
      for (const l of data.rows) {
        const tr=document.createElement("tr");
        const nom=cellule("th",l.nommembre||"—");nom.scope="row";tr.appendChild(nom);
        for (const v of [l.prenommembre,l.nom_pivot||l.typeabo,l.debut_pivot,l.date_vente,
          ...(selection.categorie?[l.abonnement,l.unites_facturees]:[l.source_date]),
          ({paye:"Payé",cancd:"Annulé après paiement",impaye:"Impayé",attente:"En attente"})[l.statut]||l.statut,l.mode,l.facture]) {
          tr.appendChild(cellule("td",v??"—"));
        }
        fragment.appendChild(tr);
      }
      corps.replaceChildren(fragment);
      const total=Number(data.total);
      pageDetail=page;
      const mot=selection.categorie?"extension":"abonnement";
      statut.textContent=total>tailleDetail
        ? entier.format(page*tailleDetail+1)+" à "+entier.format(page*tailleDetail+data.rows.length)+" sur "+entier.format(total)+" "+mot+"s."
        : total ? entier.format(total)+" "+mot+(total===1?".":"s.") : (selection.categorie?"Aucune extension vendue.":"Aucun abonnement vendu.");
      $("detail-pagination").hidden=total<=tailleDetail;
      if(total!==selection.attendu) {
        statut.textContent+=" Les données ont changé depuis l’affichage du tableau ("+entier.format(selection.attendu)+"). Actualisez les ventes.";
      }
      precedent.disabled=page===0;suivant.disabled=(page+1)*tailleDetail>=total;
    } catch(err) {
      if (controle.signal.aborted || requeteDetail!==controle) return;
      corps.replaceChildren();
      statut.setAttribute("role","alert");statut.textContent=err.message||"Détail indisponible.";
      precedent.disabled=pageDetail===0;suivant.disabled=true;
    } finally {if (requeteDetail===controle) requeteDetail=null;}
  }

  const colonnesDeclaratif = [
    ["mois","Mois"],["taux","TVA"],["ca_facture_ht","CA facturé HT"],
    ["ca_annule_ht","CA annulé HT"],["tva_facturee","TVA facturée"],
    ["tva_deduite_avoir","TVA déduite sur avoir"],["ca_net_ht","CA net HT"],
    ["tva_nette","TVA nette facturée"],["total_net_ttc","Net TTC"]
  ];
  function preparerDeclaratif() {
    const section=document.createElement("section");
    section.id="lcdp-ventesabo-declaratif";
    const h=document.createElement("h2");
    h.textContent="Journal comptable — chiffre d’affaires et TVA";
    const info=document.createElement("p");
    info.textContent="Documents émis, hors tests, par mois et taux. L’annulation et la facturation des accès consommés sont distinctes. Les remboursements ne sont pas des écritures de chiffre d’affaires. Ces montants facturés ne constituent pas à eux seuls une déclaration de TVA exigible.";
    const status=document.createElement("p");
    status.id="lcdp-ventesabo-declaratif-statut";status.setAttribute("role","status");
    const wrap=document.createElement("div");wrap.className="lcdp-table-lecture-admin lcdp-ventesabo__tableau";
    const scroll=document.createElement("div");scroll.className="lcdp-table-lecture-admin__scroll";scroll.tabIndex=0;
    const table=document.createElement("table");table.className="lcdp-table-lecture-admin__table";
    const caption=document.createElement("caption");caption.textContent="Écritures par mois d’émission et taux de TVA";
    const thead=document.createElement("thead"),tr=document.createElement("tr"),tbody=document.createElement("tbody");
    tbody.id="lcdp-ventesabo-declaratif-lignes";
    for (const [,libelle] of colonnesDeclaratif) tr.appendChild(cellule("th",libelle));
    thead.appendChild(tr);table.append(caption,thead,tbody);scroll.appendChild(table);wrap.appendChild(scroll);
    const hAnnuel=document.createElement("h3");hAnnuel.textContent="Cumul annuel par taux de TVA";
    const annuel=wrap.cloneNode(true);
    annuel.querySelector("caption").textContent="Cumul annuel des écritures";
    annuel.querySelector("thead th").textContent="Année";
    annuel.querySelector("tbody").id="lcdp-ventesabo-declaratif-annuel";
    section.append(h,info,status,wrap,hAnnuel,annuel);$("note").after(section);
  }
  function lignesDeclaratif(lignes) {
    return lignes.map(l=>{
      if (!/^\d{4}-\d{2}-01$/.test(String(l.mois)) || ![0,5.5,10,20].includes(Number(l.taux))) throw Error("Période ou taux comptable invalide.");
      const champs=colonnesDeclaratif.slice(2).map(([k])=>{
        if(l[k]===null||l[k]===""||!Number.isFinite(Number(l[k])))throw Error("Montant comptable manquant : "+k);
        return Number(l[k]);
      });
      return [String(l.mois).slice(0,7),Number(l.taux),...champs];
    }).sort((a,b)=>b[0].localeCompare(a[0])||a[1]-b[1]);
  }
  function lignesDeclaratifAnnuel(lignes){
    return lignesDeclaratif(lignes.map(l=>{
      const an=Number(l.annee);
      if(!Number.isInteger(an)||an<2000||an>9999)throw Error("Année comptable invalide.");
      return {...l,mois:String(an)+"-01-01"};
    })).map(l=>[l[0].slice(0,4),...l.slice(1)]);
  }
  async function chargerDeclaratif() {
    const status=$("declaratif-statut"), corps=$("declaratif-lignes");
    status.textContent="Chargement du journal comptable…";corps.replaceChildren();$("declaratif-annuel").replaceChildren();
    try {
      const [mensuel,annuel]=await Promise.all([obtenirVentes("membres-declaratif-factures"),obtenirVentes("membres-declaratif-annuel")]);
      const lignes=lignesDeclaratif(mensuel);
      const cumul=lignesDeclaratifAnnuel(annuel);
      for (const l of lignes) {
        const tr=document.createElement("tr");
        tr.append(cellule("th",l[0]),cellule("td",l[1].toLocaleString("fr-FR")+" %"));
        l.slice(2).forEach(v=>tr.appendChild(cellule("td",devise.format(v))));
        corps.appendChild(tr);
      }
      const cible=$("declaratif-annuel");cible.replaceChildren();
      for(const l of cumul){
        const tr=document.createElement("tr");tr.append(cellule("th",l[0]),cellule("td",l[1].toLocaleString("fr-FR")+" %"));
        l.slice(2).forEach(v=>tr.appendChild(cellule("td",devise.format(v))));cible.appendChild(tr);
      }
      status.textContent=lignes.length?lignes.length+" ligne(s) mensuelle(s) · "+cumul.length+" cumul(s) annuel(s).":"Aucun document fiscal émis.";
      status.setAttribute("role","status");
    } catch(err) {
      status.setAttribute("role","alert");status.textContent=err.message||"Journal comptable indisponible.";
    }
  }
  async function initialiser() {
    const garde = window.LCDP_GUARD_ADMIN;
    if (!garde || !await garde.verifierAccesPageAdmin({path: CHEMIN})) return;
    if (window.LCDP_ADMIN_AUTORISATION?.admin?.type !== "root") return;
    document.getElementById("lcdp-main-admin").hidden = false;
    preparer();
    await Promise.all([bandeauMenu(), charger()]);
  }

  initialiser().catch(err => {
    console.error("VENTES_ABO_ADMIN", err);
    etat(err.message || "Impossible de charger la page.", true);
  });
})();
