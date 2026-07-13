(() => {
  "use strict";

  const DELAI_FILTRAGE_MS = 350;

  async function initialiser(options = {}) {
    const slotId = String(options.slotId || "");
    const endpoint = nettoyerBaseUrl(options.endpoint);
    const resource = String(options.resource || "").trim();

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

    if (
      !loading ||
      !scroll ||
      !head ||
      !filtersRow ||
      !body ||
      !empty ||
      !errorBox
    ) {
      throw new Error("Structure de table admin incomplète.");
    }

    const etat = {
      columns: [],
      filters: {},
      filtreTimer: null,
      structureRendue: false
    };

    async function chargerDonnees() {
      try {
        loading.hidden = false;
        errorBox.hidden = true;

        const requestUrl = new URL(endpoint + "/read");

        requestUrl.searchParams.set("resource", resource);

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

        if (response.status === 401 || response.status === 403) {
          redirigerConnexion();
          return false;
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

        if (!etat.structureRendue) {
          rendreEntete(head, columns);
          rendreFiltres(
            filtersRow,
            columns,
            etat,
            chargerDonnees
          );
          etat.structureRendue = true;
        }

        rendreLignes(body, columns, rows);

        loading.hidden = true;
        errorBox.hidden = true;
        empty.hidden = rows.length > 0;
        scroll.hidden = rows.length === 0;

        return true;
      } catch (error) {
        console.error("Erreur table lecture admin :", error);

        loading.hidden = true;
        scroll.hidden = true;
        empty.hidden = true;
        errorBox.textContent = String(
          error?.message || error || "Erreur de chargement."
        );
        errorBox.hidden = false;

        return false;
      }
    }

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

      const input = document.createElement("input");
      const label = String(column.label || column.key || "");

      input.className =
        "lcdp-table-lecture-admin__filter-input";
      input.type = estColonneDate(column) ? "date" : "search";
      input.placeholder = estColonneDate(column)
        ? "AAAA-MM-JJ"
        : "Filtrer";
      input.setAttribute("aria-label", "Filtrer " + label);
      input.autocomplete = "off";

      input.addEventListener("input", () => {
        etat.filters[column.key] = input.value;

        window.clearTimeout(etat.filtreTimer);

        etat.filtreTimer = window.setTimeout(() => {
          chargerDonnees();
        }, DELAI_FILTRAGE_MS);
      });

      cellule.appendChild(input);
      filtersRow.appendChild(cellule);
    });
  }

  function rendreLignes(body, columns, rows) {
    body.innerHTML = "";

    rows.forEach((row) => {
      const ligne = document.createElement("tr");

      columns.forEach((column) => {
        const cellule = document.createElement("td");
        const valeur = row?.[column.key];

        cellule.textContent = formaterValeur(column, valeur);
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
      key.endsWith("date")
    );
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

  window.LCDP_TABLE_LECTURE_ADMIN = Object.freeze({
    initialiser
  });
})();
