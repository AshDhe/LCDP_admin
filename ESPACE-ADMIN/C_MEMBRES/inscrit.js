(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const ONGLET_SLOT_ID = "lcdp-inscrit-onglets-slot";
  const TABLE_SLOT_ID = "lcdp-inscrit-table-slot";
  const FICHE_SLOT_ID = "lcdp-inscrit-fiche-slot";
  const RESOURCE_CODE = "membres-inscrits";

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
      return String(config.apiUrl("membre-admin-api")).replace(/\/+$/, "");
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
      throw new Error("Slot des onglets Inscrits introuvable.");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/05-wraper-onglets.html")
    );

    const racine = slot.querySelector("[data-lcdp-wraper-onglets]");

    if (!racine) {
      throw new Error("Objet onglets introuvable.");
    }

    configurerOnglets(racine);
    initialiserNavigationOnglets(racine);
    preparerContenuOnglets(racine);

    return racine;
  }

  function configurerOnglets(racine) {
    const boutons = Array.from(racine.querySelectorAll("[data-lcdp-onglet]"));
    const panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    if (boutons.length < 2 || panneaux.length < 2) {
      throw new Error("Structure des onglets incomplète.");
    }

    racine.setAttribute("aria-label", "Rubriques des inscrits");
    racine.querySelector("[data-lcdp-wraper-onglets-navigation]")
      ?.setAttribute("aria-label", "Rubriques des inscrits");

    configurerOnglet(
      boutons[0],
      panneaux[0],
      "membres",
      "Membres",
      true
    );

    configurerOnglet(
      boutons[1],
      panneaux[1],
      "liste-attente",
      "Liste attente",
      false
    );
  }

  function configurerOnglet(bouton, panneau, key, label, actif) {
    const idBouton = "lcdp-inscrit-tab-" + key;
    const idPanneau = "lcdp-inscrit-onglet-" + key;
    const contenu = panneau.querySelector("[data-lcdp-contenu-onglet]");

    bouton.id = idBouton;
    bouton.textContent = label;
    bouton.dataset.lcdpOnglet = key;
    bouton.setAttribute("aria-controls", idPanneau);
    bouton.setAttribute("aria-selected", String(actif));
    bouton.tabIndex = actif ? 0 : -1;

    panneau.id = idPanneau;
    panneau.dataset.lcdpPanneauOnglet = key;
    panneau.setAttribute("aria-labelledby", idBouton);
    panneau.hidden = !actif;

    if (contenu) {
      contenu.dataset.lcdpContenuOnglet = key;
    }
  }

  function initialiserNavigationOnglets(racine) {
    const boutons = Array.from(racine.querySelectorAll("[data-lcdp-onglet]"));
    const panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    boutons.forEach((bouton) => {
      bouton.addEventListener("click", () => {
        activerOnglet(bouton.dataset.lcdpOnglet, boutons, panneaux);
      });

      bouton.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
          return;
        }

        event.preventDefault();
        const index = boutons.indexOf(bouton);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const prochain = boutons[
          (index + direction + boutons.length) % boutons.length
        ];

        prochain.click();
        prochain.focus();
      });
    });
  }

  function activerOnglet(nom, boutons, panneaux) {
    boutons.forEach((bouton) => {
      const actif = bouton.dataset.lcdpOnglet === nom;
      bouton.setAttribute("aria-selected", String(actif));
      bouton.tabIndex = actif ? 0 : -1;
    });

    panneaux.forEach((panneau) => {
      panneau.hidden = panneau.dataset.lcdpPanneauOnglet !== nom;
    });
  }

  function preparerContenuOnglets(racine) {
    const zoneMembres = racine.querySelector(
      '[data-lcdp-contenu-onglet="membres"]'
    );
    const zoneAttente = racine.querySelector(
      '[data-lcdp-contenu-onglet="liste-attente"]'
    );

    if (!zoneMembres || !zoneAttente) {
      throw new Error("Zones de contenu des onglets introuvables.");
    }

    zoneMembres.innerHTML = "";

    const tableSlot = document.createElement("div");
    tableSlot.id = TABLE_SLOT_ID;
    tableSlot.className = "lcdp-inscrit-admin__table";

    const ficheSlot = document.createElement("div");
    ficheSlot.id = FICHE_SLOT_ID;
    ficheSlot.className = "lcdp-inscrit-admin__fiche";
    ficheSlot.hidden = true;

    zoneMembres.appendChild(tableSlot);
    zoneMembres.appendChild(ficheSlot);

    zoneAttente.innerHTML = "";
    const attente = document.createElement("p");
    attente.className = "lcdp-inscrit-admin__attente";
    attente.textContent =
      "La lecture de la liste d’attente sera configurée dans une étape ultérieure.";
    zoneAttente.appendChild(attente);
  }

  async function initialiserTable() {
    const slot = document.getElementById(TABLE_SLOT_ID);

    if (!slot) {
      throw new Error("Slot de la table Membres introuvable.");
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
      interactiveColumns: ["nommembre"],
      interactiveLabel: "Ouvrir la fiche membre",
      interactiveLabels: {
        nommembre: "Ouvrir la fiche de"
      },
      initialSortKey: "datecreation",
      initialSortDirection: "desc",
      onCellActivate: ({ row }) => ouvrirFicheMembre(row)
    });
  }

  function ouvrirFicheMembre(row) {
    const tableSlot = document.getElementById(TABLE_SLOT_ID);
    const ficheSlot = document.getElementById(FICHE_SLOT_ID);

    if (!tableSlot || !ficheSlot) return;

    ficheSlot.innerHTML = "";

    const titre = document.createElement("h2");
    titre.className = "lcdp-inscrit-admin__fiche-titre";
    titre.textContent = "Fiche membre";

    const donnees = document.createElement("dl");
    donnees.className = "lcdp-inscrit-admin__fiche-donnees";

    [
      ["Nom", row?.nommembre],
      ["Prénom", row?.prenommembre],
      ["E-mail", row?.emailmembre],
      ["DateInsc", formaterDate(row?.datecreation)],
      ["DatEmailValid", formaterDate(row?.dateemailvalid)],
      ["Dptmt", row?.dptmtmembre]
    ].forEach(([label, value]) => {
      donnees.appendChild(creerLigneFiche(label, value));
    });

    const retour = document.createElement("button");
    retour.type = "button";
    retour.className = "lcdp-button lcdp-button-secondary";
    retour.textContent = "Retour à la liste";
    retour.addEventListener("click", fermerFicheMembre);

    ficheSlot.appendChild(titre);
    ficheSlot.appendChild(donnees);
    ficheSlot.appendChild(retour);

    tableSlot.hidden = true;
    ficheSlot.hidden = false;
    ficheSlot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function creerLigneFiche(label, value) {
    const ligne = document.createElement("div");
    const terme = document.createElement("dt");
    const definition = document.createElement("dd");

    ligne.className = "lcdp-inscrit-admin__fiche-ligne";
    terme.textContent = label;
    definition.textContent = valeurAffichee(value);

    ligne.appendChild(terme);
    ligne.appendChild(definition);

    return ligne;
  }

  function fermerFicheMembre() {
    const tableSlot = document.getElementById(TABLE_SLOT_ID);
    const ficheSlot = document.getElementById(FICHE_SLOT_ID);

    if (!tableSlot || !ficheSlot) return;

    ficheSlot.innerHTML = "";
    ficheSlot.hidden = true;
    tableSlot.hidden = false;
    tableSlot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formaterDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function valeurAffichee(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    return String(value);
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
    console.error("Erreur page Inscrits admin :", error);
  });
})();
