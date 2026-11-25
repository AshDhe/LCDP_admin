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
      ? "Ventes mensuelles, montants TTC nets des remises."
      : "Nombre d'abonnements vendus chaque mois.";
    $("actualiser").addEventListener("click", charger);
    if (euros) preparerDeclaratif();
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
    entetes.appendChild(cellule("th", "Total en cours", "lcdp-ventesabo__cumul"));

    const moisTotal = Array(12).fill(0);
    let total = 0;
    let montantsManquants = 0;
    const corps = $("lignes");
    corps.replaceChildren();
    lignes.sort((a,b) => {
      const ka = ordre.get(String(a.typeabo)) || 100;
      const kb = ordre.get(String(b.typeabo)) || 100;
      return ka-kb || String(a.typeabo).localeCompare(String(b.typeabo), "fr");
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
    etat(lignes.length + " formule(s) affichée(s)." + avertissement,
      montantsManquants > 0 && euro);
  }

  async function charger() {
    if (chargement) return;
    chargement = true;
    $("actualiser").disabled = true;
    etat("Actualisation des ventes…");
    try { await Promise.all([obtenirVentes().then(rendre), vue === "euros" ? chargerDeclaratif() : Promise.resolve()]); }
    catch (err) { etat(err.message || "Impossible d'afficher les ventes.", true); }
    finally { chargement = false; $("actualiser").disabled = false; }
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
    section.append(h,info,status,wrap);$("note").after(section);
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
  async function chargerDeclaratif() {
    const status=$("declaratif-statut"), corps=$("declaratif-lignes");
    status.textContent="Chargement du journal comptable…";corps.replaceChildren();
    try {
      const lignes=lignesDeclaratif(await obtenirVentes("membres-declaratif-factures"));
      for (const l of lignes) {
        const tr=document.createElement("tr");
        tr.append(cellule("th",l[0]),cellule("td",l[1].toLocaleString("fr-FR")+" %"));
        l.slice(2).forEach(v=>tr.appendChild(cellule("td",devise.format(v))));
        corps.appendChild(tr);
      }
      status.textContent=lignes.length?lignes.length+" ligne(s) comptable(s).":"Aucun document fiscal émis.";
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
