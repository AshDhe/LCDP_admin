(() => {
  "use strict";
  const cfg = window.SITE_CONFIG || {};
  const adminUrl = path => typeof window.LCDP_urlAdmin === "function" ? window.LCDP_urlAdmin(path) : path;
  const publicUrl = path => typeof window.LCDP_urlPublic === "function" ? window.LCDP_urlPublic(path) : path;
  const objetUrl = path => typeof window.LCDP_urlObjet === "function" ? window.LCDP_urlObjet(path) : path;

  async function chargerBandeau() {
    const response = await fetch(adminUrl("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), {
      credentials: "same-origin", cache: "no-cache"
    });
    if (!response.ok) throw new Error("Bandeau administrateur indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    const slot = document.getElementById("lcdp-bandeau-slot");
    slot.replaceChildren(template.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(el => {
      const path = el.dataset.siteHref || "";
      el.href = el.dataset.space === "admin" ? adminUrl(path) : publicUrl(path);
    });
    slot.querySelectorAll("[data-site-src]").forEach(el => {
      el.src = objetUrl(String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
  }

  async function demarrer() {
    const guard = window.LCDP_GUARD_ADMIN;
    if (!guard || typeof guard.verifierAccesPageAdmin !== "function")
      throw new Error("Contrôle d’accès administrateur indisponible.");
    if (!await guard.verifierAccesPageAdmin()) return;
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu || typeof menu.initialiser !== "function")
      throw new Error("Menu administrateur indisponible.");
    await Promise.all([
      chargerBandeau(),
      menu.initialiser({
        slotId: "lcdp-menu-gauche-admin-slot", categorieActive: "membres"
      })
    ]);
    document.getElementById("lcdp-main-admin").hidden = false;
  }

  demarrer().catch(error => {
    console.error("Rubriques Membres admin", error);
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
    const statut = document.getElementById("lcdp-membres-page-statut");
    if (statut) {
      statut.textContent = String(error?.message || "Page indisponible.");
      statut.setAttribute("role", "alert");
    }
  });
})();
