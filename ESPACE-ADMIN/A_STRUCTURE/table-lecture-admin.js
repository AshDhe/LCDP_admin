(() => {
  "use strict";

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

    const body = slot.querySelector(
      "[data-lcdp-table-lecture-admin-body]"
    );

    const empty = slot.querySelector(
      "[data-lcdp-table-lecture-admin-empty]"
    );

    const errorBox = slot.querySelector(
      "[data-lcdp-table-lecture-admin-error]"
    );

    if (!loading || !scroll || !head || !body || !empty || !errorBox) {
      throw new Error("Structure de table admin incomplète.");
    }

    try {
      const response = await fetch(
        endpoint + "/read?resource=" + encodeURIComponent(resource),
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        }
      );

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

      const columns = Array.isArray(data.columns) ? data.columns : [];
      const rows = Array.isArray(data.rows) ? data.rows : [];

      rendreEntete(head, columns);
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

  function rendreEntete(head, columns) {
    head.innerHTML = "";

    columns.forEach((column) => {
      const cellule = document.createElement("th");
      cellule.scope = "col";
      cellule.textContent = String(column.label || column.key || "");
      head.appendChild(cellule);
    });
  }

  function rendreLignes(body, columns, rows) {
    body.innerHTML = "";

    rows.forEach((row) => {
      const ligne = document.createElement("tr");

      columns.forEach((column) => {
        const cellule = document.createElement("td");
        const valeur = row?.[column.key];

        cellule.textContent =
          valeur === null || valeur === undefined || valeur === ""
            ? "—"
            : String(valeur);

        ligne.appendChild(cellule);
      });

      body.appendChild(ligne);
    });
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
