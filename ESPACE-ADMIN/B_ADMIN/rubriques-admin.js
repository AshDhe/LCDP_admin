(() => {
  "use strict";

  // Catégories enregistrées dans adminbouton, sans inventer de contenu Coach.
  const CATEGORIES = Object.freeze([
    { key: "admin", label: "Admin", cat: "Admin" },
    { key: "parc", label: "Parc", cat: "Parcs" },
    { key: "membre", label: "Membre", cat: "Membres" },
    { key: "coach", label: "Coach", cat: "Coach" }
  ]);

  // La grille de l'accueil admin définit ces positions particulières en JS.
  // Positions exclues de cette grille : elles ne sont pas réellement affichées.
  const PARCS_IGNORES = new Set([19, 20, 21, 25, 28, 29, 30, 31]);
  const PARCS_SLOTS_SPECIAUX = Object.freeze([
    { cat: "Parcs", position: 3, label: "CarteParc" },
    { cat: "Parcs", position: 4, label: "CardParc" },
    { cat: "Parcs", position: 18, label: "Localisation" },
    { cat: "Parcs", position: 26, label: "Planning parc" },
    { cat: "Parcs", position: 27, label: "Accueil IA" }
  ]);

  function urlAdmin(path) {
    const config = window.SITE_CONFIG || {};
    return typeof config.adminUrl === "function" ? config.adminUrl(path) : path;
  }

  function urlObjet(path) {
    const config = window.SITE_CONFIG || {};
    return typeof config.objetUrl === "function" ? config.objetUrl(path) : path;
  }

  async function fragment(url, libelle) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-cache"
    });
    if (!response.ok) throw new Error(libelle + " indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }

  async function script(path) {
    const src = path.startsWith("/JSBASE/") ? urlObjet(path) : urlAdmin(path);
    const existing = [...document.scripts].find(el => el.src === src);
    if (existing) return;
    await new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.src = src;
      element.onload = resolve;
      element.onerror = () => reject(new Error("Script indisponible : " + path));
      document.body.appendChild(element);
    });
  }

  async function afficherBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    slot.replaceChildren(await fragment(
      urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), "Bandeau"));
    slot.querySelectorAll("[data-site-href]").forEach(el => {
      const cible = el.dataset.siteHref;
      if (!cible) return;
      el.href = el.dataset.space === "admin"
        ? urlAdmin(cible)
        : (window.SITE_CONFIG?.publicUrl?.(cible) || cible);
    });
    slot.querySelectorAll("[data-site-src]").forEach(el => {
      const cible = String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/");
      el.src = urlObjet(cible);
    });
  }

  async function afficherMenu() {
    const module = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!module?.initialiser) throw new Error("Menu latéral admin indisponible.");
    await module.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "admin"
    });
  }

  function afficherStatut(message, erreur = false) {
    const p = document.getElementById("lcdp-rubriques-statut");
    p.textContent = message || "";
    p.hidden = !message;
    p.setAttribute("role", erreur ? "alert" : "status");
  }

  async function chargerRubriques() {
    const cfg = window.SITE_CONFIG || {};
    const base = String(cfg.workerAdminDataUrl || cfg.WORKER_ADMIN_DATA_URL ||
      window.ADMIN_CONFIG?.API_ADMIN_DATA || "").replace(/\/+$/, "");
    if (!base) throw new Error("Service du menu admin non configuré.");
    const response = await fetch(base + "/menu", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Array.isArray(data.buttons)) {
      throw new Error(data?.message || "Impossible de récupérer les rubriques du menu.");
    }
    return data.buttons;
  }

  function rubriquesPour(cat, buttons) {
    const parPosition = new Map();
    for (const btn of buttons) {
      if (btn?.cat !== cat) continue;
      const position = Number(btn.position);
      if (!Number.isInteger(position) || position < 1 || position > 48) continue;
      if (cat === "Parcs" && PARCS_IGNORES.has(position)) continue;
      const label = String(btn.label || "").trim();
      if (label) parPosition.set(position, label);
    }
    if (cat === "Membres") {
      for (const [position, label] of parPosition) {
        if (label.trim().toLowerCase() === "boutique") parPosition.delete(position);
      }
      parPosition.set(41, "Boutique");
    }
    if (cat === "Parcs") {
      for (const item of PARCS_SLOTS_SPECIAUX) {
        parPosition.set(item.position, item.label);
      }
    }
    return [...parPosition].sort((a, b) => a[0] - b[0])
      .map(([position, label]) => ({ position, label }));
  }

  function construireListe(titre, positions, vide) {
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = titre;
    section.appendChild(h2);

    if (!positions.length) {
      const message = document.createElement("p");
      message.textContent = vide;
      section.appendChild(message);
      return section;
    }

    const cadre = document.createElement("div");
    cadre.className = "lcdp-table-lecture-admin";
    const table = document.createElement("table");
    table.className = "lcdp-table-lecture-admin__table";
    const head = document.createElement("thead");
    const tr = document.createElement("tr");
    ["Position", "Rubrique"].forEach(texte => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = texte;
      tr.appendChild(th);
    });
    head.appendChild(tr);
    const body = document.createElement("tbody");
    positions.forEach(item => {
      const line = document.createElement("tr");
      const position = document.createElement("td");
      position.textContent = String(item.position);
      const nom = document.createElement("td");
      nom.textContent = item.label;
      line.append(position, nom);
      body.appendChild(line);
    });
    table.append(head, body);
    const scroll = document.createElement("div");
    scroll.className = "lcdp-table-lecture-admin__scroll";
    scroll.appendChild(table);
    cadre.appendChild(scroll);
    section.appendChild(cadre);
    return section;
  }

  function afficherCategorie(zone, cat, buttons) {
    const items = rubriquesPour(cat, buttons);
    zone.replaceChildren();
    if (!items.length) {
      const message = document.createElement("p");
      message.textContent = "Aucune rubrique configurée pour ce sous-espace.";
      zone.appendChild(message);
      return;
    }
    zone.appendChild(construireListe(
      "Slots verts — positions 1 à 16",
      items.filter(item => item.position <= 16),
      "Aucun slot vert occupé."
    ));
    zone.appendChild(construireListe(
      "Slots orange — positions 17 à 48",
      items.filter(item => item.position >= 17),
      "Aucun slot orange occupé."
    ));
  }

  async function afficherRubriques() {
    await script("/JSBASE/05-wraper-onglets.js");
    const module = window.LCDP_WRAPER_ONGLETS;
    if (typeof module?.initialiser !== "function") {
      throw new Error("Navigation par onglets indisponible.");
    }
    const onglets = module.initialiser({
      racine: document.querySelector("[data-lcdp-wraper-onglets]"),
      idPrefix: "lcdp-rubriques-admin",
      ariaLabel: "Sous-espaces de l'administration",
      onglets: CATEGORIES.map(({ key, label }) => ({ key, label }))
    });
    // Les quatre onglets restent présents, même si le service est indisponible.
    const buttons = await chargerRubriques();
    CATEGORIES.forEach(item => {
      afficherCategorie(onglets.zones[item.key], item.cat, buttons);
    });
    afficherStatut("");
  }

  async function initialiserPage() {
    const gardien = window.LCDP_GUARD_ADMIN;
    if (!gardien?.verifierAccesPageAdmin) {
      throw new Error("Contrôle d'accès admin indisponible.");
    }
    if (!await gardien.verifierAccesPageAdmin()) return;

    document.getElementById("lcdp-main-admin").hidden = false;
    const resultats = await Promise.allSettled([
      afficherBandeau(),
      afficherMenu(),
      afficherRubriques()
    ]);
    const erreurs = resultats.filter(x => x.status === "rejected")
      .map(x => x.reason?.message || "Composant indisponible.");
    if (erreurs.length) afficherStatut(erreurs.join(" ; "), true);
  }

  initialiserPage().catch(error => {
    console.error("Erreur Rubriques :", error);
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
    afficherStatut(error?.message || "Rubriques indisponibles.", true);
  });
})();
