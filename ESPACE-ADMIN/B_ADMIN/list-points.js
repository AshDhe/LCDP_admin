(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const TABLE_SLOT_ID =
    "lcdp-table-lecture-admin-slot";
  const EDITION_SLOT_ID =
    "lcdp-point-edition-slot";

  const CHAMPS_MODIFIABLES = [
    "type",
    "description",
    "codeapp",
    "valpoint",
    "active"
  ];

  let pointEditionCourant = null;
  let modeCreation = false;

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

  function appliquerRoutes(racine = document) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const path = element.dataset.siteHref || "";
      const space = element.dataset.space || "public";

      element.setAttribute(
        "href",
        space === "admin"
          ? urlAdmin(path)
          : urlPublic(path)
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
    if (
      document.querySelector(
        `script[${attribut}="${valeur}"]`
      )
    ) {
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

  function chargerScriptObjetUneFois(path) {
    return chargerScriptUneFois(
      urlObjet(path),
      "data-lcdp-script-objet",
      path
    );
  }

  async function initialiserBandeau() {
    const slot = document.getElementById(
      "lcdp-bandeau-slot"
    );

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
    const moduleMenu =
      window.LCDP_MENU_GAUCHE_ADMIN;

    if (
      !moduleMenu ||
      typeof moduleMenu.initialiser !== "function"
    ) {
      throw new Error(
        "Menu gauche admin centralisé indisponible."
      );
    }

    await moduleMenu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "admin"
    });
  }

  function endpointAdminData() {
    return String(
      config.workerAdminDataUrl ||
      config.WORKER_ADMIN_DATA_URL ||
      window.ADMIN_CONFIG?.API_ADMIN_DATA ||
      ""
    ).replace(/\/+$/, "");
  }

  function endpointPointsAdmin() {
    const endpointConfigure = String(
      config.workerPointsAdminUrl ||
      config.WORKER_POINTS_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_POINTS_ADMIN ||
      ""
    ).replace(/\/+$/, "");

    if (endpointConfigure) {
      return endpointConfigure;
    }

    if (typeof config.apiUrl === "function") {
      return String(
        config.apiUrl("points-admin-api") || ""
      ).replace(/\/+$/, "");
    }

    return "https://points-admin-api.lacleduparc.fr";
  }

  async function appelerPoints(path, options = {}) {
    const endpoint = endpointPointsAdmin();

    if (!endpoint) {
      throw new Error(
        "Endpoint points-admin-api non configuré."
      );
    }

    let response;

    try {
      response = await fetch(endpoint + path, {
        method: options.method || "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {})
        },
        body: options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined
      });
    } catch (_) {
      throw new Error(
        "Impossible de joindre points-admin-api.lacleduparc.fr."
      );
    }

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      redirigerConnexion();
      throw new Error("Session administrateur expirée.");
    }

    if (response.status === 403) {
      throw new Error(
        data?.message ||
        "Permission administrateur insuffisante."
      );
    }

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "Réponse du worker points admin inexploitable."
      );
    }

    return data;
  }

  async function initialiserTable() {
    const slot = document.getElementById(
      TABLE_SLOT_ID
    );

    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentAdmin(
        "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.html"
      )
    );

    await chargerScriptAdminUneFois(
      "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js"
    );

    const table =
      window.LCDP_TABLE_LECTURE_ADMIN;

    if (
      !table ||
      typeof table.initialiser !== "function"
    ) {
      throw new Error(
        "Objet table lecture admin indisponible."
      );
    }

    await table.initialiser({
      slotId: TABLE_SLOT_ID,
      endpoint: endpointAdminData(),
      resource: "points-list",
      interactiveColumns: ["codeapp"],
      interactiveLabel: "Ouvrir l’entrée",
      onCellActivate: ({ row }) => {
        return ouvrirEditionPoint(
          String(row?.idevent || "")
        );
      }
    });
  }

  async function ouvrirCreationPoint() {
    modeCreation = true;
    pointEditionCourant = {
      type: "",
      description: "",
      codeapp: "",
      valpoint: 1,
      active: true
    };

    afficherZoneEdition();
    await rendreFormulairePoint(
      pointEditionCourant
    );
  }

  async function ouvrirEditionPoint(idevent) {
    const identifiant = String(idevent || "").trim();

    if (!identifiant) {
      throw new Error(
        "Identifiant de l’événement absent."
      );
    }

    modeCreation = false;
    afficherZoneEdition(
      "Chargement de l’entrée…"
    );

    try {
      const data = await appelerPoints(
        "/point?idevent=" +
        encodeURIComponent(identifiant)
      );

      if (!data.point) {
        throw new Error("Entrée introuvable.");
      }

      pointEditionCourant = data.point;
      await rendreFormulairePoint(
        pointEditionCourant
      );
    } catch (error) {
      afficherErreurEdition(error);
    }
  }

  function afficherZoneEdition(message = "") {
    const tableSlot = document.getElementById(
      TABLE_SLOT_ID
    );
    const editionSlot = document.getElementById(
      EDITION_SLOT_ID
    );
    const boutonAjouter = document.getElementById(
      "lcdp-listpoints-ajouter"
    );

    tableSlot.hidden = true;
    editionSlot.hidden = false;
    editionSlot.innerHTML = message
      ? '<p class="lcdp-listpoints__loading"></p>'
      : "";

    if (message) {
      editionSlot.querySelector("p").textContent =
        message;
    }

    if (boutonAjouter) {
      boutonAjouter.hidden = true;
    }
  }

  function afficherErreurEdition(error) {
    const editionSlot = document.getElementById(
      EDITION_SLOT_ID
    );

    editionSlot.innerHTML = "";

    const message = document.createElement("p");
    message.className = "lcdp-listpoints__loading";
    message.textContent = String(
      error?.message ||
      error ||
      "Erreur de chargement."
    );

    const retour = document.createElement("button");
    retour.type = "button";
    retour.className =
      "lcdp-button lcdp-button-secondary";
    retour.textContent = "Retour à la liste";
    retour.addEventListener(
      "click",
      fermerEditionPoint
    );

    editionSlot.appendChild(message);
    editionSlot.appendChild(retour);
  }

  async function rendreFormulairePoint(
    point,
    message = "",
    etat = ""
  ) {
    await chargerScriptObjetUneFois(
      "/BOX/03-box-formulaire.js"
    );

    if (
      typeof window.LCDP_creerFormulaire !==
      "function"
    ) {
      throw new Error(
        "Objet formulaire indisponible."
      );
    }

    const boutons = [
      {
        id: "lcdp-point-enregistrer",
        type: "submit",
        style: "lcdp-button-orange",
        label: modeCreation
          ? "Ajouter"
          : "Enregistrer"
      }
    ];

    if (!modeCreation) {
      boutons.push({
        id: "lcdp-point-supprimer",
        type: "button",
        style: "lcdp-button-orange",
        label: "Supprimer"
      });
    }

    boutons.push({
      id: "lcdp-point-retour",
      type: "button",
      style: "lcdp-button-secondary",
      label: "Retour à la liste"
    });

    const form = await window.LCDP_creerFormulaire(
      EDITION_SLOT_ID,
      {
        id: "lcdp-point-form",
        ariaLabel: modeCreation
          ? "Ajouter un événement de points"
          : "Modifier un événement de points",
        titre: modeCreation
          ? "Ajouter une entrée"
          : "Modifier une entrée",
        sousTitre: modeCreation
          ? ""
          : String(point.codeapp || ""),
        introHtml:
          "<p>Le type et le code application sont des textes libres. " +
          "La valeur de points doit être un entier positif ou négatif.</p>",
        validationNative: true,
        champs: construireChamps(point),
        boutons,
        noteHtml: message || ""
      }
    );

    if (!form) {
      throw new Error(
        "Formulaire ListPoints non créé."
      );
    }

    const note = form.querySelector(
      "[data-lcdp-formulaire-note]"
    );

    if (note) {
      note.hidden = !message;
      note.dataset.state = etat;
    }

    form.addEventListener(
      "submit",
      enregistrerPoint
    );

    form.querySelector("#lcdp-point-retour")
      ?.addEventListener(
        "click",
        fermerEditionPoint
      );

    form.querySelector("#lcdp-point-supprimer")
      ?.addEventListener(
        "click",
        supprimerPoint
      );

    document.getElementById(EDITION_SLOT_ID)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }

  function construireChamps(point) {
    const champs = [];

    if (!modeCreation) {
      champs.push(
        champLectureSeule(
          "idevent",
          "Identifiant de l’événement",
          point.idevent
        )
      );
    }

    champs.push(
      {
        name: "type",
        label: "Type",
        type: "text",
        value: point.type,
        required: true,
        validationNative: true,
        maxlength: 200
      },
      {
        name: "codeapp",
        label: "Code application",
        type: "text",
        value: point.codeapp,
        required: true,
        validationNative: true,
        maxlength: 200
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        value: point.description,
        required: true,
        validationNative: true,
        className:
          "lcdp-box-champ-formulaire--wide"
      },
      {
        name: "valpoint",
        label: "Valeur de points",
        type: "number",
        value: point.valpoint,
        required: true,
        validationNative: true,
        step: 1
      },
      {
        name: "active",
        label: "Entrée active",
        type: "checkbox",
        checked: point.active !== false,
        checkboxLabel:
          "Cette entrée peut être utilisée"
      }
    );

    if (!modeCreation) {
      champs.push(
        champLectureSeule(
          "created_at",
          "Date de création",
          formaterDateHeure(point.created_at)
        )
      );
    }

    return champs;
  }

  function champLectureSeule(
    name,
    label,
    value
  ) {
    return {
      name,
      label,
      type: "text",
      value,
      readonly: true
    };
  }

  async function enregistrerPoint(event) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!form.reportValidity()) {
      return;
    }

    const boutonEnregistrer = form.querySelector(
      "#lcdp-point-enregistrer"
    );
    const boutonRetour = form.querySelector(
      "#lcdp-point-retour"
    );
    const boutonSupprimer = form.querySelector(
      "#lcdp-point-supprimer"
    );
    const note = form.querySelector(
      "[data-lcdp-formulaire-note]"
    );

    const valeurs = lireValeursFormulaire(form);

    if (!Number.isInteger(valeurs.valpoint)) {
      afficherNote(
        note,
        "La valeur de points doit être un entier.",
        "error"
      );
      return;
    }

    boutonEnregistrer.disabled = true;
    boutonRetour.disabled = true;

    if (boutonSupprimer) {
      boutonSupprimer.disabled = true;
    }

    afficherNote(
      note,
      modeCreation
        ? "Ajout en cours…"
        : "Enregistrement en cours…",
      ""
    );

    try {
      let data;

      if (modeCreation) {
        data = await appelerPoints(
          "/point",
          {
            method: "POST",
            body: valeurs
          }
        );
      } else {
        const changes =
          construireModifications(
            valeurs,
            pointEditionCourant
          );

        if (Object.keys(changes).length < 1) {
          afficherNote(
            note,
            "Aucune modification à enregistrer.",
            "success"
          );
          deverrouillerBoutons(
            boutonEnregistrer,
            boutonRetour,
            boutonSupprimer
          );
          return;
        }

        const original = {};

        Object.keys(changes).forEach((champ) => {
          original[champ] =
            pointEditionCourant?.[champ];
        });

        data = await appelerPoints(
          "/point",
          {
            method: "PATCH",
            body: {
              idevent:
                pointEditionCourant.idevent,
              changes,
              original
            }
          }
        );
      }

      pointEditionCourant = data.point;

      await afficherAlerte(
        modeCreation
          ? "Entrée ajoutée."
          : "Modification enregistrée."
      );

      await fermerEditionPoint(true);
    } catch (error) {
      const message = String(
        error?.message ||
        error ||
        "Erreur d’enregistrement."
      );

      afficherNote(note, message, "error");
      await afficherAlerte(message);

      deverrouillerBoutons(
        boutonEnregistrer,
        boutonRetour,
        boutonSupprimer
      );
    }
  }

  function lireValeursFormulaire(form) {
    const valeurNombre = String(
      form.elements.namedItem("valpoint")?.value ||
      ""
    ).trim();

    return {
      type: String(
        form.elements.namedItem("type")?.value ||
        ""
      ).trim(),
      description: String(
        form.elements.namedItem("description")?.value ||
        ""
      ).trim(),
      codeapp: String(
        form.elements.namedItem("codeapp")?.value ||
        ""
      ).trim(),
      valpoint:
        valeurNombre === ""
          ? Number.NaN
          : Number(valeurNombre),
      active:
        form.elements.namedItem("active")
          ?.checked === true
    };
  }

  function construireModifications(
    valeurs,
    original
  ) {
    const changes = {};

    CHAMPS_MODIFIABLES.forEach((champ) => {
      if (
        !valeursEgales(
          original?.[champ],
          valeurs[champ]
        )
      ) {
        changes[champ] = valeurs[champ];
      }
    });

    return changes;
  }

  async function supprimerPoint() {
    if (
      !pointEditionCourant?.idevent ||
      modeCreation
    ) {
      return;
    }

    const confirme =
      await demanderConfirmationSuppression();

    if (!confirme) {
      return;
    }

    const form = document.getElementById(
      "lcdp-point-form"
    );
    const boutons = form
      ? Array.from(form.querySelectorAll("button"))
      : [];

    boutons.forEach((bouton) => {
      bouton.disabled = true;
    });

    try {
      await appelerPoints(
        "/point?idevent=" +
        encodeURIComponent(
          pointEditionCourant.idevent
        ),
        {
          method: "DELETE",
          body: {
            original: {
              type: pointEditionCourant.type,
              description:
                pointEditionCourant.description,
              codeapp: pointEditionCourant.codeapp,
              valpoint:
                pointEditionCourant.valpoint,
              active: pointEditionCourant.active,
              created_at:
                pointEditionCourant.created_at
            }
          }
        }
      );

      await afficherAlerte("Entrée supprimée.");
      await fermerEditionPoint(true);
    } catch (error) {
      boutons.forEach((bouton) => {
        bouton.disabled = false;
      });

      await afficherAlerte(
        String(
          error?.message ||
          error ||
          "Erreur de suppression."
        )
      );
    }
  }

  function valeursEgales(a, b) {
    if (
      (a === null || a === undefined || a === "") &&
      (b === null || b === undefined || b === "")
    ) {
      return true;
    }

    if (
      typeof a === "boolean" ||
      typeof b === "boolean"
    ) {
      return a === b;
    }

    if (
      typeof a === "number" ||
      typeof b === "number"
    ) {
      return Number(a) === Number(b);
    }

    return String(a) === String(b);
  }

  function deverrouillerBoutons(
    enregistrer,
    retour,
    supprimer
  ) {
    enregistrer.disabled = false;
    retour.disabled = false;

    if (supprimer) {
      supprimer.disabled = false;
    }
  }

  function afficherNote(note, texte, etat) {
    if (!note) return;

    note.textContent = texte;
    note.hidden = !texte;
    note.dataset.state = etat || "";
  }

  async function demanderConfirmationSuppression() {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      return false;
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet(
        "/BOX/02-box-dialogue-bouton.html"
      )
    );

    const dialogue = slot.querySelector(
      "[data-lcdp-box-dialogue-bouton]"
    );
    const titre = slot.querySelector(
      "[data-lcdp-dialogue-title]"
    );
    const texte = slot.querySelector(
      "[data-lcdp-dialogue-text]"
    );
    const actions = slot.querySelector(
      "[data-lcdp-dialogue-actions]"
    );
    const fermer = slot.querySelector(
      "[data-lcdp-dialogue-close]"
    );

    if (
      !dialogue ||
      !titre ||
      !texte ||
      !actions
    ) {
      slot.innerHTML = "";
      return false;
    }

    titre.textContent = "Supprimer l’entrée";
    texte.textContent =
      "Cette suppression est définitive.";

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className =
      "lcdp-button lcdp-button-secondary";
    annuler.textContent = "Annuler";

    const confirmer =
      document.createElement("button");
    confirmer.type = "button";
    confirmer.className =
      "lcdp-button lcdp-button-orange";
    confirmer.textContent = "Supprimer";

    actions.appendChild(annuler);
    actions.appendChild(confirmer);

    return new Promise((resolve) => {
      let resolu = false;

      function terminer(valeur) {
        if (resolu) return;
        resolu = true;
        document.removeEventListener(
          "keydown",
          gererClavier
        );
        slot.innerHTML = "";
        resolve(valeur);
      }

      function gererClavier(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          terminer(false);
        }
      }

      document.addEventListener(
        "keydown",
        gererClavier
      );

      fermer?.addEventListener(
        "click",
        () => terminer(false)
      );
      annuler.addEventListener(
        "click",
        () => terminer(false)
      );
      confirmer.addEventListener(
        "click",
        () => terminer(true)
      );
      dialogue.addEventListener(
        "click",
        (event) => {
          if (event.target === dialogue) {
            terminer(false);
          }
        }
      );
    });
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      return false;
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet(
        "/BOX/02-box-alerte.html"
      )
    );

    const texte = slot.querySelector(
      "[data-lcdp-alerte-message]"
    );
    const fermer = slot.querySelector(
      "[data-lcdp-alerte-close]"
    );
    const ok = slot.querySelector(
      "[data-lcdp-alerte-ok]"
    );

    if (!texte || !ok) {
      slot.innerHTML = "";
      return false;
    }

    texte.textContent = message || "";

    if (fermer) {
      fermer.hidden = true;
    }

    return new Promise((resolve) => {
      ok.addEventListener(
        "click",
        () => {
          slot.innerHTML = "";
          resolve(true);
        },
        { once: true }
      );
    });
  }

  async function fermerEditionPoint(
    recharger = false
  ) {
    const tableSlot = document.getElementById(
      TABLE_SLOT_ID
    );
    const editionSlot = document.getElementById(
      EDITION_SLOT_ID
    );
    const boutonAjouter = document.getElementById(
      "lcdp-listpoints-ajouter"
    );

    pointEditionCourant = null;
    modeCreation = false;
    editionSlot.innerHTML = "";
    editionSlot.hidden = true;
    tableSlot.hidden = false;

    if (boutonAjouter) {
      boutonAjouter.hidden = false;
    }

    if (recharger) {
      const table =
        window.LCDP_TABLE_LECTURE_ADMIN;

      if (
        table &&
        typeof table.recharger === "function"
      ) {
        await table.recharger(TABLE_SLOT_ID);
      }
    }

    tableSlot.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function formaterDateHeure(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function redirigerConnexion() {
    const path =
      "/ESPACE-ADMIN/connexion-admin.html";

    if (typeof config.adminUrl === "function") {
      window.location.replace(
        config.adminUrl(path)
      );
      return;
    }

    window.location.replace(urlAdmin(path));
  }

  async function verifierAcces() {
    const guard = window.LCDP_GUARD_ADMIN;

    if (
      !guard ||
      typeof guard.verifierAccesPageAdmin !==
      "function"
    ) {
      throw new Error(
        "Garde admin centralisé indisponible."
      );
    }

    return guard.verifierAccesPageAdmin();
  }

  async function initialiserPage() {
    const autorise = await verifierAcces();

    if (!autorise) return;

    await Promise.all([
      initialiserBandeau(),
      initialiserMenuGauche(),
      initialiserTable()
    ]);

    document
      .getElementById("lcdp-listpoints-ajouter")
      ?.addEventListener(
        "click",
        ouvrirCreationPoint
      );

    const main = document.getElementById(
      "lcdp-main-admin"
    );

    if (main) {
      main.hidden = false;
    }
  }

  initialiserPage().catch((error) => {
    console.error(error);
  });
})();
