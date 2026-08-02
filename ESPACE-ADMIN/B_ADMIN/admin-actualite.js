(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const CHEMIN_ROUTE =
    "/ESPACE-ADMIN/B_ADMIN/admin-actualite.html";

  const TYPES_IMAGES_ACCEPTES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif"
  ]);

  const EXTENSIONS_IMAGES_ACCEPTEES = new Set([
    "jpg",
    "jpeg",
    "png",
    "webp",
    "avif",
    "gif"
  ]);

  const MAX_FICHIERS = 6;
  const MAX_OCTETS_PAR_FICHIER = 15 * 1024 * 1024;
  const MAX_OCTETS_TOTAL = 60 * 1024 * 1024;

  let documentCharge = null;
  let slidesLocales = [];
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

  function urlImage(path) {
    const valeur = String(path || "");

    if (
      valeur.startsWith("http://") ||
      valeur.startsWith("https://") ||
      valeur.startsWith("data:")
    ) {
      return valeur;
    }

    const cheminObjet = valeur
      .replace(/^\/?OBJET\/?/, "/");

    return urlObjet(cheminObjet);
  }

  function urlArticle(path) {
    const valeur = String(path || "").trim();

    if (
      valeur.startsWith("http://") ||
      valeur.startsWith("https://")
    ) {
      return valeur;
    }

    return urlPublic(valeur);
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

  async function appelerUpload(fichiers) {
    const endpoint = endpointEditingAdmin();

    if (!endpoint) {
      throw new Error(
        "Endpoint editing-admin-api non configuré."
      );
    }

    const formData = new FormData();

    fichiers.forEach((fichier) => {
      formData.append("images", fichier, fichier.name);
    });

    let response;

    try {
      response = await fetch(endpoint + "/admin/actualite/upload", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        },
        body: formData
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

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "L’ajout des images a échoué."
      );
    }

    return data;
  }

  function normaliserSlideClient(slide, index) {
    const articleUrl = String(slide?.articleUrl || "").trim();

    return {
      id: String(
        slide?.id ||
        "actualite-" + String(index + 1)
      ),
      image: String(slide?.image || "").trim(),
      alt: String(
        slide?.alt || "Actualité La Clé du Parc"
      ).trim(),
      active: slide?.active !== false,
      enSavoirPlusActive:
        slide?.enSavoirPlusActive === true,
      articleUrl
    };
  }

  function chargerDocumentLocal(data) {
    const brouillon = data?.brouillon || {};
    const optionAccueil = document.querySelector(
      "[data-lcdp-actualite-affiche-accueil]"
    );

    slidesLocales = Array.isArray(brouillon.slides)
      ? brouillon.slides.map(normaliserSlideClient)
      : [];

    if (optionAccueil) {
      optionAccueil.checked =
        brouillon.afficheAccueilActive === true;
    }

    rendreSlides();
  }

  function rendreSlides() {
    const liste = document.querySelector(
      "[data-lcdp-actualite-liste]"
    );
    const template = document.querySelector(
      "[data-lcdp-actualite-slide-template]"
    );
    const vide = document.querySelector(
      "[data-lcdp-actualite-vide]"
    );

    if (!liste || !template || !vide) {
      throw new Error("Structure de la liste Actualité incomplète.");
    }

    liste.innerHTML = "";
    vide.hidden = slidesLocales.length !== 0;

    slidesLocales.forEach((slide, index) => {
      const fragment = template.content.cloneNode(true);
      const carte = fragment.querySelector(
        "[data-lcdp-actualite-slide]"
      );
      const image = fragment.querySelector(
        "[data-lcdp-actualite-image]"
      );
      const chemin = fragment.querySelector(
        "[data-lcdp-actualite-chemin]"
      );
      const alt = fragment.querySelector(
        "[data-lcdp-actualite-alt]"
      );
      const active = fragment.querySelector(
        "[data-lcdp-actualite-active]"
      );
      const enSavoirPlus = fragment.querySelector(
        "[data-lcdp-actualite-en-savoir-plus]"
      );
      const articleUrl = fragment.querySelector(
        "[data-lcdp-actualite-article-url]"
      );
      const monter = fragment.querySelector(
        "[data-lcdp-actualite-monter]"
      );
      const descendre = fragment.querySelector(
        "[data-lcdp-actualite-descendre]"
      );
      const retirer = fragment.querySelector(
        "[data-lcdp-actualite-retirer]"
      );

      if (
        !carte ||
        !image ||
        !chemin ||
        !alt ||
        !active ||
        !enSavoirPlus ||
        !articleUrl ||
        !monter ||
        !descendre ||
        !retirer
      ) {
        throw new Error("Modèle d’image Actualité incomplet.");
      }

      carte.dataset.lcdpActualiteSlideId = slide.id;
      image.src = urlImage(slide.image);
      image.alt = slide.alt;
      chemin.textContent = slide.image;
      alt.value = slide.alt;
      active.checked = slide.active;
      enSavoirPlus.checked = slide.enSavoirPlusActive;
      articleUrl.value = slide.articleUrl;
      articleUrl.disabled = !slide.enSavoirPlusActive;

      monter.disabled = index === 0;
      descendre.disabled = index === slidesLocales.length - 1;

      alt.addEventListener("input", () => {
        slide.alt = alt.value;
        image.alt = alt.value;
        signalerModificationLocale();
      });

      active.addEventListener("change", () => {
        slide.active = active.checked;
        signalerModificationLocale();
      });

      enSavoirPlus.addEventListener("change", () => {
        slide.enSavoirPlusActive = enSavoirPlus.checked;
        articleUrl.disabled = !enSavoirPlus.checked;

        if (enSavoirPlus.checked) {
          articleUrl.focus();
        }

        signalerModificationLocale();
      });

      articleUrl.addEventListener("input", () => {
        slide.articleUrl = articleUrl.value;
        signalerModificationLocale();
      });

      monter.addEventListener("click", () => {
        if (index <= 0) return;

        const precedent = slidesLocales[index - 1];
        slidesLocales[index - 1] = slidesLocales[index];
        slidesLocales[index] = precedent;
        rendreSlides();
        signalerModificationLocale();
      });

      descendre.addEventListener("click", () => {
        if (index >= slidesLocales.length - 1) return;

        const suivant = slidesLocales[index + 1];
        slidesLocales[index + 1] = slidesLocales[index];
        slidesLocales[index] = suivant;
        rendreSlides();
        signalerModificationLocale();
      });

      retirer.addEventListener("click", async () => {
        const confirme = await demanderConfirmationRetrait();

        if (!confirme) return;

        slidesLocales.splice(index, 1);
        rendreSlides();
        signalerModificationLocale();
      });

      liste.appendChild(fragment);
    });
  }

  function signalerModificationLocale() {
    modificationsLocales = true;
    afficherStatus(
      "Modifications non enregistrées.",
      "dirty"
    );
  }

  function lireConfigurationLocale() {
    const optionAccueil = document.querySelector(
      "[data-lcdp-actualite-affiche-accueil]"
    );

    const slides = slidesLocales.map((slide, index) => ({
      id: String(slide.id || "actualite-" + String(index + 1)),
      image: String(slide.image || "").trim(),
      alt: String(slide.alt || "").trim(),
      ordre: index + 1,
      active: slide.active === true,
      enSavoirPlusActive:
        slide.enSavoirPlusActive === true,
      articleUrl: String(slide.articleUrl || "").trim()
    }));

    return {
      titre: "Actualité",
      afficheAccueilActive:
        optionAccueil?.checked === true,
      slides
    };
  }

  function validerConfigurationLocale(configuration) {
    if (!Array.isArray(configuration.slides)) {
      throw new Error("Configuration du carrousel invalide.");
    }

    if (configuration.slides.length > 40) {
      throw new Error(
        "Le carrousel ne peut pas contenir plus de 40 images."
      );
    }

    configuration.slides.forEach((slide, index) => {
      if (!slide.image) {
        throw new Error(
          "L’image " + String(index + 1) + " est invalide."
        );
      }

      if (!slide.alt) {
        throw new Error(
          "Le texte alternatif de l’image " +
          String(index + 1) +
          " est obligatoire."
        );
      }

      if (
        slide.enSavoirPlusActive &&
        !urlArticleValide(slide.articleUrl)
      ) {
        throw new Error(
          "L’adresse Article de l’image " +
          String(index + 1) +
          " est obligatoire et doit être une adresse interne ou HTTPS valide."
        );
      }
    });

    if (
      configuration.afficheAccueilActive &&
      !configuration.slides.some((slide) => slide.active)
    ) {
      throw new Error(
        "Active au moins une image avant d’afficher le carrousel sur la page d’accueil."
      );
    }

    return configuration;
  }

  function urlArticleValide(value) {
    const url = String(value || "").trim();

    if (!url || url.startsWith("//")) {
      return false;
    }

    const compact = url
      .replace(/[\u0000-\u0020\u007f]+/g, "")
      .toLowerCase();

    return (
      compact.startsWith("https://") ||
      compact.startsWith("/espace-public/") ||
      compact.startsWith("./") ||
      compact.startsWith("../")
    );
  }

  function afficherStatus(message, etat = "") {
    const status = document.querySelector(
      "[data-lcdp-actualite-status]"
    );

    if (!status) return;

    status.textContent = message || "";
    status.dataset.state = etat;
  }

  function actualiserMeta() {
    const meta = document.querySelector(
      "[data-lcdp-actualite-meta]"
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
        "[data-lcdp-actualite-upload], " +
        "[data-lcdp-actualite-previsualiser], " +
        "[data-lcdp-actualite-enregistrer], " +
        "[data-lcdp-actualite-publier]"
      )
      .forEach((bouton) => {
        bouton.disabled = requeteEnCours;
      });

    const inputFichiers = document.querySelector(
      "[data-lcdp-actualite-images]"
    );

    if (inputFichiers) {
      inputFichiers.disabled = requeteEnCours;
    }
  }

  async function enregistrerBrouillon() {
    if (requeteEnCours) return;

    let configuration;

    try {
      configuration = validerConfigurationLocale(
        lireConfigurationLocale()
      );
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
        "/admin/actualite/brouillon",
        {
          method: "POST",
          body: {
            version: documentCharge.version,
            ...configuration
          }
        }
      );

      documentCharge = data;
      slidesLocales = data.brouillon.slides.map(
        normaliserSlideClient
      );
      modificationsLocales = false;
      rendreSlides();
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

    let configuration;

    try {
      configuration = validerConfigurationLocale(
        lireConfigurationLocale()
      );
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
        "/admin/actualite/publier",
        {
          method: "POST",
          body: {
            version: documentCharge.version,
            ...configuration
          }
        }
      );

      documentCharge = data;
      slidesLocales = data.brouillon.slides.map(
        normaliserSlideClient
      );
      modificationsLocales = false;
      rendreSlides();
      actualiserMeta();
      afficherStatus("Actualité publiée.");
      await afficherAlerte("Actualité publiée.");
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

  function validerFichiersSelectionnes() {
    const input = document.querySelector(
      "[data-lcdp-actualite-images]"
    );
    const fichiers = Array.from(input?.files || []);

    if (fichiers.length < 1 || fichiers.length > MAX_FICHIERS) {
      throw new Error(
        "Sélectionne entre 1 et 6 images."
      );
    }

    let total = 0;

    fichiers.forEach((fichier) => {
      const taille = Number(fichier.size || 0);
      const type = String(fichier.type || "")
        .trim()
        .toLowerCase();
      const extension = String(fichier.name || "")
        .split(".")
        .pop()
        .toLowerCase();

      if (!taille) {
        throw new Error(
          "Image vide : " + fichier.name + "."
        );
      }

      if (taille > MAX_OCTETS_PAR_FICHIER) {
        throw new Error(
          "Image trop lourde : " +
          fichier.name +
          ". Maximum : 15 Mo."
        );
      }

      if (
        !EXTENSIONS_IMAGES_ACCEPTEES.has(extension) ||
        (type && !TYPES_IMAGES_ACCEPTES.has(type))
      ) {
        throw new Error(
          "Format non accepté : " + fichier.name + "."
        );
      }

      total += taille;
    });

    if (total > MAX_OCTETS_TOTAL) {
      throw new Error(
        "Le poids total des images dépasse 60 Mo."
      );
    }

    return fichiers;
  }

  async function ajouterImages() {
    if (requeteEnCours) return;

    let fichiers;

    try {
      fichiers = validerFichiersSelectionnes();
    } catch (error) {
      afficherStatus(
        String(error?.message || error || ""),
        "error"
      );
      return;
    }

    verrouillerActions(true);
    afficherStatus("Ajout des images en cours…");

    try {
      const data = await appelerUpload(fichiers);
      const nouvellesSlides = Array.isArray(data.slides)
        ? data.slides.map(normaliserSlideClient)
        : [];

      slidesLocales.push(...nouvellesSlides);
      rendreSlides();
      signalerModificationLocale();

      const input = document.querySelector(
        "[data-lcdp-actualite-images]"
      );
      const selection = document.querySelector(
        "[data-lcdp-actualite-selection]"
      );

      if (input) input.value = "";
      if (selection) selection.textContent = "";

      afficherStatus(
        nouvellesSlides.length > 1
          ? String(nouvellesSlides.length) +
            " images ajoutées. Enregistre ou publie le carrousel."
          : "Image ajoutée. Enregistre ou publie le carrousel.",
        "dirty"
      );
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

  function actualiserSelectionFichiers() {
    const input = document.querySelector(
      "[data-lcdp-actualite-images]"
    );
    const selection = document.querySelector(
      "[data-lcdp-actualite-selection]"
    );

    if (!selection) return;

    const noms = Array.from(input?.files || [])
      .map((fichier) => fichier.name);

    selection.textContent = noms.length > 0
      ? noms.join(" — ")
      : "";
  }

  function previsualiser() {
    let configuration;

    try {
      configuration = validerConfigurationLocale(
        lireConfigurationLocale()
      );
    } catch (error) {
      afficherStatus(
        String(error?.message || error || ""),
        "error"
      );
      return;
    }

    const preview = document.querySelector(
      "[data-lcdp-actualite-preview]"
    );
    const contenu = document.querySelector(
      "[data-lcdp-actualite-preview-content]"
    );

    if (!preview || !contenu) return;

    contenu.innerHTML = "";

    const slidesActives = configuration.slides.filter(
      (slide) => slide.active
    );

    if (slidesActives.length === 0) {
      const message = document.createElement("p");
      message.className = "lcdp-admin-actualite__preview-message";
      message.textContent =
        "Aucune image active : le carrousel ne sera pas affiché.";
      contenu.appendChild(message);
    } else {
      const grille = document.createElement("div");
      grille.className = "lcdp-admin-actualite__preview-grid";

      slidesActives.forEach((slide) => {
        const figure = document.createElement("figure");
        figure.className = "lcdp-admin-actualite__preview-item";

        const image = document.createElement("img");
        image.className = "lcdp-admin-actualite__preview-image";
        image.src = urlImage(slide.image);
        image.alt = slide.alt;
        image.loading = "lazy";
        image.decoding = "async";

        figure.appendChild(image);

        if (
          slide.enSavoirPlusActive &&
          urlArticleValide(slide.articleUrl)
        ) {
          const lien = document.createElement("a");
          lien.className =
            "lcdp-button lcdp-button-orange " +
            "lcdp-admin-actualite__preview-link";
          lien.href = urlArticle(slide.articleUrl);
          lien.textContent = "En savoir plus";
          figure.appendChild(lien);
        }

        grille.appendChild(figure);
      });

      contenu.appendChild(grille);
    }

    preview.hidden = false;
    preview.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
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

  async function demanderConfirmationPublication() {
    return demanderConfirmation({
      titre: "Publier l’actualité",
      texte:
        "La version publique du carrousel sera remplacée par le contenu actuel.",
      confirmer: "Publier"
    });
  }

  async function demanderConfirmationRetrait() {
    return demanderConfirmation({
      titre: "Retirer cette image",
      texte:
        "L’image sera retirée du carrousel. Le fichier conservé dans GitHub ne sera pas supprimé.",
      confirmer: "Retirer"
    });
  }

  async function demanderConfirmation(options) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      return window.confirm(options.texte || "");
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

    titre.textContent = options.titre || "Confirmation";
    texte.textContent = options.texte || "";

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className =
      "lcdp-button lcdp-button-secondary";
    annuler.textContent = "Annuler";

    const confirmer = document.createElement("button");
    confirmer.type = "button";
    confirmer.className =
      "lcdp-button lcdp-button-orange";
    confirmer.textContent = options.confirmer || "Confirmer";

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

    return guard.verifierAccesPageAdmin({
      path: CHEMIN_ROUTE
    });
  }

  function brancherActions() {
    document
      .querySelector("[data-lcdp-actualite-affiche-accueil]")
      ?.addEventListener("change", signalerModificationLocale);

    document
      .querySelector("[data-lcdp-actualite-images]")
      ?.addEventListener("change", actualiserSelectionFichiers);

    document
      .querySelector("[data-lcdp-actualite-upload]")
      ?.addEventListener("click", ajouterImages);

    document
      .querySelector("[data-lcdp-actualite-previsualiser]")
      ?.addEventListener("click", previsualiser);

    document
      .querySelector("[data-lcdp-actualite-enregistrer]")
      ?.addEventListener("click", enregistrerBrouillon);

    document
      .querySelector("[data-lcdp-actualite-publier]")
      ?.addEventListener("click", publier);
  }

  async function initialiserPage() {
    const autorise = await verifierAcces();

    if (!autorise) return;

    const [data] = await Promise.all([
      appelerJson("/admin/actualite"),
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);

    documentCharge = data;
    chargerDocumentLocal(data);
    brancherActions();
    actualiserMeta();
    afficherStatus("");

    const loading = document.querySelector(
      "[data-lcdp-actualite-loading]"
    );
    const contenu = document.querySelector(
      "[data-lcdp-actualite-contenu]"
    );

    if (loading) loading.hidden = true;
    if (contenu) contenu.hidden = false;

    document.getElementById("lcdp-main-admin").hidden = false;
  }

  window.addEventListener("beforeunload", (event) => {
    if (!modificationsLocales || requeteEnCours) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  initialiserPage().catch((error) => {
    console.error(error);

    const loading = document.querySelector(
      "[data-lcdp-actualite-loading]"
    );

    if (loading) {
      loading.textContent = String(
        error?.message ||
        error ||
        "Impossible d’initialiser la page Actualité."
      );
    }

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }
  });
})();
