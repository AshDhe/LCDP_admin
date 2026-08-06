(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const ONGLET_SLOT_ID = "lcdp-parrains-onglets-slot";
  const TABLE_SLOT_ID = "lcdp-parrains-table-slot";
  const RESOURCE_CODE = "membres-parrains";

  function urlAdmin(path) {
    return typeof window.LCDP_urlAdmin === "function"
      ? window.LCDP_urlAdmin(path)
      : path;
  }

  function urlPublic(path) {
    return typeof window.LCDP_urlPublic === "function"
      ? window.LCDP_urlPublic(path)
      : path;
  }

  function urlObjet(path) {
    return typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet(path)
      : path;
  }

  function endpointMembreAdmin() {
    const configure =
      config.workerMembreAdminUrl ||
      config.WORKER_MEMBRE_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_MEMBRE_ADMIN ||
      "";

    if (configure) {
      return String(configure).replace(/\/+$/, "");
    }

    if (typeof config.apiUrl === "function") {
      return String(config.apiUrl("membre-admin-api"))
        .replace(/\/+$/, "");
    }

    return "https://membre-admin-api.lacleduparc.fr";
  }

  function appliquerRoutes(racine = document) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const path = element.dataset.siteHref || "";
      const space = element.dataset.space || "public";

      element.setAttribute(
        "href",
        space === "admin" ? urlAdmin(path) : urlPublic(path)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const path = String(element.dataset.siteSrc || "")
        .replace(/^\/?OBJET\/?/, "/");

      element.setAttribute("src", urlObjet(path));
    });
  }

  async function chargerFragment(url, libelle) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(libelle + " introuvable.");
    }

    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();

    return template.content.cloneNode(true);
  }

  function chargerFragmentAdmin(path) {
    return chargerFragment(
      urlAdmin(path),
      "Fragment ADMIN " + path
    );
  }

  function chargerFragmentObjet(path) {
    return chargerFragment(
      urlObjet(path),
      "Fragment OBJET " + path
    );
  }

  function chargerScriptAdminUneFois(path) {
    if (document.querySelector(`script[data-lcdp-script-admin="${path}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = urlAdmin(path);
      script.defer = true;
      script.dataset.lcdpScriptAdmin = path;
      script.onload = resolve;
      script.onerror = () => reject(
        new Error("Script ADMIN introuvable : " + path)
      );
      document.body.appendChild(script);
    });
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentAdmin(
        "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
      )
    );
    appliquerRoutes(slot);
  }

  async function initialiserMenuGauche() {
    const moduleMenu = window.LCDP_MENU_GAUCHE_ADMIN;

    if (!moduleMenu || typeof moduleMenu.initialiser !== "function") {
      throw new Error("Menu gauche admin centralisé indisponible.");
    }

    await moduleMenu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "membres"
    });
  }

  async function initialiserWraperOnglets() {
    const slot = document.getElementById(ONGLET_SLOT_ID);

    if (!slot) {
      throw new Error("Slot des onglets Parrains introuvable.");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/05-wraper-onglets.html")
    );

    const racine = slot.querySelector("[data-lcdp-wraper-onglets]");

    if (!racine) {
      throw new Error("Objet onglets introuvable.");
    }

    configurerOngletParrains(racine);
    preparerContenuOnglet(racine);

    return racine;
  }

  function configurerOngletParrains(racine) {
    const boutons = Array.from(
      racine.querySelectorAll("[data-lcdp-onglet]")
    );
    const panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    if (boutons.length < 1 || panneaux.length < 1) {
      throw new Error("Structure de l’onglet Parrains incomplète.");
    }

    boutons.slice(1).forEach((bouton) => bouton.remove());
    panneaux.slice(1).forEach((panneau) => panneau.remove());

    const bouton = boutons[0];
    const panneau = panneaux[0];
    const contenu = panneau.querySelector("[data-lcdp-contenu-onglet]");
    const idBouton = "lcdp-parrains-tab-parrains";
    const idPanneau = "lcdp-parrains-onglet-parrains";

    racine.setAttribute("aria-label", "Rubriques des parrains");
    racine.querySelector("[data-lcdp-wraper-onglets-navigation]")
      ?.setAttribute("aria-label", "Rubriques des parrains");

    bouton.id = idBouton;
    bouton.textContent = "Parrains";
    bouton.dataset.lcdpOnglet = "parrains";
    bouton.setAttribute("aria-controls", idPanneau);
    bouton.setAttribute("aria-selected", "true");
    bouton.tabIndex = 0;

    panneau.id = idPanneau;
    panneau.dataset.lcdpPanneauOnglet = "parrains";
    panneau.setAttribute("aria-labelledby", idBouton);
    panneau.hidden = false;

    if (contenu) {
      contenu.dataset.lcdpContenuOnglet = "parrains";
    }
  }

  function preparerContenuOnglet(racine) {
    const zone = racine.querySelector(
      '[data-lcdp-contenu-onglet="parrains"]'
    );

    if (!zone) {
      throw new Error("Zone de contenu Parrains introuvable.");
    }

    zone.innerHTML = "";

    const tableSlot = document.createElement("div");
    tableSlot.id = TABLE_SLOT_ID;
    tableSlot.className = "lcdp-parrains-admin__table";
    zone.appendChild(tableSlot);
  }

  async function initialiserTable() {
    const slot = document.getElementById(TABLE_SLOT_ID);

    if (!slot) {
      throw new Error("Slot de la table Parrains introuvable.");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentAdmin(
        "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.html"
      )
    );

    await chargerScriptAdminUneFois(
      "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js"
    );

    const table = window.LCDP_TABLE_LECTURE_ADMIN;

    if (!table || typeof table.initialiser !== "function") {
      throw new Error("Objet table lecture admin indisponible.");
    }

    await table.initialiser({
      slotId: TABLE_SLOT_ID,
      endpoint: endpointMembreAdmin(),
      resource: RESOURCE_CODE,
      initialSortKey: "nomparrain",
      initialSortDirection: "asc"
    });
  }

  async function verifierAcces() {
    const guard = window.LCDP_GUARD_ADMIN;

    if (!guard || typeof guard.verifierAccesPageAdmin !== "function") {
      throw new Error("Garde admin centralisé indisponible.");
    }

    return guard.verifierAccesPageAdmin();
  }

  async function initialiserPage() {
    const autorise = await verifierAcces();

    if (!autorise) return;

    await Promise.all([
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);

    await initialiserWraperOnglets();
    await initialiserTable();

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }
  }

  initialiserPage().catch((error) => {
    console.error("Erreur page Parrains admin :", error);
  });
})();
