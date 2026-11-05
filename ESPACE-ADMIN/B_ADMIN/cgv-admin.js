(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const CHEMIN_ROUTE =
    "/ESPACE-ADMIN/B_ADMIN/cgv-admin.html";

  let controleurEditeur = null;
  let documentCharge = null;
  let modificationsLocales = false;
  let requeteEnCours = false;

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

  function endpointEditingAdmin() {
    return String(
      config.workerEditingAdminUrl ||
      config.WORKER_EDITING_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_EDITING_ADMIN ||
      "https://editing-admin-api.lacleduparc.fr"
    ).replace(/\/+$/, "");
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
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-cache"
      });
    } catch (error) {
      throw new Error(libelle + " : chargement impossible (" + url + ").", { cause: error });
    }

    if (!response.ok) {
      throw new Error(libelle + " : erreur HTTP " + response.status + " (" + url + ").");
    }

    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();

    return template.content.cloneNode(true);
  }

  async function chargerFragmentAdmin(path) {
    const distant = urlAdmin(path);
    const local = new URL(path, window.location.origin).href;
    try {
      return await chargerFragment(distant, "Fragment ADMIN " + path);
    } catch (error) {
      // Les fragments ADMIN sont des ressources statiques ; si le domaine configuré
      // est momentanément inaccessible, essayer le chemin du site affiché.
      if (new URL(distant, window.location.href).href !== local) {
        try {
          return await chargerFragment(local, "Fragment ADMIN " + path);
        } catch (erreurLocale) {
          throw new Error(
            "Fragment ADMIN " + path + " inaccessible sur les deux origines : " +
            error.message + " ; " + erreurLocale.message
          );
        }
      }
      throw error;
    }
  }

  function chargerFragmentObjet(path) {
    return chargerFragment(
      urlObjet(path),
      "Fragment OBJET " + path
    );
  }

  function chargerScriptAdminUneFois(path) {
    if (
      document.querySelector(
        `script[data-lcdp-script-admin="${path}"]`
      )
    ) {
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

  function chargerScriptObjetUneFois(path) {
    if (
      document.querySelector(
        `script[data-lcdp-script-objet="${path}"]`
      )
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = urlObjet(path);
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
    const fragment = await chargerFragmentAdmin(
      "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
    );

    slot.appendChild(fragment);
    appliquerRoutes(slot);
  }

  async function initialiserMenuGauche() {
    const moduleMenu = window.LCDP_MENU_GAUCHE_ADMIN;

    if (!moduleMenu || typeof moduleMenu.initialiser !== "function") {
      throw new Error("Menu gauche admin centralisé indisponible.");
    }

    await moduleMenu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "admin"
    });
  }

  async function appelerJson(path, options = {}) {
    const endpoint = endpointEditingAdmin();

    if (!endpoint) {
      throw new Error(
        "Endpoint editing-admin-api non configuré."
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
        "Impossible de joindre editing-admin-api.lacleduparc.fr."
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
        "Réponse du worker editing-admin inexploitable."
      );
    }

    return data;
  }

  async function chargerDocument() {
    return appelerJson("/admin/cgv");
  }

  async function initialiserEditeur(data) {
    const slot = document.querySelector(
      "[data-lcdp-mentions-editeur-slot]"
    );

    if (!slot) {
      throw new Error("Slot de l’éditeur introuvable.");
    }

    slot.innerHTML = "";

    // La structure partagée est présente dans cette page : aucun fetch HTML
    // externe n'est nécessaire pour initialiser les CGV.
    const modele = document.getElementById("lcdp-cgv-editeur-structure");
    if (!modele?.content?.querySelector("[data-lcdp-editeur-contenu]")) {
      throw new Error("Structure de l'éditeur CGV indisponible.");
    }
    slot.appendChild(modele.content.cloneNode(true));

    await chargerScriptAdminUneFois(
      "/ESPACE-ADMIN/A_STRUCTURE/box-editeur-contenu.js"
    );

    const moduleEditeur = window.LCDP_EDITEUR_CONTENU;
    const racine = slot.querySelector(
      "[data-lcdp-editeur-contenu]"
    );

    if (
      !moduleEditeur ||
      typeof moduleEditeur.initialiser !== "function" ||
      !racine
    ) {
      throw new Error("Objet éditeur de contenu indisponible.");
    }

    controleurEditeur = moduleEditeur.initialiser({
      root: racine,
      blocs: data?.brouillon?.blocs,
      onChange: signalerModificationLocale
    });

    slot.hidden = false;
  }

  function signalerModificationLocale() {
    modificationsLocales = true;
    afficherStatus(
      "Modifications non enregistrées.",
      "dirty"
    );
  }

  function lireDocumentLocal() {
    if (!controleurEditeur) {
      throw new Error("Éditeur non initialisé.");
    }

    if (!controleurEditeur.valider()) {
      throw new Error(
        "Complète le titre et le contenu de chaque section."
      );
    }

    return {
      titre: "CGV",
      blocs: controleurEditeur.lire()
    };
  }

  function afficherStatus(message, etat = "") {
    const status = document.querySelector(
      "[data-lcdp-mentions-status]"
    );

    if (!status) return;

    status.textContent = message || "";
    status.dataset.state = etat;
  }

  function actualiserMeta() {
    const meta = document.querySelector(
      "[data-lcdp-mentions-meta]"
    );

    if (!meta || !documentCharge) return;

    const morceaux = [];

    if (documentCharge.datemaj) {
      morceaux.push(
        "Brouillon enregistré : " +
        formaterDateHeure(documentCharge.datemaj)
      );
    }

    if (documentCharge.datepublication) {
      morceaux.push(
        "Dernière publication : " +
        formaterDateHeure(documentCharge.datepublication)
      );
    } else {
      morceaux.push("Aucune publication enregistrée");
    }

    meta.textContent = morceaux.join(" — ");
  }

  function verrouillerActions(verrouiller) {
    requeteEnCours = verrouiller === true;

    document
      .querySelectorAll(
        "[data-lcdp-mentions-actions] button"
      )
      .forEach((bouton) => {
        bouton.disabled = requeteEnCours;
      });
  }

  async function enregistrerBrouillon() {
    if (requeteEnCours) return;

    let documentLocal;

    try {
      documentLocal = lireDocumentLocal();
    } catch (error) {
      afficherStatus(
        String(error?.message || error || ""),
        "error"
      );
      return;
    }

    verrouillerActions(true);
    afficherStatus("Enregistrement du brouillon…");

    try {
      const data = await appelerJson(
        "/admin/cgv/brouillon",
        {
          method: "POST",
          body: {
            version: documentCharge.version,
            ...documentLocal
          }
        }
      );

      documentCharge = data;
      modificationsLocales = false;
      actualiserMeta();
      afficherStatus("Brouillon enregistré.");
      await afficherAlerte("Brouillon enregistré.");
    } catch (error) {
      afficherStatus(
        String(error?.message || error || ""),
        "error"
      );
      await afficherAlerte(
        String(error?.message || error || "")
      );
    } finally {
      verrouillerActions(false);
    }
  }

  async function publier() {
    if (requeteEnCours) return;

    let documentLocal;

    try {
      documentLocal = lireDocumentLocal();
    } catch (error) {
      afficherStatus(
        String(error?.message || error || ""),
        "error"
      );
      return;
    }

    const confirme = await demanderConfirmationPublication();

    if (!confirme) return;

    verrouillerActions(true);
    afficherStatus("Publication en cours…");

    try {
      const data = await appelerJson(
        "/admin/cgv/publier",
        {
          method: "POST",
          body: {
            version: documentCharge.version,
            ...documentLocal
          }
        }
      );

      documentCharge = data;
      modificationsLocales = false;
      actualiserMeta();
      afficherStatus("CGV publiées.");
      await afficherAlerte("CGV publiées.");
    } catch (error) {
      afficherStatus(
        String(error?.message || error || ""),
        "error"
      );
      await afficherAlerte(
        String(error?.message || error || "")
      );
    } finally {
      verrouillerActions(false);
    }
  }

  function previsualiser() {
    let documentLocal;

    try {
      documentLocal = lireDocumentLocal();
    } catch (error) {
      afficherStatus(
        String(error?.message || error || ""),
        "error"
      );
      return;
    }

    const preview = document.querySelector(
      "[data-lcdp-mentions-preview]"
    );
    const contenu = document.querySelector(
      "[data-lcdp-mentions-preview-content]"
    );

    contenu.innerHTML = "";

    documentLocal.blocs.forEach((bloc) => {
      const box = document.createElement("section");
      box.className = "lcdp-component lcdp-boxtext";

      const titre = document.createElement("h2");
      titre.className = "lcdp-boxtext__title";
      titre.textContent = bloc.titre;

      const texte = document.createElement("div");
      texte.className = "lcdp-boxtext__content";
      texte.innerHTML = nettoyerHtmlPourApercu(bloc.html);

      box.appendChild(titre);
      box.appendChild(texte);
      contenu.appendChild(box);
    });

    appliquerRoutes(contenu);
    preview.hidden = false;
    preview.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function nettoyerHtmlPourApercu(value) {
    const moduleEditeur = window.LCDP_EDITEUR_CONTENU;

    return typeof moduleEditeur?.nettoyerHtml === "function"
      ? moduleEditeur.nettoyerHtml(value)
      : "";
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      window.alert(message || "");
      return;
    }

    slot.innerHTML = "";
    const fragment = await chargerFragmentObjet(
      "/HTMLBASE/02-alerte.html"
    );

    slot.appendChild(fragment);

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
      window.alert(message || "");
      return;
    }

    texte.textContent = message || "";

    if (fermer) {
      fermer.hidden = true;
    }

    await new Promise((resolve) => {
      ok.addEventListener("click", () => {
        slot.innerHTML = "";
        resolve();
      }, { once: true });
    });
  }

  async function demanderConfirmationPublication() {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      return false;
    }

    slot.innerHTML = "";
    const fragment = await chargerFragmentObjet(
      "/HTMLBASE/02-dialogue-bouton.html"
    );

    slot.appendChild(fragment);

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

    titre.textContent = "Publier les CGV";
    texte.textContent =
      "La version affichée sur le site sera remplacée par le contenu actuel.";

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className =
      "lcdp-button lcdp-button-secondary";
    annuler.textContent = "Annuler";

    const confirmer = document.createElement("button");
    confirmer.type = "button";
    confirmer.className =
      "lcdp-button lcdp-button-orange";
    confirmer.textContent = "Publier";

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

      fermer?.addEventListener("click", () => {
        terminer(false);
      });

      annuler.addEventListener("click", () => {
        terminer(false);
      });

      confirmer.addEventListener("click", () => {
        terminer(true);
      });

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          terminer(false);
        }
      });
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
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
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
      throw new Error("Garde admin centralisé indisponible.");
    }

    return guard.verifierAccesPageAdmin();
  }

  async function initialiserPage() {
    const autorise = await verifierAcces();

    if (!autorise) return;

    // L’échec d’un élément de navigation ne doit pas empêcher l’édition des CGV.
    // En revanche, le document et l’éditeur sont indispensables.
    const data = await chargerDocument();
    documentCharge = data;
    await initialiserEditeur(data);

    const navigations = await Promise.allSettled([
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);
    navigations.forEach((resultat, index) => {
      if (resultat.status === "rejected") {
        console.error(
          index === 0 ? "Bandeau ADMIN indisponible :" : "Menu ADMIN indisponible :",
          resultat.reason
        );
      }
    });

    const loading = document.querySelector(
      "[data-lcdp-mentions-loading]"
    );
    const actions = document.querySelector(
      "[data-lcdp-mentions-actions]"
    );

    loading.hidden = true;
    actions.hidden = false;

    document
      .querySelector("[data-lcdp-mentions-previsualiser]")
      ?.addEventListener("click", previsualiser);

    document
      .querySelector("[data-lcdp-mentions-enregistrer]")
      ?.addEventListener("click", enregistrerBrouillon);

    document
      .querySelector("[data-lcdp-mentions-publier]")
      ?.addEventListener("click", publier);

    actualiserMeta();
    afficherStatus("");
    document.getElementById("lcdp-main-admin").hidden = false;
  }

  window.addEventListener("beforeunload", (event) => {
    if (!modificationsLocales || requeteEnCours) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  initialiserPage().catch(async (error) => {
    console.error("CGV : chargement interrompu :", error);
    const actions = document.querySelector("[data-lcdp-mentions-actions]");
    if (actions) actions.hidden = true;

    const loading = document.querySelector(
      "[data-lcdp-mentions-loading]"
    );

    if (loading) {
      loading.textContent = String(
        error?.message ||
        error ||
        "Impossible d’initialiser l’éditeur."
      );
    }

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }
  });
})();