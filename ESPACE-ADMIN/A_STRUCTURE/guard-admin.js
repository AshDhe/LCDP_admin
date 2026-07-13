(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function construireUrlAdmin(path) {
    const valeur = String(path || "");

    if (typeof config.adminUrl === "function") {
      return config.adminUrl(valeur);
    }

    const base = nettoyerBaseUrl(
      config.adminBaseUrl ||
      config.ADMIN_BASE ||
      config.siteBase ||
      window.ADMIN_CONFIG?.ADMIN_BASE_URL ||
      ""
    );

    return base + "/" + valeur.replace(/^\/+/, "");
  }

  function normaliserCheminPage(pathname) {
    let chemin = String(pathname || "").trim();

    const marqueur = "/ESPACE-ADMIN/";
    const indexMarqueur = chemin.indexOf(marqueur);

    if (indexMarqueur >= 0) {
      chemin = chemin.slice(indexMarqueur);
    }

    chemin = "/" + chemin.replace(/^\/+/, "");
    chemin = chemin.replace(/\/{2,}/g, "/");

    if (chemin.length > 1) {
      chemin = chemin.replace(/\/+$/, "");
    }

    return chemin;
  }

  function endpointAutorisation() {
    return nettoyerBaseUrl(
      config.workerLogSessAdminUrl ||
      config.WORKER_LOG_SESS_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_LOG_SESS_AD ||
      ""
    );
  }

  function redirigerConnexion(reason) {
    const url = new URL(
      construireUrlAdmin("/ESPACE-ADMIN/connexion-admin.html")
    );

    if (reason) {
      url.searchParams.set("reason", reason);
    }

    window.location.replace(url.toString());
  }

  async function verifierAccesPageAdmin(options = {}) {
    const endpoint = endpointAutorisation();

    if (!endpoint) {
      redirigerConnexion("configuration");
      return false;
    }

    const chemin = normaliserCheminPage(
      options.path || window.location.pathname
    );

    try {
      const response = await fetch(
        endpoint + "/authorize?path=" + encodeURIComponent(chemin),
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json"
          }
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || data.success !== true) {
        const reason = response.status === 403
          ? "acces-refuse"
          : "session";

        redirigerConnexion(reason);
        return false;
      }

      window.LCDP_ADMIN_AUTORISATION = Object.freeze({
        admin: data.admin,
        route: data.route,
        permission: data.permission
      });

      return true;
    } catch (error) {
      console.error("Erreur garde admin :", error);
      redirigerConnexion("erreur");
      return false;
    }
  }

  window.LCDP_GUARD_ADMIN = Object.freeze({
    verifierAccesPageAdmin,
    normaliserCheminPage
  });
})();
