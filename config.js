(function () {
  "use strict";

  const host = window.location.hostname;

  const isGithub =
    host === "ashdhe.github.io" ||
    host === "huguespavret.github.io";

  const githubOwner = host === "huguespavret.github.io"
    ? "huguespavret"
    : "ashdhe";

  const CONFIG = {
    github: {
      publicBase: "https://" + githubOwner + ".github.io/LCDP_public",
      membreBase: "https://" + githubOwner + ".github.io/LCDP_membre",
      parcBase: "https://" + githubOwner + ".github.io/LCDP_parc",
      coachBase: "https://" + githubOwner + ".github.io/LCDP_coach",
      adminBase: "https://" + githubOwner + ".github.io/LCDP_admin"
    },

    production: {
      publicBase: "https://lacleduparc.fr",
      membreBase: "https://membre.lacleduparc.fr",
      parcBase: "https://parc.lacleduparc.fr",
      coachBase: "https://coach.lacleduparc.fr",
      adminBase: "https://admin.lacleduparc.fr"
    }
  };

  const active = isGithub ? CONFIG.github : CONFIG.production;

  const WORKERS = {
    logSessAdmin: "https://ad-log-sess-api.lacleduparc.fr",

    creaParc: "https://crea-parc-api.lacleduparc.fr",
    dashboardParc: "https://dashboard-parc-api.lacleduparc.fr",
    dashboardCapacite: "https://dashboard-capacite-api.lacleduparc.fr",

    autocompleteParc: "https://autocomplete-parc-api.lacleduparc.fr",
    iaShiftHparcs1: "https://ia-shift-hparcs-1-api.lacleduparc.fr",
    iaShiftHparcs2: "https://ia-shift-hparcs-2-api.lacleduparc.fr",

    writeInHparcs: "https://write-in-hparcs-api.lacleduparc.fr"
  };

  function buildUrl(base, path) {
    return String(base || "").replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
  }

  const objetBase = buildUrl(active.publicBase, "/OBJET");

  window.SITE_BASE = active.adminBase;

  window.SITE_CONFIG = {
    publicBaseUrl: active.publicBase,
    membreBaseUrl: active.membreBase,
    parcBaseUrl: active.parcBase,
    coachBaseUrl: active.coachBase,
    adminBaseUrl: active.adminBase,

    objetBaseUrl: objetBase,

    siteBase: active.adminBase,

    workerLogSessAdminUrl: WORKERS.logSessAdmin,

    workerCreaParcUrl: WORKERS.creaParc,
    workerDashboardParcUrl: WORKERS.dashboardParc,
    workerDashboardCapaciteUrl: WORKERS.dashboardCapacite,

    workerAutocompleteParcUrl: WORKERS.autocompleteParc,
    workerIaShiftHparcs1Url: WORKERS.iaShiftHparcs1,
    workerIaShiftHparcs2Url: WORKERS.iaShiftHparcs2,

    workerWriteInHparcsUrl: WORKERS.writeInHparcs,

    PUBLIC_BASE: active.publicBase,
    MEMBRE_BASE: active.membreBase,
    PARC_BASE: active.parcBase,
    COACH_BASE: active.coachBase,
    ADMIN_BASE: active.adminBase,
    OBJET_BASE: objetBase,

    WORKER_LOG_SESS_ADMIN_URL: WORKERS.logSessAdmin,

    WORKER_CREA_PARC_URL: WORKERS.creaParc,
    WORKER_DASHBOARD_PARC_URL: WORKERS.dashboardParc,
    WORKER_DASHBOARD_CAPACITE_URL: WORKERS.dashboardCapacite,

    WORKER_AUTOCOMPLETE_PARC_URL: WORKERS.autocompleteParc,
    WORKER_IA_SHIFT_HPARCS_1_URL: WORKERS.iaShiftHparcs1,
    WORKER_IA_SHIFT_HPARCS_2_URL: WORKERS.iaShiftHparcs2,

    WORKER_WRITE_IN_HPARCS_URL: WORKERS.writeInHparcs,

    publicUrl(path) {
      return buildUrl(active.publicBase, path);
    },

    membreUrl(path) {
      return buildUrl(active.membreBase, path);
    },

    parcUrl(path) {
      return buildUrl(active.parcBase, path);
    },

    coachUrl(path) {
      return buildUrl(active.coachBase, path);
    },

    adminUrl(path) {
      return buildUrl(active.adminBase, path);
    },

    objetUrl(path) {
      return buildUrl(objetBase, path);
    },

    apiUrl(workerSubdomain) {
      return "https://" + workerSubdomain + ".lacleduparc.fr";
    }
  };

  window.ADMIN_CONFIG = {
    ADMIN_BASE_URL: active.adminBase,

    API_LOG_SESS_AD: WORKERS.logSessAdmin,

    API_CREA_PARC: WORKERS.creaParc,
    API_DASHBOARD_PARC: WORKERS.dashboardParc,
    API_DASHBOARD_CAPACITE: WORKERS.dashboardCapacite,

    API_AUTOCOMPLETE_PARC: WORKERS.autocompleteParc,
    API_IA_SHIFT_HPARCS_1: WORKERS.iaShiftHparcs1,
    API_IA_SHIFT_HPARCS_2: WORKERS.iaShiftHparcs2,

    API_WRITE_IN_HPARCS: WORKERS.writeInHparcs
  };
})();
