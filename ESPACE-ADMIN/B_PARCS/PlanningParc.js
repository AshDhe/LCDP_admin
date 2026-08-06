(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const TABLE_SLOT_ID = "lcdp-planning-parc-table-slot";
  const RESOURCE_CODE = "parcs-planning-lecture";

  let templateJourMois = null;
  let templateHeureJour = null;
  let planningOuvert = null;

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

  function endpointAdminData() {
    const configure =
      config.workerAdminDataUrl ||
      config.WORKER_ADMIN_DATA_URL ||
      window.ADMIN_CONFIG?.API_ADMIN_DATA ||
      "";

    if (configure) {
      return String(configure).replace(/\/+$/, "");
    }

    if (typeof config.apiUrl === "function") {
      return String(
        config.apiUrl("admin-data-api")
      ).replace(/\/+$/, "");
    }

    return "https://admin-data-api.lacleduparc.fr";
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

  function chargerScriptUneFois(src, attribut, valeur) {
    if (document.querySelector(`script[${attribut}="${valeur}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.setAttribute(attribut, valeur);
      script.onload = resolve;
      script.onerror = () => reject(
        new Error("Script introuvable : " + valeur)
      );
      document.body.appendChild(script);
    });
  }

  function chargerScriptAdminUneFois(path) {
    return chargerScriptUneFois(
      urlAdmin(path),
      "data-lcdp-script-admin",
      path
    );
  }

  function chargerScriptPublicUneFois(path) {
    return chargerScriptUneFois(
      urlPublic(path),
      "data-lcdp-script-public",
      path
    );
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
      categorieActive: "parcs"
    });
  }

  async function initialiserTable() {
    const slot = document.getElementById(TABLE_SLOT_ID);

    if (!slot) {
      throw new Error("Slot de la table Planning Parc introuvable.");
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
      endpoint: endpointAdminData(),
      resource: RESOURCE_CODE,
      interactiveColumns: ["nom"],
      onCellActivate: ({ row }) => {
        ouvrirPlanningParc(row).catch(console.error);
      }
    });
  }

  async function initialiserObjetsPlanning() {
    await chargerScriptPublicUneFois(
      "/ESPACE-PUBLIC/fiche-parc.js"
    );

    if (
      !window.LCDP_FicheParc ||
      typeof window.LCDP_FicheParc.rendrePlanningDansConteneur !==
        "function"
    ) {
      throw new Error("Constructeur du planning du parc indisponible.");
    }

    const [fragmentJour, fragmentHeure] = await Promise.all([
      chargerFragmentObjet(
        "/BOX/04-box-card-jour-in-calendrier-mois.html"
      ),
      chargerFragmentObjet(
        "/BOX/04-box-card-heure-in-calendrier-jour.html"
      )
    ]);

    templateJourMois = fragmentJour.querySelector(
      "[data-lcdp-card-jour-mois]"
    );
    templateHeureJour = fragmentHeure.querySelector(
      "[data-lcdp-card-heure-jour]"
    );

    if (!templateJourMois || !templateHeureJour) {
      throw new Error("Templates du planning introuvables.");
    }
  }

  async function ouvrirPlanningParc(row) {
    const idparc = String(row?.idparc || "").trim();
    const nom = String(row?.nom || "Parc").trim() || "Parc";
    const dptmt = String(row?.dptmt || "").trim();

    if (!idparc) {
      throw new Error("Identifiant du parc absent de la ligne.");
    }

    fermerPlanningParc();

    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot du planning introuvable.");
    }

    const fragment = await chargerFragmentObjet(
      "/BOX/04-box-shift-detail-parc.html"
    );
    const shift = fragment.querySelector(
      "[data-lcdp-box-shift-detail-parc]"
    );
    const contenu = fragment.querySelector(
      "[data-lcdp-shift-detail-parc-content]"
    );
    const alerteSlot = fragment.querySelector(
      "[data-lcdp-shift-detail-parc-alerte-slot]"
    );
    const boutonFermer = fragment.querySelector(
      "[data-lcdp-shift-detail-parc-close]"
    );

    if (!shift || !contenu || !boutonFermer) {
      throw new Error("Structure du planning du parc incomplète.");
    }

    shift.hidden = false;
    shift.classList.add(
      "lcdp-box-shift-detail-parc--visible",
      "lcdp-planning-parc-admin__shift"
    );
    slot.replaceChildren(shift);

    const fermer = () => fermerPlanningParc();
    const gererEchap = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        fermer();
      }
    };

    boutonFermer.addEventListener("click", fermer);
    shift.addEventListener("click", (event) => {
      if (event.target === shift) {
        fermer();
      }
    });
    document.addEventListener("keydown", gererEchap);

    const observateur = new MutationObserver(() => {
      nettoyerActionsPlanning(contenu);
    });
    observateur.observe(contenu, {
      childList: true,
      subtree: true
    });

    planningOuvert = {
      shift,
      observateur,
      gererEchap
    };

    try {
      await window.LCDP_FicheParc.rendrePlanningDansConteneur(
        contenu,
        {
          idparc,
          nom,
          dptmt
        },
        {
          modeUsage: "consultation-publique",
          chargerFragmentObjet,
          construireUrlObjet: urlObjet,
          appliquerRoutes,
          templateJourMois,
          templateHeureJour,
          chargerDroitsPlanning: chargerDroitsPlanning,
          chargerPlanningMois: chargerPlanningMois,
          chargerPlanningJour: chargerPlanningJour,
          onInformation: (message) => {
            afficherMessagePlanning(alerteSlot, message, false);
          },
          onErreur: (message) => {
            afficherMessagePlanning(alerteSlot, message, true);
          },
          onRetourPresentation: () => {},
          onPartager: () => {},
          onReserver: () => {}
        }
      );

      nettoyerActionsPlanning(contenu);
    } catch (error) {
      afficherMessagePlanning(
        alerteSlot,
        String(
          error?.message ||
          error ||
          "Impossible de charger le planning."
        ),
        true
      );
      throw error;
    }
  }

  function nettoyerActionsPlanning(contenu) {
    contenu
      .querySelectorAll(".lcdp-box-fiche-parc__actions-barre")
      .forEach((element) => element.remove());

    contenu
      .querySelectorAll("[data-lcdp-planning-instruction-detail]")
      .forEach((element) => {
        if (
          element.closest(
            ".lcdp-fiche-parc__planning-jour-overlay"
          )
        ) {
          element.textContent = "Détail horaire de la journée.";
        }
      });
  }

  function fermerPlanningParc() {
    if (planningOuvert) {
      planningOuvert.observateur?.disconnect();
      document.removeEventListener(
        "keydown",
        planningOuvert.gererEchap
      );
    }

    planningOuvert = null;

    const slot = document.getElementById("lcdp-lightbox-slot");

    if (slot) {
      slot.innerHTML = "";
    }
  }

  function afficherMessagePlanning(slot, message, erreur) {
    if (!slot) {
      return;
    }

    slot.innerHTML = "";

    const texte = document.createElement("p");
    texte.className = erreur
      ? "lcdp-planning-parc-admin__message lcdp-planning-parc-admin__message--erreur"
      : "lcdp-planning-parc-admin__message";
    texte.textContent = String(message || "");
    slot.appendChild(texte);
  }

  async function chargerDroitsPlanning(parc) {
    const data = await lireApiPlanning(
      "/droits-planning?idparc=" +
      encodeURIComponent(String(parc?.idparc || ""))
    );

    return data.droitsPlanning;
  }

  async function chargerPlanningMois(etatPlanning) {
    const idparc = String(
      etatPlanning?.parc?.idparc || ""
    ).trim();
    const data = await lireApiPlanning(
      "/planning-parc-mois?idparc=" +
      encodeURIComponent(idparc) +
      "&annee=" +
      encodeURIComponent(String(etatPlanning.annee)) +
      "&mois=" +
      encodeURIComponent(String(etatPlanning.mois))
    );

    return Array.isArray(data.planning)
      ? data.planning
      : [];
  }

  async function chargerPlanningJour(etatPlanning, dateIso) {
    const idparc = String(
      etatPlanning?.parc?.idparc || ""
    ).trim();
    const data = await lireApiPlanning(
      "/planning-parc-jour?idparc=" +
      encodeURIComponent(idparc) +
      "&date=" +
      encodeURIComponent(dateIso)
    );

    return data.jour || {
      date: dateIso,
      ouvert: false,
      segments: []
    };
  }

  async function lireApiPlanning(path) {
    const endpoint = endpointAdminData();

    if (!endpoint) {
      throw new Error("Le service Admin Data n’est pas configuré.");
    }

    const response = await fetch(endpoint + path, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });
    const data = await response.json().catch(() => null);

    if (response.status === 401 || response.status === 403) {
      redirigerConnexion();
      throw new Error("Session administrateur inactive.");
    }

    if (
      !response.ok ||
      !data ||
      (data.success !== true && data.ok !== true)
    ) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "Impossible de lire le planning du parc."
      );
    }

    return data;
  }

  function redirigerConnexion() {
    const path = "/ESPACE-ADMIN/connexion-admin.html";

    window.location.replace(
      typeof config.adminUrl === "function"
        ? config.adminUrl(path)
        : urlAdmin(path)
    );
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
      initialiserMenuGauche(),
      initialiserObjetsPlanning()
    ]);

    await initialiserTable();

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }
  }

  initialiserPage().catch((error) => {
    console.error("Erreur Planning Parc admin :", error);
  });
})();
