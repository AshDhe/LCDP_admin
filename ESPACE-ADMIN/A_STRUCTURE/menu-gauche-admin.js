(() => {
  "use strict";

  const CATEGORIES = Object.freeze([
    Object.freeze({
      id: "admin",
      label: "Admin",
      cat: "Admin",
      fallback: "Admin"
    }),
    Object.freeze({
      id: "parcs",
      label: "Parcs",
      cat: "Parcs",
      fallback: "Parc"
    }),
    Object.freeze({
      id: "membres",
      label: "Membres",
      cat: "Membres",
      fallback: "Membres"
    })
  ]);

  function adminUrl(path) {
    const config = window.SITE_CONFIG || {};

    if (typeof config.adminUrl === "function") {
      return config.adminUrl(path);
    }

    return path;
  }

  function objetUrl(path) {
    const config = window.SITE_CONFIG || {};

    if (typeof config.objetUrl === "function") {
      return config.objetUrl(path);
    }

    return path;
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

  async function initialiser(options = {}) {
    const slot = document.getElementById(String(options.slotId || ""));
    const categorieActive = String(options.categorieActive || "");

    if (!slot) {
      throw new Error("Slot du menu gauche admin introuvable.");
    }

    slot.innerHTML = "";

    const [menuGauche, menuBouton] = await Promise.all([
      chargerFragment(
        adminUrl("/ESPACE-ADMIN/A_STRUCTURE/menu-gauche-admin.html"),
        "Menu gauche admin"
      ),
      chargerFragment(
        objetUrl("/BOX/02-box-menu-bouton.html"),
        "Menu bouton générique"
      )
    ]);

    slot.appendChild(menuGauche);

    const emplacement = slot.querySelector(
      "[data-lcdp-menu-gauche-admin-slot]"
    );

    if (!emplacement) {
      throw new Error("Structure du menu gauche admin incomplète.");
    }

    emplacement.appendChild(menuBouton);

    const nav = emplacement.querySelector("[data-lcdp-box-menu-bouton]");
    const liste = emplacement.querySelector("[data-lcdp-menu-bouton-list]");

    if (!nav || !liste) {
      throw new Error("Objet 02-box-menu-bouton incomplet.");
    }

    nav.setAttribute("aria-label", "Catégories de l’espace admin");

    CATEGORIES.forEach((categorie) => {
      const lien = document.createElement("a");

      lien.className = "lcdp-button lcdp-button-primary";
      lien.textContent = categorie.label;
      lien.href = adminUrl(
        "/ESPACE-ADMIN/accueil-admin.html?categorie=" +
        encodeURIComponent(categorie.id)
      );

      if (categorie.id === categorieActive) {
        lien.setAttribute("aria-current", "page");
      }

      liste.appendChild(lien);
    });

    return true;
  }

  function getCategories() {
    return CATEGORIES.map((categorie) => ({ ...categorie }));
  }

  window.LCDP_MENU_GAUCHE_ADMIN = Object.freeze({
    initialiser,
    getCategories
  });
})();
