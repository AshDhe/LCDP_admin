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
  let chargement = false;
  let pageDetail = 0, detailEnCours = false;
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
    zone.setAttribute("role", erreur ? "alert" : "status");
  }

  function cellule(tag, texte, classe) {
    const el = document.createElement(tag);
    el.textContent = String(texte);
    if (classe) el.className = classe;
    return el;
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

  async function obtenirVentes(resource = "membres-ventes-abo") {
    if (!BASE) throw new Error("Service de données administratives non configuré.");
    const lignes = [];
    let offset = 0;
    for (let page = 0; page < 30; page += 1) {
      const url = new URL(BASE + "/read");
      url.searchParams.set("resource", resource);
      url.searchParams.set("limit", "100");
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url.toString(), {
        credentials: "include", cache: "no-store",
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
    $("lien-quantites").href = urlAdmin(CHEMIN) + "?vue=quantites";
    $("lien-euros").href = urlAdmin(CHEMIN) + "?vue=euros";
    $("lien-" + vue).setAttribute("aria-current", "page");
    const euros = vue === "euros";
    $("titre").textContent = euros ? "VT Abo — Montants en euros" : "VT Abo — Quantités vendues";
    $("sous-titre").textContent = euros
      ? "Factures émises par mois, montants TTC nets des remises, avant avoirs."
      : "Abonnements principaux vendus par pivot tarifaire et par mois.";
    $("actualiser").addEventListener("click", charger);
    if (euros) preparerDeclaratif();
    else {
      $("note").textContent = "Une ligne par référence pivot d’abonnement principal, y compris les anciens pivots identifiés. Options, extensions, abonnements gratuits et dossiers non validés exclus. Les ventes sont rattachées à leur référence tarifaire d’origine, sans réaffectation au pivot actuel. Les ventes antérieures sans pivot historique identifié ne sont pas incluses. Date du paiement, sinon date de création. Les annulations après paiement et les tests identifiés restent visibles.";
      preparerDetail();
    }
  }

  function rendre(lignes) {
    if (!lignes.length) throw new Error("Aucune formule disponible dans le catalogue.");
    const annee = Number(lignes[0].annee);
    if (!Number.isInteger(annee) || lignes.some(l => Number(l.annee) !== annee)) {
      throw new Error("L'année de référence est incohérente.");
    }

    const euro = vue === "euros";
    $("periode").textContent = "Année " + annee + " · cumul à ce jour";
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
      fort.textContent = String(ligne.formule || ligne.typeabo);
      const type = document.createElement("small");
      type.textContent = String(ligne.typeabo);
      if (!euro) {
        const periode = [ligne.debut_pivot || "—", ligne.fin_pivot || "sans fin renseignée"].join(" → ");
        type.textContent += " · " + periode + (ligne.ancienne ? " · Ancien pivot" : "");
        nom.title = "Référence pivot : " + ligne.idprixabo;
      }
      nom.append(fort, type);
      tr.appendChild(nom);
      valeurs.forEach((n,i) => {
        const centimes = euro ? Math.round(n * 100) : n;
        moisTotal[i] += centimes;
        tr.appendChild(cellule("td", euro ? devise.format(n) : entier.format(n)));
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
      tr.appendChild(cellule("td",
        euro ? devise.format(valTotal) : entier.format(valTotal),
        "lcdp-ventesabo__cumul"));
      corps.appendChild(tr);
    });

    const pied = $("totaux");
    pied.replaceChildren(cellule("th", "TOTAL"));
    moisTotal.forEach(n => pied.appendChild(cellule("td",
      euro ? devise.format(n / 100) : entier.format(n))));
    pied.appendChild(cellule("td",
      euro ? devise.format(total / 100) : entier.format(total),
      "lcdp-ventesabo__cumul"));
    $("total").textContent = euro ? devise.format(total / 100) :
      entier.format(total) + " abonnement" + (total > 1 ? "s" : "");
    const avertissement = montantsManquants
      ? " Attention : " + entier.format(montantsManquants) +
        " vente(s) sans montant net enregistré."
      : "";
    if (!euro) {
      if (![tests,production,nonConfirmes,factures].every(Number.isSafeInteger) ||
          tests + production + nonConfirmes !== total || factures > total) {
        throw Error("Volumes de vente incohérents.");
      }
      $("coherence").textContent = "Production confirmée : " + entier.format(production) +
        " · Tests : " + entier.format(tests) +
        " · Mode non confirmé : " + entier.format(nonConfirmes) +
        " · Abonnements avec facture émise : " + entier.format(factures) +
        " / " + entier.format(total);
    }
    etat(lignes.length + " formule(s) affichée(s)." + avertissement,
      montantsManquants > 0 && euro);
  }

  async function charger() {
    if (chargement) return;
    chargement = true;
    $("actualiser").disabled = true;
    etat("Actualisation des ventes…");
    try {
      if (vue === "euros") await Promise.all([obtenirVentes().then(rendre), chargerDeclaratif()]);
      else await Promise.all([obtenirVentes("membres-ventes-abo-quantites").then(rendre), chargerDetail(0)]);
    }
    catch (err) { etat(err.message || "Impossible d'afficher les ventes.", true); }
    finally { chargement = false; $("actualiser").disabled = false; }
  }


  function preparerDetail() {
    const coherence = document.createElement("p");
    coherence.id = "lcdp-ventesabo-coherence";
    coherence.className = "lcdp-ventesabo__note";
    $("note").before(coherence);
    const section = document.createElement("section");
    const titre = document.createElement("h2");
    titre.textContent = "Détail des abonnements vendus";
    const statut = document.createElement("p");
    statut.id = "lcdp-ventesabo-detail-statut";
    statut.setAttribute("role","status");
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
    for (const nom of ["Nom","Prénom","Pivot","Début pivot","Date","Origine date","Statut","Mode","Facture TVA"]) {
      const th = cellule("th",nom); th.scope = "col"; tr.appendChild(th);
    }
    thead.appendChild(tr);table.append(caption,thead,tbody);scroll.appendChild(table);wrap.appendChild(scroll);
    const nav = document.createElement("nav");
    nav.className = "lcdp-ventesabo__vues";
    nav.setAttribute("aria-label","Pagination du détail des ventes");
    for (const [id,label,delta] of [["precedent","Précédent",-1],["suivant","Suivant",1]]) {
      const bouton = document.createElement("button");
      bouton.type="button"; bouton.id="lcdp-ventesabo-detail-"+id;
      bouton.className="lcdp-button lcdp-button-secondary"; bouton.textContent=label;
      bouton.disabled=true;
      bouton.addEventListener("click",()=>chargerDetail(pageDetail+delta));
      nav.appendChild(bouton);
    }
    section.append(titre,statut,wrap,nav); $("note").after(section);
  }

  async function chargerDetail(page) {
    if (detailEnCours || page < 0) return;
    detailEnCours = true;
    const statut=$("detail-statut"), corps=$("detail-lignes");
    const precedent=$("detail-precedent"), suivant=$("detail-suivant");
    precedent.disabled=suivant.disabled=true;
    statut.setAttribute("role","status");statut.textContent="Chargement du détail…";
    try {
      const url=new URL(BASE+"/read");
      url.searchParams.set("resource","membres-ventes-abo-detail");
      url.searchParams.set("limit",String(tailleDetail));
      url.searchParams.set("offset",String(page*tailleDetail));
      const response=await fetch(url.toString(),{credentials:"include",cache:"no-store",headers:{Accept:"application/json"}});
      const data=await response.json().catch(()=>null);
      if (response.status===401) {
        window.location.replace(urlAdmin("/ESPACE-ADMIN/connexion-admin.html"));
        throw Error("Session administrateur expirée.");
      }
      if (!response.ok || data?.success!==true || !Array.isArray(data.rows) ||
          !Number.isSafeInteger(Number(data.total))) throw Error(data?.message||"Détail des ventes indisponible.");
      const fragment=document.createDocumentFragment();
      for (const l of data.rows) {
        const tr=document.createElement("tr");
        const nom=cellule("th",l.nommembre||"—");nom.scope="row";tr.appendChild(nom);
        for (const v of [l.prenommembre,l.nom_pivot||l.typeabo,l.debut_pivot,l.date_vente,l.source_date,
          ({paye:"Payé",cancd:"Annulé après paiement",impaye:"Impayé",attente:"En attente"})[l.statut]||l.statut,l.mode,l.facture]) {
          tr.appendChild(cellule("td",v??"—"));
        }
        fragment.appendChild(tr);
      }
      corps.replaceChildren(fragment);
      const total=Number(data.total);
      pageDetail=page;
      statut.textContent=total?entier.format(page*tailleDetail+1)+" à "+entier.format(page*tailleDetail+data.rows.length)+" sur "+entier.format(total)+" abonnement(s).":"Aucun abonnement vendu.";
      precedent.disabled=page===0;suivant.disabled=(page+1)*tailleDetail>=total;
    } catch(err) {
      corps.replaceChildren();
      statut.setAttribute("role","alert");statut.textContent=err.message||"Détail indisponible.";
      precedent.disabled=pageDetail===0;suivant.disabled=true;
    } finally {detailEnCours=false;}
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
