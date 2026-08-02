(() => {
  "use strict";

  const DELAI_FILTRAGE_MS = 350;
  const TAILLE_PAGE_DEFAUT = 100;
  const CONTROLEURS = new Map();

  async function initialiser(options = {}) {
    const slotId = String(options.slotId || "");
    const endpoint = nettoyerBaseUrl(options.endpoint);
    const resource = String(options.resource || "").trim();
    const interactiveColumns = new Set(
      Array.isArray(options.interactiveColumns)
        ? options.interactiveColumns
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : []
    );
    const onCellActivate =
      typeof options.onCellActivate === "function"
        ? options.onCellActivate
        : null;
    const interactiveLabel = String(
      options.interactiveLabel ||
      "Ouvrir la fiche du parc"
    ).trim();
    const interactiveLabels =
      options.interactiveLabels &&
      typeof options.interactiveLabels === "object"
        ? { ...options.interactiveLabels }
        : {};
    const initialFilters =
      options.initialFilters &&
      typeof options.initialFilters === "object"
        ? Object.fromEntries(
            Object.entries(options.initialFilters)
              .map(([key, value]) => [
                String(key || "").trim(),
                String(value ?? "").trim()
              ])
              .filter(([key]) => Boolean(key))
          )
        : {};
    const initialSortKey = String(
      options.initialSortKey || ""
    ).trim();
    const initialSortDirection =
      String(options.initialSortDirection || "asc")
        .trim()
        .toLowerCase() === "desc"
        ? "desc"
        : "asc";

    const slot = document.getElementById(slotId);

    if (!slot) {
      throw new Error("Slot de table admin introuvable.");
    }

    if (!endpoint) {
      throw new Error("Endpoint admin data manquant.");
    }

    if (!resource) {
      throw new Error("Code ressource admin manquant.");
    }

    const loading = slot.querySelector(
      "[data-lcdp-table-lecture-admin-loading]"
    );

    const scroll = slot.querySelector(
      "[data-lcdp-table-lecture-admin-scroll]"
    );

    const head = slot.querySelector(
      "[data-lcdp-table-lecture-admin-head]"
    );

    const sortsRow = slot.querySelector(
      "[data-lcdp-table-lecture-admin-sorts]"
    );

    const filtersRow = slot.querySelector(
      "[data-lcdp-table-lecture-admin-filters]"
    );

    const body = slot.querySelector(
      "[data-lcdp-table-lecture-admin-body]"
    );

    const empty = slot.querySelector(
      "[data-lcdp-table-lecture-admin-empty]"
    );

    const errorBox = slot.querySelector(
      "[data-lcdp-table-lecture-admin-error]"
    );

    const pagination = slot.querySelector(
      "[data-lcdp-table-lecture-admin-pagination]"
    );

    const paginationInfo = slot.querySelector(
      "[data-lcdp-table-lecture-admin-pagination-info]"
    );

    const paginationPage = slot.querySelector(
      "[data-lcdp-table-lecture-admin-page]"
    );

    const boutonPrecedent = slot.querySelector(
      "[data-lcdp-table-lecture-admin-previous]"
    );

    const boutonSuivant = slot.querySelector(
      "[data-lcdp-table-lecture-admin-next]"
    );

    if (
      !scroll ||
      !head ||
      !sortsRow ||
      !filtersRow ||
      !body ||
      !empty ||
      !errorBox ||
      !pagination ||
      !paginationInfo ||
      !paginationPage ||
      !boutonPrecedent ||
      !boutonSuivant
    ) {
      throw new Error("Structure de table admin incomplète.");
    }

    const etat = {
      columns: [],
      filters: { ...initialFilters },
      sortKey: initialSortKey,
      sortDirection: initialSortDirection,
      filtreTimer: null,
      structureRendue: false,
      limit: normaliserTaillePage(options.pageSize),
      offset: 0,
      total: 0,
      chargement: false
    };

    if (loading) {
      loading.hidden = true;
      loading.setAttribute("aria-hidden", "true");
    }

    async function chargerDonnees() {
      if (etat.chargement) {
        return false;
      }

      etat.chargement = true;
      boutonPrecedent.disabled = true;
      boutonSuivant.disabled = true;

      try {
        errorBox.hidden = true;

        const requestUrl = new URL(endpoint + "/read");

        requestUrl.searchParams.set("resource", resource);
        requestUrl.searchParams.set("limit", String(etat.limit));
        requestUrl.searchParams.set("offset", String(etat.offset));

        if (etat.sortKey) {
          requestUrl.searchParams.set("sort", etat.sortKey);
          requestUrl.searchParams.set(
            "direction",
            etat.sortDirection === "desc" ? "desc" : "asc"
          );
        }

        Object.entries(etat.filters).forEach(([key, value]) => {
          const texte = String(value || "").trim();

          if (texte) {
            requestUrl.searchParams.set("filter_" + key, texte);
          }
        });

        const response = await fetch(requestUrl.toString(), {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        });

        const data = await response.json().catch(() => null);

        if (response.status === 401) {
          redirigerConnexion();
          return false;
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
            "Impossible de charger les données."
          );
        }

        const columns = Array.isArray(data.columns)
          ? data.columns
          : [];

        const rows = Array.isArray(data.rows)
          ? data.rows
          : [];

        etat.columns = columns;
        etat.total = normaliserEntierPositif(data.total, rows.length);
        etat.limit = normaliserEntierPositif(
          data.limit,
          etat.limit
        );
        etat.offset = normaliserEntierPositif(
          data.offset,
          etat.offset
        );

        if (
          etat.total > 0 &&
          rows.length === 0 &&
          etat.offset >= etat.total
        ) {
          etat.offset =
            Math.floor((etat.total - 1) / etat.limit) *
            etat.limit;
          etat.chargement = false;
          return chargerDonnees();
        }

        if (!etat.structureRendue) {
          rendreEntete(head, columns);
          rendreTris(
            sortsRow,
            columns,
            etat,
            chargerDonnees
          );
          rendreFiltres(
            filtersRow,
            columns,
            etat,
            chargerDonnees
          );
          etat.structureRendue = true;
        }

        actualiserEtatTris(sortsRow, etat);

        rendreLignes(
          body,
          columns,
          rows,
          interactiveColumns,
          onCellActivate,
          interactiveLabel,
          interactiveLabels
        );

        actualiserPagination(
          pagination,
          paginationInfo,
          paginationPage,
          boutonPrecedent,
          boutonSuivant,
          etat,
          rows.length
        );

        errorBox.hidden = true;
        empty.hidden = rows.length > 0;

        /*
         * Les filtres restent visibles même sans résultat.
         * Lorsque plusieurs filtres sont renseignés, ils sont transmis
         * ensemble au worker et combinés avec l'opérateur logique ET.
         */
        scroll.hidden = columns.length === 0;

        return true;
      } catch (error) {
        console.error("Erreur table lecture admin :", error);

        scroll.hidden = true;
        pagination.hidden = true;
        empty.hidden = true;
        errorBox.textContent = String(
          error?.message || error || "Erreur de chargement."
        );
        errorBox.hidden = false;

        return false;
      } finally {
        etat.chargement = false;
      }
    }

    boutonPrecedent.addEventListener("click", () => {
      if (etat.offset <= 0 || etat.chargement) {
        return;
      }

      etat.offset = Math.max(0, etat.offset - etat.limit);
      chargerDonnees();
    });

    boutonSuivant.addEventListener("click", () => {
      if (
        etat.chargement ||
        etat.offset + etat.limit >= etat.total
      ) {
        return;
      }

      etat.offset += etat.limit;
      chargerDonnees();
    });

    CONTROLEURS.set(slotId, {
      recharger: chargerDonnees
    });

    return chargerDonnees();
  }

  function rendreEntete(head, columns) {
    head.innerHTML = "";

    columns.forEach((column) => {
      const cellule = document.createElement("th");
      cellule.scope = "col";
      cellule.textContent = String(
        column.label || column.key || ""
      );
      head.appendChild(cellule);
    });
  }


  function rendreTris(
    sortsRow,
    columns,
    etat,
    chargerDonnees
  ) {
    sortsRow.innerHTML = "";

    columns.forEach((column) => {
      const cellule = document.createElement("th");
      const sortable = column.sortable === true;
      const label = String(column.label || column.key || "");

      cellule.scope = "col";

      if (!sortable) {
        cellule.setAttribute("aria-hidden", "true");
        sortsRow.appendChild(cellule);
        return;
      }

      const actions = document.createElement("div");
      actions.className = "lcdp-table-lecture-admin__sort-actions";

      [
        {
          direction: "asc",
          texte: "↑",
          libelle: "Classer " + label + " par ordre ascendant"
        },
        {
          direction: "desc",
          texte: "↓",
          libelle: "Classer " + label + " par ordre descendant"
        }
      ].forEach((action) => {
        const bouton = document.createElement("button");

        bouton.type = "button";
        bouton.className = "lcdp-table-lecture-admin__sort-button";
        bouton.textContent = action.texte;
        bouton.dataset.lcdpTableSortKey = String(column.key || "");
        bouton.dataset.lcdpTableSortDirection = action.direction;
        bouton.setAttribute("aria-label", action.libelle);
        bouton.setAttribute("aria-pressed", "false");
        bouton.title = action.libelle;

        bouton.addEventListener("click", () => {
          etat.sortKey = String(column.key || "");
          etat.sortDirection = action.direction;
          etat.offset = 0;
          actualiserEtatTris(sortsRow, etat);
          chargerDonnees();
        });

        actions.appendChild(bouton);
      });

      cellule.appendChild(actions);
      sortsRow.appendChild(cellule);
    });
  }

  function actualiserEtatTris(sortsRow, etat) {
    sortsRow
      .querySelectorAll("[data-lcdp-table-sort-key]")
      .forEach((bouton) => {
        const actif =
          bouton.dataset.lcdpTableSortKey === etat.sortKey &&
          bouton.dataset.lcdpTableSortDirection === etat.sortDirection;

        bouton.setAttribute("aria-pressed", String(actif));
      });
  }

  function rendreFiltres(
    filtersRow,
    columns,
    etat,
    chargerDonnees
  ) {
    filtersRow.innerHTML = "";

    columns.forEach((column) => {
      const cellule = document.createElement("th");
      const filterable = column.filterable === true;

      cellule.scope = "col";

      if (!filterable) {
        cellule.setAttribute("aria-hidden", "true");
        filtersRow.appendChild(cellule);
        return;
      }

      const label = String(column.label || column.key || "");
      const controle = estColonneBooleenne(column)
        ? creerFiltreBooleen(label)
        : creerFiltreStandard(column, label);

      controle.value = String(
        etat.filters[column.key] || ""
      );

      controle.addEventListener(
        estColonneBooleenne(column) ? "change" : "input",
        () => {
          etat.filters[column.key] = controle.value;
          etat.offset = 0;

          window.clearTimeout(etat.filtreTimer);

          etat.filtreTimer = window.setTimeout(() => {
            chargerDonnees();
          }, DELAI_FILTRAGE_MS);
        }
      );

      cellule.appendChild(controle);
      filtersRow.appendChild(cellule);
    });
  }

  function creerFiltreStandard(column, label) {
    const input = document.createElement("input");

    input.className =
      "lcdp-table-lecture-admin__filter-input";
    input.type = estColonneDate(column) ? "date" : "search";
    input.placeholder = estColonneDate(column)
      ? "AAAA-MM-JJ"
      : "Filtrer";
    input.setAttribute("aria-label", "Filtrer " + label);
    input.autocomplete = "off";

    return input;
  }

  function creerFiltreBooleen(label) {
    const select = document.createElement("select");

    select.className =
      "lcdp-table-lecture-admin__filter-input";
    select.setAttribute("aria-label", "Filtrer " + label);

    [
      { value: "", label: "Tous" },
      { value: "true", label: "TRUE" },
      { value: "false", label: "FALSE" }
    ].forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });

    return select;
  }

  function rendreLignes(
    body,
    columns,
    rows,
    interactiveColumns,
    onCellActivate,
    interactiveLabel,
    interactiveLabels
  ) {
    body.innerHTML = "";

    rows.forEach((row) => {
      const ligne = document.createElement("tr");

      columns.forEach((column) => {
        const cellule = document.createElement("td");
        const valeur = row?.[column.key];
        const texte = formaterValeur(column, valeur);
        const interactive =
          interactiveColumns.has(String(column.key || "")) &&
          onCellActivate;

        if (interactive) {
          const bouton = document.createElement("button");

          bouton.type = "button";
          bouton.className =
            "lcdp-table-lecture-admin__cell-action";
          bouton.textContent = texte;
          const libelleBase = String(
            interactiveLabels?.[column.key] ||
            interactiveLabel
          ).trim();
          const libelleAction =
            libelleBase + " " + texte;

          bouton.title = libelleAction;
          bouton.setAttribute(
            "aria-label",
            libelleAction
          );

          bouton.addEventListener("click", () => {
            Promise.resolve(
              onCellActivate({
                row,
                column,
                value: valeur
              })
            ).catch((error) => {
              console.error(
                "Erreur action cellule table admin :",
                error
              );
            });
          });

          cellule.appendChild(bouton);
        } else {
          cellule.textContent = texte;
        }

        ligne.appendChild(cellule);
      });

      body.appendChild(ligne);
    });
  }

  function formaterValeur(column, valeur) {
    if (
      valeur === null ||
      valeur === undefined ||
      valeur === ""
    ) {
      return "—";
    }

    if (estColonneDate(column)) {
      const date = new Date(valeur);

      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat("fr-CA", {
          timeZone: "Europe/Paris",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(date);
      }
    }

    return String(valeur);
  }

  function estColonneDate(column) {
    const key = String(column?.key || "").toLowerCase();

    return (
      key === "date" ||
      key.startsWith("date") ||
      key.endsWith("_date") ||
      key.endsWith("date") ||
      key === "created_at" ||
      key === "updated_at" ||
      key.endsWith("_at")
    );
  }

  function estColonneBooleenne(column) {
    const key = String(column?.key || "").toLowerCase();

    return (
      key === "tiktok" ||
      key === "abbaye" ||
      key === "active" ||
      key === "actif"
    );
  }

  function actualiserPagination(
    pagination,
    paginationInfo,
    paginationPage,
    boutonPrecedent,
    boutonSuivant,
    etat,
    nombreLignes
  ) {
    if (etat.total < 1) {
      pagination.hidden = true;
      paginationInfo.textContent = "";
      paginationPage.textContent = "";
      boutonPrecedent.disabled = true;
      boutonSuivant.disabled = true;
      return;
    }

    const pageCourante =
      Math.floor(etat.offset / etat.limit) + 1;
    const totalPages = Math.max(
      1,
      Math.ceil(etat.total / etat.limit)
    );
    const debut = etat.offset + 1;
    const fin = Math.min(
      etat.offset + nombreLignes,
      etat.total
    );

    paginationInfo.textContent =
      "Résultats " +
      formaterNombre(debut) +
      " à " +
      formaterNombre(fin) +
      " sur " +
      formaterNombre(etat.total);

    paginationPage.textContent =
      "Page " +
      formaterNombre(pageCourante) +
      " sur " +
      formaterNombre(totalPages);

    boutonPrecedent.disabled = pageCourante <= 1;
    boutonSuivant.disabled = pageCourante >= totalPages;
    pagination.hidden = false;
  }

  function formaterNombre(value) {
    return new Intl.NumberFormat("fr-FR").format(
      Number(value) || 0
    );
  }

  function normaliserTaillePage(value) {
    const nombre = Number(value);

    if (!Number.isInteger(nombre)) {
      return TAILLE_PAGE_DEFAUT;
    }

    return Math.min(200, Math.max(1, nombre));
  }

  function normaliserEntierPositif(value, fallback) {
    const nombre = Number(value);

    if (!Number.isInteger(nombre) || nombre < 0) {
      return fallback;
    }

    return nombre;
  }

  function redirigerConnexion() {
    const config = window.SITE_CONFIG || {};
    const path = "/ESPACE-ADMIN/connexion-admin.html";

    if (typeof config.adminUrl === "function") {
      window.location.replace(config.adminUrl(path));
      return;
    }

    window.location.replace(path);
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function recharger(slotId) {
    const controleur = CONTROLEURS.get(String(slotId || ""));

    if (!controleur || typeof controleur.recharger !== "function") {
      return Promise.resolve(false);
    }

    return controleur.recharger();
  }

  window.LCDP_TABLE_LECTURE_ADMIN = Object.freeze({
    initialiser,
    recharger
  });
})();
