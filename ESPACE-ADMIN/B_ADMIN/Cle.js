(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const ONGLET_SLOT_ID = "lcdp-cle-onglets-slot";
  const PAGE_CONNEXION = "/ESPACE-ADMIN/connexion-admin.html";

  const CONTEXTES = Object.freeze({
    parcs: {
      key: "parcs",
      label: "Parcs",
      resource: "cle-parcs",
      tableSlotId: "lcdp-cle-parcs-table-slot",
      editionSlotId: "lcdp-cle-parcs-edition-slot",
      actionsId: "lcdp-cle-parcs-actions",
      ajouterId: "lcdp-cle-parcs-ajouter",
      codeKey: "cle",
      codeLabel: "Clé",
      idKey: "idcleparc",
      path: "/cle-parc",
      optionPath: "/options/parcs",
      optionKey: "idparc",
      optionLabel: "Parc",
      boutonAjouter: "Ajouter une clé"
    },
    membres: {
      key: "membres",
      label: "Membres",
      resource: "cle-membres",
      tableSlotId: "lcdp-cle-membres-table-slot",
      editionSlotId: "lcdp-cle-membres-edition-slot",
      actionsId: "lcdp-cle-membres-actions",
      ajouterId: "lcdp-cle-membres-ajouter",
      codeKey: "brac",
      codeLabel: "Brac",
      idKey: "idclemembre",
      path: "/cle-membre",
      optionPath: "/options/membres",
      optionKey: "idmembre",
      optionLabel: "Membre",
      boutonAjouter: "Ajouter un Brac"
    },
    bluetooth: {
      key: "bluetooth",
      label: "Clés Bluetooth",
      resource: "cles-bluetooth",
      tableSlotId: "lcdp-cle-bluetooth-table-slot",
      editionSlotId: "lcdp-cle-bluetooth-edition-slot",
      actionsId: "lcdp-cle-bluetooth-actions",
      ajouterId: "lcdp-cle-bluetooth-ajouter",
      codeKey: "nomble",
      codeLabel: "Clé Bluetooth",
      idKey: "idclebluetooth",
      path: "/cle-bluetooth",
      optionPath: "/options/bracelets",
      optionKey: "idbracelet",
      optionLabel: "Bracelet",
      boutonAjouter: "Ajouter une clé Bluetooth"
    }
  });

  let contexteEdition = null;
  let ligneEdition = null;
  let modeEdition = "";
  const cacheOptions = new Map();

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

  function endpointCleAdmin() {
    const configure =
      config.workerAdminCleUrl ||
      config.WORKER_ADMIN_CLE_URL ||
      window.ADMIN_CONFIG?.API_ADMIN_CLE ||
      "";

    if (configure) {
      return String(configure).replace(/\/+$/, "");
    }

    if (typeof config.apiUrl === "function") {
      const viaApi = config.apiUrl("admin-cle-api");

      if (viaApi) {
        return String(viaApi).replace(/\/+$/, "");
      }
    }

    return "https://admin-cle-api.lacleduparc.fr";
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
    slot.appendChild(
      await chargerFragmentAdmin(
        "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
      )
    );
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

  async function initialiserWraperOnglets() {
    const slot = document.getElementById(ONGLET_SLOT_ID);

    if (!slot) {
      throw new Error("Slot des onglets Clé introuvable.");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/05-wraper-onglets.html")
    );

    const racine = slot.querySelector("[data-lcdp-wraper-onglets]");

    if (!racine) {
      throw new Error("Objet onglets introuvable.");
    }

    configurerOnglets(racine);
    initialiserNavigationOnglets(racine);
    preparerContenuOnglets(racine);

    return racine;
  }

  function configurerOnglets(racine) {
    assurerTroisiemeOnglet(racine);

    const boutons = Array.from(
      racine.querySelectorAll("[data-lcdp-onglet]")
    );
    const panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    if (boutons.length < 4 || panneaux.length < 4) {
      throw new Error("Structure des onglets incomplète.");
    }

    racine.setAttribute("aria-label", "Administration des clés");
    racine.querySelector("[data-lcdp-wraper-onglets-navigation]")
      ?.setAttribute("aria-label", "Administration des clés");

    configurerOnglet(
      boutons[0],
      panneaux[0],
      "parcs",
      "Parcs",
      true
    );

    configurerOnglet(
      boutons[1],
      panneaux[1],
      "membres",
      "Membres",
      false
    );

    configurerOnglet(
      boutons[2],
      panneaux[2],
      "bluetooth",
      "Clés Bluetooth",
      false
    );
    configurerOnglet(boutons[3],panneaux[3],"suivi","Présence et fréquences",false);
  }

  function assurerTroisiemeOnglet(racine) {
    let boutons = Array.from(
      racine.querySelectorAll("[data-lcdp-onglet]")
    );
    let panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    if (boutons.length >= 4 && panneaux.length >= 4) {
      return;
    }

    if (boutons.length < 1 || panneaux.length < 1) {
      throw new Error("Structure des onglets incomplète.");
    }

    const modeleBouton = boutons[boutons.length - 1];
    const modelePanneau = panneaux[panneaux.length - 1];
    const parentBouton = modeleBouton.parentElement;
    const parentPanneau = modelePanneau.parentElement;

    if (!parentBouton || !parentPanneau) {
      throw new Error("Structure des onglets incomplète.");
    }

    while (boutons.length < 4) {
      const bouton = modeleBouton.cloneNode(true);
      bouton.removeAttribute("id");
      bouton.removeAttribute("aria-controls");
      bouton.removeAttribute("aria-selected");
      bouton.removeAttribute("tabindex");
      parentBouton.appendChild(bouton);
      boutons.push(bouton);
    }

    while (panneaux.length < 4) {
      const panneau = modelePanneau.cloneNode(true);
      panneau.removeAttribute("id");
      panneau.removeAttribute("aria-labelledby");
      panneau.hidden = true;
      parentPanneau.appendChild(panneau);
      panneaux.push(panneau);
    }
  }

  function configurerOnglet(bouton, panneau, key, label, actif) {
    const idBouton = "lcdp-cle-tab-" + key;
    const idPanneau = "lcdp-cle-onglet-" + key;
    const contenu = panneau.querySelector("[data-lcdp-contenu-onglet]");

    bouton.id = idBouton;
    bouton.textContent = label;
    bouton.dataset.lcdpOnglet = key;
    bouton.setAttribute("aria-controls", idPanneau);
    bouton.setAttribute("aria-selected", String(actif));
    bouton.tabIndex = actif ? 0 : -1;

    panneau.id = idPanneau;
    panneau.dataset.lcdpPanneauOnglet = key;
    panneau.setAttribute("aria-labelledby", idBouton);
    panneau.hidden = !actif;

    if (contenu) {
      contenu.dataset.lcdpContenuOnglet = key;
    }
  }

  function initialiserNavigationOnglets(racine) {
    const boutons = Array.from(
      racine.querySelectorAll("[data-lcdp-onglet]")
    );
    const panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    boutons.forEach((bouton) => {
      bouton.addEventListener("click", () => {
        activerOnglet(
          bouton.dataset.lcdpOnglet,
          boutons,
          panneaux
        );
      });

      bouton.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
          return;
        }

        event.preventDefault();

        const index = boutons.indexOf(bouton);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const prochain = boutons[
          (index + direction + boutons.length) % boutons.length
        ];

        prochain.click();
        prochain.focus();
      });
    });
  }

  function activerOnglet(nom, boutons, panneaux) {
    boutons.forEach((bouton) => {
      const actif = bouton.dataset.lcdpOnglet === nom;
      bouton.setAttribute("aria-selected", String(actif));
      bouton.tabIndex = actif ? 0 : -1;
    });

    panneaux.forEach((panneau) => {
      panneau.hidden =
        panneau.dataset.lcdpPanneauOnglet !== nom;
    });
  }

  function preparerContenuOnglets(racine) {
    Object.values(CONTEXTES).forEach((contexte) => {
      const zone = racine.querySelector(
        `[data-lcdp-contenu-onglet="${contexte.key}"]`
      );

      if (!zone) {
        throw new Error(
          "Zone de contenu introuvable : " + contexte.key
        );
      }

      zone.innerHTML = "";

      const actions = document.createElement("div");
      actions.id = contexte.actionsId;
      actions.className = "lcdp-cle-admin__barre-actions";

      const ajouter = document.createElement("button");
      ajouter.type = "button";
      ajouter.className = "lcdp-button lcdp-button-orange";
      ajouter.id = contexte.ajouterId;
      ajouter.textContent = contexte.boutonAjouter;
      ajouter.addEventListener("click", () => {
        ouvrirCreation(contexte).catch(gererErreurPage);
      });

      const tableSlot = document.createElement("div");
      tableSlot.id = contexte.tableSlotId;
      tableSlot.className = "lcdp-cle-admin__table";

      const editionSlot = document.createElement("div");
      editionSlot.id = contexte.editionSlotId;
      editionSlot.className = "lcdp-cle-admin__edition";
      editionSlot.hidden = true;

      actions.appendChild(ajouter);
      zone.appendChild(actions);
      zone.appendChild(tableSlot);
      zone.appendChild(editionSlot);
    });
  }

  async function initialiserTables() {
    await chargerScriptAdminUneFois(
      "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js"
    );

    const table = window.LCDP_TABLE_LECTURE_ADMIN;

    if (!table || typeof table.initialiser !== "function") {
      throw new Error("Objet table lecture admin indisponible.");
    }

    for (const contexte of Object.values(CONTEXTES)) {
      const slot = document.getElementById(contexte.tableSlotId);

      if (!slot) {
        throw new Error(
          "Slot de table introuvable : " + contexte.tableSlotId
        );
      }

      slot.innerHTML = "";
      slot.appendChild(
        await chargerFragmentAdmin(
          "/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.html"
        )
      );

      await table.initialiser({
        slotId: contexte.tableSlotId,
        endpoint: endpointCleAdmin(),
        resource: contexte.resource,
        pageSize: 100,
        initialSortKey:
          contexte.key === "parcs"
            ? "dptmt"
            : contexte.key === "membres"
              ? "nom"
              : "brac",
        initialSortDirection: "asc",
        interactiveColumns: [contexte.codeKey],
        interactiveLabel: "Modifier " + contexte.codeLabel,
        interactiveLabels: {
          [contexte.codeKey]:
            "Modifier ou supprimer " + contexte.codeLabel
        },
        onCellActivate: ({ row }) => {
          return ouvrirEdition(contexte, row);
        }
      });
    }
  }

  async function appelerCle(path, options = {}) {
    const endpoint = endpointCleAdmin();

    if (!endpoint) {
      throw new Error("Endpoint admin-cle-api non configuré.");
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
        "Impossible de joindre admin-cle-api.lacleduparc.fr."
      );
    }

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      redirigerConnexion();
      throw new Error("Session administrateur expirée.");
    }

    if (response.status === 403) {
      throw new Error(
        data?.message || "Permission administrateur insuffisante."
      );
    }

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "Réponse du worker Clé inexploitable."
      );
    }

    return data;
  }

  async function ouvrirCreation(contexte) {
    contexteEdition = contexte;
    ligneEdition = null;
    modeEdition = "create";

    afficherZoneEdition(contexte);

    try {
      const options = await chargerOptions(contexte);
      await rendreFormulaire(contexte, construireLigneVide(contexte), options);
    } catch (error) {
      afficherErreurEdition(contexte, error);
    }
  }

  async function ouvrirEdition(contexte, row) {
    const identifiant = String(row?.[contexte.idKey] || "").trim();

    if (!identifiant) {
      throw new Error("Identifiant absent.");
    }

    contexteEdition = contexte;
    ligneEdition = null;
    modeEdition = "update";

    afficherZoneEdition(contexte, "Chargement…");

    try {
      const [data, options] = await Promise.all([
        appelerCle(
          contexte.path +
          "?" +
          encodeURIComponent(contexte.idKey) +
          "=" +
          encodeURIComponent(identifiant)
        ),
        chargerOptions(contexte)
      ]);

      ligneEdition = data.item || null;

      if (!ligneEdition) {
        throw new Error("Entrée introuvable.");
      }

      await rendreFormulaire(contexte, ligneEdition, options);
    } catch (error) {
      afficherErreurEdition(contexte, error);
    }
  }

  function construireLigneVide(contexte) {
    if (contexte.key === "parcs") {
      return {
        idparc: "",
        cle: "",
        active: false,
        instal: "",
        datemaj: ""
      };
    }

    if (contexte.key === "membres") {
      return {
        idmembre: "",
        brac: "",
        serial: "",
        brightd: 58,
        actif: false,
        date: "",
        datemaj: ""
      };
    }

    return {
      idbracelet: "",
      nomble: "",
      actif: false,
      datemaj: ""
    };
  }

  async function chargerOptions(contexte) {
    if (cacheOptions.has(contexte.key)) {
      return cacheOptions.get(contexte.key);
    }

    const data = await appelerCle(contexte.optionPath);
    const options = Array.isArray(data.options)
      ? data.options
      : [];

    cacheOptions.set(contexte.key, options);
    return options;
  }

  function afficherZoneEdition(contexte, message = "") {
    const tableSlot = document.getElementById(contexte.tableSlotId);
    const editionSlot = document.getElementById(contexte.editionSlotId);
    const actions = document.getElementById(contexte.actionsId);

    tableSlot.hidden = true;
    actions.hidden = true;
    editionSlot.hidden = false;
    editionSlot.innerHTML = "";

    if (message) {
      const p = document.createElement("p");
      p.className = "lcdp-cle-admin__chargement";
      p.textContent = message;
      editionSlot.appendChild(p);
    }
  }

  function afficherErreurEdition(contexte, error) {
    const editionSlot = document.getElementById(contexte.editionSlotId);

    editionSlot.innerHTML = "";

    const message = document.createElement("p");
    message.className = "lcdp-cle-admin__chargement";
    message.textContent = String(
      error?.message || error || "Erreur de chargement."
    );

    const retour = document.createElement("button");
    retour.type = "button";
    retour.className = "lcdp-button lcdp-button-secondary";
    retour.textContent = "Retour à la liste";
    retour.addEventListener("click", () => fermerEdition(contexte));

    editionSlot.appendChild(message);
    editionSlot.appendChild(retour);
  }

  async function rendreFormulaire(contexte, item, options) {
    await chargerScriptObjetUneFois("/BOX/03-box-formulaire.js");

    if (typeof window.LCDP_creerFormulaire !== "function") {
      throw new Error("Objet formulaire indisponible.");
    }

    const boutons = [
      {
        id: "lcdp-cle-enregistrer",
        type: "submit",
        style: "lcdp-button-orange",
        label: modeEdition === "create"
          ? "Ajouter"
          : "Enregistrer"
      }
    ];

    if (modeEdition === "update") {
      boutons.push({
        id: "lcdp-cle-supprimer",
        type: "button",
        style: "lcdp-button-orange",
        label: "Supprimer"
      });
    }

    boutons.push({
      id: "lcdp-cle-retour",
      type: "button",
      style: "lcdp-button-secondary",
      label: "Retour à la liste"
    });

    const form = await window.LCDP_creerFormulaire(
      contexte.editionSlotId,
      {
        id: "lcdp-cle-form",
        ariaLabel:
          (modeEdition === "create" ? "Ajouter " : "Modifier ") +
          contexte.codeLabel,
        titre:
          modeEdition === "create"
            ? contexte.boutonAjouter
            : "Modifier " + contexte.codeLabel,
        sousTitre:
          modeEdition === "update"
            ? String(item?.[contexte.codeKey] || "")
            : "",
        validationNative: true,
        champs: construireChamps(contexte, item, options),
        boutons,
        noteHtml: ""
      }
    );

    if (!form) {
      throw new Error("Formulaire Clé non créé.");
    }

    form.addEventListener("submit", enregistrer);
    if(contexte.key==="membres" && modeEdition==="update"){
      const preparer=document.createElement("button");preparer.type="button";preparer.className="lcdp-button lcdp-button-secondary";preparer.textContent="Générer le secret du bracelet Wi-Fi";
      const note=document.createElement("p");note.textContent="Cette action remplace le secret de connexion précédent du bracelet. Elle ne change pas son mot de passe Wi-Fi.";
      form.append(note,preparer);
      preparer.addEventListener("click",async()=>{
        preparer.disabled=true;
        try{
          const base=String(config.workerLaCleDuParcUrl || config.WORKER_LA_CLE_DU_PARC_URL || config.W_LA_CLE_DU_PARC_URL || (typeof config.apiUrl==="function"?config.apiUrl("w-la-cle-du-parc-api"):"")).replace(/\/+$/,"");
          if(!base)throw Error("Endpoint Ma clé non configuré dans le config admin.");
          const r=await fetch(base+"/bracelet/enroll",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({idclemembre:Number(item.idclemembre)})});const d=await r.json();
          if(!r.ok || !d.success)throw Error(d.message || "Génération refusée.");
          const sortie=document.createElement("textarea");sortie.readOnly=true;sortie.setAttribute("aria-label","Configuration privée du bracelet");sortie.rows=6;sortie.style.width="100%";sortie.value=JSON.stringify({apiBase:base,idbracelet:d.idbracelet,deviceToken:d.deviceToken},null,2);form.appendChild(sortie);sortie.select();preparer.remove();note.textContent="Copiez cette configuration privée pour programmer l’Atom Lite. Le secret ne sera pas réaffiché après fermeture.";
        }catch(e){await afficherAlerte(e.message);preparer.disabled=false;}
      });
    }


    if (contexte.key === "bluetooth") {
      initialiserNomBleDepuisBracelet(form, options);
    }

    form.querySelector("#lcdp-cle-retour")
      ?.addEventListener(
        "click",
        () => fermerEdition(contexte)
      );
    form.querySelector("#lcdp-cle-supprimer")
      ?.addEventListener(
        "click",
        supprimer
      );

    document.getElementById(contexte.editionSlotId)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }

  function construireChamps(contexte, item, options) {
    const optionsSelect = [
      { value: "", label: "Sélectionner" },
      ...options.map((option) => ({
        value: String(option.value || ""),
        label: String(option.label || "")
      }))
    ];

    if (contexte.key === "parcs") {
      return [
        {
          name: "idparc",
          label: "Parc",
          type: "select",
          value: item?.idparc || "",
          options: optionsSelect,
          required: true,
          validationNative: true
        },
        {
          name: "cle",
          label: "Clé",
          type: "text",
          value: item?.cle || "",
          required: true,
          validationNative: true,
          maxlength: 100
        },
        {
          name: "active",
          label: "Active",
          type: "checkbox",
          checked: item?.active === true,
          checkboxLabel: "Clé active"
        },
        {
          name: "instal",
          label: "Instal",
          type: "date",
          value: item?.instal || "",
          required: true,
          validationNative: true
        }
      ];
    }

    if (contexte.key === "bluetooth") {
      return [
        {
          name: "idbracelet",
          label: "Bracelet",
          type: "select",
          value: item?.idbracelet || "",
          options: optionsSelect,
          required: true,
          validationNative: true
        },
        {
          name: "nomble",
          label: "Nom BLE",
          type: "text",
          value: item?.nomble || "",
          required: true,
          validationNative: true,
          maxlength: 100
        },
        {
          name: "actif",
          label: "Actif",
          type: "checkbox",
          checked: item?.actif === true,
          checkboxLabel: "Clé Bluetooth active"
        }
      ];
    }

    return [
      {
        name: "idmembre",
        label: "Membre",
        type: "select",
        value: item?.idmembre || "",
        options: optionsSelect,
        required: true,
        validationNative: true
      },
      {
        name: "brac",
        label: "Brac",
        type: "text",
        value: item?.brac || "",
        required: true,
        validationNative: true,
        maxlength: 100
      },
      {
        name: "serial",
        label: "Serial",
        type: "text",
        value: item?.serial || "",
        required: false,
        validationNative: true,
        maxlength: 100
      },
      {
        name: "brightd",
        label: "Brightd",
        type: "number",
        value: Number(item?.brightd || 58),
        required: true,
        validationNative: true,
        min: 1
      },
      {
        name: "actif",
        label: "Actif",
        type: "checkbox",
        checked: item?.actif === true,
        checkboxLabel: "Brac actif"
      },
      {
        name: "date",
        label: "Date",
        type: "date",
        value: item?.date || "",
        required: true,
        validationNative: true
      }
    ];
  }

  function initialiserNomBleDepuisBracelet(form, options) {
    if (modeEdition !== "create") {
      return;
    }

    const selectBracelet =
      form.elements.namedItem("idbracelet");
    const champNomBle =
      form.elements.namedItem("nomble");

    if (!selectBracelet || !champNomBle) {
      return;
    }

    function proposerNom() {
      if (String(champNomBle.value || "").trim()) {
        return;
      }

      const option = options.find(
        (item) =>
          String(item?.value || "") ===
          String(selectBracelet.value || "")
      );

      const brac = String(option?.label || "").trim();

      if (brac) {
        champNomBle.value = "LCDP-" + brac;
      }
    }

    selectBracelet.addEventListener("change", proposerNom);
    proposerNom();
  }

  async function enregistrer(event) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!form.reportValidity() || !contexteEdition) {
      return;
    }

    const boutonEnregistrer =
      form.querySelector("#lcdp-cle-enregistrer");
    const boutonRetour =
      form.querySelector("#lcdp-cle-retour");
    const boutonSupprimer =
      form.querySelector("#lcdp-cle-supprimer");
    const note =
      form.querySelector("[data-lcdp-formulaire-note]");

    const item = lireValeursFormulaire(
      contexteEdition,
      form
    );

    verrouillerBoutons(
      boutonEnregistrer,
      boutonRetour,
      boutonSupprimer,
      true
    );
    afficherNote(note, "Enregistrement en cours…", "");

    try {
      const data = await appelerCle(
        contexteEdition.path,
        {
          method: modeEdition === "create" ? "POST" : "PATCH",
          body: {
            item,
            ...(modeEdition === "update"
              ? {
                  [contexteEdition.idKey]:
                    ligneEdition?.[contexteEdition.idKey],
                  originalDatemaj:
                    ligneEdition?.datemaj || ""
                }
              : {})
          }
        }
      );

      await afficherAlerte(
        data.message ||
        (modeEdition === "create"
          ? "Entrée ajoutée."
          : "Entrée modifiée.")
      );

      await fermerEdition(contexteEdition, true);
    } catch (error) {
      verrouillerBoutons(
        boutonEnregistrer,
        boutonRetour,
        boutonSupprimer,
        false
      );

      const message = String(
        error?.message || error || "Erreur d'enregistrement."
      );

      afficherNote(note, message, "error");
      await afficherAlerte(message);
    }
  }

  function lireValeursFormulaire(contexte, form) {
    if (contexte.key === "parcs") {
      return {
        idparc: String(
          form.elements.namedItem("idparc")?.value || ""
        ).trim(),
        cle: String(
          form.elements.namedItem("cle")?.value || ""
        ).trim(),
        active:
          form.elements.namedItem("active")?.checked === true,
        instal: String(
          form.elements.namedItem("instal")?.value || ""
        ).trim()
      };
    }

    if (contexte.key === "bluetooth") {
      return {
        idbracelet: String(
          form.elements.namedItem("idbracelet")?.value || ""
        ).trim(),
        nomble: String(
          form.elements.namedItem("nomble")?.value || ""
        ).trim(),
        actif:
          form.elements.namedItem("actif")?.checked === true
      };
    }

    return {
      idmembre: String(
        form.elements.namedItem("idmembre")?.value || ""
      ).trim(),
      brac: String(
        form.elements.namedItem("brac")?.value || ""
      ).trim(),
      serial: String(
        form.elements.namedItem("serial")?.value || ""
      ).trim(),
      brightd: Number(
        form.elements.namedItem("brightd")?.value || 58
      ),
      actif:
        form.elements.namedItem("actif")?.checked === true,
      date: String(
        form.elements.namedItem("date")?.value || ""
      ).trim()
    };
  }

  async function supprimer() {
    if (
      !contexteEdition ||
      !ligneEdition?.[contexteEdition.idKey] ||
      modeEdition !== "update"
    ) {
      return;
    }

    const confirme = await demanderConfirmationSuppression(
      contexteEdition.codeLabel
    );

    if (!confirme) {
      return;
    }

    const form = document.getElementById("lcdp-cle-form");
    const boutons = form
      ? Array.from(form.querySelectorAll("button"))
      : [];

    boutons.forEach((bouton) => {
      bouton.disabled = true;
    });

    try {
      const query =
        "?" +
        encodeURIComponent(contexteEdition.idKey) +
        "=" +
        encodeURIComponent(
          ligneEdition[contexteEdition.idKey]
        );

      const data = await appelerCle(
        contexteEdition.path + query,
        {
          method: "DELETE",
          body: {
            originalDatemaj:
              ligneEdition?.datemaj || ""
          }
        }
      );

      await afficherAlerte(
        data.message || "Entrée supprimée."
      );
      await fermerEdition(contexteEdition, true);
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

  async function fermerEdition(contexte, recharger = false) {
    const tableSlot = document.getElementById(contexte.tableSlotId);
    const editionSlot = document.getElementById(contexte.editionSlotId);
    const actions = document.getElementById(contexte.actionsId);

    editionSlot.innerHTML = "";
    editionSlot.hidden = true;
    tableSlot.hidden = false;
    actions.hidden = false;

    contexteEdition = null;
    ligneEdition = null;
    modeEdition = "";

    if (recharger) {
      await window.LCDP_TABLE_LECTURE_ADMIN
        ?.recharger(contexte.tableSlotId);
    }

    tableSlot.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function verrouillerBoutons(
    enregistrer,
    retour,
    supprimer,
    verrouille
  ) {
    if (enregistrer) enregistrer.disabled = verrouille;
    if (retour) retour.disabled = verrouille;
    if (supprimer) supprimer.disabled = verrouille;
  }

  function afficherNote(note, texte, etat) {
    if (!note) return;

    note.textContent = texte;
    note.hidden = !texte;
    note.dataset.state = etat || "";
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      window.alert(message || "");
      return true;
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/02-box-alerte.html")
    );

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

  async function demanderConfirmationSuppression(libelle) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      return window.confirm("Supprimer définitivement " + libelle + " ?");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html")
    );

    const dialogue = slot.querySelector(
      "[data-lcdp-box-dialogue-bouton]"
    );
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const fermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions) {
      slot.innerHTML = "";
      return window.confirm("Supprimer définitivement " + libelle + " ?");
    }

    titre.textContent = "Supprimer " + libelle;
    texte.textContent = "Cette suppression est définitive.";

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className = "lcdp-button lcdp-button-secondary";
    annuler.textContent = "Annuler";

    const confirmer = document.createElement("button");
    confirmer.type = "button";
    confirmer.className = "lcdp-button lcdp-button-orange";
    confirmer.textContent = "Supprimer";

    actions.appendChild(annuler);
    actions.appendChild(confirmer);

    return new Promise((resolve) => {
      let termine = false;

      function terminer(valeur) {
        if (termine) return;
        termine = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      annuler.addEventListener(
        "click",
        () => terminer(false),
        { once: true }
      );
      confirmer.addEventListener(
        "click",
        () => terminer(true),
        { once: true }
      );
      fermer?.addEventListener(
        "click",
        () => terminer(false),
        { once: true }
      );
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          terminer(false);
        }
      });
    });
  }

  function gererErreurPage(error) {
    console.error("Erreur page Clé admin :", error);
    afficherAlerte(
      String(error?.message || error || "Erreur.")
    ).catch(() => {});
  }

  function redirigerConnexion() {
    if (typeof config.adminUrl === "function") {
      window.location.replace(
        config.adminUrl(PAGE_CONNEXION)
      );
      return;
    }

    window.location.replace(urlAdmin(PAGE_CONNEXION));
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

  function elementSuivi(tag,texte,classe){const e=document.createElement(tag);if(texte!==undefined)e.textContent=texte;if(classe)e.className=classe;return e;}
  function baseSuivi(){const base=String(config.workerLaCleDuParcUrl || config.WORKER_LA_CLE_DU_PARC_URL || config.W_LA_CLE_DU_PARC_URL || (typeof config.apiUrl==="function"?config.apiUrl("w-la-cle-du-parc-api"):"")).replace(/\/+$/,"");if(!base)throw Error("Endpoint Ma clé non configuré dans le config admin.");return base;}
  async function appelSuivi(path,body){const r=await fetch(baseSuivi()+path,{method:body?"POST":"GET",credentials:"include",cache:"no-store",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok || !d.success)throw Error(d.message || "Suivi indisponible.");return d;}
  async function initialiserSuivi(page=0){
    const zone=document.querySelector('[data-lcdp-contenu-onglet="suivi"]');if(!zone)return;
    zone.replaceChildren();const statut=elementSuivi("p","Chargement du suivi…");statut.setAttribute("role","status");zone.append(statut);
    try{
      const d=await appelSuivi("/admin/monitor?page="+page);zone.replaceChildren();
      zone.append(elementSuivi("p","Réglages globaux, par parc et par bracelet. Les couleurs restent communes aux bracelets d’un même parc."));
      const avertissement=elementSuivi("p","Sans réponse du serveur, extinction après deux intervalles réseau + 5 secondes au maximum, et au plus tard à la fin du créneau connue du bracelet. Un check-out est reçu au prochain appel réseau.");zone.append(avertissement);
      function formulaire(type,id,values,effective){
        const form=elementSuivi("form",undefined,"lcdp-cle-suivi__form");
        const fields=type==="bracelet"?[["poll_secondes","Interrogation du bracelet (minutes)"]]:[["bracelet_secondes","Couleur (secondes)"],["image_secondes","Image (secondes)"],["poll_secondes","Interrogation du bracelet (minutes)"]];
        const inputs={};
        for(const [key,label] of fields){const l=elementSuivi("label",label),input=elementSuivi("input");input.type="number";input.step="1";input.min=key==="poll_secondes"?"5":"60";input.max=key==="poll_secondes"?"20":"86400";input.value=values?.[key]==null?"":key==="poll_secondes"?values[key]/60:values[key];input.required=type==="global";input.placeholder=type==="global"?"":"Hérité : "+((effective?.[key] ?? d.global[key])/(key==="poll_secondes"?60:1));l.append(input);form.append(l);inputs[key]=input;}
        const button=elementSuivi("button","Enregistrer","lcdp-button lcdp-button-orange");button.type="submit";const message=elementSuivi("p","");message.setAttribute("role","status");form.append(button,message);
        form.addEventListener("submit",async e=>{e.preventDefault();button.disabled=true;try{const values={};for(const [key,input] of Object.entries(inputs))values[key]=input.value===""?null:Number(input.value)*(key==="poll_secondes"?60:1);await appelSuivi("/admin/monitor/settings",{type,id,values});message.textContent="Réglages enregistrés. Ils s’appliquent au prochain contact de l’appareil.";}catch(error){message.textContent=error.message;}finally{button.disabled=false;}});return form;
      }
      const videoForm=elementSuivi("form",undefined,"lcdp-cle-suivi__form");
      const videoLabel=elementSuivi("label","Nombre de séquences vidéo à l’entrée"),videoSelect=elementSuivi("select");
      for(const [value,label] of [[1,"1 — Boîtier (4 s)"],[2,"2 — Boîtier (4 s), puis selfie et bracelet (6 s)"]]){const option=elementSuivi("option",label);option.value=String(value);videoSelect.append(option);}
      videoSelect.disabled=true;videoLabel.append(videoSelect);
      const videoSave=elementSuivi("button","Enregistrer","lcdp-button lcdp-button-orange");videoSave.type="submit";videoSave.disabled=true;
      const videoStatus=elementSuivi("p","Chargement…");videoStatus.setAttribute("role","status");
      videoForm.append(videoLabel,elementSuivi("p","En mode automatique, sans bracelet : une seule séquence. Un réglage individuel peut imposer une ou deux séquences. Check-out : une seule séquence. Les six secondes commencent une fois la caméra selfie prête, après appui sur le bouton selfie. Bracelet demandé pendant les trois dernières secondes."),videoSave,videoStatus);
      zone.append(elementSuivi("h2","Capture vidéo"),videoForm);
      try{const v=await appelSuivi("/admin/monitor/video");videoSelect.value=String(v.sequenceCount);videoSelect.disabled=false;videoSave.disabled=false;videoStatus.textContent="";}catch(e){videoStatus.textContent=e.message;}
      videoForm.addEventListener("submit",async e=>{e.preventDefault();videoSave.disabled=true;try{await appelSuivi("/admin/monitor/video",{sequenceCount:Number(videoSelect.value)});videoStatus.textContent="Enregistré. Applicable aux prochaines captures, y compris aux tests.";if(profilMembre.value)await chargerProfil();}catch(e){videoStatus.textContent=e.message;}finally{videoSave.disabled=false;}});
      const profilForm=elementSuivi("form",undefined,"lcdp-cle-suivi__form");
      const profilMembre=elementSuivi("select"),profilChoix=elementSuivi("select");
      const profilLabel=elementSuivi("label","Membre"),choixLabel=elementSuivi("label","Séquences à l’entrée");profilLabel.append(profilMembre);choixLabel.append(profilChoix);
      const vide=elementSuivi("option","Choisissez un membre");vide.value="";profilMembre.append(vide);
      for(const [value,label] of [[0,"Automatique"],[1,"Forcer 1"],[2,"Forcer 2"]]){const option=elementSuivi("option",label);option.value=String(value);profilChoix.append(option);}
      const profilSave=elementSuivi("button","Enregistrer pour ce membre","lcdp-button lcdp-button-orange");profilSave.type="submit";
      const profilStatus=elementSuivi("p","");profilStatus.setAttribute("role","status");profilChoix.disabled=true;profilSave.disabled=true;
      profilForm.append(profilLabel,choixLabel,elementSuivi("p","Automatique suit le réglage global et l’attribution d’un bracelet. Forcer 1 ou Forcer 2 est prioritaire, avec ou sans bracelet. Sans bracelet, le selfie ne demande pas de présenter un bracelet. La sortie reste sur une seule séquence."),profilSave,profilStatus);
      zone.append(elementSuivi("h2","Réglage vidéo par membre"),profilForm);
      let profilVersion=0;
      function resultatProfil(r){return (r.hasBracelet?"Bracelet actif attribué. ":"Sans bracelet actif. ")+"Entrée : "+r.effectiveSequenceCount+" séquence(s). Sortie : 1.";}
      async function chargerProfil(){
       const version=++profilVersion,id=profilMembre.value;profilChoix.disabled=true;profilSave.disabled=true;profilStatus.textContent="";if(!id)return;
       try{const r=await appelSuivi("/admin/monitor/video/member?member="+encodeURIComponent(id));if(version!==profilVersion)return;profilChoix.value=String(r.sequenceCount);profilStatus.textContent=resultatProfil(r);profilChoix.disabled=false;profilSave.disabled=false;}catch(e){if(version===profilVersion)profilStatus.textContent=e.message;}
      }
      profilMembre.addEventListener("change",chargerProfil);
      try{const r=await appelerCle("/options/membres");for(const m of r.options || []){const option=elementSuivi("option",m.label);option.value=m.value;profilMembre.append(option);}}catch(e){profilMembre.disabled=true;profilStatus.textContent=e.message;}
      profilForm.addEventListener("submit",async e=>{e.preventDefault();if(profilSave.disabled || !profilMembre.value)return;profilSave.disabled=true;profilMembre.disabled=true;profilChoix.disabled=true;try{const r=await appelSuivi("/admin/monitor/video/member",{memberId:profilMembre.value,sequenceCount:Number(profilChoix.value)});profilStatus.textContent="Enregistré. "+resultatProfil(r);}catch(e){profilStatus.textContent=e.message;}finally{profilMembre.disabled=false;profilChoix.disabled=false;profilSave.disabled=false;}});
      zone.append(elementSuivi("h2","Valeurs générales"),formulaire("global","",d.global,d.global));
      zone.append(elementSuivi("h2","Parcs"));
      const filtre=elementSuivi("input");filtre.type="search";filtre.placeholder="Rechercher un parc";filtre.setAttribute("aria-label","Rechercher un parc");zone.append(filtre);
      const cartes=[];
      for(const p of d.parks){const carte=elementSuivi("section",undefined,"lcdp-cle-suivi__carte");carte.append(elementSuivi("h3",p.nom));const heure=x=>new Date(x).toLocaleTimeString("fr-FR");carte.append(elementSuivi("p","Prochains tirages : couleur "+heure(p.nextColorAt)+", image "+heure(p.nextImageAt)+". Géolocalisation : "+(p.geoConfigured?"zone configurée":"position recueillie, sans rayon configuré")+"."));carte.append(formulaire("parc",p.idparc,p.overrides,p.effective));zone.append(carte);cartes.push([carte,String(p.nom || "").toLowerCase()]);}
      filtre.addEventListener("input",()=>cartes.forEach(([c,nom])=>{c.hidden=!nom.includes(filtre.value.toLowerCase());}));
      if(d.parksTruncated)zone.append(elementSuivi("p","Affichage limité à 1 000 parcs."));
      zone.append(elementSuivi("h2","Bracelets initialisés — page "+(page+1)));
      for(const b of d.devices){const carte=elementSuivi("section",undefined,"lcdp-cle-suivi__carte");carte.append(elementSuivi("h3",b.memberName+" — "+b.braceletName));carte.append(elementSuivi("p","Dernier contact : "+(b.dernier_contact?new Date(b.dernier_contact).toLocaleString("fr-FR"):"aucun")+". "+(b.online?"Contact récent":"Contact attendu ou appareil hors ligne")+". Dernière commande : "+(b.dernier_mode || "aucune")+(b.dernier_hex?" "+b.dernier_hex:"")+". "+(b.acknowledged?"Réception confirmée.":"Réception non confirmée.")));carte.append(formulaire("bracelet",b.idbracelet,{poll_secondes:b.poll_secondes},{poll_secondes:b.effectivePollSeconds ?? d.global.poll_secondes}));zone.append(carte);}
      const actions=elementSuivi("div",undefined,"lcdp-cle-admin__barre-actions");
      for(const [label,target] of [["Actualiser",page],...(page>0?[["Précédent",page-1]]:[]),...(d.hasMore?[["Suivant",page+1]]:[])]){const b=elementSuivi("button",label,"lcdp-button lcdp-button-orange");b.type="button";b.addEventListener("click",()=>initialiserSuivi(target));actions.append(b);}zone.append(actions);
    }catch(e){statut.textContent=e.message;}
  }

  async function initialiserPage() {
    const autorise = await verifierAcces();

    if (!autorise) return;

    await Promise.all([
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);

    await initialiserWraperOnglets();
    await initialiserTables();
    initialiserSuivi().catch(gererErreurPage);

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }
  }

  initialiserPage().catch(gererErreurPage);
})();
