(() => {
  "use strict";
  const config = window.SITE_CONFIG || {};
  const API = String(config.workerAdminComptesUrl ||
    config.WORKER_ADMIN_COMPTES_URL ||
    window.ADMIN_CONFIG?.API_ADMIN_COMPTES || "").replace(new RegExp("/+$"), "");
  const MOIS = ["jan","fev","mar","avr","mai","jun","jul","aou","sep","oct","nov","decembre"];
  const fmt = new Intl.NumberFormat("fr-FR");
  const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
  const anneeActuelle = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", year: "numeric"
  }).format(new Date()));
  const id = nom => document.getElementById("lcdp-invitmens-" + nom);
  const normaliser = v => String(v ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
  const urlAdmin = path => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(path) : path;
  const urlPublic = path => typeof window.LCDP_urlPublic === "function"
    ? window.LCDP_urlPublic(path) : path;
  const urlObjet = path => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(path) : path;
  let membres = [];
  let selectionDepartements = null; // null = tous
  let selectionMembres = null; // null = tous
  let chargement = false;

  async function fragment(path) {
    const reponse = await fetch(urlAdmin(path), {
      credentials: "same-origin", cache: "no-cache"
    });
    if (!reponse.ok) throw new Error("Composant introuvable : " + path);
    const modele = document.createElement("template");
    modele.innerHTML = (await reponse.text()).trim();
    return modele.content.cloneNode(true);
  }

  async function initialiserStructure() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    slot.replaceChildren(await fragment("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"));
    slot.querySelectorAll("[data-site-href]").forEach(element => {
      element.href = element.dataset.space === "admin"
        ? urlAdmin(element.dataset.siteHref)
        : urlPublic(element.dataset.siteHref);
    });
    slot.querySelectorAll("[data-site-src]").forEach(element => {
      element.src = urlObjet(String(element.dataset.siteSrc || "")
        .replace(new RegExp("^/?OBJET/?"), "/"));
    });
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu?.initialiser) throw new Error("Menu administrateur indisponible.");
    await menu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot", categorieActive: "parcs"
    });
  }

  function statut(message, erreur = false) {
    const element = id("statut");
    if (!element) return;
    element.textContent = message;
    element.setAttribute("role", erreur ? "alert" : "status");
  }

  function departements() {
    return [...new Set(membres.map(m => m.dptmtmembre).filter(Boolean))]
      .sort(collator.compare);
  }

  function nomComplet(membre) {
    return [membre.nommembre, membre.prenommembre].filter(Boolean).join(" ") ||
      "Compte sans nom";
  }

  function estSelectionne(selection, code) {
    return selection === null || selection.has(code);
  }

  function basculerSelection(selection, code, coche, univers) {
    const ensemble = selection === null ? new Set(univers) : new Set(selection);
    if (coche) ensemble.add(code);
    else ensemble.delete(code);
    return ensemble.size === univers.length ? null : ensemble;
  }

  function creerChoix(texte, valeur, coche, changer) {
    const etiquette = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = coche;
    input.value = valeur;
    input.addEventListener("change", () => changer(input.checked));
    const span = document.createElement("span");
    span.textContent = texte;
    etiquette.append(input, span);
    return etiquette;
  }

  function rendreDepartements() {
    const tous = departements();
    const frag = document.createDocumentFragment();
    for (const code of tous) {
      frag.appendChild(creerChoix(code, code,
        estSelectionne(selectionDepartements, code),
        coche => {
          selectionDepartements = basculerSelection(
            selectionDepartements, code, coche, tous);
          rendreDepartements();
          rendreMembres();
          rendreTableau();
        }));
    }
    id("departements").replaceChildren(frag);
  }

  function correspondRecherche(membre) {
    const recherche = normaliser(id("recherche").value);
    return !recherche || normaliser([
      membre.nommembre, membre.prenommembre
    ].join(" ")).includes(recherche) ||
      normaliser([membre.prenommembre,membre.nommembre].join(" ")).includes(recherche);
  }

  function rendreMembres() {
    const frag = document.createDocumentFragment();
    const univers = membres.map(m => m.idmembre);
    const filtres = membres
      .filter(m => estSelectionne(selectionDepartements, m.dptmtmembre))
      .filter(correspondRecherche);
    for (const membre of filtres) {
      frag.appendChild(creerChoix(
        nomComplet(membre) + " (" + (membre.dptmtmembre || "Dpt —") + ")",
        membre.idmembre, estSelectionne(selectionMembres, membre.idmembre),
        coche => {
          selectionMembres = basculerSelection(
            selectionMembres, membre.idmembre, coche, univers);
          rendreMembres();
          rendreTableau();
        }));
    }
    if (!filtres.length) {
      const texte = document.createElement("span");
      texte.textContent = "Aucun membre pour cette recherche.";
      frag.appendChild(texte);
    }
    id("membres").replaceChildren(frag);
  }

  function selectionFiltree() {
    return membres.filter(m =>
      estSelectionne(selectionDepartements, m.dptmtmembre) &&
      estSelectionne(selectionMembres, m.idmembre) &&
      correspondRecherche(m));
  }

  function cellule(texte, entete = false) {
    const el = document.createElement(entete ? "th" : "td");
    if (entete) el.scope = "row";
    el.textContent = String(texte);
    return el;
  }

  function rendreTableau() {
    const selection = selectionFiltree();
    const lignes = document.createDocumentFragment();
    const totaux = Object.fromEntries([...MOIS, "total"].map(m => [m, 0]));
    let actifs = 0;
    for (const membre of selection) {
      const tr = document.createElement("tr");
      tr.append(
        cellule(membre.dptmtmembre || "—"),
        cellule(membre.nommembre || "—", true),
        cellule(membre.prenommembre || "—")
      );
      for (const cle of MOIS) {
        const n = Number(membre[cle] || 0);
        tr.appendChild(cellule(fmt.format(n)));
        totaux[cle] += n;
      }
      const total = MOIS.reduce((s, cle) => s + Number(membre[cle] || 0), 0);
      tr.appendChild(cellule(fmt.format(total)));
      totaux.total += total;
      if (total > 0) actifs += 1;
      lignes.appendChild(tr);
    }
    id("lignes").replaceChildren(lignes);
    const footer = document.createElement("tr");
    const titre = document.createElement("th");
    titre.colSpan = 3;
    titre.scope = "row";
    titre.textContent = "Total sélection";
    footer.appendChild(titre);
    for (const cle of [...MOIS, "total"]) {
      footer.appendChild(cellule(fmt.format(totaux[cle])));
    }
    id("totaux").replaceChildren(footer);
    id("vide").hidden = selection.length > 0;
    id("synthese").textContent =
      fmt.format(totaux.total) + " invitation(s) envoyée(s) — " +
      fmt.format(actifs) + " membre(s) ayant envoyé au moins une invitation — " +
      fmt.format(new Set(selection.map(m => m.dptmtmembre).filter(Boolean)).size) +
      " département(s) dans la sélection.";
  }

  function rendre() {
    rendreDepartements();
    rendreMembres();
    rendreTableau();
  }

  async function charger() {
    if (chargement) return;
    chargement = true;
    id("actualiser").disabled = true;
    id("annee").disabled = true;
    statut("Lecture des invitations envoyées…");
    try {
      if (!API) throw new Error("Service de statistiques non configuré.");
      const annee = Number(id("annee").value);
      const reponse = await fetch(
        API + "/admin/invitations-mensuelles?annee=" + encodeURIComponent(String(annee)), {
          credentials: "include", cache: "no-store",
          headers: { Accept: "application/json" }
        });
      const resultat = await reponse.json().catch(() => null);
      if (!reponse.ok || resultat?.success !== true || !Array.isArray(resultat.rows)) {
        throw new Error(resultat?.message || "Statistiques d'invitations indisponibles.");
      }
      membres = resultat.rows.map(m => ({
        ...m, idmembre: String(m.idmembre || ""),
        nommembre: String(m.nommembre || ""),
        prenommembre: String(m.prenommembre || ""),
        dptmtmembre: String(m.dptmtmembre || "")
      })).filter(m => m.idmembre).sort((a, b) =>
        collator.compare(a.nommembre, b.nommembre) ||
        collator.compare(a.prenommembre, b.prenommembre));
      rendre();
      statut("Données de l'année " + annee + " actualisées.");
    } catch (erreur) {
      statut(String(erreur?.message || "Chargement indisponible."), true);
      console.error("InT mensuelles : chargement indisponible", erreur);
    } finally {
      chargement = false;
      id("actualiser").disabled = false;
      id("annee").disabled = false;
    }
  }

  async function demarrer() {
    const guard = window.LCDP_GUARD_ADMIN;
    if (!guard?.verifierAccesPageAdmin) {
      throw new Error("Vérification de session administrateur indisponible.");
    }
    if (!await guard.verifierAccesPageAdmin()) return;
    await initialiserStructure();
    const select = id("annee");
    for (let annee = anneeActuelle; annee >= 2020; annee--) {
      const option = document.createElement("option");
      option.value = String(annee);
      option.textContent = String(annee);
      select.appendChild(option);
    }
    id("actualiser").addEventListener("click", charger);
    id("annee").addEventListener("change", charger);
    id("recherche").addEventListener("input", () => {
      rendreMembres();
      rendreTableau();
    });
    id("tous-departements").addEventListener("click", () => {
      selectionDepartements = null;
      rendre();
    });
    id("aucun-departement").addEventListener("click", () => {
      selectionDepartements = new Set();
      rendre();
    });
    id("tous-membres").addEventListener("click", () => {
      selectionMembres = null;
      rendreMembres();
      rendreTableau();
    });
    id("aucun-membre").addEventListener("click", () => {
      selectionMembres = new Set();
      rendreMembres();
      rendreTableau();
    });
    document.getElementById("lcdp-main-admin").hidden = false;
    await charger();
  }

  demarrer().catch(erreur => {
    console.error("InT mensuelles : initialisation indisponible", erreur);
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
    statut(String(erreur?.message || "Page indisponible."), true);
  });
})();