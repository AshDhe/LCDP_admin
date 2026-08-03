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

    await chargerScriptAdminUneFois(
      "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js?v=20260802-1359"
    );

    const table = window.LCDP_TABLE_LECTURE_ADMIN;

    if (!table || typeof table.initialiser !== "function") {
      throw new Error("Objet table lecture admin indisponible.");
    }

    await table.initialiser({
      slotId: TABLE_SLOT_ID,
      endpoint,
      resource: "prixabo",
      pageSize: 50,
      initialSortKey: "typeabo",
      initialSortDirection: "asc",
      interactiveColumns: ["typeabo"],
      interactiveLabel: "Modifier l'abonnement",
      onCellActivate: ({ row }) => ouvrirModification(row)
    });
  }

  async function ouvrirModification(row) {
    const typeabo = String(row?.typeabo || "").trim();
    if (!typeabo) throw new Error("Type d'abonnement absent.");

    const endpoint = endpointAboAdmin();
    const requestUrl = new URL(endpoint + "/abonnement");
    requestUrl.searchParams.set("typeabo", typeabo);

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
    const endpoint = endpointAboAdmin();
    const response = await fetch(endpoint + "/options", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    const data = await response.json().catch(() => null);
    gererStatutAcces(response, data);

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message || data?.detail || "Impossible de préparer l'ajout."
      );
    }

    const disponibles = Array.isArray(data.disponibles)
      ? data.disponibles
      : [];

    if (disponibles.length < 1) {
      await afficherAlerte("Tous les types d'abonnement autorisés existent déjà.");
      return;
    }

    modeEdition = "create";
    abonnementCourant = {
      typeabo: disponibles[0],
      prixabottc: "",
      txtvafr: 20,
      ech: "",
      mois1: "",
      mois2: "",
      mois3: "",
      valvrmt: "",
      "1xval": "",
      datecreation: ""
    };

    await rendreFormulaire(abonnementCourant, disponibles);
  }

  async function rendreFormulaire(abonnement, codesDisponibles = []) {
    await chargerScriptObjetUneFois("/BOX/03-box-formulaire.js");

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
      champs: construireChamps(abonnement, codesDisponibles),
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
        }
      ],
      noteHtml: ""
    });

    if (!form) throw new Error("Formulaire PrixAbo non créé.");

    form.addEventListener("submit", enregistrerAbonnement);
    form.querySelector("#lcdp-prixabo-retour")
      ?.addEventListener("click", fermerEdition);

    editionSlot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function construireChamps(abonnement, codesDisponibles) {
    const champType = modeEdition === "create"
      ? {
          name: "typeabo",
          label: "Type d'abonnement",
          type: "select",
          value: abonnement.typeabo,
          required: true,
          validationNative: true,
          options: codesDisponibles.map((code) => ({
            value: code,
            label: code
          }))
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
      champMontant("prixabottc", "Prix total TTC", abonnement.prixabottc, true, 0.01),
      champMontant("txtvafr", "Taux de TVA (%)", abonnement.txtvafr, true, 0),
      {
        name: "ech",
        label: "Nombre d'échéances",
        type: "select",
        value: abonnement.ech ?? "",
        options: [
          { value: "", label: "Non renseigné" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" }
        ]
      },
      champMontant("mois1", "Mois 1", abonnement.mois1, false, 0.01),
      champMontant("mois2", "Mois 2", abonnement.mois2, false, 0.01),
      champMontant("mois3", "Mois 3", abonnement.mois3, false, 0.01),
      champMontant("valvrmt", "Valeur de versement", abonnement.valvrmt, false, 0),
      champMontant("1xval", "Valeur 1×", abonnement["1xval"], false, 0)
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
      prixabottc: lireNombre("prixabottc", false),
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
      urlObjet("/BOX/02-box-alerte.html"),
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
