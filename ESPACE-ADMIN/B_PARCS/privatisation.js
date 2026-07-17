
(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};

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

  function endpointWorker() {
    return String(
      config.workerPrivatisationAdminUrl ||
      config.WORKER_PRIVATISATION_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_PRIVATISATION_ADMIN ||
      ""
    ).replace(/\/+$/, "");
  }

  async function chargerFragment(url, libelle) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!response.ok) throw new Error(libelle + " introuvable.");

    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragment(
        urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"),
        "Bandeau admin"
      )
    );
  }

  async function initialiserMenuGauche() {
    const moduleMenu = window.LCDP_MENU_GAUCHE_ADMIN;

    if (!moduleMenu || typeof moduleMenu.initialiser !== "function") {
      throw new Error("Menu gauche admin centralisé indisponible.");
    }

    await moduleMenu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "parcs"
    });
  }

  function lireSelectionUrl() {
    const params = new URLSearchParams(window.location.search);
    return {
      dptmt: String(params.get("dptmt") || "").trim(),
      idparc: String(params.get("idparc") || "").trim()
    };
  }

  async function chargerParc() {
    const endpoint = endpointWorker();
    const selection = lireSelectionUrl();

    if (!endpoint || !selection.dptmt || !selection.idparc) return;

    const response = await fetch(
      endpoint + "/parc?" + new URLSearchParams(selection).toString(),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" }
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.success !== true) return;

    const identite = document.getElementById(
      "lcdp-privatisation-identite"
    );

    if (identite) {
      identite.textContent =
        "Parc : " + data.parc.nom +
        " — Département " + data.parc.dptmt;
    }
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

    await Promise.all([
      initialiserBandeau(),
      initialiserMenuGauche(),
      chargerParc()
    ]);

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
  }

  initialiserPage().catch((error) => {
    console.error(error);
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;

    const status = document.getElementById("lcdp-privatisation-status");
    if (status) {
      status.textContent =
        "Privatisation indisponible : " +
        String(error?.message || error || "");
      status.dataset.etat = "erreur";
      status.hidden = false;
    }
  });
})();
