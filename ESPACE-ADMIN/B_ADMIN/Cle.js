(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const ONGLET_SLOT_ID = "lcdp-cle-onglets-slot";
  const PAGE_CONNEXION = "/ESPACE-ADMIN/connexion-admin.html";

  const CONTEXTES = Object.freeze({
    parcs: {
      key: "parcs",
      label: "FixParc",
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
      boutonAjouter: "Ajouter un fix"
    },
    membres: {
      key: "membres",
      label: "Présence",
      resource: "cle-membres",
      tableSlotId: "lcdp-cle-membres-table-slot",
      editionSlotId: "lcdp-cle-membres-edition-slot",
      actionsId: "lcdp-cle-membres-actions",
      ajouterId: "lcdp-cle-membres-ajouter",
      codeKey: "brac",
      codeLabel: "Bracelet",
      idKey: "idclemembre",
      path: "/cle-membre",
      optionPath: "/options/membres",
      optionKey: "idmembre",
      optionLabel: "Membre",
      boutonAjouter: "Ajouter un bracelet"
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
      await chargerFragmentObjet("/HTMLBASE/05-wraper-onglets.html")
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

    if (boutons.length !== 3 || panneaux.length !== 3) {
      throw new Error("Structure des trois onglets incomplète.");
    }

    racine.setAttribute("aria-label", "Administration des clés");
    racine.querySelector("[data-lcdp-wraper-onglets-navigation]")
      ?.setAttribute("aria-label", "Administration des clés");

    configurerOnglet(
      boutons[0],
      panneaux[0],
      "parcs",
      "FixParc",
      true
    );

    configurerOnglet(
      boutons[1],
      panneaux[1],
      "membres",
      "Présence",
      false
    );

    configurerOnglet(
      boutons[2],
      panneaux[2],
      "suivi",
      "RefreshApp",
      false
    );
  }

  function assurerTroisiemeOnglet(racine) {
    let boutons = Array.from(
      racine.querySelectorAll("[data-lcdp-onglet]")
    );
    let panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    // L'objet partagé contient deux onglets : le troisième est Paramétrage.
    // Aucun panneau Wi-Fi n'est créé côté admin.
    if (boutons.length === 3 && panneaux.length === 3) {
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

    while (boutons.length < 3) {
      const bouton = modeleBouton.cloneNode(true);
      bouton.removeAttribute("id");
      bouton.removeAttribute("aria-controls");
      bouton.removeAttribute("aria-selected");
      bouton.removeAttribute("tabindex");
      parentBouton.appendChild(bouton);
      boutons.push(bouton);
    }

    while (panneaux.length < 3) {
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



  // Les départements sont sélectionnés avec l'objet centralisé 07-DIGINUM.
  async function choisirDepartementCle(codes, titre) {
    await chargerScriptObjetUneFois("/JSBASE/07-diginum.js");
    if (!window.LCDP_diginum?.ouvrir) throw new Error("Objet Diginum indisponible.");
    const valides = new Set([...codes].map(x => String(x).trim().toUpperCase()).filter(Boolean));
    if (!valides.size) throw new Error("Aucun département disponible.");
    return window.LCDP_diginum.ouvrir({
      titre: titre || "Choisir un département",
      placeholder: "exemple 41",
      longueurMax: Math.max(2, ...[...valides].map(x => x.length)),
      codesSpeciaux: [...valides].filter(x => /^[0-9][A-Z]$/.test(x)),
      autoValider: code => valides.has(String(code).toUpperCase()),
      verifier: code => valides.has(String(code).toUpperCase())
        ? null : "Aucun parc dans ce département."
    });
  }

  function decomposerOptionParc(option) {
    const label = String(option?.label || "").trim();
    const match = label.match(/^([0-9]{2,3}|2[AB])\s*[—-]\s*(.+)$/i);
    return {
      value: String(option?.value || "").trim(),
      departement: match ? match[1].toUpperCase() : "",
      nom: match ? match[2].trim() : label,
      label
    };
  }

  // Tableau spécialisé de l'onglet Parc : filtres multisélection exhaustifs.
  // Les valeurs sont chargées par lots via /read ; aucun Worker n'est modifié.
  let rechargerTableParcs = null;

  async function initialiserTableParcs(slot) {
    const selection = {
      departements: new Set(),
      parcs: new Set(),
      active: "",
      ordre: "",
      nombreVisible: 200
    };
    let toutesLesCles = [];
    const element = (tag, classe, contenu) => {
      const node = document.createElement(tag);
      if (classe) node.className = classe;
      if (contenu !== undefined) node.textContent = contenu;
      return node;
    };

    const cadre = element("section", "lcdp-table-lecture-admin");
    const defilement = element("div", "lcdp-table-lecture-admin__scroll");
    const tableau = element("table", "lcdp-table-lecture-admin__table");
    const thead = document.createElement("thead");
    const titres = document.createElement("tr");
    const tris = document.createElement("tr");
    tris.className = "lcdp-table-lecture-admin__sorts";
    const filtres = document.createElement("tr");
    filtres.className = "lcdp-table-lecture-admin__filters";
    const corps = document.createElement("tbody");
    const statut = element("p", "lcdp-table-lecture-admin__status");
    statut.setAttribute("role", "status");
    const afficherPlus = element("button", "lcdp-table-lecture-admin__pagination-button", "Afficher 200 clés supplémentaires");
    afficherPlus.type = "button";
    afficherPlus.hidden = true;
    afficherPlus.addEventListener("click", () => {
      selection.nombreVisible += 200;
      rendreLignes();
    });

    for (const titre of ["Dptmt", "Parc", "Clé", "Active", "Instal"]) {
      const th = element("th", "", titre);
      th.scope = "col";
      titres.appendChild(th);
      const sort = document.createElement("th");
      sort.scope = "col";
      tris.appendChild(sort);
    }
    const triInstal = tris.lastElementChild;
    const actionsTri = element("div", "lcdp-table-lecture-admin__sort-actions");
    for (const [ordre, sens] of [["asc", "↑"], ["desc", "↓"]]) {
      const bouton = element("button", "lcdp-table-lecture-admin__sort-button", sens);
      bouton.type = "button";
      bouton.title = ordre === "asc" ? "Classer Instal par ordre croissant" : "Classer Instal par ordre décroissant";
      bouton.setAttribute("aria-label", bouton.title);
      bouton.setAttribute("aria-pressed", "false");
      bouton.addEventListener("click", () => {
        selection.ordre = ordre;
        selection.nombreVisible = 200;
        for (const b of actionsTri.querySelectorAll("button")) {
          b.setAttribute("aria-pressed", String(b === bouton));
        }
        rendreLignes();
      });
      actionsTri.appendChild(bouton);
    }
    triInstal.appendChild(actionsTri);
    thead.append(titres, tris, filtres);
    tableau.append(thead, corps);
    defilement.appendChild(tableau);
    cadre.append(defilement, statut, afficherPlus);
    slot.replaceChildren(cadre);

    function nomParc(ligne) {
      return String(ligne?.nom || "").trim();
    }
    function idParc(ligne) {
      return String(ligne?.idparc || "").trim() ||
        String(ligne?.dptmt || "") + "|" + nomParc(ligne);
    }
    function estActive(ligne) {
      return ligne?._active === true ||
        /^(oui|true|1)$/i.test(String(ligne?.active || "").trim());
    }
    function dateInstallation(ligne) {
      const iso = String(ligne?._instal || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
      const match = String(ligne?.instal || "").match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
      if (!match) return "";
      const annee = match[3].length === 2 ? "20" + match[3] : match[3];
      return annee + "-" + match[2] + "-" + match[1];
    }
    function comparer(a, b) {
      return String(a ?? "").localeCompare(String(b ?? ""), "fr", {
        numeric: true, sensitivity: "base"
      });
    }

    function rendreFiltres() {
      filtres.replaceChildren();

      const departements = [...new Set(toutesLesCles
        .map(x => String(x.dptmt || "").trim().toUpperCase()))]
        .filter(Boolean).sort(comparer);

      const parcsParId = new Map();
      for (const cle of toutesLesCles) {
        const id = idParc(cle);
        if (!parcsParId.has(id)) {
          parcsParId.set(id, {
            value: id,
            departement: String(cle.dptmt || "").trim().toUpperCase(),
            nom: nomParc(cle)
          });
        }
      }
      const tousParcs = [...parcsParId.values()].sort((a, b) =>
        comparer(a.nom, b.nom) || comparer(a.departement, b.departement));

      function ajouterCellule(contenu) {
        const cellule = document.createElement("th");
        cellule.scope = "col";
        if (contenu) cellule.appendChild(contenu);
        filtres.appendChild(cellule);
      }

      const departementZone = element("div", "lcdp-cle-admin__departements");
      const choisirDepartement = element("button", "lcdp-table-lecture-admin__multi-resume", "Ajouter un département");
      choisirDepartement.type = "button";
      choisirDepartement.setAttribute("aria-label", "Ajouter un département avec le pavé Diginum");
      const departementsRetenus = element("div", "lcdp-cle-admin__jetons");
      const afficherDepartements = () => {
        departementsRetenus.replaceChildren();
        for (const departement of [...selection.departements].sort(comparer)) {
          const retirer = element("button", "lcdp-table-lecture-admin__pagination-button", departement + " ×");
          retirer.type = "button";
          retirer.setAttribute("aria-label", "Retirer le département " + departement);
          retirer.addEventListener("click", () => {
            selection.departements.delete(departement);
            selection.nombreVisible = 200;
            afficherDepartements();
            mettreAJourRechercheParcs();
            rendreLignes();
          });
          departementsRetenus.appendChild(retirer);
        }
      };
      choisirDepartement.addEventListener("click", async () => {
        choisirDepartement.disabled = true;
        try {
          const dpt = await choisirDepartementCle(departements, "Ajouter un département");
          if (dpt) {
            selection.departements.add(String(dpt).toUpperCase());
            selection.nombreVisible = 200;
            afficherDepartements();
            mettreAJourRechercheParcs();
            rendreLignes();
          }
        } catch (error) {
          await afficherAlerte(error?.message || "Sélecteur de département indisponible.");
        } finally {
          choisirDepartement.disabled = false;
        }
      });
      departementZone.append(choisirDepartement, departementsRetenus);
      ajouterCellule(departementZone);

      const parcZone = element("div", "lcdp-cle-admin__parcs-recherche");
      const parcRecherche = element("input", "lcdp-table-lecture-admin__filter-input");
      parcRecherche.type = "search";
      parcRecherche.autocomplete = "off";
      parcRecherche.placeholder = "Rechercher un parc";
      parcRecherche.setAttribute("aria-label", "Rechercher un parc par son nom");
      const parcSuggestions = element("div", "lcdp-cle-admin__suggestions");
      parcSuggestions.setAttribute("role", "listbox");
      parcSuggestions.setAttribute("aria-label", "Parcs proposés");
      const parcsRetenus = element("div", "lcdp-cle-admin__jetons");
      const parcMessage = element("p", "lcdp-cle-admin__suggestions-info");
      parcMessage.setAttribute("role", "status");
      parcZone.append(parcRecherche, parcSuggestions, parcsRetenus, parcMessage);
      ajouterCellule(parcZone);

      function afficherParcsRetenus() {
        parcsRetenus.replaceChildren();
        for (const parcId of selection.parcs) {
          const parc = parcsParId.get(parcId);
          if (!parc) continue;
          const retirer = element("button", "lcdp-table-lecture-admin__pagination-button",
            parc.nom + " ×");
          retirer.type = "button";
          retirer.setAttribute("aria-label", "Retirer le parc " + parc.nom);
          retirer.addEventListener("click", () => {
            selection.parcs.delete(parcId);
            selection.nombreVisible = 200;
            afficherParcsRetenus();
            mettreAJourRechercheParcs();
            rendreLignes();
          });
          parcsRetenus.appendChild(retirer);
        }
      }
      function mettreAJourRechercheParcs() {
        parcSuggestions.replaceChildren();
        parcMessage.textContent = "";
        const saisie = parcRecherche.value.trim().toLocaleLowerCase("fr");
        if (!saisie) return;
        const candidats = tousParcs.filter(parc =>
          (!selection.departements.size || selection.departements.has(parc.departement)) &&
          !selection.parcs.has(parc.value) &&
          parc.nom.toLocaleLowerCase("fr").includes(saisie));
        for (const parc of candidats.slice(0, 12)) {
          const choisir = element("button", "lcdp-cle-admin__suggestion",
            parc.nom + " (" + parc.departement + ")");
          choisir.type = "button";
          choisir.setAttribute("role", "option");
          choisir.addEventListener("click", () => {
            selection.parcs.add(parc.value);
            selection.nombreVisible = 200;
            parcRecherche.value = "";
            afficherParcsRetenus();
            mettreAJourRechercheParcs();
            rendreLignes();
            parcRecherche.focus();
          });
          parcSuggestions.appendChild(choisir);
        }
        if (!candidats.length) {
          parcMessage.textContent = "Aucun parc correspondant.";
        } else if (candidats.length > 12) {
          parcMessage.textContent = "Affinez la recherche pour voir les autres parcs.";
        }
      }
      parcRecherche.addEventListener("input", mettreAJourRechercheParcs);
      afficherParcsRetenus();
      afficherDepartements();

      ajouterCellule(null); // La clé se lit dans le tableau, sans filtre textuel.

      const filtreActif = element("select", "lcdp-table-lecture-admin__filter-input");
      filtreActif.setAttribute("aria-label", "Filtrer les clés actives ou inactives");
      for (const [valeur, nom] of [["", "Toutes"], ["oui", "Actives"], ["non", "Inactives"]]) {
        const option = element("option", "", nom);
        option.value = valeur;
        filtreActif.appendChild(option);
      }
      filtreActif.value = selection.active;
      filtreActif.addEventListener("change", () => {
        selection.active = filtreActif.value;
        selection.nombreVisible = 200;
        rendreLignes();
      });
      ajouterCellule(filtreActif);
      ajouterCellule(null); // Instal : tri uniquement, pas de filtre.
    }

    function rendreLignes() {
      const lignes = toutesLesCles.filter(cle => {
        const dpt = String(cle.dptmt || "").trim();
        if (selection.departements.size && !selection.departements.has(dpt)) return false;
        if (selection.parcs.size && !selection.parcs.has(idParc(cle))) return false;
        if (selection.active === "oui" && !estActive(cle)) return false;
        if (selection.active === "non" && estActive(cle)) return false;
        return true;
      });
      if (selection.ordre) {
        lignes.sort((a, b) => {
          const premiere = dateInstallation(a);
          const seconde = dateInstallation(b);
          if (!premiere && !seconde) return 0;
          if (!premiere) return 1;
          if (!seconde) return -1;
          const resultat = comparer(premiere, seconde);
          return selection.ordre === "desc" ? -resultat : resultat;
        });
      } else {
        lignes.sort((a, b) => comparer(a.dptmt, b.dptmt) || comparer(a.nom, b.nom));
      }
      const fragment = document.createDocumentFragment();
      for (const ligne of lignes.slice(0, selection.nombreVisible)) {
        const tr = document.createElement("tr");
        const valeurs = [
          ligne.dptmt, ligne.nom, ligne.cle,
          estActive(ligne) ? "oui" : "non", ligne.instal
        ];
        valeurs.forEach((valeur, i) => {
          const td = document.createElement("td");
          if (i === 2) {
            const bouton = element("button", "lcdp-table-lecture-admin__cell-action", String(valeur || "—"));
            bouton.type = "button";
            bouton.title = "Modifier ou supprimer la clé " + String(valeur || "");
            bouton.setAttribute("aria-label", bouton.title);
            bouton.addEventListener("click", () => {
              Promise.resolve(ouvrirEdition(CONTEXTES.parcs, ligne)).catch(gererErreurPage);
            });
            td.appendChild(bouton);
          } else {
            td.textContent = String(valeur ?? "") || "—";
          }
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
      }
      corps.replaceChildren(fragment);
      statut.textContent = lignes.length ? "" : "Aucune clé ne correspond aux filtres.";
      afficherPlus.hidden = lignes.length <= selection.nombreVisible;
    }

    async function recharger() {
      statut.textContent = "";
      afficherPlus.hidden = true;
      try {
        const tous = [];
        for (let offset = 0; offset < 50000; offset += 200) {
          const data = await appelerCle(
            "/read?resource=cle-parcs&limit=200&offset=" + String(offset)
          );
          if (!Array.isArray(data.rows)) throw new Error("Réponse du tableau des clés invalide.");
          tous.push(...data.rows);
          if (tous.length >= 50000) throw new Error("Inventaire des clés trop volumineux.");
          if (data.rows.length < 200 || tous.length >= Number(data.total || 0)) break;
        }
        toutesLesCles = tous;
        const ids = new Set(tous.map(idParc));
        for (const id of [...selection.parcs]) if (!ids.has(id)) selection.parcs.delete(id);
        defilement.hidden = false;
        statut.setAttribute("role", "status");
        rendreFiltres();
        rendreLignes();
      } catch (error) {
        defilement.hidden = true;
        statut.setAttribute("role", "alert");
        statut.textContent = error?.message || "Impossible de charger les clés de parc.";
      }
    }

    rechargerTableParcs = recharger;
    await recharger();
  }


  // Présence : aucune flèche de tri et uniquement les filtres opérationnels.
  // Les données sont chargées intégralement par lots, puis filtrées localement.
  let rechargerTablePresence = null;
  async function initialiserTablePresence(slot) {
    const selection = {
      departements: new Set(),
      nom: "",
      prefixe: "",
      statut: "",
      limite: 200
    };
    let toutes = [];
    const creer = (tag, classe, txt) => {
      const node = document.createElement(tag);
      if (classe) node.className = classe;
      if (txt !== undefined) node.textContent = txt;
      return node;
    };
    const normaliser = valeur => String(valeur ?? "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
    const section = creer("section", "lcdp-table-lecture-admin");
    const scroll = creer("div", "lcdp-table-lecture-admin__scroll");
    const tableau = creer("table", "lcdp-table-lecture-admin__table");
    const entete = document.createElement("thead");
    const noms = document.createElement("tr");
    const filtres = document.createElement("tr");
    filtres.className = "lcdp-table-lecture-admin__filters";
    const corps = document.createElement("tbody");
    const statut = creer("p", "lcdp-table-lecture-admin__status");
    statut.setAttribute("role", "status");
    const suite = creer("button", "lcdp-table-lecture-admin__pagination-button",
      "Afficher 200 bracelets supplémentaires");
    suite.type = "button";
    suite.hidden = true;
    suite.addEventListener("click", () => { selection.limite += 200; rendre(); });
    for (const nom of ["Dptmt", "Nom", "Prénom", "Bracelet", "Refresh", "Actif", "Date"]) {
      const th = creer("th", "", nom);
      th.scope = "col";
      noms.appendChild(th);
    }
    entete.append(noms, filtres);
    tableau.append(entete, corps);
    scroll.appendChild(tableau);
    section.append(scroll, statut, suite);
    slot.replaceChildren(section);
    function cellule(contenu) {
      const th = document.createElement("th");
      th.scope = "col";
      if (contenu) th.appendChild(contenu);
      filtres.appendChild(th);
    }
    let rendre = () => {};
    function preparerFiltres() {
      filtres.replaceChildren();

      const deptZone = creer("div", "lcdp-cle-admin__departements");
      const ajout = creer("button", "lcdp-table-lecture-admin__multi-resume",
        "Départements");
      ajout.type = "button";
      ajout.setAttribute("aria-label", "Ajouter un département avec Diginum");
      const jetons = creer("div", "lcdp-cle-admin__jetons");
      function afficherJetons() {
        jetons.replaceChildren();
        for (const dpt of [...selection.departements].sort((a,b) => a.localeCompare(b,"fr",{numeric:true}))) {
          const effacer = creer("button", "lcdp-table-lecture-admin__pagination-button", dpt + " ×");
          effacer.type = "button";
          effacer.setAttribute("aria-label", "Retirer le département " + dpt);
          effacer.addEventListener("click", () => {
            selection.departements.delete(dpt);
            selection.limite = 200;
            afficherJetons();
            rendre();
          });
          jetons.appendChild(effacer);
        }
      }
      ajout.addEventListener("click", async () => {
        const departements = [...new Set(toutes.map(r => String(r.dptmt || "").trim().toUpperCase()))]
          .filter(Boolean);
        ajout.disabled = true;
        try {
          const choisi = await choisirDepartementCle(departements, "Filtrer les départements");
          if (choisi) {
            selection.departements.add(String(choisi).toUpperCase());
            afficherJetons(); selection.limite = 200; rendre();
          }
        } catch (error) {
          await afficherAlerte(error?.message || "Sélection du département indisponible.");
        } finally {
          ajout.disabled = false;
        }
      });
      deptZone.append(ajout, jetons); afficherJetons(); cellule(deptZone);

      const zoneNom = creer("div", "lcdp-cle-admin__parcs-recherche");
      const rechercheNom = creer("input", "lcdp-table-lecture-admin__filter-input");
      rechercheNom.type = "search";
      rechercheNom.autocomplete = "off";
      rechercheNom.placeholder = "Rechercher un nom";
      rechercheNom.value = selection.nom;
      rechercheNom.setAttribute("aria-label", "Recherche alphabétique progressive par nom");
      rechercheNom.setAttribute("aria-autocomplete", "list");
      const propositions = creer("div", "lcdp-cle-admin__suggestions");
      propositions.setAttribute("role", "listbox");
      propositions.setAttribute("aria-label", "Noms proposés");
      function mettreSuggestions() {
        propositions.replaceChildren();
        const saisie = normaliser(rechercheNom.value);
        if (!saisie) return;
        const correspondances = [...new Set(toutes.filter(r =>
          !selection.departements.size ||
          selection.departements.has(String(r.dptmt || "").toUpperCase())
        ).map(r => String(r.nom || "").trim()).filter(Boolean))]
          .filter(nom => normaliser(nom).includes(saisie))
          .sort((a,b) => Number(normaliser(b).startsWith(saisie)) -
            Number(normaliser(a).startsWith(saisie)) ||
            a.localeCompare(b,"fr",{sensitivity:"base"}));
        for (const nom of correspondances.slice(0, 8)) {
          const choix = creer("button", "lcdp-cle-admin__suggestion", nom);
          choix.type = "button";
          choix.setAttribute("role", "option");
          choix.addEventListener("click", () => {
            rechercheNom.value = nom;
            selection.nom = nom;
            selection.limite = 200;
            propositions.replaceChildren();
            rendre();
          });
          propositions.appendChild(choix);
        }
      }
      rechercheNom.addEventListener("input", () => {
        selection.nom = rechercheNom.value;
        selection.limite = 200;
        mettreSuggestions(); rendre();
      });
      zoneNom.append(rechercheNom, propositions);
      cellule(zoneNom);

      cellule(null); // Prénom : aucune recherche demandée.
      const prefixe = creer("input", "lcdp-table-lecture-admin__filter-input");
      prefixe.type = "search";
      prefixe.placeholder = "Début du code";
      prefixe.setAttribute("aria-label", "Bracelets dont le code commence par");
      prefixe.value = selection.prefixe;
      prefixe.addEventListener("input", () => {
        selection.prefixe = prefixe.value;
        selection.limite = 200;
        rendre();
      });
      cellule(prefixe);
      cellule(null); // Refresh n'est pas un filtre de recherche.
      const actif = creer("select", "lcdp-table-lecture-admin__filter-input");
      actif.setAttribute("aria-label", "Filtrer les bracelets par état");
      for (const [valeur,texte] of [["","Tous"],["oui","Actifs"],["non","Inactifs"]]) {
        const option = creer("option","",texte); option.value = valeur;
        actif.appendChild(option);
      }
      actif.value = selection.statut;
      actif.addEventListener("change", () => {
        selection.statut = actif.value; selection.limite = 200; rendre();
      });
      cellule(actif);
      cellule(null); // Date : aucun filtre inutile.
    }
    rendre = () => {
      const correspondants = toutes.filter(row => {
        if (selection.departements.size && !selection.departements.has(
          String(row.dptmt || "").trim().toUpperCase())) return false;
        if (selection.nom && !normaliser(row.nom).includes(normaliser(selection.nom))) return false;
        if (selection.prefixe && !normaliser(row.brac).startsWith(normaliser(selection.prefixe))) return false;
        const actif = row._actif === true || String(row.actif).toLowerCase() === "oui";
        if (selection.statut === "oui" && !actif) return false;
        if (selection.statut === "non" && actif) return false;
        return true;
      });
      const portion = document.createDocumentFragment();
      for (const row of correspondants.slice(0, selection.limite)) {
        const tr = document.createElement("tr");
        for (const col of ["dptmt","nom","prenom","brac","refresh","actif","date"]) {
          const td = document.createElement("td");
          if (col === "brac") {
            const bouton = creer("button", "lcdp-table-lecture-admin__cell-action",
              String(row.brac || "—"));
            bouton.type = "button";
            bouton.setAttribute("aria-label", "Modifier le bracelet " + String(row.brac || ""));
            bouton.addEventListener("click", () => {
              Promise.resolve(ouvrirEdition(CONTEXTES.membres, row)).catch(gererErreurPage);
            });
            td.appendChild(bouton);
          } else td.textContent = String(row[col] ?? "").trim() || "—";
          tr.appendChild(td);
        }
        portion.appendChild(tr);
      }
      corps.replaceChildren(portion);
      statut.hidden = correspondants.length > 0;
      statut.textContent = correspondants.length
        ? ""
        : "Aucun bracelet ne correspond aux critères.";
      suite.hidden = correspondants.length <= selection.limite;
    };
    async function recharger() {
      try {
        const rows = [];
        for (let offset=0; offset < 20000; offset+=200) {
          const donnees = await appelerCle("/read?resource=cle-membres&limit=200&offset=" + offset);
          if (!Array.isArray(donnees.rows)) throw new Error("Réponse Présence invalide.");
          rows.push(...donnees.rows);
          if (donnees.rows.length < 200 || rows.length >= Number(donnees.total || 0)) break;
        }
        if (rows.length >= 20000) throw new Error("Trop de bracelets pour cet affichage.");
        toutes = rows;
        const departements = new Set(rows.map(x => String(x.dptmt || "").toUpperCase()));
        for (const dpt of [...selection.departements]) {
          if (!departements.has(dpt)) selection.departements.delete(dpt);
        }
        scroll.hidden = false;
        statut.setAttribute("role", "status");
        preparerFiltres(); rendre();
      } catch(error) {
        scroll.hidden = true;
        statut.hidden = false;
        statut.setAttribute("role","alert");
        statut.textContent = String(error?.message || "Lecture des bracelets indisponible.");
      }
    }
    rechargerTablePresence = recharger;
    await recharger();
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

      if (contexte.key === "parcs") {
        await initialiserTableParcs(slot);
        continue;
      }
      if (contexte.key === "membres") {
        await initialiserTablePresence(slot);
        continue;
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
        columnLabels: contexte.key === "bluetooth"
          ? { nomble: "Réseau Wi-Fi" }
          : contexte.key === "membres"
            ? { brac: "Bracelet" }
            : { nom: "Parc" },
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
        poll_secondes: 300,
        geoloc_frq: 2,
        geoloc_interval_minutes: null,
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


  // Sélection dépendante dans les formulaires Ajouter/Modifier Clé :
  // Diginum (département), puis autocomplétion du parc.
  function initialiserChoixParcFormulaire(form, item, options) {
    const parcOptions = (Array.isArray(options) ? options : [])
      .map(decomposerOptionParc)
      .filter(x => x.value && x.nom && x.departement)
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base", numeric: true }));
    const dptDisponibles = [...new Set(parcOptions.map(x => x.departement))].sort();
    const initial = parcOptions.find(x => x.value === String(item?.idparc || ""));
    let departement = initial?.departement || "";
    const champId = document.createElement("input");
    champId.type = "hidden";
    champId.name = "idparc";
    champId.id = "idparc";
    champId.value = initial?.value || "";

    const conteneur = document.createElement("div");
    conteneur.className = "lcdp-cle-admin__selection-parc";
    const labelDpt = document.createElement("label");
    labelDpt.className = "lcdp-box-champ-formulaire__label";
    labelDpt.textContent = "Département*";
    const boutonDpt = document.createElement("button");
    boutonDpt.type = "button";
    boutonDpt.className = "lcdp-button lcdp-button-secondary";
    const labelParc = document.createElement("label");
    labelParc.className = "lcdp-box-champ-formulaire__label";
    labelParc.textContent = "Parc*";
    const champParc = document.createElement("input");
    champParc.type = "search";
    champParc.className = "lcdp-table-lecture-admin__filter-input";
    champParc.placeholder = "Rechercher un parc par son nom";
    champParc.autocomplete = "off";
    champParc.setAttribute("aria-label", "Rechercher un parc après avoir choisi le département");
    champParc.value = initial?.nom || "";
    champParc.disabled = !departement;
    const suggestions = document.createElement("div");
    suggestions.className = "lcdp-cle-admin__suggestions";
    suggestions.setAttribute("role", "listbox");
    suggestions.setAttribute("aria-label", "Parcs du département");
    const statut = document.createElement("p");
    statut.className = "lcdp-cle-admin__suggestions-info";
    statut.setAttribute("role", "status");
    const liberer = () => {
      champId.value = "";
      suggestions.replaceChildren();
      statut.textContent = "";
    };

    const mettreBouton = () => {
      boutonDpt.textContent = departement
        ? "Département " + departement + " — Changer"
        : "Choisir un département";
    };
    mettreBouton();
    const rechercher = () => {
      suggestions.replaceChildren();
      statut.textContent = "";
      if (!departement || !champParc.value.trim()) return;
      const texte = champParc.value.trim().toLocaleLowerCase("fr");
      const candidats = parcOptions.filter(parc =>
        parc.departement === departement &&
        parc.nom.toLocaleLowerCase("fr").includes(texte));
      for (const parc of candidats.slice(0, 12)) {
        const suggestion = document.createElement("button");
        suggestion.type = "button";
        suggestion.className = "lcdp-cle-admin__suggestion";
        suggestion.setAttribute("role", "option");
        suggestion.textContent = parc.nom;
        suggestion.addEventListener("click", () => {
          champId.value = parc.value;
          champParc.value = parc.nom;
          suggestions.replaceChildren();
          statut.textContent = "Parc sélectionné : " + parc.nom;
        });
        suggestions.appendChild(suggestion);
      }
      if (!candidats.length) statut.textContent = "Aucun parc correspondant.";
      else if (candidats.length > 12) statut.textContent = "Affinez la recherche.";
    };
    boutonDpt.addEventListener("click", async () => {
      boutonDpt.disabled = true;
      try {
        const choisi = await choisirDepartementCle(dptDisponibles, "Choisir le département du parc");
        if (choisi && choisi !== departement) {
          departement = choisi;
          champParc.disabled = false;
          champParc.value = "";
          liberer();
          mettreBouton();
          champParc.focus();
        }
      } catch (error) {
        await afficherAlerte(error?.message || "Sélection du département indisponible.");
      } finally {
        boutonDpt.disabled = false;
      }
    });
    champParc.addEventListener("input", () => {
      liberer();
      rechercher();
    });
    conteneur.append(labelDpt, boutonDpt, labelParc, champParc, suggestions, statut, champId);
    const zone = form.querySelector("[data-lcdp-formulaire-fields]");
    if (!zone) throw new Error("Zone des champs Clé indisponible.");
    zone.prepend(conteneur);
    return { champParc, champId };
  }


  // Sélection d'un seul membre à partir d'une recherche alphabétique progressive.
  // La valeur envoyée à l'API reste uniquement l'UUID du membre choisi.
  function initialiserChoixMembreFormulaire(form, item, options) {
    const candidats = (Array.isArray(options) ? options : [])
      .filter(x => String(x?.value || "").trim() && String(x?.label || "").trim())
      .map(x => ({
        id: String(x.value).trim(),
        label: String(x.label).trim()
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", {
        sensitivity: "base", numeric: true
      }));

    const zone = form.querySelector("[data-lcdp-formulaire-fields]");
    if (!zone) throw new Error("Zone des champs du formulaire indisponible.");
    const selection = document.createElement("div");
    selection.className = "lcdp-cle-admin__selection-membre lcdp-cle-admin__selection-parc";

    const titre = document.createElement("label");
    titre.className = "lcdp-box-champ-formulaire__label";
    titre.textContent = "Membre";
    const etoile = document.createElement("span");
    etoile.className = "lcdp-box-champ-formulaire__required";
    etoile.textContent = "*";
    titre.appendChild(etoile);

    const initial = candidats.find(x => x.id === String(item?.idmembre || ""));
    const recherche = document.createElement("input");
    recherche.type = "search";
    recherche.className = "lcdp-table-lecture-admin__filter-input";
    recherche.placeholder = "Rechercher par nom, prénom ou email";
    recherche.autocomplete = "off";
    recherche.setAttribute("aria-label", "Rechercher un membre par nom, prénom ou email");
    recherche.setAttribute("aria-autocomplete", "list");
    recherche.value = initial?.label || "";

    const idMembre = document.createElement("input");
    idMembre.type = "hidden";
    idMembre.name = "idmembre";
    idMembre.id = "idmembre";
    idMembre.value = initial?.id || "";

    const suggestions = document.createElement("div");
    suggestions.className = "lcdp-cle-admin__suggestions";
    suggestions.setAttribute("role", "listbox");
    suggestions.setAttribute("aria-label", "Suggestions de membres");
    const statut = document.createElement("p");
    statut.className = "lcdp-cle-admin__suggestions-info";
    statut.setAttribute("role", "status");

    const normaliser = value => String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr").trim();

    function proposer() {
      suggestions.replaceChildren();
      statut.textContent = "";
      const saisie = normaliser(recherche.value);
      if (!saisie) return;
      const resultats = candidats
        .filter(m => normaliser(m.label).includes(saisie))
        .sort((a, b) => {
          const aDebut = normaliser(a.label).startsWith(saisie) ? 0 : 1;
          const bDebut = normaliser(b.label).startsWith(saisie) ? 0 : 1;
          return aDebut - bDebut || a.label.localeCompare(b.label, "fr", {
            sensitivity: "base", numeric: true
          });
        });
      for (const membre of resultats.slice(0, 12)) {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-cle-admin__suggestion";
        bouton.textContent = membre.label;
        bouton.setAttribute("role", "option");
        bouton.addEventListener("click", () => {
          idMembre.value = membre.id;
          recherche.value = membre.label;
          suggestions.replaceChildren();
          statut.textContent = "Membre sélectionné : " + membre.label;
        });
        suggestions.appendChild(bouton);
      }
      if (!resultats.length) statut.textContent = "Aucun membre correspondant.";
      else if (resultats.length > 12) statut.textContent = "Affinez la recherche.";
    }
    recherche.addEventListener("input", () => {
      idMembre.value = ""; // Toute retouche exige une nouvelle sélection.
      proposer();
    });
    titre.htmlFor = "lcdp-cle-rechercher-membre";
    recherche.id = "lcdp-cle-rechercher-membre";
    selection.append(titre, recherche, suggestions, statut, idMembre);
    zone.prepend(selection);
  }

  async function rendreFormulaire(contexte, item, options) {
    await chargerScriptObjetUneFois("/JSBASE/03-formulaire.js");

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

    if (contexte.key === "parcs") {
      initialiserChoixParcFormulaire(form, item, options);
    } else if (contexte.key === "membres") {
      initialiserChoixMembreFormulaire(form, item, options);
    }
    form.addEventListener("submit", enregistrer);
    if(contexte.key==="membres" && modeEdition==="update"){
      const preparer=document.createElement("button");preparer.type="button";preparer.className="lcdp-button lcdp-button-secondary";preparer.textContent="Générer le secret du bracelet Wi-Fi";
      const note=document.createElement("p");note.textContent="Cette action remplace le secret de connexion précédent du bracelet. Elle ne change pas son mot de passe Wi-Fi.";
      form.querySelector("[data-lcdp-formulaire-actions]")?.appendChild(preparer);
      form.appendChild(note);
      preparer.addEventListener("click",async()=>{
        preparer.disabled=true;
        try{
          const base=String(config.workerLaCleDuParcUrl || config.WORKER_LA_CLE_DU_PARC_URL || config.W_LA_CLE_DU_PARC_URL || (typeof config.apiUrl==="function"?config.apiUrl("la-cle-du-parc-api"):"")).replace(/\/+$/,"");
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
          label: "Réseau Wi-Fi",
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
          checkboxLabel: "Réseau Wi-Fi actif"
        }
      ];
    }

    return [
      {
        name: "brac",
        label: "Bracelet",
        type: "text",
        value: item?.brac || "",
        required: true,
        validationNative: true,
        maxlength: 100
      },
      {
        name: "poll_minutes",
        label: "Communication du bracelet (minutes)",
        type: "number",
        value: Number(item?.poll_secondes ?? 300) / 60,
        required: true,
        validationNative: true,
        min: 5,
        max: 20,
        step: 1
      },
      {
        name: "gps_intervalle",
        label: "GPS intermédiaire (minutes, 0 = aucun)",
        type: "number",
        value: Number(item?.geoloc_frq ?? 2) <= 2
          ? 0 : Number(item?.geoloc_interval_minutes ?? 60),
        required: true,
        validationNative: true,
        min: 0,
        max: 1440,
        step: 1
      },
      {
        name: "actif",
        label: "Actif",
        type: "checkbox",
        checked: item?.actif === true,
        checkboxLabel: "Bracelet actif"
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
    if (contexteEdition.key === "parcs" &&
        !String(form.elements.namedItem("idparc")?.value || "").trim()) {
      await afficherAlerte("Choisis d'abord le département, puis sélectionne un parc parmi les résultats proposés.");
      form.querySelector('.lcdp-cle-admin__selection-parc input[type="search"]')?.focus();
      return;
    }
    if (contexteEdition.key === "membres" &&
        !String(form.elements.namedItem("idmembre")?.value || "").trim()) {
      await afficherAlerte("Sélectionne un membre parmi les propositions de la recherche.");
      form.querySelector("#lcdp-cle-rechercher-membre")?.focus();
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
      poll_secondes: Number(
        form.elements.namedItem("poll_minutes")?.value || 5
      ) * 60,
      // L'entrée et la sortie sont systématiques. L'intervalle active
      // uniquement les contrôles GPS intermédiaires.
      geoloc_frq: Number(form.elements.namedItem("gps_intervalle")?.value || 0) === 0
        ? 2 : 3,
      geoloc_interval_minutes: Number(form.elements.namedItem("gps_intervalle")?.value || 0) === 0
        ? null : Number(form.elements.namedItem("gps_intervalle")?.value),
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
      if (contexte.key === "parcs" && rechargerTableParcs) {
        await rechargerTableParcs();
      } else if (contexte.key === "membres" && rechargerTablePresence) {
        await rechargerTablePresence();
      } else {
        await window.LCDP_TABLE_LECTURE_ADMIN
          ?.recharger(contexte.tableSlotId);
      }
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
      await chargerFragmentObjet("/HTMLBASE/02-alerte.html")
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
    if (!slot) return false;
    const focusInitial = document.activeElement;
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
      slot.replaceChildren();
      slot.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-suppression.html"));
      const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="suppression"]');
      const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
      const texte = slot.querySelector("[data-lcdp-dialogue-message]");
      const conserver = slot.querySelector('[data-lcdp-dialogue-action="conserver"]');
      const supprimer = slot.querySelector('[data-lcdp-dialogue-action="supprimer"]');
      if (!dialogue || !titre || !texte || !conserver || !supprimer) throw new Error("Dialogue SUPPRESSION incomplet.");
      titre.textContent = "Supprimer " + libelle;
      texte.textContent = "Cette suppression est définitive.";
      conserver.textContent = "Annuler";
      supprimer.textContent = "Supprimer";
      conserver.focus();
      return await new Promise(resolve => {
        let resolu = false;
        function terminer(valeur) {
          if (resolu) return;
          resolu = true;
          document.removeEventListener("keydown", gererClavier);
          slot.replaceChildren();
          if (focusInitial?.isConnected && typeof focusInitial.focus === "function") focusInitial.focus();
          resolve(valeur);
        }
        function gererClavier(event) {
          if (event.key === "Escape") { event.preventDefault(); terminer(false); }
          if (event.key === "Tab") {
            const cible = event.shiftKey ? conserver : supprimer;
            if (document.activeElement === cible) {
              event.preventDefault();
              (event.shiftKey ? supprimer : conserver).focus();
            }
          }
        }
        document.addEventListener("keydown", gererClavier);
        conserver.addEventListener("click", () => terminer(false), { once: true });
        supprimer.addEventListener("click", () => terminer(true), { once: true });
        dialogue.addEventListener("click", event => { if (event.target === dialogue) terminer(false); });
      });
    } catch (error) {
      slot.replaceChildren();
      if (focusInitial?.isConnected && typeof focusInitial.focus === "function") focusInitial.focus();
      console.error("Confirmation SUPPRESSION indisponible :", error);
      return false;
    }
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
  function baseSuivi(){const base=String(config.workerLaCleDuParcUrl || config.WORKER_LA_CLE_DU_PARC_URL || config.W_LA_CLE_DU_PARC_URL || (typeof config.apiUrl==="function"?config.apiUrl("la-cle-du-parc-api"):"")).replace(/\/+$/,"");if(!base)throw Error("Endpoint Ma clé non configuré dans le config admin.");return base;}
  async function appelSuivi(path,body){const r=await fetch(baseSuivi()+path,{method:body?"POST":"GET",credentials:"include",cache:"no-store",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok || !d.success)throw Error(d.message || "Suivi indisponible.");return d;}

  // RefreshApp : uniquement les parcs en ligne. Chaque parc conserve deux
  // fréquences : couleur du bracelet et combinaison de trois couleurs du mobile.
  async function initialiserSuivi() {
    const zone = document.querySelector('[data-lcdp-contenu-onglet="suivi"]');
    if (!zone) return;
    const creer = (tag, classe, texte) => {
      const e = document.createElement(tag);
      if (classe) e.className = classe;
      if (texte !== undefined) e.textContent = texte;
      return e;
    };
    const normaliser = v => String(v ?? "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
    const minutes = n => n == null || !Number.isFinite(Number(n))
      ? "—" : String(Number(n) / 60);
    const statut = creer("p", "lcdp-table-lecture-admin__status",
      "Chargement des parcs en ligne…");
    statut.setAttribute("role", "status");
    zone.replaceChildren(statut);

    let parcs = [];
    try {
      for (let offset = 0; offset < 10000; offset += 250) {
        const page = await appelSuivi(
          "/admin/monitor/parks?offset=" + offset + "&limit=250"
        );
        if (!Array.isArray(page.parks)) throw Error("Liste des parcs invalide.");
        parcs.push(...page.parks);
        if (!page.hasMore) break;
      }
    } catch (error) {
      statut.textContent = String(error?.message || "Liste RefreshApp indisponible.");
      return;
    }
    parcs.sort((a, b) =>
      String(a.dptmt || "").localeCompare(String(b.dptmt || ""), "fr", {numeric:true})
      || String(a.nom || "").localeCompare(String(b.nom || ""), "fr", {sensitivity:"base"})
    );
    const departements = [...new Set(parcs.map(p =>
      String(p.dptmt || "").trim().toUpperCase()
    ))].filter(Boolean).sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
    const dptsChoisis = new Set();
    const parcsChoisis = new Set();
    let texteRecherche = "";
    let affiches = 200;

    const barre = creer("div", "lcdp-cle-suivi__filtres");
    const departement = creer("button", "lcdp-button lcdp-button-secondary",
      "Départements");
    departement.type = "button";
    const jetons = creer("div", "lcdp-cle-admin__jetons");
    const rechercheZone = creer("div", "lcdp-cle-suivi__recherche");
    const recherche = creer("input", "lcdp-table-lecture-admin__filter-input");
    recherche.type = "search";
    recherche.autocomplete = "off";
    recherche.placeholder = "Rechercher un parc";
    recherche.setAttribute("aria-label", "Rechercher un parc par son nom");
    const suggestions = creer("div", "lcdp-cle-admin__suggestions");
    suggestions.setAttribute("role", "listbox");
    rechercheZone.append(recherche, suggestions);
    barre.append(departement, jetons, rechercheZone);

    const actions = creer("div", "lcdp-cle-suivi__selection");
    const selectionner = creer("button", "lcdp-button lcdp-button-secondary",
      "Sélectionner les parcs filtrés");
    selectionner.type = "button";
    const effacer = creer("button", "lcdp-button lcdp-button-secondary",
      "Effacer la sélection");
    effacer.type = "button";
    const grouper = creer("button", "lcdp-button lcdp-button-orange",
      "Modifier les parcs sélectionnés");
    grouper.type = "button";
    const indication = creer("span", "lcdp-cle-suivi__selection-etat");
    actions.append(selectionner, effacer, grouper, indication);

    const edition = creer("section", "lcdp-cle-suivi__edition");
    edition.hidden = true;
    const cadre = creer("section", "lcdp-table-lecture-admin");
    const defilement = creer("div", "lcdp-table-lecture-admin__scroll");
    const tableau = creer("table", "lcdp-table-lecture-admin__table");
    const entete = creer("thead");
    const enteteLigne = creer("tr");
    for (const titre of ["Choix", "Dptmt", "Parc", "Couleur bracelet (min)",
      "Combinaison 3 couleurs (min)"]) {
      const th = creer("th", "", titre);
      th.scope = "col";
      enteteLigne.appendChild(th);
    }
    entete.appendChild(enteteLigne);
    const corps = creer("tbody");
    tableau.append(entete, corps);
    defilement.appendChild(tableau);
    const suite = creer("button", "lcdp-table-lecture-admin__pagination-button",
      "Afficher 200 parcs supplémentaires");
    suite.type = "button";
    cadre.append(defilement, suite);
    const note = creer("p", "lcdp-cle-suivi__note");
    note.setAttribute("role", "status");
    zone.replaceChildren(
      creer("p", "", "Refresh par parc : couleur du bracelet et combinaison des trois couleurs de l’application."),
      barre, actions, edition, cadre, note
    );

    const filtrer = () => parcs.filter(p =>
      (!dptsChoisis.size || dptsChoisis.has(String(p.dptmt || "").toUpperCase()))
      && (!texteRecherche || normaliser(p.nom).includes(normaliser(texteRecherche)))
    );
    function majSelection() {
      indication.textContent = parcsChoisis.size
        ? parcsChoisis.size + " parc(s) sélectionné(s)" : "";
      grouper.disabled = parcsChoisis.size === 0;
      effacer.disabled = parcsChoisis.size === 0;
    }
    function afficherJetons() {
      jetons.replaceChildren();
      for (const code of [...dptsChoisis].sort()) {
        const bouton = creer("button", "lcdp-table-lecture-admin__pagination-button",
          code + " ×");
        bouton.type = "button";
        bouton.setAttribute("aria-label", "Retirer le département " + code);
        bouton.addEventListener("click", () => {
          dptsChoisis.delete(code);
          affiches = 200;
          afficherJetons(); rendre();
        });
        jetons.appendChild(bouton);
      }
    }
    function rendre() {
      const lignes = filtrer();
      const fragment = document.createDocumentFragment();
      for (const parc of lignes.slice(0, affiches)) {
        const tr = creer("tr");
        const choix = creer("td");
        const caseParc = creer("input");
        caseParc.type = "checkbox";
        caseParc.checked = parcsChoisis.has(String(parc.idparc));
        caseParc.setAttribute("aria-label", "Sélectionner le parc " + parc.nom);
        caseParc.addEventListener("change", () => {
          if (caseParc.checked) parcsChoisis.add(String(parc.idparc));
          else parcsChoisis.delete(String(parc.idparc));
          majSelection();
        });
        choix.appendChild(caseParc);
        const nom = creer("td");
        const ouvrir = creer("button", "lcdp-cle-suivi__nom", String(parc.nom));
        ouvrir.type = "button";
        ouvrir.addEventListener("click", () => modifier([parc]));
        nom.appendChild(ouvrir);
        tr.append(choix, creer("td", "", String(parc.dptmt || "")),
          nom, creer("td", "", minutes(parc.effective?.bracelet_secondes)),
          creer("td", "", minutes(parc.effective?.image_secondes)));
        fragment.appendChild(tr);
      }
      corps.replaceChildren(fragment);
      suite.hidden = lignes.length <= affiches;
      note.textContent = lignes.length ? "" : "Aucun parc en ligne ne correspond aux filtres.";
      majSelection();
    }
    function proposer() {
      suggestions.replaceChildren();
      if (!normaliser(recherche.value)) return;
      const mots = [...new Set(parcs.filter(p => !dptsChoisis.size ||
        dptsChoisis.has(String(p.dptmt || "").toUpperCase()))
        .map(p => String(p.nom || "")))].filter(n =>
        normaliser(n).includes(normaliser(recherche.value)));
      mots.sort((a, b) =>
        Number(normaliser(b).startsWith(normaliser(recherche.value))) -
        Number(normaliser(a).startsWith(normaliser(recherche.value)))
        || a.localeCompare(b, "fr", {sensitivity:"base"})
      );
      for (const mot of mots.slice(0, 12)) {
        const bouton = creer("button", "lcdp-cle-admin__suggestion", mot);
        bouton.type = "button";
        bouton.addEventListener("click", () => {
          recherche.value = mot; texteRecherche = mot; affiches = 200;
          suggestions.replaceChildren(); rendre();
        });
        suggestions.appendChild(bouton);
      }
    }
    departement.addEventListener("click", async () => {
      departement.disabled = true;
      try {
        const code = await choisirDepartementCle(departements, "Filtrer par département");
        if (code) {
          dptsChoisis.add(String(code).toUpperCase());
          affiches = 200;
          afficherJetons(); proposer(); rendre();
        }
      } catch (error) {
        note.textContent = String(error?.message || "Département indisponible.");
      } finally {
        departement.disabled = false;
      }
    });
    recherche.addEventListener("input", () => {
      texteRecherche = recherche.value;
      affiches = 200;
      proposer(); rendre();
    });
    selectionner.addEventListener("click", () => {
      for (const parc of filtrer()) parcsChoisis.add(String(parc.idparc));
      rendre();
    });
    effacer.addEventListener("click", () => {
      parcsChoisis.clear();
      rendre();
    });
    suite.addEventListener("click", () => {
      affiches += 200;
      rendre();
    });
    grouper.addEventListener("click", () => {
      modifier(parcs.filter(p => parcsChoisis.has(String(p.idparc))));
    });

    function modifier(cibles) {
      if (!cibles.length) return;
      edition.replaceChildren();
      const formulaire = creer("form", "lcdp-cle-suivi__form");
      const groupe = cibles.length > 1;
      const titre = creer("h3", "", groupe
        ? "Modifier " + cibles.length + " parcs"
        : "Modifier " + cibles[0].nom);
      const champs = [
        ["bracelet_secondes", "Refresh couleur du bracelet (minutes)"],
        ["image_secondes", "Refresh des trois couleurs de l’application (minutes)"]
      ];
      const controles = {};
      for (const [cle, libelle] of champs) {
        const label = creer("label", "", libelle);
        const champ = creer("input");
        champ.type = "number";
        champ.min = "1";
        champ.max = "1440";
        champ.step = "any";
        champ.required = true;
        champ.value = groupe ? "" : minutes(cibles[0].effective?.[cle]);
        champ.placeholder = groupe ? "Valeur commune en minutes" : "";
        controles[cle] = champ;
        label.appendChild(champ);
        formulaire.appendChild(label);
      }
      const enregistrer = creer("button", "lcdp-button lcdp-button-orange", "Enregistrer");
      enregistrer.type = "submit";
      const annuler = creer("button", "lcdp-button lcdp-button-secondary", "Annuler");
      annuler.type = "button";
      const retour = creer("p", "");
      retour.setAttribute("role", "status");
      annuler.addEventListener("click", () => { edition.hidden = true; });
      formulaire.append(enregistrer, annuler, retour);
      edition.append(titre, formulaire);
      edition.hidden = false;
      edition.scrollIntoView({block:"nearest",behavior:"smooth"});
      formulaire.addEventListener("submit", async event => {
        event.preventDefault();
        if (!formulaire.reportValidity()) return;
        const valeurs = {
          bracelet_secondes: Math.round(Number(controles.bracelet_secondes.value) * 60),
          image_secondes: Math.round(Number(controles.image_secondes.value) * 60)
        };
        if (Object.values(valeurs).some(v => !Number.isInteger(v) ||
            v < 60 || v > 86400)) {
          retour.textContent = "Valeurs invalides.";
          return;
        }
        enregistrer.disabled = true;
        annuler.disabled = true;
        retour.textContent = "";
        try {
          const resultat = await appelSuivi("/admin/monitor/settings/bulk", {
            ids: cibles.map(p => String(p.idparc)),
            values: valeurs
          });
          if (Number(resultat.updated) !== cibles.length)
            throw Error("Nombre de parcs modifiés inattendu.");
          for (const parc of cibles) {
            parc.effective = {...parc.effective, ...valeurs};
            parc.overrides = {...parc.overrides, ...valeurs};
          }
          edition.hidden = true;
          rendre();
          note.textContent = "Refresh enregistré pour " + cibles.length + " parc(s).";
        } catch (error) {
          retour.textContent = String(error?.message || "Enregistrement impossible.");
        } finally {
          enregistrer.disabled = false;
          annuler.disabled = false;
        }
      });
    }
    rendre();
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
