(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const FORM = $("lcdp-connexion-form");
  const formatNombre = new Intl.NumberFormat("fr-FR");

  function urlAdmin(path) {
    const cfg = window.SITE_CONFIG || {};
    return typeof cfg.adminUrl === "function" ? cfg.adminUrl(path) : path;
  }
  function urlObjet(path) {
    const cfg = window.SITE_CONFIG || {};
    return typeof cfg.objetUrl === "function" ? cfg.objetUrl(path) : path;
  }
  function urlPublic(path) {
    const cfg = window.SITE_CONFIG || {};
    return typeof cfg.publicUrl === "function" ? cfg.publicUrl(path) : path;
  }
  function endpoint() {
    const cfg = window.SITE_CONFIG || {};
    return String(
      cfg.workerAdminComptesUrl ||
      cfg.WORKER_ADMIN_COMPTES_URL ||
      window.ADMIN_CONFIG?.API_ADMIN_COMPTES || ""
    ).replace(/\/+$/, "");
  }
  function statut(message, erreur = false) {
    const element = $("lcdp-connexion-statut");
    element.textContent = message || "";
    element.hidden = !message;
    element.setAttribute("role", erreur ? "alert" : "status");
  }

  // Périodes exprimées en jours calendaires, selon le calendrier français.
  function aujourdHui() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const valeur = (type) => parts.find(part => part.type === type)?.value || "";
    return valeur("year") + "-" + valeur("month") + "-" + valeur("day");
  }
  function decalage(iso, jours) {
    const d = new Date(iso + "T12:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + jours);
    return d.toISOString().slice(0, 10);
  }
  function afficherDate(iso) {
    return new Intl.DateTimeFormat("fr-FR", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC"
    }).format(new Date(iso + "T12:00:00.000Z"));
  }
  function somme(lignes) {
    return lignes.reduce((n, item) => n + Number(item.connexions || 0), 0);
  }
  function nomComplet(item) {
    return [item.nomadmin, item.prenomadmin].filter(Boolean).join(" ") || "Compte sans nom";
  }
  function viderTableau(tbody) { tbody.replaceChildren(); }
  function cellule(ligne, texte) {
    const td = document.createElement("td");
    td.textContent = String(texte);
    ligne.appendChild(td);
  }
  function ligneVide(tbody, colSpan) {
    const ligne = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colSpan;
    td.textContent = "Aucun autre compte administrateur à afficher.";
    ligne.appendChild(td);
    tbody.appendChild(ligne);
  }
  function afficherDetail5et30(lignes5, lignes30) {
    const comptes5 = new Map(lignes5.map(item => [item.adminaccount_id, item]));
    const cible = $("lcdp-connexion-detail");
    viderTableau(cible);
    if (!lignes30.length) {
      ligneVide(cible, 4);
      return;
    }
    for (const item of lignes30) {
      const tr = document.createElement("tr");
      cellule(tr, nomComplet(item));
      cellule(tr, item.type || "—");
      cellule(tr, formatNombre.format(Number(comptes5.get(item.adminaccount_id)?.connexions || 0)));
      cellule(tr, formatNombre.format(Number(item.connexions || 0)));
      cible.appendChild(tr);
    }
  }
  function afficherDetailPersonnalise(lignes) {
    const tbody = $("lcdp-connexion-detail-personnalise");
    viderTableau(tbody);
    if (!lignes.length) {
      ligneVide(tbody, 3);
      return;
    }
    for (const item of lignes) {
      const tr = document.createElement("tr");
      cellule(tr, nomComplet(item));
      cellule(tr, item.type || "—");
      cellule(tr, formatNombre.format(Number(item.connexions || 0)));
      tbody.appendChild(tr);
    }
  }
  function validerDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return null;
    const value = new Date(iso + "T00:00:00.000Z");
    return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === iso
      ? value : null;
  }
  function validerPeriode(debut, fin) {
    const d1 = validerDate(debut);
    const d2 = validerDate(fin);
    if (!d1 || !d2 || d2 < d1) {
      throw new Error("Sélectionne une date de début antérieure ou égale à la date de fin.");
    }
    if ((d2 - d1) / 86400000 > 366) {
      throw new Error("La période maximale est de 367 jours calendaires.");
    }
  }
  async function consulter(debut, fin) {
    validerPeriode(debut, fin);
    const base = endpoint();
    if (!base) throw new Error("Service Connexion admin non configuré.");
    const params = new URLSearchParams({ debut, fin });
    const response = await fetch(base + "/admin/connexion?" + params.toString(), {
      credentials: "include", cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true || !Array.isArray(payload.comptes)) {
      throw new Error(payload?.message || "Impossible de consulter les connexions.");
    }
    return payload.comptes;
  }
  async function afficherParDefaut() {
    const fin = aujourdHui();
    const debut5 = decalage(fin, -4);
    const debut30 = decalage(fin, -29);
    $("lcdp-connexion-dates-5").textContent = afficherDate(debut5) + " au " + afficherDate(fin);
    $("lcdp-connexion-dates-30").textContent = afficherDate(debut30) + " au " + afficherDate(fin);
    $("lcdp-connexion-debut").value = debut30;
    $("lcdp-connexion-fin").value = fin;

    const [lignes5, lignes30] = await Promise.all([
      consulter(debut5, fin), consulter(debut30, fin)
    ]);
    $("lcdp-connexion-total-5").textContent = formatNombre.format(somme(lignes5));
    $("lcdp-connexion-total-30").textContent = formatNombre.format(somme(lignes30));
    afficherDetail5et30(lignes5, lignes30);
    statut("");
  }
  async function rechercher(event) {
    event.preventDefault();
    const debut = $("lcdp-connexion-debut").value;
    const fin = $("lcdp-connexion-fin").value;
    const bouton = FORM.querySelector('[type="submit"]');
    bouton.disabled = true;
    statut("");
    try {
      const lignes = await consulter(debut, fin);
      $("lcdp-connexion-titre-periode").textContent =
        "Du " + afficherDate(debut) + " au " + afficherDate(fin);
      $("lcdp-connexion-total-personnalise").textContent = formatNombre.format(somme(lignes));
      afficherDetailPersonnalise(lignes);
      $("lcdp-connexion-personnalise").hidden = false;
    } catch (erreur) {
      statut(erreur?.message || "Recherche indisponible.", true);
    } finally {
      bouton.disabled = false;
    }
  }
  function reinitialiser() {
    const fin = aujourdHui();
    $("lcdp-connexion-debut").value = decalage(fin, -29);
    $("lcdp-connexion-fin").value = fin;
    $("lcdp-connexion-personnalise").hidden = true;
    statut("");
  }

  async function chargerFragment(chemin) {
    const response = await fetch(urlAdmin(chemin), {
      credentials: "same-origin", cache: "no-cache"
    });
    if (!response.ok) throw new Error("Élément d'interface indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }
  async function afficherBandeau() {
    const slot = $("lcdp-bandeau-slot");
    slot.replaceChildren(await chargerFragment(
      "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
    ));
    slot.querySelectorAll("[data-site-href]").forEach(el => {
      const cible = el.dataset.siteHref;
      if (cible) el.href = el.dataset.space === "admin" ? urlAdmin(cible) : urlPublic(cible);
    });
    slot.querySelectorAll("[data-site-src]").forEach(el => {
      const cible = String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/");
      el.src = urlObjet(cible);
    });
  }
  async function afficherMenu() {
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu?.initialiser) throw new Error("Menu admin indisponible.");
    await menu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot", categorieActive: "admin"
    });
  }
  async function initialiser() {
    const garde = window.LCDP_GUARD_ADMIN;
    if (!garde?.verifierAccesPageAdmin) {
      throw new Error("Contrôle des accès admin indisponible.");
    }
    if (!await garde.verifierAccesPageAdmin()) return;
    $("lcdp-main-admin").hidden = false;
    FORM.addEventListener("submit", rechercher);
    $("lcdp-connexion-reinitialiser").addEventListener("click", reinitialiser);

    const resultats = await Promise.allSettled([
      afficherBandeau(), afficherMenu(), afficherParDefaut()
    ]);
    const erreurs = resultats.filter(item => item.status === "rejected")
      .map(item => item.reason?.message || "Composant indisponible.");
    if (erreurs.length) statut(erreurs.join(" ; "), true);
  }
  initialiser().catch(error => {
    console.error("Connexion admin :", error);
    statut(error?.message || "Statistiques indisponibles.", true);
  });
})();