(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const CHEMIN_ROUTE =
    "/ESPACE-ADMIN/B_ADMIN/faq-admin.html";

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
      ""
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
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
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
    const slot = document.getElementById("lcdp-menu-gauche-admin-slot");
    const fragment = await chargerFragmentAdmin("/ESPACE-ADMIN/A_STRUCTURE/menu-gauche-admin.html");
    slot.replaceChildren(fragment);
    const cible = slot.querySelector("[data-lcdp-menu-gauche-admin-slot]");
    if (!cible) throw new Error("Structure du menu admin incomplète.");
    cible.appendChild(await chargerFragmentObjet("/BOX/02-box-menu-bouton.html"));
    const liste = cible.querySelector("[data-lcdp-menu-bouton-list]");
    if (!liste) throw new Error("Liste des catégories admin introuvable.");
    for (const [categorie, libelle] of [["admin", "Admin"], ["parcs", "Parcs"], ["membres", "Membres"]]) {
      const lien = document.createElement("a");
      lien.className = "lcdp-button lcdp-button-primary";
      lien.textContent = libelle;
      lien.href = urlAdmin("/ESPACE-ADMIN/accueil-admin.html?categorie=" + categorie);
      if (categorie === "admin") lien.setAttribute("aria-current", "page");
      liste.appendChild(lien);
    }
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
    return appelerJson("/admin/faq");
  }

  async function initialiserEditeur(data) {
    const slot = document.querySelector(
      "[data-lcdp-mentions-editeur-slot]"
    );

    if (!slot) {
      throw new Error("Slot de l’éditeur introuvable.");
    }

    slot.innerHTML = "";

    const fragment = await chargerFragmentAdmin(
      "/ESPACE-ADMIN/A_STRUCTURE/box-editeur-contenu.html"
    );

    const editeur = fragment.querySelector("[data-lcdp-editeur-contenu]");
    editeur.querySelector("[data-lcdp-editeur-ajouter]").textContent = "Ajouter une FAQ";
    editeur.querySelector(".lcdp-editeur-contenu__aide").textContent = "Une question par bloc ; sa réponse peut contenir plusieurs paragraphes et des listes.";
    editeur.querySelector("template").content.querySelector(".lcdp-editeur-contenu__label").textContent = "Question";
    slot.appendChild(fragment);

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
      blocs: data?.brouillon?.blocs?.length ? data.brouillon.blocs : [{ id: "question-1", titre: "", html: "<p><br></p>" }],
      onChange: signalerModificationLocale
    });

    racine.querySelector("[data-lcdp-editeur-ajouter]").addEventListener("click", event => {
      event.stopImmediatePropagation();
      controleurEditeur.ajouterBloc({ id: "q-" + crypto.randomUUID(), titre: "", html: "<p><br></p>" });
    }, true);
    installerConfirmationSuppressionFAQ(racine);
    installerLiensFAQ(racine);
    slot.hidden = false;
  }

  function installerConfirmationSuppressionFAQ(racine) {
    const autorises = new WeakSet();
    let confirmationEnCours = false;
    racine.addEventListener("click", async event => {
      const bouton = event.target.closest?.("[data-lcdp-editeur-supprimer]");
      if (!bouton || !racine.contains(bouton) || bouton.disabled) return;
      if (autorises.has(bouton)) { autorises.delete(bouton); return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (confirmationEnCours) return;
      confirmationEnCours = true;
      const bloc = bouton.closest("[data-lcdp-editeur-bloc]");
      const question = bloc?.querySelector("[data-lcdp-editeur-titre]")?.value?.trim();
      try {
        const confirme = await demanderConfirmationPublication({
          titre: "Supprimer cette FAQ ?",
          texte: question ? "Supprimer la FAQ « " + question + " » du brouillon ?" : "Supprimer ce bloc FAQ du brouillon ?",
          annuler: "Non",
          confirmer: "Oui"
        });
        if (confirme && bouton.isConnected && !bouton.disabled) {
          autorises.add(bouton);
          bouton.click();
          autorises.delete(bouton);
        }
      } catch (error) {
        afficherStatus("Confirmation indisponible : aucune FAQ supprimée.", "erreur");
      } finally {
        confirmationEnCours = false;
      }
    }, true);
  }

  function installerLiensFAQ(racine) {
    function ajouterBoutons() {
      racine.querySelectorAll("[data-lcdp-editeur-bloc]").forEach(bloc => {
        if (bloc.querySelector("[data-faq-liens]")) return;
        const zone = document.createElement("div");
        zone.className = "lcdp-faq-admin__liens";
        zone.setAttribute("data-faq-liens", "");
        const statut = document.createElement("span");
        statut.setAttribute("role", "status");
        for (const [label, publicComplet] of [["Copier le lien interne", false], ["Copier le lien public", true]]) {
          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = "lcdp-button lcdp-button-secondary";
          bouton.textContent = label;
          bouton.title = "Le lien ouvre cette FAQ dans sa version publiée.";
          bouton.addEventListener("click", async () => {
            const ancre = window.LCDP_FAQ.ancre({ id: bloc.dataset.lcdpEditeurBlocId });
            const path = "/ESPACE-PUBLIC/FAQ-public.html#" + ancre;
            const config = window.SITE_CONFIG || {};
            const base = String(config.publicBaseUrl || config.PUBLIC_BASE || "https://lacleduparc.fr").replace(/\/+$/, "");
            const lien = publicComplet ? (typeof config.publicUrl === "function" ? config.publicUrl(path) : base + path) : "#" + ancre;
            try {
              if (!navigator.clipboard?.writeText) throw new Error("Copie manuelle");
              await navigator.clipboard.writeText(lien);
              statut.textContent = "Lien copié. À utiliser après publication de la FAQ.";
            } catch {
              window.prompt("Copie ce lien (à utiliser après publication) :", lien);
            }
          });
          zone.appendChild(bouton);
        }
        zone.appendChild(statut);
        bloc.appendChild(zone);
      });
    }
    ajouterBoutons();
    const observateur = new MutationObserver(ajouterBoutons);
    observateur.observe(racine.querySelector("[data-lcdp-editeur-blocs]"), { childList: true });
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
      titre: "FAQ",
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
        "/admin/faq/brouillon",
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
        "/admin/faq/publier",
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
      afficherStatus("FAQ publiées.");
      await afficherAlerte("FAQ publiées.");
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

    window.LCDP_FAQ.afficher(contenu, documentLocal.blocs);

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
      "/BOX/02-box-alerte.html"
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

  async function demanderConfirmationPublication(options = {}) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      return false;
    }

    slot.innerHTML = "";
    const fragment = await chargerFragmentObjet(
      "/BOX/02-box-dialogue-bouton.html"
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

    titre.textContent = options.titre || "Publier les FAQ";
    texte.textContent =
      options.texte || "La version affichée sur le site sera remplacée par le contenu actuel.";

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className =
      "lcdp-button lcdp-button-secondary";
    annuler.textContent = options.annuler || "Annuler";

    const confirmer = document.createElement("button");
    confirmer.type = "button";
    confirmer.className =
      "lcdp-button lcdp-button-orange";
    confirmer.textContent = options.confirmer || "Publier";

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

    const [data] = await Promise.all([
      chargerDocument(),
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);

    documentCharge = data;
    await initialiserEditeur(data);

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
    console.error(error);

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
