(() => {
  "use strict";

  const configuration = window.SITE_CONFIG || {};
  const RUBRIQUES = [
    { cle: "entree", titre: "Entrée", images: ["entree1.webp", "entree2.webp"] },
    { cle: "checkin", titre: "Check-in", images: ["checkin1.webp", "checkin2.webp"] },
    { cle: "chemin1", titre: "Chemin d’accès à la zone réservée 1", images: ["chemin1.webp"] },
    { cle: "chemin2", titre: "Chemin d’accès à la zone réservée 2", images: ["chemin2.webp"], optionnelle: true },
    { cle: "zonereservee1", titre: "Zone réservée 1", images: ["zonereservee11.webp", "zonereservee12.webp"] },
    { cle: "zonereservee2", titre: "Zone réservée 2", images: ["zonereservee21.webp", "zonereservee22.webp"], optionnelle: true },
    { cle: "presence", titre: "Présence 1", images: ["presence11.webp", "presence12.webp"] },
    { cle: "presence2", titre: "Présence 2", images: ["presence21.webp", "presence22.webp"], optionnelle: true },
    { cle: "reglement", titre: "Règlement", images: [], liens: true },
    { cle: "reglementparc", titre: "Règlement parc", images: [] }
  ];
  const IMAGE_BASE = "/IMAG/ACCESPARC/";
  // Moteur, filtres et ressource identiques à Mise à jour Parc.
  const TABLE_SLOT_ID = "lcdp-table-lecture-admin-slot";
  function endpointAdminData() {
    return String(
      configuration.workerAdminDataUrl || configuration.WORKER_ADMIN_DATA_URL ||
      window.ADMIN_CONFIG?.API_ADMIN_DATA || ""
    ).replace(/\/+$/, "");
  }
  function chargerScriptUneFois(src, attribut, valeur) {
    if (document.querySelector('script[' + attribut + '="' + valeur + '"]')) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.setAttribute(attribut, valeur);
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Module indisponible : " + valeur)), { once: true });
      document.body.appendChild(script);
    });
  }
  const chargerScriptAdminUneFois = path =>
    chargerScriptUneFois(urlAdmin(path), "data-lcdp-script-admin", path);
  const chargerScriptObjetUneFois = path =>
    chargerScriptUneFois(urlObjet(path), "data-lcdp-script-objet", path);


  let parcCourant = null;
  let formulaires = new Map();
  let contenuOriginal = {};
  let modifie = false;
  let operation = false;
  let importsEnCours = 0;
  let fileImportQueue = Promise.resolve();

  const urlAdmin = chemin => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(chemin) : chemin;
  const urlPublic = chemin => typeof window.LCDP_urlPublic === "function"
    ? window.LCDP_urlPublic(chemin) : chemin;
  const urlObjet = chemin => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(chemin) : chemin;
  const endpoint = () => String(
    configuration.workerParcAdminUrl || configuration.WORKER_PARC_ADMIN_URL ||
    window.ADMIN_CONFIG?.API_PARC_ADMIN || ""
  ).replace(/\/+$/, "");

  function statut(message, erreur = false) {
    const element = document.getElementById("lcdp-accesdetail-statut");
    if (!element) return;
    element.hidden = !message;
    element.textContent = String(message || "");
    element.dataset.state = erreur ? "error" : "success";
    element.setAttribute("role", erreur ? "alert" : "status");
  }
  function signalerModification() {
    modifie = true;
    statut("Modifications non enregistrées.");
  }
  async function afficherConfirmationEnregistrement(message) {
    const conteneur = document.createElement("div");
    const reponse = await fetch(urlObjet("/HTMLBASE/02-dialogue-reference-information.html"), {
      credentials: "same-origin",
      cache: "no-cache"
    });
    if (!reponse.ok) throw new Error("Dialogue INFORMATION indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await reponse.text()).trim();
    conteneur.appendChild(template.content.cloneNode(true));

    const dialogue = conteneur.querySelector('[data-lcdp-dialogue-reference="information"]');
    const titre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
    const texte = conteneur.querySelector("[data-lcdp-dialogue-message]");
    const boutonOk = conteneur.querySelector('[data-lcdp-dialogue-action="compris"]');
    if (!dialogue || !titre || !texte || !boutonOk) {
      throw new Error("Structure du dialogue INFORMATION incomplète.");
    }
    titre.textContent = "Enregistrement confirmé";
    texte.textContent = message;
    texte.style.whiteSpace = "pre-line";
    boutonOk.textContent = "OK";
    document.body.appendChild(conteneur);

    await new Promise(resolve => {
      const fermer = () => {
        document.removeEventListener("keydown", intercepterClavier);
        conteneur.remove();
        resolve();
      };
      const intercepterClavier = event => {
        if (event.key === "Escape") {
          event.preventDefault();
        } else if (event.key === "Tab") {
          event.preventDefault();
          boutonOk.focus();
        }
      };
      document.addEventListener("keydown", intercepterClavier);
      boutonOk.addEventListener("click", fermer, { once: true });
      boutonOk.focus();
    });
  }

  async function chargerFragmentAdmin(path) {
    const response = await fetch(urlAdmin(path), { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error("Fragment ADMIN introuvable : " + path);
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }
  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    slot.appendChild(await chargerFragmentAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"));
    slot.querySelectorAll("[data-site-href]").forEach(element => {
      const chemin = element.dataset.siteHref || "";
      element.href = element.dataset.space === "admin" ? urlAdmin(chemin) : urlPublic(chemin);
    });
    slot.querySelectorAll("[data-site-src]").forEach(element => {
      element.src = urlObjet(String(element.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
  }
  async function chargerFormulaire() {
    if (window.LCDP_creerFormulaire) return;
    const script = document.createElement("script");
    script.src = urlObjet("/JSBASE/03-formulaire.js");
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(new Error("Composant formulaire indisponible."));
      document.body.appendChild(script);
    });
  }
  async function api(path, options = {}) {
    if (!endpoint()) throw new Error("Worker parc admin non configuré.");
    const response = await fetch(endpoint() + path, {
      method: options.method || "GET",
      credentials: "include", cache: "no-store",
      headers: options.body instanceof FormData ? { Accept: "application/json" } :
        { Accept: "application/json", ...(options.body ? {"Content-Type":"application/json"} : {}) },
      body: options.body instanceof FormData ? options.body :
        (options.body ? JSON.stringify(options.body) : undefined)
    });
    const result = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      window.location.replace(urlAdmin("/ESPACE-ADMIN/connexion-admin.html"));
      throw new Error("Session ADMIN à renouveler.");
    }
    if (!response.ok || result?.success !== true) {
      throw new Error(result?.message || "Opération Accès détail impossible.");
    }
    return result;
  }
async function initialiserTable() {
  const slot = document.getElementById(TABLE_SLOT_ID);

  if (!slot) return;

  const fragment = await chargerFragmentAdmin(
    "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.html"
  );

  slot.appendChild(fragment);

  await chargerScriptAdminUneFois(
    "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js"
  );

  const table = window.LCDP_TABLE_LECTURE_ADMIN;

  if (!table || typeof table.initialiser !== "function") {
    throw new Error("Objet table lecture admin indisponible.");
  }

  await chargerScriptObjetUneFois("/JSBASE/07-diginum.js");
  const cleFiltres = "lcdp-accesdetail-liste-filtres";
  const sessionId = window.LCDP_ADMIN_AUTORISATION?.sessionId;
  if (!sessionId) throw new Error("Identifiant de session admin absent. Déployez le worker de session et le garde admin.");
  let initialFilters = {};
  try {
    const sauvegarde = JSON.parse(localStorage.getItem(cleFiltres) || "null");
    if (sauvegarde?.sessionId === sessionId) initialFilters = sauvegarde.filters || {};
    else localStorage.removeItem(cleFiltres);
  } catch (_) { /* Le filtrage reste disponible sans stockage navigateur. */ }
  await table.initialiser({
    initialFilters,
    multipleFilterColumns: ["dptmt"],
    onFiltersChange: filters => {
      try { localStorage.setItem(cleFiltres, JSON.stringify({ sessionId, filters })); } catch (_) {}
    },
    filterOpeners: {
      dptmt: () => window.LCDP_diginum.ouvrir({
        titre: "Ajouter un département",
        placeholder: "exemple 08",
        longueurMax: 3,
        autoValider: code => (code.length === 2 && !code.startsWith("97")) ||
          (code.length === 3 && code.startsWith("97")),
        verifier: code => /^(?:0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|97[1-6])$/.test(code)
          ? null : "Code de département invalide. Exemple : 08."
      })
    },
    filterOptions: {
      statut: [
        { value: "", label: "Tous" },
        { value: "1-basebrute", label: "1-basebrute" },
        { value: "2-aqualifier", label: "2-aqualifier" },
        { value: "2-ademarcher", label: "2-ademarcher" },
        { value: "3-nonqualifié", label: "3-nonqualifié" },
        { value: "3-encours", label: "3-encours" },
        { value: "3-refus", label: "3-refus" },
        { value: "prepa", label: "prepa" },
        { value: "enligne", label: "enligne" },
        { value: "horsligne", label: "horsligne" }
      ]
    },
    slotId: TABLE_SLOT_ID,
    endpoint: endpointAdminData(),
    resource: "parcs-statut",
    interactiveColumns: ["nom"],
    onCellActivate: ({ row }) => ouvrirAccesDetailParc(row)
  });
}

  async function ouvrirAccesDetailParc(row) {
    const idparc = String(row?.idparc || "").trim();
    if (!idparc) {
      statut("Identifiant du parc absent de la ligne.", true);
      return;
    }
    const liste = document.getElementById(TABLE_SLOT_ID);
    const editeur = document.getElementById("lcdp-accesdetail-edition");
    if (!liste || !editeur) return;
    statut("");
    try {
      const resultat = await api("/accesdetail?idparc=" + encodeURIComponent(idparc));
      if (!resultat?.parc || String(resultat.parc.idparc) !== idparc) {
        throw new Error("La fiche reçue ne correspond pas au parc sélectionné.");
      }
      await chargerEditeur(resultat.parc);
      liste.hidden = true;
      editeur.scrollIntoView({ behavior: "auto", block: "start" });
    } catch (error) {
      liste.hidden = false;
      editeur.hidden = true;
      editeur.innerHTML = "";
      parcCourant = null;
      modifie = false;
      formulaires.clear();
      statut(String(error?.message || error || "Impossible de charger les accès du parc."), true);
    }
  }

  function nomDossier(nom) {
    return String(nom || "").trim().replace(/\s+/g, "_");
  }
  function cheminImage(parc, nomFichier) {
    return urlObjet(IMAGE_BASE + parc.dptmt + "/" + nomDossier(parc.nom) + "/" + nomFichier);
  }
  function creerBouton(label, action, secondaire = true) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (secondaire ? "lcdp-button-secondary" : "lcdp-button-primary");
    bouton.textContent = label;
    bouton.addEventListener("click", action);
    return bouton;
  }
  async function chargerEditeur(parc) {
    const slot = document.getElementById("lcdp-accesdetail-edition");
    slot.innerHTML = "";
    slot.hidden = false;
    parcCourant = parc;
    contenuOriginal = JSON.parse(JSON.stringify(parc.accesdetail || {}));
    formulaires = new Map();
    modifie = false;
    // Seuls les imports confirmés par GitHub seront annoncés comme réussis.
    const imagesTeleversees = new Set();
    const imagesEnEchec = new Set();

    const nom = document.createElement("h2");
    nom.textContent = parc.nom + " — " + parc.dptmt;
    slot.appendChild(nom);
    const optionPhotos = document.createElement("p");
    optionPhotos.textContent = "Photographies facultatives : choisissez uniquement les images que vous souhaitez ajouter. Chaque image sélectionnée est enregistrée séparément dans GitHub.";
    slot.appendChild(optionPhotos);
    const emplacements = new Map();
    for (const rubrique of RUBRIQUES) {
      const bloc = document.createElement("section");
      bloc.id = "lcdp-accesdetail-" + rubrique.cle;
      const id = "lcdp-accesdetail-champ-" + rubrique.cle;
      bloc.className = "lcdp-accesdetail-rubrique";
      if (rubrique.optionnelle && !contenuOriginal[rubrique.cle]?.texte) bloc.hidden = true;
      slot.appendChild(bloc);
      const form = await window.LCDP_creerFormulaire(bloc, {
        id:"lcdp-accesdetail-form-" + rubrique.cle,
        titre: rubrique.titre,
        champs: [{
          name:"texte", id, label:"Texte de la rubrique",
          type:"textarea", value:contenuOriginal[rubrique.cle]?.texte || "",
          maxlength:2000,
          className:"lcdp-box-champ-formulaire--wide"
        }]
      });
      if (!form) throw new Error("Formulaire de rubrique indisponible : " + rubrique.cle);
      form.addEventListener("submit", e => e.preventDefault());
      const textarea = form.elements.namedItem("texte");
      textarea.maxLength = 2000;
      textarea.rows = rubrique.cle === "reglementparc" ? 5 : 3;
      textarea.addEventListener("input", signalerModification);
      formulaires.set(rubrique.cle, {form, textarea, bloc});
      emplacements.set(rubrique.cle, bloc);

      if (rubrique.images.length) {
        const photos = document.createElement("div");
        photos.className = "lcdp-box-formulaire__fields";
        for (const nomImage of rubrique.images) {
          const item = document.createElement("div");
          item.className = "lcdp-box-champ-formulaire";
          const texte = document.createElement("p");
          texte.textContent = "Photo : " + nomImage + " (WEBP, 15 Mo maximum)";
          item.appendChild(texte);

          const apercu = document.createElement("img");
          apercu.alt = "Aperçu de " + nomImage + " pour " + parc.nom;
          apercu.style.maxWidth = "min(100%, 420px)";
          apercu.style.maxHeight = "260px";
          apercu.style.objectFit = "contain";
          apercu.hidden = true;
          apercu.onerror = () => { apercu.hidden = true; };
          apercu.onload = () => { apercu.hidden = false; };
          apercu.src = cheminImage(parc, nomImage);
          item.appendChild(apercu);

          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".webp,image/webp";
          input.required = false;
          input.setAttribute("aria-label", "Sélectionner une photo pour import automatique : " + nomImage);
          input.className = "lcdp-box-champ-formulaire__input";
          item.appendChild(input);
          const aide = document.createElement("p");
          aide.textContent = "Sélectionnez une image : son import est automatique. Le résultat apparaît ici.";
          item.appendChild(aide);
          const etatImage = document.createElement("p");
          etatImage.setAttribute("role", "status");
          etatImage.setAttribute("aria-live", "polite");
          etatImage.textContent = "Statut GitHub non vérifié.";
          item.appendChild(etatImage);
          const retry = creerBouton("Réessayer l'import", () => {
            if (fichierSelectionne) programmerImport(fichierSelectionne);
            else input.click();
          });
          retry.hidden = true;
          item.appendChild(retry);
          photos.appendChild(item);

          let fichierSelectionne = null;
          let tentativeEnCours = false;
          const afficherImageStatut = (message, erreur = false) => {
            etatImage.textContent = message;
            etatImage.dataset.state = erreur ? "error" : "success";
            etatImage.style.color = erreur ? "var(--lcdp-color-danger, #a02020)" : "";
            etatImage.style.fontWeight = erreur ? "700" : "";
          };
          const televerser = async fichier => {
            if (tentativeEnCours) return;
            tentativeEnCours = true;
            input.disabled = true;
            retry.hidden = true;
            afficherImageStatut("Import en cours vers GitHub…");
            try {
              if (!/\.webp$/i.test(fichier.name) ||
                  (fichier.type && fichier.type !== "image/webp") ||
                  fichier.size < 12 || fichier.size > 15 * 1024 * 1024) {
                throw new Error("Le fichier doit être un WEBP de 15 Mo maximum.");
              }
              const body = new FormData();
              body.append("idparc", parc.idparc);
              body.append("image", nomImage);
              body.append("fichier", fichier, fichier.name);
              const data = await api("/accesdetail/image", { method: "POST", body });
              if (data.image !== nomImage || !data.chemin) {
                throw new Error("Confirmation d'enregistrement incomplète.");
              }
              const cheminAttendu = "OBJET/IMAG/ACCESPARC/" +
                parc.dptmt + "/" + nomDossier(parc.nom) + "/" + nomImage;
              if (data.chemin !== cheminAttendu) {
                throw new Error("Le worker a enregistré l'image à un emplacement inattendu.");
              }
              if (data.confirme !== true ||
                  !/^[0-9a-f]{40}$/i.test(String(data.sha || "")) ||
                  Number(data.taille) !== fichier.size ||
                  !/^[0-9a-f]{40}$/i.test(String(data.commit || ""))) {
                throw new Error("Enregistrement non confirmé par GitHub. Ne pas considérer l'image comme enregistrée.");
              }
              imagesTeleversees.add(nomImage);
              imagesEnEchec.delete(nomImage);
              afficherImageStatut("Image téléchargée et enregistrée dans GitHub (commit confirmé).");
              apercu.src = cheminImage(parc, nomImage) + "?v=" + Date.now();
              fichierSelectionne = null;
              input.value = "";
            } catch (erreur) {
              imagesTeleversees.delete(nomImage);
              imagesEnEchec.add(nomImage);
              afficherImageStatut("Échec de l'import : " + String(erreur?.message || erreur), true);
              retry.hidden = false;
            } finally {
              input.disabled = false;
              tentativeEnCours = false;
            }
          };
          const programmerImport = fichier => {
            if (input.disabled || tentativeEnCours) return;
            importsEnCours += 1;
            imagesTeleversees.delete(nomImage);
            imagesEnEchec.delete(nomImage);
            input.disabled = true;
            retry.hidden = true;
            afficherImageStatut("En attente d'envoi vers GitHub…");
            const tache = fileImportQueue.then(() => televerser(fichier));
            fileImportQueue = tache.catch(() => {});
            tache.then(
              () => { importsEnCours -= 1; input.disabled = false; },
              () => { importsEnCours -= 1; input.disabled = false; }
            );
          };
          input.addEventListener("change", () => {
            const fichier = input.files?.[0];
            if (!fichier) return;
            fichierSelectionne = fichier;
            programmerImport(fichier);
          });
          // Les preuves de présence viennent du listing GitHub lu par le worker.
          // Une image absente n'est pas présentée comme enregistrée.
          item.dataset.lcdpAccesImage = nomImage;
          item._lcdpStatutPhoto = afficherImageStatut;
        }
        form.appendChild(photos);
      }
      if (rubrique.liens) {
        const liens = document.createElement("p");
        liens.append("Liens : ");
        for (const item of [
          ["Règlement du parc", "#lcdp-accesdetail-reglementparc"],
          ["Règlement du club", urlPublic("/ESPACE-PUBLIC/reglement-club.html")],
          ["Règlement de l’application", urlPublic("/ESPACE-PUBLIC/reglement-app.html")]
        ]) {
          if (liens.childNodes.length > 1) liens.append(" · ");
          const a = document.createElement("a");
          a.href = item[1];
          a.textContent = item[0];
          if (!item[1].startsWith("#")) { a.target="_blank"; a.rel="noopener noreferrer"; }
          liens.appendChild(a);
        }
        form.appendChild(liens);
      }
    }
    // La seconde zone réservée et son chemin forment une seule option.
    const chemin2 = emplacements.get("chemin2");
    const zone2 = emplacements.get("zonereservee2");
    if (!chemin2.hidden || !zone2.hidden) {
      chemin2.hidden = false;
      zone2.hidden = false;
    }
    const ajouterZone2 = creerBouton("Ajouter une zone réservée 2 et son chemin d’accès", () => {
      chemin2.hidden = false;
      zone2.hidden = false;
      ajouterZone2.hidden = true;
      chemin2.scrollIntoView({behavior:"smooth",block:"start"});
      chemin2.querySelector("textarea")?.focus();
    });
    ajouterZone2.hidden = !zone2.hidden;
    chemin2.before(ajouterZone2);

    const presence2 = emplacements.get("presence2");
    const ajouterPresence2 = creerBouton("Ajouter une présence 2", () => {
      presence2.hidden = false;
      ajouterPresence2.hidden = true;
      presence2.scrollIntoView({behavior:"smooth",block:"start"});
      presence2.querySelector("textarea")?.focus();
    });
    ajouterPresence2.hidden = !presence2.hidden;
    presence2.before(ajouterPresence2);

    // Lecture de l'état de toutes les photos directement sur la branche GitHub.
    try {
      const etat = await api("/accesdetail/images?idparc=" + encodeURIComponent(parc.idparc));
      const imagesConfirmees = new Set((etat.images || []).map(x => x.nom));
      if (["chemin2.webp", "zonereservee21.webp", "zonereservee22.webp"].some(
        nom => imagesConfirmees.has(nom)
      )) {
        chemin2.hidden = false;
        zone2.hidden = false;
        ajouterZone2.hidden = true;
      }
      if (["presence21.webp", "presence22.webp"].some(
        nom => imagesConfirmees.has(nom)
      )) {
        presence2.hidden = false;
        ajouterPresence2.hidden = true;
      }
      for (const item of slot.querySelectorAll("[data-lcdp-acces-image]")) {
        const existe = imagesConfirmees.has(item.dataset.lcdpAccesImage);
        item._lcdpStatutPhoto?.(
          existe ? "Image présente et vérifiée dans GitHub." : "Aucune image enregistrée dans GitHub."
        );
      }
    } catch (erreur) {
      for (const item of slot.querySelectorAll("[data-lcdp-acces-image]")) {
        item._lcdpStatutPhoto?.("Vérification GitHub indisponible. La sélection et l'import restent possibles.");
      }
    }

    const actions = document.createElement("div");
    actions.className = "lcdp-box-formulaire__actions";
    const enregistrer = creerBouton("Enregistrer les rubriques", async () => {
      if (!parcCourant || operation) return;
      if (importsEnCours > 0) {
        statut("Import de photographie en cours : attendez la confirmation sous chaque image avant d'enregistrer les textes.", true);
        return;
      }
      const contenu = {};
      for (const [cle, f] of formulaires) {
        const texte = f.textarea.value.trim();
        if (texte) contenu[cle] = { texte };
      }
      operation = true;
      enregistrer.disabled = true;
      const changement = JSON.stringify(contenu) !== JSON.stringify(contenuOriginal);
      statut(changement ? "Enregistrement des rubriques en cours…" : "Vérification de l'enregistrement…");
      try {
        if (changement) {
          const data = await api("/accesdetail", { method: "POST",
            body: { idparc: parcCourant.idparc, original: contenuOriginal, accesdetail: contenu } });
          if (!data.parc || !data.parc.accesdetail) {
            throw new Error("Réponse d'enregistrement incomplète : la fiche enregistrée est absente.");
          }
          parcCourant = data.parc;
          contenuOriginal = JSON.parse(JSON.stringify(data.parc.accesdetail));
        }
        modifie = false;
        const imagesReussies = [...imagesTeleversees].sort();
        const imagesEchouees = [...imagesEnEchec].sort();
        let confirmation = changement
          ? "Les rubriques Accès détail de ce parc ont bien été enregistrées."
          : "Aucune modification des rubriques n'était nécessaire.";
        confirmation += imagesReussies.length
          ? "\nImages téléchargées et enregistrées dans GitHub (" + imagesReussies.length +
            ") : " + imagesReussies.join(", ") + "."
          : "\nAucune nouvelle image téléchargée pendant cette édition.";
        if (imagesEchouees.length) {
          confirmation += "\nTéléchargement non confirmé pour : " +
            imagesEchouees.join(", ") + ".";
        }
        await afficherConfirmationEnregistrement(confirmation);
        fermerEdition();
        const liste = document.getElementById(TABLE_SLOT_ID);
        liste?.scrollIntoView({ behavior: "auto", block: "start" });
      } catch (e) {
        statut(e.message || String(e), true);
      } finally {
        operation = false;
        enregistrer.disabled = false;
      }
    }, false);
    enregistrer.textContent = "Enregistrer";
    actions.appendChild(enregistrer);
    slot.appendChild(actions);
    statut("Rubriques chargées pour " + parc.nom + ".");
  }
  function fermerEdition() {
    parcCourant = null;
    modifie = false;
    formulaires.clear();
    const editeur = document.getElementById("lcdp-accesdetail-edition");
    editeur.hidden = true;
    editeur.innerHTML = "";
    const liste = document.getElementById(TABLE_SLOT_ID);
    if (liste) liste.hidden = false;
    statut("");
  }
  async function initialiser() {
    const guard = window.LCDP_GUARD_ADMIN;
    if (!guard || typeof guard.verifierAccesPageAdmin !== "function") {
      throw new Error("Garde ADMIN non disponible.");
    }
    if (!(await guard.verifierAccesPageAdmin())) return;
    await Promise.all([
      initialiserBandeau(),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({
        slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"parcs"
      }),
      chargerFormulaire(),
      initialiserTable()
    ]);
    document.getElementById("lcdp-main-admin").hidden = false;
    // La liste des parcs est le point d'entrée et la destination après enregistrement.
  }
  initialiser().catch(e => {
    console.error("Accès détail :",e);
    statut(e.message || String(e),true);
    document.getElementById("lcdp-main-admin").hidden = false;
  });
})();