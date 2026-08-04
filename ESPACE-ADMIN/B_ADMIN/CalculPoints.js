(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const FORM_SLOT_ID = "lcdp-calculpoints-form-slot";
  const RESULTAT_ID = "lcdp-calculpoints-resultat";

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

  function chargerScriptObjetUneFois(path) {
    const src = urlObjet(path);

    if (
      document.querySelector(
        `script[data-lcdp-script-objet="${path}"]`
      )
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.lcdpScriptObjet = path;
      script.onload = resolve;
      script.onerror = () => reject(
        new Error("Script OBJET introuvable : " + path)
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

  async function initialiserFormulaire() {
    await chargerScriptObjetUneFois(
      "/BOX/03-box-formulaire.js"
    );

    if (
      typeof window.LCDP_creerFormulaire !== "function"
    ) {
      throw new Error("Objet formulaire indisponible.");
    }

    const dateAujourdhui = dateIsoAujourdhuiParis();
    const form = await window.LCDP_creerFormulaire(
      FORM_SLOT_ID,
      {
        id: "lcdp-calculpoints-form",
        ariaLabel: "Calcul manuel des points",
        titre: "Lancer le calcul",
        sousTitre: "",
        introHtml:
          "<p>Le calcul crée une photographie à la date choisie. " +
          "Les comptes bloqués ou fermés sont exclus. Les comptes actifs, " +
          "suspendus ou sans statut sont inclus.</p>",
        validationNative: true,
        champs: [
          {
            name: "datepoints",
            label: "Date du calcul",
            type: "date",
            value: dateAujourdhui,
            required: true,
            validationNative: true
          }
        ],
        boutons: [
          {
            id: "lcdp-calculpoints-lancer",
            type: "submit",
            style: "lcdp-button-orange",
            label: "Calculer / recalculer"
          }
        ],
        noteHtml: ""
      }
    );

    if (!form) {
      throw new Error("Formulaire CalculPoints non créé.");
    }

    const dateInput = form.elements.namedItem("datepoints");

    if (dateInput) {
      dateInput.max = dateAujourdhui;
    }

    form.addEventListener("submit", lancerCalcul);
  }

  async function lancerCalcul(event) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!form.reportValidity()) {
      return;
    }

    const datepoints = String(
      form.elements.namedItem("datepoints")?.value || ""
    ).trim();

    if (!dateIsoValide(datepoints)) {
      await afficherAlerte("La date de calcul est invalide.");
      return;
    }

    if (datepoints > dateIsoAujourdhuiParis()) {
      await afficherAlerte(
        "La date de calcul ne peut pas être postérieure à aujourd’hui."
      );
      return;
    }

    const confirme = await demanderConfirmation(datepoints);

    if (!confirme) return;

    const bouton = form.querySelector(
      "#lcdp-calculpoints-lancer"
    );

    if (bouton) {
      bouton.disabled = true;
      bouton.textContent = "Calcul en cours…";
    }

    masquerResultat();

    try {
      const data = await appelerPoints(
        "/calcul-mensuel",
        {
          method: "POST",
          body: { datepoints }
        }
      );

      afficherResultat(data.resultat || {});
    } catch (error) {
      await afficherAlerte(
        String(
          error?.message ||
          error ||
          "Erreur pendant le calcul des points."
        )
      );
    } finally {
      if (bouton) {
        bouton.disabled = false;
        bouton.textContent = "Calculer / recalculer";
      }
    }
  }

  function masquerResultat() {
    const resultat = document.getElementById(RESULTAT_ID);

    if (resultat) {
      resultat.hidden = true;
    }
  }

  function afficherResultat(resultat) {
    const bloc = document.getElementById(RESULTAT_ID);

    if (!bloc) return;

    const statut = bloc.querySelector(
      "[data-calculpoints-statut]"
    );
    const estRecalcul = resultat?.statut === "recalcule";

    if (statut) {
      statut.textContent = estRecalcul
        ? "Les valeurs déjà enregistrées à cette date ont été remplacées."
        : "Le calcul a été enregistré.";
    }

    const valeursPoints = new Set([
      "pointsminimum",
      "pointsmaximum",
      "pointsintervalle",
      "seuilbronze",
      "seuilargent",
      "seuilor",
      "seuilplatine"
    ]);

    bloc.querySelectorAll(
      "[data-calculpoints-valeur]"
    ).forEach((element) => {
      const cle = element.dataset.calculpointsValeur || "";
      const valeur = resultat?.[cle];

      if (cle === "datepoints") {
        element.textContent = formaterDateIso(valeur);
        return;
      }

      if (valeursPoints.has(cle)) {
        element.textContent = formaterPoints(valeur);
        return;
      }

      element.textContent = formaterEntier(valeur);
    });

    bloc.hidden = false;
    bloc.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function formaterPoints(value) {
    const nombre = nombreOuNull(value);

    if (nombre === null) {
      return "Non calculé";
    }

    return nombre.toLocaleString("fr-FR") +
      (nombre === 1 ? " point" : " points");
  }

  function formaterEntier(value) {
    const nombre = nombreOuNull(value);

    return nombre === null
      ? "0"
      : nombre.toLocaleString("fr-FR");
  }

  function nombreOuNull(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const nombre = Number(value);

    return Number.isFinite(nombre)
      ? nombre
      : null;
  }

  function formaterDateIso(value) {
    const texte = String(value || "").trim();
    const match = texte.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return texte || "Non renseignée";

    return match[3] + "/" + match[2] + "/" + match[1];
  }

  function dateIsoValide(value) {
    const texte = String(value || "").trim();
    const match = texte.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return false;

    const annee = Number(match[1]);
    const mois = Number(match[2]);
    const jour = Number(match[3]);
    const date = new Date(
      Date.UTC(annee, mois - 1, jour)
    );

    return (
      date.getUTCFullYear() === annee &&
      date.getUTCMonth() + 1 === mois &&
      date.getUTCDate() === jour
    );
  }

  function dateIsoAujourdhuiParis() {
    const morceaux = new Intl.DateTimeFormat(
      "fr-FR",
      {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

    const valeur = (type) =>
      morceaux.find((item) => item.type === type)
        ?.value || "";

    return valeur("year") + "-" +
      valeur("month") + "-" +
      valeur("day");
  }

  async function demanderConfirmation(datepoints) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) return false;

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

    if (!dialogue || !titre || !texte || !actions) {
      slot.innerHTML = "";
      return false;
    }

    titre.textContent = "Calculer les points";
    texte.textContent =
      "Le calcul au " +
      formaterDateIso(datepoints) +
      " remplacera les valeurs déjà enregistrées à cette date.";

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className =
      "lcdp-button lcdp-button-secondary";
    annuler.textContent = "Annuler";

    const confirmer = document.createElement("button");
    confirmer.type = "button";
    confirmer.className =
      "lcdp-button lcdp-button-orange";
    confirmer.textContent = "Calculer";

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

      document.addEventListener("keydown", gererClavier);
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
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          terminer(false);
        }
      });
    });
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) return false;

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

  function redirigerConnexion() {
    const path = "/ESPACE-ADMIN/connexion-admin.html";

    if (typeof config.adminUrl === "function") {
      window.location.replace(config.adminUrl(path));
      return;
    }

    window.location.replace(urlAdmin(path));
  }

  async function verifierAcces() {
    const guard = window.LCDP_GUARD_ADMIN;

    if (
      !guard ||
      typeof guard.verifierAccesPageAdmin !== "function"
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
      initialiserFormulaire()
    ]);

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }
  }

  initialiserPage().catch(async (error) => {
    console.error(error);

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }

    await afficherAlerte(
      String(
        error?.message ||
        error ||
        "Erreur de chargement de CalculPoints."
      )
    );
  });
})();
