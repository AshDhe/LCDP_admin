(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const TABLE_SLOT_ID = "lcdp-prixabo-table-slot";
  const EDITION_SLOT_ID = "lcdp-prixabo-edition-slot";
  const PAGE_CONNEXION = "/ESPACE-ADMIN/connexion-admin.html";

  let abonnementCourant = null;
  let modeEdition = "";

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
        space === "admin" ? urlAdmin(path) : urlPublic(path)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const path = String(element.dataset.siteSrc || "")
        .replace(/^\/?OBJET\/?/, "/");

      element.setAttribute("src", urlObjet(path));
    });
  }

  function endpointAboAdmin() {
    return String(
      config.workerAboAdminUrl ||
      config.WORKER_ABO_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_ABO_ADMIN ||
      ""
    ).replace(/\/+$/, "");
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
    return chargerFragment(urlAdmin(path), "Fragment ADMIN " + path);
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

  function chargerScriptObjetUneFois(path) {
    return chargerScriptUneFois(
      urlObjet(path),
      "data-lcdp-script-objet",
      path
    );
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(await chargerFragmentAdmin(
      "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
    ));
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

  async function initialiserTable() {
    const slot = document.getElementById(TABLE_SLOT_ID);
    const endpoint = endpointAboAdmin();

    if (!slot) return;
    if (!endpoint) throw new Error("Endpoint du worker PrixAbo manquant.");

    slot.innerHTML = "";
    slot.appendChild(await chargerFragmentAdmin(
      "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.html"
    ));

    await chargerScriptUneFois(
      urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js") + "?v=20261112-ordrecolonnes2",
      "data-lcdp-script-admin",
      "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js?v=20261112-ordrecolonnes2"
    );

    const table = window.LCDP_TABLE_LECTURE_ADMIN;

    if (!table || typeof table.initialiser !== "function") {
      throw new Error("Objet table lecture admin indisponible.");
    }

    await table.initialiser({
      slotId: TABLE_SLOT_ID,
      endpoint,
      reorderableColumns: true,
      resource: "prixabo",
      pageSize: 200,
      multiSelectFilterColumns: ["typeabo", "nomabo", "variables", "datedebut", "datefin", "prixabottc", "ria", "typmb", "txtvafr", "ech", "mois1", "mois2", "mois3", "valvrmt", "1xval", "maxduo", "duoplus", "freqduoplus", "famille", "coach", "maxcoach", "remise", "datecreation"],
      initialSortKey: "typeabo",
      initialSortDirection: "asc",
      interactiveColumns: ["typeabo", "nomabo", "ria", "typmb"],
      interactiveLabel: "Modifier l'abonnement",
      interactiveLabels: {
        typeabo: "Modifier l'abonnement",
        nomabo: "Modifier l'abonnement",
        ria: "Modifier le droit Recherche IA",
        typmb: "Modifier la catégorie membre"
      },
      onCellActivate: ({ row, column }) => {
        if (String(column?.key || "") === "ria") {
          return basculerDroitRechercheIa(row);
        }

        return ouvrirModification(row);
      }
    });
  }

  async function basculerDroitRechercheIa(row) {
    const idprixabo = String(row?.idprixabo || "").trim();

    if (!idprixabo) {
      throw new Error("Identifiant PrixAbo absent.");
    }

    const nouvelEtat = row?.rechercheia !== true;
    const response = await fetch(endpointAboAdmin() + "/recherche-ia", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idprixabo,
        actif: nouvelEtat
      })
    });

    const data = await response.json().catch(() => null);
    gererStatutAcces(response, data);

    if (!response.ok || !data || data.success !== true) {
      const message = String(
        data?.message ||
        data?.detail ||
        "Impossible d'enregistrer le droit Recherche IA."
      );
      await afficherAlerte(message);
      return false;
    }

    await window.LCDP_TABLE_LECTURE_ADMIN?.recharger(TABLE_SLOT_ID);
    return true;
  }

  async function ouvrirModification(row) {
    const idprixabo = String(row?.idprixabo || "").trim();
    if (!idprixabo) throw new Error("Identifiant PrixAbo absent.");

    const endpoint = endpointAboAdmin();
    const requestUrl = new URL(endpoint + "/abonnement");
    requestUrl.searchParams.set("idprixabo", idprixabo);

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    const data = await response.json().catch(() => null);
    gererStatutAcces(response, data);

    if (!response.ok || !data || data.success !== true || !data.abonnement) {
      throw new Error(
        data?.message || data?.detail || "Impossible de lire l'abonnement."
      );
    }

    modeEdition = "update";
    abonnementCourant = data.abonnement;
    await rendreFormulaire(abonnementCourant);
  }

  async function ouvrirAjout() {
    modeEdition = "create";
    abonnementCourant = {
      typeabo: "",
      nomabo: "",
      variables: "",
      datedebut: "",
      datefin: "",
      prixabottc: "",
      txtvafr: 20,
      maxduo: "",
      duoplus: "",
      freqduoplus: "",
      famille: "",
      coach: "",
      maxcoach: "",
      remise: "",
      typmb: "",
      ech: "",
      mois1: "",
      mois2: "",
      mois3: "",
      valvrmt: "",
      "1xval": "",
      datecreation: ""
    };

    await rendreFormulaire(abonnementCourant);
  }

  async function rendreFormulaire(abonnement) {
    await chargerScriptObjetUneFois("/JSBASE/03-formulaire.js");

    if (typeof window.LCDP_creerFormulaire !== "function") {
      throw new Error("Objet formulaire indisponible.");
    }

    const tableSlot = document.getElementById(TABLE_SLOT_ID);
    const editionSlot = document.getElementById(EDITION_SLOT_ID);
    const boutonAjouter = document.getElementById("lcdp-prixabo-ajouter");

    tableSlot.hidden = true;
    editionSlot.hidden = false;
    boutonAjouter.hidden = true;

    const form = await window.LCDP_creerFormulaire(EDITION_SLOT_ID, {
      id: "lcdp-prixabo-form",
      ariaLabel: modeEdition === "create"
        ? "Ajouter un abonnement"
        : "Modifier l'abonnement " + String(abonnement.typeabo || ""),
      titre: modeEdition === "create"
        ? "Ajouter un abonnement"
        : "Modifier l'abonnement",
      sousTitre: modeEdition === "create"
        ? ""
        : String(abonnement.typeabo || ""),
      validationNative: true,
      champs: ordonnerChampsSelonTable(construireChamps(abonnement)),
      boutons: [
        {
          id: "lcdp-prixabo-enregistrer",
          type: "submit",
          style: "lcdp-button-orange",
          label: "Enregistrer"
        },
        {
          id: "lcdp-prixabo-retour",
          type: "button",
          style: "lcdp-button-secondary",
          label: "Retour à la liste"
        },
        ...(modeEdition === "update" ? [{
          id: "lcdp-prixabo-supprimer",
          type: "button",
          style: "lcdp-button-secondary",
          label: "Supprimer"
        }] : [])
      ],
      noteHtml: ""
    });

    if (!form) throw new Error("Formulaire PrixAbo non créé.");

    form.addEventListener("submit", enregistrerAbonnement);
    form.querySelector("#lcdp-prixabo-retour")
      ?.addEventListener("click", fermerEdition);
    form.querySelector("#lcdp-prixabo-supprimer")
      ?.addEventListener("click", () => supprimerAbonnement(form));

    editionSlot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function confirmerSuppressionAbonnement(nom) {
    const focusInitial = document.activeElement;
    let conteneur = null;
    try {
      const hrefCss = urlObjet("/CSSBASE/lcdp-lightbox-convergence.css");
      if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(lien => lien.href === new URL(hrefCss, document.baseURI).href)) {
        await new Promise((resolve, reject) => {
          const feuille = document.createElement("link");
          feuille.rel = "stylesheet";
          feuille.href = hrefCss;
          feuille.onload = resolve;
          feuille.onerror = () => { feuille.remove(); reject(new Error("CSS SUPPRESSION indisponible.")); };
          document.head.appendChild(feuille);
        });
      }
      const fragment = await chargerFragment(urlObjet("/HTMLBASE/02-dialogue-reference-suppression.html"), "Dialogue SUPPRESSION");
      conteneur = document.createElement("div");
      conteneur.appendChild(fragment);
      const dialogue = conteneur.querySelector('[data-lcdp-dialogue-reference="suppression"]');
      const titre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const message = conteneur.querySelector("[data-lcdp-dialogue-message]");
      const conserver = conteneur.querySelector('[data-lcdp-dialogue-action="conserver"]');
      const supprimer = conteneur.querySelector('[data-lcdp-dialogue-action="supprimer"]');
      if (!dialogue || !titre || !message || !conserver || !supprimer) throw new Error("Dialogue SUPPRESSION incomplet.");
      titre.textContent = "Supprimer cette version d’abonnement ?";
      message.textContent = 'Supprimer définitivement cette version de l’abonnement « ' + nom + ' » ?';
      conserver.textContent = "Conserver";
      supprimer.textContent = "Supprimer";
      document.body.appendChild(conteneur);
      conserver.focus();
      return await new Promise(resolve => {
        let termine = false;
        const terminer = valeur => {
          if (termine) return;
          termine = true;
          document.removeEventListener("keydown", gererClavier);
          conteneur.remove();
          if (focusInitial?.isConnected && typeof focusInitial.focus === "function") focusInitial.focus();
          resolve(valeur);
        };
        const gererClavier = event => {
          if (event.key === "Escape") { event.preventDefault(); terminer(false); }
          if (event.key === "Tab") {
            const cible = event.shiftKey ? supprimer : conserver;
            if (document.activeElement === cible) { event.preventDefault(); (event.shiftKey ? conserver : supprimer).focus(); }
          }
        };
        document.addEventListener("keydown", gererClavier);
        conserver.addEventListener("click", () => terminer(false), { once: true });
        supprimer.addEventListener("click", () => terminer(true), { once: true });
        dialogue.addEventListener("click", event => { if (event.target === dialogue) terminer(false); });
      });
    } catch (erreur) {
      conteneur?.remove();
      if (focusInitial?.isConnected && typeof focusInitial.focus === "function") focusInitial.focus();
      console.error("Confirmation de suppression indisponible :", erreur);
      return false;
    }
  }

  async function supprimerAbonnement(form) {
    if (modeEdition !== "update" || !abonnementCourant?.idprixabo) return;
    const idprixabo = String(abonnementCourant.idprixabo).trim();
    const nom = String(abonnementCourant.nomabo || abonnementCourant.typeabo || "").trim();
    if (!await confirmerSuppressionAbonnement(nom)) return;

    const bouton = form.querySelector("#lcdp-prixabo-supprimer");
    if (bouton) bouton.disabled = true;
    try {
      const response = await fetch(endpointAboAdmin() + "/abonnement", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", idprixabo })
      });
      const data = await response.json().catch(() => null);
      gererStatutAcces(response, data);
      if (!response.ok || !data || data.success !== true) {
        throw new Error(data?.message || data?.detail || "Suppression non prise en charge par le Worker Admin.");
      }
      fermerEdition();
      await window.LCDP_TABLE_LECTURE_ADMIN?.recharger(TABLE_SLOT_ID);
    } catch (error) {
      await afficherAlerte(String(error?.message || error || "Suppression impossible."));
    } finally {
      if (bouton?.isConnected) bouton.disabled = false;
    }
  }

  function ordonnerChampsSelonTable(champs) {
    let ordre = [];
    try {
      const valeur = JSON.parse(window.localStorage.getItem("lcdp-admin-columns:prixabo") || "[]");
      if (Array.isArray(valeur)) ordre = valeur.filter(cle => typeof cle === "string");
    } catch (_) { /* L'ordre standard reste disponible. */ }
    if (!ordre.length) return champs;
    const position = new Map(ordre.map((cle, index) => [cle, index]));
    return [...champs].sort((a, b) => {
      const ia = position.has(a.name) ? position.get(a.name) : Infinity;
      const ib = position.has(b.name) ? position.get(b.name) : Infinity;
      return ia - ib;
    });
  }

  function construireChamps(abonnement) {
    const champType = modeEdition === "create"
      ? {
          name: "typeabo",
          label: "Type d'abonnement",
          type: "text",
          value: abonnement.typeabo,
          required: true,
          validationNative: true
        }
      : {
          name: "typeabo",
          label: "Type d'abonnement",
          type: "text",
          value: abonnement.typeabo,
          readonly: true
        };

    const champs = [
      champType,
      {
        name: "nomabo",
        label: "Nom commercial",
        type: "text",
        value: abonnement.nomabo || "",
        required: true,
        validationNative: true
      },
      {
        name: "variables",
        label: "Variables",
        type: "text",
        value: abonnement.variables ?? "",
        required: false
      },
      {
        name: "datedebut",
        label: "Date de début de commercialisation (facultative)",
        type: "date",
        value: String(abonnement.datedebut || "").slice(0, 10),
        required: false,
        validationNative: true
      },
      {
        name: "datefin",
        label: "Date de fin de commercialisation (facultative)",
        type: "date",
        value: String(abonnement.datefin || "").slice(0, 10),
        required: false
      },
      champMontant("prixabottc", "Prix total TTC", abonnement.prixabottc, true, 0.01),
      champMontant("maxduo", "MaxDuo", abonnement.maxduo, true, 0),
      champMontant("duoplus", "Duo+", abonnement.duoplus, true, 0),
      champMontant("freqduoplus", "Fréquence Duo+", abonnement.freqduoplus, true, 0),
      champMontant("famille", "Famille", abonnement.famille, true, 0),
      champMontant("coach", "Coach", abonnement.coach, true, 0),
      champMontant("maxcoach", "MaxCoach", abonnement.maxcoach, true, 0),
      champMontant("remise", "Remise", abonnement.remise, true, 0),
      {
        name: "typmb",
        label: "TypMb",
        type: "select",
        value: abonnement.typmb ?? "",
        required: true,
        validationNative: true,
        options: [
          { value: "", label: "Sélectionner" },
          { value: "DUO", label: "DUO" },
          { value: "FAMILLE", label: "FAMILLE" },
          { value: "COACH", label: "COACH" }
        ]
      },
      champMontant("txtvafr", "Taux de TVA (%)", abonnement.txtvafr, true, 0),
      {
        name: "ech",
        label: "Nombre d'échéances",
        type: "select",
        value: abonnement.ech ?? "",
        required: true,
        validationNative: true,
        options: [
          { value: "", label: "Non renseigné" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" }
        ]
      },
      champMontant("mois1", "Mois 1", abonnement.mois1, true, 0),
      champMontant("mois2", "Mois 2", abonnement.mois2, true, 0),
      champMontant("mois3", "Mois 3", abonnement.mois3, true, 0),
      champMontant("valvrmt", "Valeur de versement", abonnement.valvrmt, true, 0),
      champMontant("1xval", "Valeur 1×", abonnement["1xval"], true, 0)
    ];

    if (modeEdition === "update") {
      champs.push({
        name: "datecreation",
        label: "Date de création",
        type: "text",
        value: formaterDateHeure(abonnement.datecreation),
        readonly: true
      });
    }

    return champs;
  }

  function champMontant(name, label, value, required, min) {
    return {
      name,
      label,
      type: "number",
      value: value ?? "",
      min,
      step: "0.01",
      required,
      validationNative: true
    };
  }

  async function enregistrerAbonnement(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const boutonEnregistrer = form.querySelector("#lcdp-prixabo-enregistrer");
    const boutonRetour = form.querySelector("#lcdp-prixabo-retour");
    const note = form.querySelector("[data-lcdp-formulaire-note]");

    if (!form.reportValidity()) return;

    const abonnement = construirePayload(form);
    const total = abonnement.mois1 + abonnement.mois2 + abonnement.mois3;
    if (Math.round(total * 100) !== Math.round(abonnement.prixabottc * 100)) {
      await afficherAlerte("Le total des mois 1, 2 et 3 doit être exactement égal au prix TTC de l’abonnement.");
      return;
    }
    if ((abonnement.ech === 1 && (abonnement.mois2 !== 0 || abonnement.mois3 !== 0)) ||
        (abonnement.ech === 2 && abonnement.mois3 !== 0)) {
      await afficherAlerte("Échéances incohérentes : avec 1 échéance, mois 2 et mois 3 doivent être à 0 ; avec 2 échéances, mois 3 doit être à 0.");
      return;
    }
    boutonEnregistrer.disabled = true;
    boutonRetour.disabled = true;
    afficherNote(note, "Enregistrement en cours…", "");

    try {
      const response = await fetch(endpointAboAdmin() + "/abonnement", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: modeEdition,
          idprixabo: modeEdition === "update" ? abonnementCourant?.idprixabo : undefined,
          abonnement
        })
      });

      const data = await response.json().catch(() => null);
      gererStatutAcces(response, data);

      if (!response.ok || !data || data.success !== true) {
        throw new Error(
          data?.message || data?.detail || "Échec de l'enregistrement."
        );
      }

      await afficherAlerte(
        modeEdition === "create"
          ? "Abonnement ajouté."
          : "Abonnement modifié."
      );

      fermerEdition();
      await window.LCDP_TABLE_LECTURE_ADMIN?.recharger(TABLE_SLOT_ID);
    } catch (error) {
      boutonEnregistrer.disabled = false;
      boutonRetour.disabled = false;
      const message = String(
        error?.message || error || "Erreur d'enregistrement."
      );
      afficherNote(note, message, "error");
      await afficherAlerte(message);
    }
  }

  function construirePayload(form) {
    const lireNombre = (name, nullable = true) => {
      const controle = form.elements.namedItem(name);
      const texte = String(controle?.value || "").trim();
      if (!texte && nullable) return null;
      return Number(texte);
    };

    const echTexte = String(form.elements.namedItem("ech")?.value || "").trim();

    return {
      typeabo: String(form.elements.namedItem("typeabo")?.value || "").trim(),
      nomabo: String(form.elements.namedItem("nomabo")?.value || "").trim(),
      variables: String(form.elements.namedItem("variables")?.value || ""),
      datedebut: String(form.elements.namedItem("datedebut")?.value || "").trim(),
      datefin: String(form.elements.namedItem("datefin")?.value || "").trim() || null,
      maxduo: lireNombre("maxduo", false),
      duoplus: lireNombre("duoplus", false),
      freqduoplus: lireNombre("freqduoplus", false),
      famille: lireNombre("famille", false),
      coach: lireNombre("coach", false),
      maxcoach: lireNombre("maxcoach", false),
      remise: lireNombre("remise", false),
      prixabottc: lireNombre("prixabottc", false),
      typmb: String(form.elements.namedItem("typmb")?.value || "").trim(),
      txtvafr: lireNombre("txtvafr", false),
      ech: echTexte ? Number(echTexte) : null,
      mois1: lireNombre("mois1"),
      mois2: lireNombre("mois2"),
      mois3: lireNombre("mois3"),
      valvrmt: lireNombre("valvrmt"),
      "1xval": lireNombre("1xval")
    };
  }

  function fermerEdition() {
    const tableSlot = document.getElementById(TABLE_SLOT_ID);
    const editionSlot = document.getElementById(EDITION_SLOT_ID);
    const boutonAjouter = document.getElementById("lcdp-prixabo-ajouter");

    abonnementCourant = null;
    modeEdition = "";
    editionSlot.innerHTML = "";
    editionSlot.hidden = true;
    tableSlot.hidden = false;
    boutonAjouter.hidden = false;
    tableSlot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function afficherNote(note, texte, etat) {
    if (!note) return;
    note.textContent = texte;
    note.hidden = !texte;
    note.dataset.state = etat || "";
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;

    slot.innerHTML = "";
    slot.appendChild(await chargerFragment(
      urlObjet("/HTMLBASE/02-alerte.html"),
      "AlertBox"
    ));

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const fermer = slot.querySelector("[data-lcdp-alerte-close]");
    const ok = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !ok) {
      slot.innerHTML = "";
      window.alert(message || "");
      return true;
    }

    texte.textContent = message || "";

    return new Promise((resolve) => {
      let termine = false;

      function terminer() {
        if (termine) return;
        termine = true;
        slot.innerHTML = "";
        resolve(true);
      }

      fermer?.addEventListener("click", terminer, { once: true });
      ok.addEventListener("click", terminer, { once: true });
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) terminer();
      });
    });
  }

  function formaterDateHeure(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function gererStatutAcces(response, data) {
    if (response.status !== 401 && response.status !== 403) return;

    if (response.status === 401) {
      redirigerConnexion();
      throw new Error("Session administrateur inactive.");
    }

    throw new Error(data?.message || "Droits administrateur insuffisants.");
  }

  function redirigerConnexion() {
    if (typeof config.adminUrl === "function") {
      window.location.replace(config.adminUrl(PAGE_CONNEXION));
      return;
    }

    window.location.replace(urlAdmin(PAGE_CONNEXION));
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

    document.getElementById("lcdp-prixabo-ajouter")
      ?.addEventListener("click", () => {
        ouvrirAjout().catch(async (error) => {
          console.error(error);
          await afficherAlerte(String(error?.message || error || "Erreur."));
        });
      });

    await Promise.all([
      initialiserBandeau(),
      initialiserMenuGauche(),
      initialiserTable()
    ]);

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
  }

  initialiserPage().catch(async (error) => {
    console.error(error);
    await afficherAlerte(
      String(error?.message || error || "Erreur de chargement.")
    );
  });
})();
