(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const route = path => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(path) : path;

  async function chargerBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    const url = route("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html");
    const reponse = await fetch(url, { credentials:"same-origin",cache:"no-cache" });
    if (!reponse.ok) throw Error("Bandeau administrateur indisponible.");
    const modele = document.createElement("template");
    modele.innerHTML = (await reponse.text()).trim();
    slot.replaceChildren(modele.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(lien => {
      const destination = lien.getAttribute("data-site-href") || "";
      if (lien.getAttribute("data-space") === "admin") lien.href = route(destination);
    });
    slot.querySelectorAll("[data-site-src]").forEach(image => {
      const chemin = String(image.dataset.siteSrc || "").replace(/^\/?OBJET\/?/,"/");
      if (typeof window.LCDP_urlObjet === "function") image.src = window.LCDP_urlObjet(chemin);
    });
  }

  async function chargerMenu() {
    const moduleMenu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!moduleMenu || typeof moduleMenu.initialiser !== "function")
      throw Error("Menu administrateur indisponible.");
    await moduleMenu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "admin"
    });
  }

  const nombre = valeur => {
    const v = Number(valeur);
    return Number.isFinite(v) ? new Intl.NumberFormat("fr-FR").format(v) : "—";
  };
  const prix = valeur => valeur === null || valeur === undefined
    ? "—"
    : new Intl.NumberFormat("fr-FR", {style:"currency",currency:"EUR"})
        .format(Number(valeur));

  function rendre(rows) {
    const tbody = document.getElementById("lcdp-suiviabo-lignes");
    const totaux = rows.find(r => Number(r.groupe) === 2);
    if (!totaux) throw Error("Ligne de total absente de la synthèse.");
    const autres = rows.filter(r => Number(r.groupe) !== 2)
      .sort((a,b) =>
        Number(a.groupe) - Number(b.groupe) ||
        String(a.typeabo || "").localeCompare(String(b.typeabo || ""), "fr", {numeric:true})
      );
    const fragment = document.createDocumentFragment();
    for (const ligne of [...autres,totaux]) {
      const tr = document.createElement("tr");
      const total = Number(ligne.groupe) === 2;
      if (total) tr.className = "lcdp-suiviabo__total";
      else if (Number(ligne.groupe) === 1) tr.className = "lcdp-suiviabo__historique";
      const valeurs = [
        ligne.formule,
        total ? "" : ligne.typeabo,
        total ? "" : prix(ligne.prix_ttc),
        nombre(ligne.abonnements_en_cours),
        nombre(ligne.membres_en_cours),
        nombre(ligne.abonnements_a_venir)
      ];
      valeurs.forEach((valeur,indice) => {
        const cellule = document.createElement(indice === 0 ? "th" : "td");
        if (indice === 0) cellule.scope = "row";
        cellule.textContent = String(valeur ?? "");
        if (indice >= 3) cellule.classList.add("lcdp-suiviabo__nombre");
        tr.appendChild(cellule);
      });
      fragment.appendChild(tr);
    }
    tbody.replaceChildren(fragment);
    document.getElementById("lcdp-suiviabo-offres").textContent =
      nombre(autres.filter(x => Number(x.groupe) === 0).length);
    document.getElementById("lcdp-suiviabo-abonnements").textContent =
      nombre(totaux.abonnements_en_cours);
    document.getElementById("lcdp-suiviabo-membres").textContent =
      nombre(totaux.membres_en_cours);
    document.getElementById("lcdp-suiviabo-avenir").textContent =
      nombre(totaux.abonnements_a_venir);
    document.getElementById("lcdp-suiviabo-chiffres").hidden = false;
  }

  async function actualiser() {
    const statut = document.getElementById("lcdp-suiviabo-statut");
    const bouton = document.getElementById("lcdp-suiviabo-actualiser");
    const endpoint = String(config.workerAdminDataUrl ||
      config.WORKER_ADMIN_DATA_URL || "").replace(/\/+$/,"");
    if (!endpoint) throw Error("Service de données administrateur non configuré.");
    bouton.disabled = true;
    statut.setAttribute("role","status");
    statut.textContent = "Actualisation des abonnements…";
    try {
      const url = new URL(endpoint + "/read");
      url.searchParams.set("resource", "suiviabo");
      url.searchParams.set("limit", "200");
      const response = await fetch(url.toString(), {
        method:"GET",credentials:"include",cache:"no-store",
        headers:{Accept:"application/json"}
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        window.location.replace(route("/ESPACE-ADMIN/connexion-admin.html"));
        return;
      }
      if (!response.ok || data?.success !== true || !Array.isArray(data.rows)) {
        throw Error(data?.message || data?.detail || "Synthèse indisponible.");
      }
      if (Number(data.total) > data.rows.length)
        throw Error("Réponse incomplète : pagination supplémentaire nécessaire.");
      rendre(data.rows);
      statut.textContent = "Actualisé le " +
        new Intl.DateTimeFormat("fr-FR", {
          timeZone:"Europe/Paris",dateStyle:"short",timeStyle:"short"
        }).format(new Date());
    } catch (error) {
      statut.setAttribute("role","alert");
      statut.textContent = String(error?.message || "Erreur de chargement.");
    } finally {
      bouton.disabled = false;
    }
  }

  async function demarrer() {
    const garde = window.LCDP_GUARD_ADMIN;
    if (!garde || typeof garde.verifierAccesPageAdmin !== "function")
      throw Error("Contrôle d'accès administrateur indisponible.");
    if (!await garde.verifierAccesPageAdmin()) return;
    await Promise.all([chargerBandeau(),chargerMenu()]);
    document.getElementById("lcdp-main-admin").hidden = false;
    document.getElementById("lcdp-suiviabo-actualiser")
      .addEventListener("click", () => { actualiser().catch(console.error); });
    await actualiser();
  }
  demarrer().catch(error => {
    console.error(error);
    const statut = document.getElementById("lcdp-suiviabo-statut");
    if (statut) {
      document.getElementById("lcdp-main-admin").hidden = false;
      statut.setAttribute("role","alert");
      statut.textContent = String(error?.message || "SuiviAbo indisponible.");
    }
  });
})();
