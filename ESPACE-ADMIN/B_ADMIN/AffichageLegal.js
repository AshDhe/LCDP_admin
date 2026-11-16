(() => {
  "use strict";

  const PAGES = [
    { code: "mentions-legales", nom: "Mentions légales" },
    { code: "reglement-app", nom: "Règlement d’application" },
    { code: "reglement-club", nom: "Règlement du club" },
    { code: "cgv", nom: "CGV" },
    { code: "demande-abonnement", nom: "Demande d’abonnement" }
  ];
  const $ = id => document.getElementById(id);
  const frNombre = new Intl.NumberFormat("fr-FR");
  const zones = new Map();
  let stats5 = new Map(), stats30 = new Map(), periode30 = null;

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
    return String(cfg.workerAffichageLegalUrl ||
      cfg.WORKER_AFFICHAGE_LEGAL_URL ||
      "https://affichage-legal-api.lacleduparc.fr").replace(/\/+$/, "");
  }
  function statut(message, erreur = false) {
    const zone = $("lcdp-afflegal-statut");
    if (!zone) return;
    zone.textContent = message || "";
    zone.hidden = !message;
    zone.setAttribute("role", erreur ? "alert" : "status");
  }
  function aujourdhuiParis() {
    const morceaux = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const v = code => morceaux.find(p => p.type === code)?.value || "";
    return v("year") + "-" + v("month") + "-" + v("day");
  }
  function jourMoins(date, jours) {
    const d = new Date(date + "T12:00:00.000Z");
    d.setUTCDate(d.getUTCDate() - jours);
    return d.toISOString().slice(0, 10);
  }
  function dateFrancais(date) {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric"
    }).format(new Date(date + "T12:00:00.000Z"));
  }
  function dateValide(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
    const parsed = new Date(date + "T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date ? parsed : null;
  }
  function verifierDates(debut, fin) {
    const a = dateValide(debut), b = dateValide(fin);
    if (!a || !b || a > b || (b - a) / 86400000 > 366) {
      throw new Error("Sélectionne une période valide de 367 jours maximum.");
    }
  }
  async function api(debut, fin, detail) {
    verifierDates(debut, fin);
    if (!endpoint()) throw new Error("Service de statistiques non configuré.");
    const params = new URLSearchParams({ debut, fin });
    if (detail) params.set("detail", detail);
    const response = await fetch(endpoint() + "/admin/affichage-legal?" + params, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const resultat = await response.json().catch(() => null);
    if (!response.ok || resultat?.success !== true ||
        !Array.isArray(resultat.statistiques)) {
      throw new Error(resultat?.message || "Impossible de charger les affichages.");
    }
    return resultat;
  }
  function fixerTexte(element, valeur) {
    if (element) element.textContent = valeur;
  }
  function donnerStat(map, code) {
    return map.get(code) || {
      affichages: 0, affichages_identifies: 0,
      affichages_non_identifies: 0, membres_distincts: 0
    };
  }
  function remplirResume(zone, cle, stats, periode) {
    fixerTexte(zone.querySelector('[data-total="'+cle+'"]'),
      frNombre.format(Number(stats.affichages || 0)));
    fixerTexte(zone.querySelector('[data-membres="'+cle+'"]'),
      frNombre.format(Number(stats.membres_distincts || 0)));
    fixerTexte(zone.querySelector('[data-identifies="'+cle+'"]'),
      frNombre.format(Number(stats.affichages_identifies || 0)));
    fixerTexte(zone.querySelector('[data-anonymes="'+cle+'"]'),
      frNombre.format(Number(stats.affichages_non_identifies || 0)));
    fixerTexte(zone.querySelector('[data-dates="'+cle+'"]'),
      dateFrancais(periode.debut) + " au " + dateFrancais(periode.fin));
  }
  function listeMembres(zone, membres, titre) {
    const tbody = zone.querySelector('[data-liste-membres]');
    tbody.replaceChildren();
    fixerTexte(zone.querySelector('[data-titre-detail]'), titre);
    if (!Array.isArray(membres) || !membres.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.textContent = "Aucun membre identifié pour cette période.";
      tr.appendChild(td); tbody.appendChild(tr);
      return;
    }
    for (const membre of membres) {
      const tr = document.createElement("tr");
      const nom = document.createElement("td");
      nom.textContent = [membre.nommembre, membre.prenommembre]
        .filter(Boolean).join(" ") || "Compte sans nom";
      const quantite = document.createElement("td");
      quantite.textContent = frNombre.format(Number(membre.affichages || 0));
      tr.append(nom, quantite); tbody.appendChild(tr);
    }
  }
  function resume(cle, titre) {
    return '<section class="lcdp-afflegal-resume" aria-label="' + titre + '">' +
      '<h3>' + titre + '</h3>' +
      '<output data-total="' + cle + '">—</output>' +
      '<small data-dates="' + cle + '"></small>' +
      '<dl>' +
      '<dt>Membres distincts</dt><dd data-membres="' + cle + '">—</dd>' +
      '<dt>Affichages identifiés</dt><dd data-identifies="' + cle + '">—</dd>' +
      '<dt>Affichages non identifiés</dt><dd data-anonymes="' + cle + '">—</dd>' +
      '</dl></section>';
  }
  function construireZone(code, zone) {
    zone.classList.add("lcdp-afflegal-section");
    zone.innerHTML =
      '<div class="lcdp-afflegal-resumes">' +
      resume("5", "5 derniers jours") +
      resume("30", "30 derniers jours") +
      '</div>' +
      '<section class="lcdp-afflegal-recherche" aria-label="Période personnalisée">' +
      '<h3>Période personnalisée</h3>' +
      '<form class="lcdp-afflegal-filtres" data-form>' +
      '<label>Du <input type="date" name="debut" required></label>' +
      '<label>Au <input type="date" name="fin" required></label>' +
      '<button type="submit" class="lcdp-button lcdp-button-orange">Afficher</button>' +
      '<button type="button" data-reinitialiser class="lcdp-button lcdp-button-secondary">Réinitialiser</button>' +
      '</form>' +
      '<div data-personnalise hidden><h3>Résultat de la période</h3>' +
      '<div data-periode-description></div>' +
      '<div class="lcdp-afflegal-resumes">' + resume("libre", "Période sélectionnée") + '</div></div>' +
      '</section>' +
      '<section class="lcdp-afflegal-detail">' +
      '<h3 data-titre-detail>Membres identifiés, 30 derniers jours</h3>' +
      '<div class="lcdp-table-lecture-admin__scroll"><table class="lcdp-table-lecture-admin__table">' +
      '<thead><tr><th scope="col">Nom et prénom</th>' +
      '<th scope="col">Affichages</th></tr></thead>' +
      '<tbody data-liste-membres></tbody></table></div>' +
      '</section>' +
      '<p data-erreur role="status" aria-live="polite"></p>';

    const form = zone.querySelector("[data-form]");
    form.elements.debut.value = periode30.debut;
    form.elements.fin.value = periode30.fin;
    const erreur = zone.querySelector("[data-erreur]");

    form.addEventListener("submit", async event => {
      event.preventDefault();
      erreur.textContent = "";
      const debut = form.elements.debut.value;
      const fin = form.elements.fin.value;
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        const resultat = await api(debut, fin, code);
        const ligne = resultat.statistiques.find(item => item.page_code === code);
        remplirResume(zone, "libre", ligne || donnerStat(new Map(), code), { debut, fin });
        zone.querySelector("[data-personnalise]").hidden = false;
        fixerTexte(zone.querySelector("[data-periode-description]"),
          "Du " + dateFrancais(debut) + " au " + dateFrancais(fin));
        listeMembres(zone, resultat.membres,
          "Membres identifiés, du " + dateFrancais(debut) + " au " + dateFrancais(fin));
      } catch (error) {
        erreur.textContent = error?.message || "Recherche indisponible.";
        erreur.setAttribute("role", "alert");
      } finally {
        bouton.disabled = false;
      }
    });
    zone.querySelector("[data-reinitialiser]").addEventListener("click", () => {
      form.elements.debut.value = periode30.debut;
      form.elements.fin.value = periode30.fin;
      zone.querySelector("[data-personnalise]").hidden = true;
      erreur.textContent = "";
      void chargerListe(code, zone, periode30.debut, periode30.fin, true);
    });
  }
  async function chargerListe(code, zone, debut, fin, defaut) {
    try {
      const resultat = await api(debut, fin, code);
      listeMembres(zone, resultat.membres,
        defaut ? "Membres identifiés, 30 derniers jours"
          : "Membres identifiés, du " + dateFrancais(debut) + " au " + dateFrancais(fin));
      zone.querySelector("[data-erreur]").textContent = "";
    } catch (error) {
      const el = zone.querySelector("[data-erreur]");
      el.textContent = error?.message || "Liste indisponible.";
      el.setAttribute("role", "alert");
    }
  }

  async function fragment(path) {
    const response = await fetch(urlAdmin(path), {
      credentials: "same-origin", cache: "no-cache"
    });
    if (!response.ok) throw new Error("Élément de page indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }
  async function bandeau() {
    const emplacement = $("lcdp-bandeau-slot");
    emplacement.replaceChildren(await fragment(
      "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"));
    emplacement.querySelectorAll("[data-site-href]").forEach(lien => {
      const p = lien.dataset.siteHref;
      if (p) lien.href = lien.dataset.space === "admin" ? urlAdmin(p) : urlPublic(p);
    });
    emplacement.querySelectorAll("[data-site-src]").forEach(element => {
      element.src = urlObjet(String(element.dataset.siteSrc || "")
        .replace(/^\/?OBJET\/?/, "/"));
    });
  }
  async function menu() {
    const obj = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!obj?.initialiser) throw new Error("Menu admin indisponible.");
    return obj.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "admin"
    });
  }
  async function onglets() {
    const src = urlObjet("/JSBASE/05-wraper-onglets.js");
    if (!window.LCDP_WRAPER_ONGLETS) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Module d'onglets indisponible."));
        document.body.appendChild(script);
      });
    }
    const module = window.LCDP_WRAPER_ONGLETS;
    if (!module?.initialiser) throw new Error("Module d'onglets indisponible.");
    const composant = module.initialiser({
      racine: document.querySelector("[data-lcdp-wraper-onglets]"),
      idPrefix: "lcdp-affichage-legal",
      ariaLabel: "Pages suivies",
      onglets: PAGES.map(item => ({ key: item.code, label: item.nom }))
    });
    for (const page of PAGES) {
      const zone = composant.zones[page.code];
      if (!zone) throw new Error("Onglet manquant : " + page.nom);
      zones.set(page.code, zone);
      construireZone(page.code, zone);
    }
  }
  async function donnerCompte() {
    const today = aujourdhuiParis();
    const cinq = { debut: jourMoins(today, 4), fin: today };
    periode30 = { debut: jourMoins(today, 29), fin: today };
    const resultats = await Promise.all([
      api(cinq.debut, cinq.fin),
      api(periode30.debut, periode30.fin)
    ]);
    stats5 = new Map(resultats[0].statistiques.map(l => [l.page_code, l]));
    stats30 = new Map(resultats[1].statistiques.map(l => [l.page_code, l]));
    for (const page of PAGES) {
      const zone = zones.get(page.code);
      remplirResume(zone, "5", donnerStat(stats5, page.code), cinq);
      remplirResume(zone, "30", donnerStat(stats30, page.code), periode30);
    }
    statut("");
    // Listes courtes de la même période, préparées pour chaque onglet.
    await Promise.all(PAGES.map(p =>
      chargerListe(p.code, zones.get(p.code), periode30.debut, periode30.fin, true)));
  }

  async function initialiser() {
    const gardien = window.LCDP_GUARD_ADMIN;
    if (!gardien?.verifierAccesPageAdmin) {
      throw new Error("Contrôle d'accès administrateur indisponible.");
    }
    if (!await gardien.verifierAccesPageAdmin()) return;
    $("lcdp-main-admin").hidden = false;
    const today = aujourdhuiParis();
    periode30 = { debut: jourMoins(today, 29), fin: today };
    const resultats = await Promise.allSettled([bandeau(), menu(), onglets()]);
    const erreurs = resultats.filter(r => r.status === "rejected")
      .map(r => r.reason?.message || "Composant indisponible.");
    if (erreurs.length) {
      statut(erreurs.join(" ; "), true);
      return;
    }
    try {
      await donnerCompte();
    } catch (error) {
      statut(error?.message || "Statistiques indisponibles.", true);
    }
  }
  initialiser().catch(error => {
    console.error("Affichage légal :", error);
    statut(error?.message || "Page indisponible.", true);
  });
})();