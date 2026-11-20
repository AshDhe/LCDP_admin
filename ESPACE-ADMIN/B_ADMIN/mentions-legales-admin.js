(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const CHEMIN_ROUTE =
    "/ESPACE-ADMIN/B_ADMIN/mentions-legales-admin.html";

  let controleurEditeur = null;
  let documentCharge = null;
  let modificationsLocales = false;
  let requeteEnCours = false;
  const DELAI_AUTO = 900, INTERVALLE_AUTO = 4000;
  let revisionLocale = 0, sauvegardeEnCours = null, minuteurAuto = null;
  let conflitVersion = false, prochaineTentative = 0;

  function annulerMinuteur() {
    if (minuteurAuto !== null) { clearTimeout(minuteurAuto); minuteurAuto = null; }
  }
  function planifierSauvegarde() {
    annulerMinuteur();
    if (!modificationsLocales || conflitVersion) return;
    minuteurAuto = setTimeout(() => { minuteurAuto = null; void tenterSauvegardeAuto(); }, DELAI_AUTO);
  }
  function tenterSauvegardeAuto(force = false) {
    if (!modificationsLocales || requeteEnCours || sauvegardeEnCours || conflitVersion ||
        (!force && Date.now() < prochaineTentative)) return;
    return sauvegarderUneFois();
  }


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
      if (!modificationsLocales && !sauvegardeEnCours) redirigerConnexion();
      const erreur = new Error("Session administrateur expirée.");
      erreur.status = 401;
      throw erreur;
    }

    if (response.status === 403) {
      throw new Error(
        data?.message ||
        "Permission administrateur insuffisante."
      );
    }

    if (!response.ok || !data || data.success !== true) {
      const erreur = new Error(
        data?.message ||
        data?.detail ||
        "Réponse du worker editing-admin inexploitable."
      );
      erreur.status = response.status;
      throw erreur;
    }

    return data;
  }

  async function chargerDocument() {
    return appelerJson("/admin/mentions-legales");
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

    slot.appendChild(fragment);

    await chargerScriptAdminUneFois(
      "/ESPACE-ADMIN/A_STRUCTURE/box-editeur-contenu.js?v=20261119-editeur-listes"
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
      brouillon: { code: "mentions-legales", version: data.version, sauvegardeAuto: true },
      onChange: signalerModificationLocale
    });

    slot.hidden = false;
  }

  function signalerModificationLocale(sauvegardeLocale) {
    modificationsLocales = true;
    revisionLocale++;
    afficherStatus(
      conflitVersion ? "Conflit de version : la copie locale reste conservée, recharge la page pour réconcilier les versions."
        : sauvegardeLocale ? "Modifications en cours — sauvegarde automatique…"
          : "Copie locale indisponible. Sauvegarde en base en attente.",
      conflitVersion || !sauvegardeLocale ? "error" : "dirty"
    );
    planifierSauvegarde();
  }

  function afficherEtatBrouillonLocal() {
    if (controleurEditeur?.brouillonRestaure) {
      signalerModificationLocale(controleurEditeur.sauvegarderBrouillon());
      afficherStatus("Brouillon local restauré — sauvegarde automatique en attente.", "dirty");
    } else if (!controleurEditeur?.protectionDisponible()) {
      afficherStatus("Stockage de secours local indisponible.", "error");
    } else {
      afficherStatus("Sauvegarde automatique active.", "ready");
    }
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
      titre: "Mentions légales",
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
    const editeur = document.querySelector("[data-lcdp-mentions-editeur-slot]");
    if (editeur) editeur.inert = requeteEnCours;
  }

  function sauvegarderUneFois() {
    if (sauvegardeEnCours) return sauvegardeEnCours;
    if (!modificationsLocales) return Promise.resolve(true);
    if (conflitVersion || !documentCharge || !controleurEditeur) return Promise.resolve(false);
    annulerMinuteur();
    const version = Number(documentCharge.version), revision = revisionLocale;
    const travail = (async () => {
      try {
        if (!Number.isFinite(version)) throw new Error("Version du brouillon inconnue.");
        const blocs = controleurEditeur.lireBrouillon();
        afficherStatus("Sauvegarde automatique en base…", "dirty");
        const data = await appelerJson("/admin/mentions-legales/brouillon", {
          method: "POST", body: { version, titre: "Mentions légales", blocs }
        });
        if (Number(data.version) !== version + 1 || !Array.isArray(data.brouillon?.blocs) ||
            JSON.stringify(data.brouillon.blocs.map(b => b.id)) !== JSON.stringify(blocs.map(b => b.id))) {
          throw new Error("Le Worker ne confirme pas la totalité du brouillon.");
        }
        documentCharge = data;
        modificationsLocales = revisionLocale !== revision;
        const secours = controleurEditeur.confirmerBrouillon(data.version, modificationsLocales);
        prochaineTentative = 0;
        actualiserMeta();
        afficherStatus(modificationsLocales
          ? secours ? "Sauvegarde effectuée — nouvelles modifications en attente…" : "Sauvegarde effectuée — copie locale indisponible."
          : "Sauvegarde automatique effectuée.", modificationsLocales ? secours ? "dirty" : "error" : "saved");
        return true;
      } catch (error) {
        conflitVersion = error?.status === 409;
        prochaineTentative = Date.now() + 5000;
        const secours = controleurEditeur?.sauvegarderBrouillon();
        afficherStatus("Sauvegarde en base non confirmée : " + String(error?.message || error) +
          (secours ? " Copie locale conservée." : " ATTENTION : copie locale indisponible."), "error");
        return false;
      }
    })();
    sauvegardeEnCours = travail.finally(() => {
      sauvegardeEnCours = null;
      if (modificationsLocales && !conflitVersion) planifierSauvegarde();
    });
    return sauvegardeEnCours;
  }

  async function synchroniserBrouillon() {
    annulerMinuteur();
    if (sauvegardeEnCours && !await sauvegardeEnCours) return false;
    while (modificationsLocales) {
      if (!await sauvegarderUneFois()) return false;
    }
    return true;
  }

  async function publier() {
    if (requeteEnCours || !documentCharge) return;
    verrouillerActions(true);
    try {
      if (!await synchroniserBrouillon()) return;
      const documentLocal = lireDocumentLocal();
      const confirme = await demanderConfirmationPublication();
      if (!confirme) return;
      afficherStatus("Publication en cours…");
      const data = await appelerJson("/admin/mentions-legales/publier", {
        method: "POST", body: { version: documentCharge.version, ...documentLocal }
      });
      documentCharge = data;
      controleurEditeur.confirmerBrouillon(data.version);
      modificationsLocales = false;
      actualiserMeta();
      afficherStatus("Mentions légales" + " publié.", "saved");
      await afficherAlerte("Mentions légales" + " publié.");
    } catch (error) {
      afficherStatus(String(error?.message || error), "error");
      await afficherAlerte(String(error?.message || error));
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
    const slotChoix = document.getElementById('lcdp-lightbox-slot');
    if (!slotChoix) return false;
    const hrefCss = typeof window.LCDP_urlObjet === 'function'
      ? window.LCDP_urlObjet('/CSSBASE/lcdp-lightbox-convergence.css')
      : null;
    if (!hrefCss) return false;
    if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href === hrefCss)) {
      await new Promise((resolve, reject) => {
        const feuille = document.createElement('link');
        feuille.rel = 'stylesheet';
        feuille.href = hrefCss;
        feuille.onload = resolve;
        feuille.onerror = () => { feuille.remove(); reject(new Error('CSS CHOIX indisponible.')); };
        document.head.appendChild(feuille);
      });
    }
    slotChoix.replaceChildren();
    try {
      slotChoix.appendChild(await chargerFragmentObjet('/HTMLBASE/02-dialogue-reference-choix.html'));
      const dialogue = slotChoix.querySelector('[data-lcdp-dialogue-reference="choix"]');
      const titre = slotChoix.querySelector('[data-lcdp-dialogue-titre]');
      const texte = slotChoix.querySelector('[data-lcdp-dialogue-message]');
      const annuler = slotChoix.querySelector('[data-lcdp-dialogue-action="annuler"]');
      const confirmer = slotChoix.querySelector('[data-lcdp-dialogue-action="confirmer"]');
      if (!dialogue || !titre || !texte || !annuler || !confirmer) throw new Error('Structure CHOIX incomplète.');
      titre.textContent = "Publier les mentions légales";
      texte.textContent = 'La version affichée sur le site sera remplacée par le contenu actuel.';
      annuler.textContent = 'Annuler';
      confirmer.textContent = 'Publier';
      return await new Promise(resolve => {
        let resolu = false;
        const terminer = valeur => {
          if (resolu) return;
          resolu = true;
          document.removeEventListener('keydown', gererClavier);
          slotChoix.replaceChildren();
          resolve(valeur);
        };
        const gererClavier = event => {
          if (event.key === 'Escape') { event.preventDefault(); terminer(false); }
        };
        document.addEventListener('keydown', gererClavier);
        annuler.addEventListener('click', () => terminer(false), {once:true});
        confirmer.addEventListener('click', () => terminer(true), {once:true});
        dialogue.addEventListener('click', e => { if (e.target === dialogue) terminer(false); });
        annuler.focus();
      });
    } catch (error) {
      slotChoix.replaceChildren();
      throw error;
    }

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

  function installerSauvegardeAuto() {
    setInterval(() => { void tenterSauvegardeAuto(); }, INTERVALLE_AUTO);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && modificationsLocales) {
        controleurEditeur?.sauvegarderBrouillon();
        void tenterSauvegardeAuto(true);
      }
    });
    window.addEventListener("online", () => {
      prochaineTentative = 0;
      void tenterSauvegardeAuto(true);
    });
    window.addEventListener("pagehide", () => {
      if (modificationsLocales) controleurEditeur?.sauvegarderBrouillon();
    });
    document.addEventListener("click", async event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
          event.metaKey || event.shiftKey || event.altKey) return;
      const lien = event.target.closest?.("a[href]");
      if (!lien || (lien.target && lien.target !== "_self") || lien.hasAttribute("download")) return;
      if (lien.closest("[data-lcdp-mentions-editeur-slot], [data-lcdp-reglement-club-editeur-slot], [data-lcdp-reglement-app-editeur-slot]")) return;
      let url;
      try { url = new URL(lien.href, window.location.href); } catch (_) { return; }
      if (!["http:", "https:"].includes(url.protocol) ||
          (url.origin === location.origin && url.pathname === location.pathname &&
           url.search === location.search && url.hash)) return;
      if (!modificationsLocales && !sauvegardeEnCours && !requeteEnCours) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (requeteEnCours) return;
      verrouillerActions(true);
      try {
        if (await synchroniserBrouillon()) window.location.assign(url.href);
      } catch (error) {
        afficherStatus(String(error?.message || error), "error");
      } finally {
        verrouillerActions(false);
      }
    }, true);
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
      .querySelector("[data-lcdp-mentions-publier]")
      ?.addEventListener("click", publier);

    actualiserMeta();
    afficherEtatBrouillonLocal();
    installerSauvegardeAuto();
    document.getElementById("lcdp-main-admin").hidden = false;
  }

  window.addEventListener("beforeunload", (event) => {
    if (!modificationsLocales && !sauvegardeEnCours) return;
    if (modificationsLocales) controleurEditeur?.sauvegarderBrouillon();
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
