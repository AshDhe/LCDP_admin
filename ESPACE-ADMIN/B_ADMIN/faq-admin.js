(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const CHEMIN_ROUTE =
    "/ESPACE-ADMIN/B_ADMIN/faq-admin.html";

  let controleurEditeur = null;
  let documentCharge = null;
  let modificationsLocales = false;
  let requeteEnCours = false;
  let espaceActif = "public";
  let observateurLiensFAQ = null;
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
    if (!modificationsLocales || requeteEnCours || sauvegardeEnCours ||
        conflitVersion || (!force && Date.now() < prochaineTentative)) return;
    return sauvegarderUneFois();
  }
  const ESPACES_FAQ = Object.freeze({
    public: Object.freeze({ route: "/admin/faq", libelle: "FAQ publiques", page: "/ESPACE-PUBLIC/FAQ-public.html" }),
    membre: Object.freeze({ route: "/admin/faq-membre", libelle: "FAQ membres", page: "/ESPACE-MEMBRE/FAQ-membre.html" })
  });

  // FAQ uniquement : espaces insécables avant la ponctuation française.
  // Ne pas ajouter d'espace dans les URL, heures, codes ou autres chaînes compactes.
  function espacesInsecablesFAQ(texte) {
    return String(texte ?? "").replace(/[ \t\u00a0\u202f]+(?=[?!:;])/g,
      espaces => espaces.replace(/[ \t]/g, "\u00a0"));
  }

  // Traiter uniquement le texte affiché, jamais les attributs des liens.
  // Parcourir les segments continus d'un paragraphe, y compris le gras/italique.
  function espacesInsecablesHtmlFAQ(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");
    let noeuds = [];
    function traiterSegment() {
      const texte = noeuds.map(n => n.data).join("");
      const corrige = espacesInsecablesFAQ(texte);
      if (corrige !== texte) {
        let debut = 0;
        for (const n of noeuds) {
          const valeur = corrige.slice(debut, debut + n.data.length);
          debut += n.data.length;
          if (n.data !== valeur) n.data = valeur;
        }
      }
      noeuds = [];
    }
    function visiter(parent) {
      for (const n of parent.childNodes) {
        if (n.nodeType === 3) { noeuds.push(n); continue; }
        if (n.nodeType !== 1) continue;
        const coupure = /^(P|BR|DIV|UL|OL|LI|SECTION|ARTICLE|BLOCKQUOTE|H[1-6])$/.test(n.tagName);
        if (coupure) traiterSegment();
        visiter(n);
        if (coupure) traiterSegment();
      }
    }
    visiter(template.content);
    traiterSegment();
    return template.innerHTML;
  }

  function normaliserBlocsFAQ(blocs) {
    return blocs.map(bloc => ({
      ...bloc,
      titre: espacesInsecablesFAQ(bloc.titre),
      html: espacesInsecablesHtmlFAQ(bloc.html)
    }));
  }

  function installerEspacesInsecablesFAQ(racine) {
    // Même longueur : le curseur et la sélection restent à leur place.
    function normaliserQuestion(event) {
      const champ = event.target;
      if (!champ.matches?.("[data-lcdp-editeur-titre]") || event.isComposing) return;
      const valeur = espacesInsecablesFAQ(champ.value);
      if (valeur === champ.value) return;
      const debut = champ.selectionStart, fin = champ.selectionEnd, sens = champ.selectionDirection;
      champ.value = valeur;
      if (debut !== null && fin !== null) champ.setSelectionRange(debut, fin, sens || "none");
      // L'écouteur partagé reçoit déjà l'événement input après la capture.
      if (event.type !== "input") champ.dispatchEvent(new Event("input", { bubbles: true }));
    }
    racine.addEventListener("input", normaliserQuestion, true);
    racine.addEventListener("compositionend", normaliserQuestion, true);
    racine.addEventListener("focusout", normaliserQuestion, true);
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
    const slot = document.getElementById("lcdp-menu-gauche-admin-slot");
    const fragment = await chargerFragmentAdmin("/ESPACE-ADMIN/A_STRUCTURE/menu-gauche-admin.html");
    slot.replaceChildren(fragment);
    const cible = slot.querySelector("[data-lcdp-menu-gauche-admin-slot]");
    if (!cible) throw new Error("Structure du menu admin incomplète.");
    cible.appendChild(await chargerFragmentObjet("/HTMLBASE/02-menu-bouton.html"));
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
      const erreur = new Error(data?.message || data?.detail || "Réponse du worker editing-admin inexploitable.");
      erreur.status = response.status;
      throw erreur;
    }

    return data;
  }

  async function appelerFaq(espace, suffixe = "", options = {}) {
    if (!Object.prototype.hasOwnProperty.call(ESPACES_FAQ, espace)) throw new Error("Espace FAQ inconnu.");
    const data = await appelerJson(ESPACES_FAQ[espace].route + suffixe, options);
    // Les FAQ membres doivent être un document distinct ; aucun repli vers les FAQ publiques.
    if (espace === "membre" && (data.code !== "faq-membre" || data.espace !== "membre" || !Array.isArray(data.brouillon?.blocs))) {
      throw new Error("Le stockage indépendant des FAQ membres n’est pas confirmé par le Worker. Édition bloquée.");
    }
    return data;
  }

  async function chargerDocument(espace = espaceActif) {
    return appelerFaq(espace);
  }

  async function initialiserEditeur(data, espace = espaceActif) {
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
      "/ESPACE-ADMIN/A_STRUCTURE/box-editeur-contenu.js?v=20261119-faq-autosave"
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
      brouillon: { code: espace === "membre" ? "faq-membre" : "faq", version: data.version, sauvegardeAuto: true },
      onChange: signalerModificationLocale
    });

    racine.querySelector("[data-lcdp-editeur-ajouter]").addEventListener("click", event => {
      event.stopImmediatePropagation();
      controleurEditeur.ajouterBloc({ id: "q-" + crypto.randomUUID(), titre: "", html: "<p><br></p>" });
    }, true);
    installerEspacesInsecablesFAQ(racine);
    installerConfirmationSuppressionFAQ(racine);
    installerLiensFAQ(racine, espace);
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

  function installerLiensFAQ(racine, espace) {
    observateurLiensFAQ?.disconnect();
    function ajouterBoutons() {
      racine.querySelectorAll("[data-lcdp-editeur-bloc]").forEach(bloc => {
        if (bloc.querySelector("[data-faq-liens]")) return;
        const zone = document.createElement("div");
        zone.className = "lcdp-faq-admin__liens";
        zone.setAttribute("data-faq-liens", "");
        const statut = document.createElement("span");
        statut.setAttribute("role", "status");
        for (const [label, lienComplet] of [["Copier le lien interne", false], [espace === "membre" ? "Copier le lien membre" : "Copier le lien public", true]]) {
          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = "lcdp-button lcdp-button-secondary";
          bouton.textContent = label;
          bouton.title = "Le lien ouvre cette FAQ dans sa version publiée.";
          bouton.addEventListener("click", async () => {
            const ancre = window.LCDP_FAQ.ancre({ id: bloc.dataset.lcdpEditeurBlocId });
            const path = ESPACES_FAQ[espace].page + "#" + ancre;
            const base = String(espace === "membre"
              ? (config.membreBaseUrl || config.MEMBRE_BASE || "")
              : (config.publicBaseUrl || config.PUBLIC_BASE || "")).replace(/\/+$/, "");
            const construire = espace === "membre" ? config.membreUrl : config.publicUrl;
            let lien = "#" + ancre;
            if (lienComplet) {
              if (typeof construire === "function") lien = construire.call(config, path);
              else if (base) lien = base + path;
              else { statut.textContent = "Adresse de l’espace non configurée."; return; }
            }
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
    observateurLiensFAQ = new MutationObserver(ajouterBoutons);
    observateurLiensFAQ.observe(racine.querySelector("[data-lcdp-editeur-blocs]"), { childList: true });
  }

  function signalerModificationLocale(sauvegardeLocale) {
    modificationsLocales = true;
    revisionLocale++;
    afficherStatus(
      conflitVersion ? "Conflit de version : rédaction préservée si la copie locale est disponible. Recharge pour récupérer le brouillon." :
      sauvegardeLocale ? "Modifications en cours — sauvegarde automatique…" : "Copie locale indisponible. Sauvegarde en base en attente.",
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
    } else afficherStatus("Sauvegarde automatique active.", "ready");
  }

  function lireDocumentLocal() {
    if (!controleurEditeur || !documentCharge) {
      throw new Error("Éditeur non initialisé.");
    }

    if (!controleurEditeur.valider()) {
      throw new Error(
        "Complète le titre et le contenu de chaque section."
      );
    }

    return {
      titre: espaceActif === "membre" ? "FAQ membres" : "FAQ",
      blocs: normaliserBlocsFAQ(controleurEditeur.lire())
    };
  }

  function afficherStatus(message, etat = "") {
    const status = document.querySelector(
      "[data-lcdp-mentions-status]"
    );

    if (!status) return;
    const suivi = document.querySelector("[data-faq-suivi]");
    const libelle = document.querySelector("[data-faq-suivi-espace]");
    if (libelle && libelle.textContent !== ESPACES_FAQ[espaceActif].libelle) libelle.textContent = ESPACES_FAQ[espaceActif].libelle;
    if (suivi) suivi.hidden = !message;
    if (status.textContent !== (message || "")) status.textContent = message || "";
    if (status.dataset.state !== etat) status.dataset.state = etat;
    if (suivi) suivi.dataset.state = etat;
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
    afficherHeureSauvegarde(documentCharge.datemaj);
  }

  function afficherHeureSauvegarde(value) {
    const cible = document.querySelector("[data-faq-suivi-heure]");
    if (!cible) return;
    const date = value ? new Date(value) : null;
    const texte = date && !Number.isNaN(date.getTime())
      ? "Dernière sauvegarde en base : " + new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris", day: "2-digit", month: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
        }).format(date)
      : "Aucun horaire de sauvegarde confirmé.";
    if (cible.textContent !== texte) cible.textContent = texte;
  }

  function verrouillerActions(verrouiller) {
    requeteEnCours = verrouiller === true;

    document
      .querySelectorAll(
        "[data-lcdp-mentions-actions] button, [data-faq-espace]"
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
    const espace = espaceActif, version = Number(documentCharge.version), revision = revisionLocale;
    const travail = (async () => {
      try {
        const documentLocal = {
          titre: espace === "membre" ? "FAQ membres" : "FAQ",
          blocs: normaliserBlocsFAQ(controleurEditeur.lireBrouillon())
        };
        afficherStatus("Sauvegarde automatique en base…", "dirty");
        const data = await appelerFaq(espace, "/brouillon", {
          method: "POST", body: { version, ...documentLocal }
        });
        if (Number(data.version) !== version + 1 || !Array.isArray(data.brouillon?.blocs) ||
            JSON.stringify(data.brouillon.blocs.map(b => b.id)) !== JSON.stringify(documentLocal.blocs.map(b => b.id))) {
          throw Error("Le Worker ne confirme pas la totalité du brouillon.");
        }
        documentCharge = data;
        modificationsLocales = revisionLocale !== revision;
        const secours = controleurEditeur.confirmerBrouillon(data.version, modificationsLocales);
        prochaineTentative = 0;
        actualiserMeta();
        afficherStatus(modificationsLocales
          ? (secours ? "Sauvegarde effectuée — nouvelles modifications en attente…" : "Sauvegarde effectuée — nouvelles modifications sans secours local.")
          : "Sauvegarde automatique effectuée.", modificationsLocales ? (secours ? "dirty" : "error") : "saved");
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
      const confirme = await demanderConfirmationPublication({
        titre: "Publier les " + ESPACES_FAQ[espaceActif].libelle,
        texte: "Seule la version publiée des " + ESPACES_FAQ[espaceActif].libelle + " est remplacée par le contenu actuel."
      });
      if (!confirme) return;
      afficherStatus("Publication en cours…");
      const data = await appelerFaq(espaceActif, "/publier", {
        method: "POST", body: { version: documentCharge.version, ...documentLocal }
      });
      documentCharge = data;
      controleurEditeur.confirmerBrouillon(data.version);
      modificationsLocales = false;
      actualiserMeta();
      afficherStatus(ESPACES_FAQ[espaceActif].libelle + " publiées.", "saved");
      await afficherAlerte(ESPACES_FAQ[espaceActif].libelle + " publiées.");
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), "error");
      await afficherAlerte(String(error?.message || error || ""));
    } finally { verrouillerActions(false); }
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

  async function demanderConfirmationPublication(options = {}) {
    if (options.confirmer !== 'Oui') {
      const slotChoix = document.getElementById('lcdp-lightbox-slot');
      if (!slotChoix) return false;
      const hrefCss = typeof window.LCDP_urlObjet === 'function'
        ? window.LCDP_urlObjet('/CSSBASE/lcdp-lightbox-convergence.css')
        : null;
      if (!hrefCss) return false;
      if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href === hrefCss)) {
        await new Promise((resolve, reject) => {
          const lien = document.createElement('link');
          lien.rel = 'stylesheet';
          lien.href = hrefCss;
          lien.onload = resolve;
          lien.onerror = () => { lien.remove(); reject(new Error('CSS CHOIX indisponible.')); };
          document.head.appendChild(lien);
        });
      }
      slotChoix.replaceChildren();
      try {
        slotChoix.appendChild(await chargerFragmentObjet('/HTMLBASE/02-dialogue-reference-choix.html'));
        const dialogue = slotChoix.querySelector('[data-lcdp-dialogue-reference="choix"]');
        const heading = slotChoix.querySelector('[data-lcdp-dialogue-titre]');
        const texte = slotChoix.querySelector('[data-lcdp-dialogue-message]');
        const non = slotChoix.querySelector('[data-lcdp-dialogue-action="annuler"]');
        const oui = slotChoix.querySelector('[data-lcdp-dialogue-action="confirmer"]');
        if (!dialogue || !heading || !texte || !non || !oui) throw new Error('Structure CHOIX incomplète.');
        heading.textContent = options.titre || 'Publier les FAQ';
        texte.textContent = options.texte || 'La version affichée sur le site sera remplacée par le contenu actuel.';
        non.textContent = options.annuler || 'Annuler';
        oui.textContent = options.confirmer || 'Publier';
        return await new Promise(resolve => {
          let termine = false;
          function fermer(valeur) {
            if (termine) return;
            termine = true;
            document.removeEventListener('keydown', onEscape);
            slotChoix.replaceChildren();
            resolve(valeur);
          }
          function onEscape(e) { if(e.key === 'Escape') {e.preventDefault(); fermer(false);} }
          document.addEventListener('keydown', onEscape);
          non.addEventListener('click', () => fermer(false), {once:true});
          oui.addEventListener('click', () => fermer(true), {once:true});
          dialogue.addEventListener('click', e => {if(e.target===dialogue)fermer(false);});
          non.focus();
        });
      } catch (error) {
        slotChoix.replaceChildren();
        throw error;
      }
    }

    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;
    const focusInitial = document.activeElement;
    try {
      const hrefCss = typeof window.LCDP_urlObjet === "function"
        ? window.LCDP_urlObjet("/CSSBASE/lcdp-lightbox-convergence.css")
        : null;
      if (!hrefCss) return false;
      if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href === new URL(hrefCss, document.baseURI).href)) {
        await new Promise((resolve, reject) => {
          const lien = document.createElement("link");
          lien.rel = "stylesheet";
          lien.href = hrefCss;
          lien.onload = resolve;
          lien.onerror = () => { lien.remove(); reject(new Error("CSS SUPPRESSION indisponible.")); };
          document.head.appendChild(lien);
        });
      }
      slot.replaceChildren();
      slot.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-suppression.html"));
      const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="suppression"]');
      const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
      const texte = slot.querySelector("[data-lcdp-dialogue-message]");
      const non = slot.querySelector('[data-lcdp-dialogue-action="conserver"]');
      const oui = slot.querySelector('[data-lcdp-dialogue-action="supprimer"]');
      if (!dialogue || !titre || !texte || !non || !oui) throw new Error("Structure SUPPRESSION incomplète.");
      titre.textContent = options.titre || "Supprimer cette FAQ ?";
      texte.textContent = options.texte || "Supprimer ce bloc FAQ du brouillon ?";
      non.textContent = options.annuler || "Non";
      oui.textContent = options.confirmer || "Oui";
      non.focus();
      return await new Promise(resolve => {
        let termine = false;
        function fermer(valeur) {
          if (termine) return;
          termine = true;
          document.removeEventListener("keydown", onClavier);
          slot.replaceChildren();
          if (focusInitial?.isConnected && typeof focusInitial.focus === "function") focusInitial.focus();
          resolve(valeur);
        }
        function onClavier(event) {
          if (event.key === "Escape") { event.preventDefault(); fermer(false); }
          if (event.key === "Tab") {
            const cible = event.shiftKey ? non : oui;
            if (document.activeElement === cible) {
              event.preventDefault();
              (event.shiftKey ? oui : non).focus();
            }
          }
        }
        document.addEventListener("keydown", onClavier);
        non.addEventListener("click", () => fermer(false), { once: true });
        oui.addEventListener("click", () => fermer(true), { once: true });
        dialogue.addEventListener("click", event => { if (event.target === dialogue) fermer(false); });
      });
    } catch (error) {
      slot.replaceChildren();
      if (focusInitial?.isConnected && typeof focusInitial.focus === "function") focusInitial.focus();
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

  function actualiserOnglets() {
    for (const bouton of document.querySelectorAll("[data-faq-espace]")) {
      bouton.setAttribute("aria-pressed", String(bouton.dataset.faqEspace === espaceActif));
    }
    const explication = document.querySelector("[data-faq-explication]");
    explication.textContent = "Chaque bloc correspond à une question et à sa réponse. Le brouillon des " +
      ESPACES_FAQ[espaceActif].libelle + " est enregistré automatiquement. La publication reste manuelle.";
  }

  async function afficherEspace(espace) {
    const loading = document.querySelector("[data-lcdp-mentions-loading]");
    const actions = document.querySelectorAll("[data-lcdp-mentions-actions]");
    const slot = document.querySelector("[data-lcdp-mentions-editeur-slot]");
    observateurLiensFAQ?.disconnect();
    observateurLiensFAQ = null;
    espaceActif = espace;
    documentCharge = null;
    controleurEditeur = null;
    modificationsLocales = false;
    revisionLocale = 0;
    conflitVersion = false;
    prochaineTentative = 0;
    annulerMinuteur();
    actualiserOnglets();
    document.querySelector("[data-lcdp-mentions-meta]").textContent = "";
    afficherHeureSauvegarde(null);
    afficherStatus("");
    actions.forEach(action => { action.hidden = true; });
    slot.hidden = true;
    slot.replaceChildren();
    loading.textContent = "Chargement des " + ESPACES_FAQ[espace].libelle + "…";
    loading.hidden = false;
    try {
      const data = await chargerDocument(espace);
      await initialiserEditeur(data, espace);
      documentCharge = data;
      modificationsLocales = false;
      loading.hidden = true;
      actions.forEach(action => { action.hidden = false; });
      actualiserMeta();
      afficherEtatBrouillonLocal();
    } catch (error) {
      controleurEditeur = null;
      documentCharge = null;
      slot.hidden = true;
      slot.replaceChildren();
      actions.forEach(action => { action.hidden = true; });
      loading.textContent = espace === "membre"
        ? "FAQ membres indisponibles. Le stockage indépendant doit être confirmé par le Worker. " + String(error?.message || error)
        : String(error?.message || error);
      afficherStatus("Sauvegarde automatique indisponible : " + String(error?.message || error), "error");
      console.error(error);
    }
  }

  async function choisirEspace(espace) {
    if (requeteEnCours || !Object.prototype.hasOwnProperty.call(ESPACES_FAQ, espace) ||
        (espace === espaceActif && documentCharge) ||
        document.getElementById("lcdp-lightbox-slot")?.childElementCount) return;
    verrouillerActions(true);
    try {
      if (!await synchroniserBrouillon()) return;
      await afficherEspace(espace);
    } catch (error) {
      afficherStatus(String(error?.message || error), "error");
    } finally {
      verrouillerActions(false);
    }
  }

  async function initialiserPage() {
    const autorise = await verifierAcces();

    if (!autorise) return;

    await Promise.all([
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);

    for (const bouton of document.querySelectorAll("[data-faq-espace]")) {
      bouton.addEventListener("click", () => choisirEspace(bouton.dataset.faqEspace));
    }

    document.querySelectorAll("[data-lcdp-mentions-publier]").forEach(bouton => bouton.addEventListener("click", publier));

    setInterval(() => { void tenterSauvegardeAuto(); }, INTERVALLE_AUTO);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && modificationsLocales) {
        controleurEditeur?.sauvegarderBrouillon();
        void tenterSauvegardeAuto(true);
      }
    });
    window.addEventListener("online", () => { prochaineTentative = 0; void tenterSauvegardeAuto(true); });
    window.addEventListener("pagehide", () => {
      if (modificationsLocales) controleurEditeur?.sauvegarderBrouillon();
    });
    // Navigation dans l'administration : attendre la confirmation de la base.
    document.addEventListener("click", async event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const lien = event.target.closest?.("a[href]");
      if (!lien || (lien.target && lien.target !== "_self") || lien.hasAttribute("download")) return;
      if (lien.closest("[data-lcdp-mentions-editeur-slot]")) return;
      let url;
      try { url = new URL(lien.href, window.location.href); } catch (_) { return; }
      if (!["http:", "https:"].includes(url.protocol) ||
          (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash)) return;
      if (!modificationsLocales && !sauvegardeEnCours && !requeteEnCours) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (requeteEnCours) return;
      verrouillerActions(true);
      try {
        if (await synchroniserBrouillon()) window.location.assign(url.href);
      } catch (error) {
        afficherStatus(String(error?.message || error), "error");
      } finally { verrouillerActions(false); }
    }, true);

    document.getElementById("lcdp-main-admin").hidden = false;
    verrouillerActions(true);
    try { await afficherEspace("public"); }
    finally { verrouillerActions(false); }
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
