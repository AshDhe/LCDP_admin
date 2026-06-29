(function () {
  "use strict";

  window.LCDP_initialiserAdminParcDashboardParc = initialiserAdminParcDashboardParc;

  async function initialiserAdminParcDashboardParc(outils = {}) {
    const config = window.SITE_CONFIG || {};

    const construireUrlAdmin = typeof outils.construireUrlAdmin === "function"
      ? outils.construireUrlAdmin
      : construireUrlAdminFallback;

    const chargerFragmentObjet = typeof outils.chargerFragmentObjet === "function"
      ? outils.chargerFragmentObjet
      : window.LCDP_chargerFragmentObjet;

    const endpointDashboardParc = nettoyerBaseUrlDashboardParc(
      config.workerDashboardParcUrl ||
      config.WORKER_DASHBOARD_PARC_URL ||
      window.ADMIN_CONFIG?.API_DASHBOARD_PARC ||
      ""
    );

    const urlConnexionAdmin = construireUrlAdmin("/ESPACE-ADMIN/connexion-admin.html");

    let lignes = [];
    let cleTri = "datecreationparc";
    let sensTri = "desc";

    if (typeof window.LCDP_creerFormulaire !== "function" || typeof chargerFragmentObjet !== "function") {
      await afficherAlerte("Erreur technique", "Les composants V3 nécessaires au dashboard Parc ne sont pas disponibles.");
      return;
    }

    if (!endpointDashboardParc) {
      await afficherAlerte("Configuration manquante", "L’adresse du service dashboard Parc n’est pas configurée.");
      return;
    }

    await creerFiltres();
    creerTableau();

    const tbody = document.getElementById("dashboard-parc-tbody");
    const filtre = document.getElementById("filtre-dashboard-parc");
    const filtreDptmt = document.getElementById("filtre-dashboard-parc-dptmt");
    const filtreStatut = document.getElementById("filtre-dashboard-parc-statut");
    const message = document.getElementById("dashboard-parc-message");
    const boutonExport = document.getElementById("btn-export-csv");
    const boutonsTri = document.querySelectorAll("[data-sort-key]");

    if (!tbody || !filtre || !filtreDptmt || !filtreStatut || !message || !boutonExport) {
      await afficherAlerte("Erreur technique", "La page dashboard Parc est incomplète.");
      return;
    }

    filtre.addEventListener("input", () => {
      if (filtre.value.trim()) {
        filtreDptmt.value = "";
        filtreStatut.value = "";
      }

      afficherTableau();
    });

    filtreDptmt.addEventListener("change", () => {
      if (filtreDptmt.value) {
        filtre.value = "";
        filtreStatut.value = "";
      }

      afficherTableau();
    });

    filtreStatut.addEventListener("change", () => {
      if (filtreStatut.value) {
        filtre.value = "";
        filtreDptmt.value = "";
      }

      afficherTableau();
    });

    boutonExport.addEventListener("click", () => {
      exporterCsv(lignesFiltreesEtTriees());
    });

    boutonsTri.forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const nouvelleCle = bouton.dataset.sortKey;

        if (!nouvelleCle) return;

        if (cleTri === nouvelleCle) {
          sensTri = sensTri === "asc" ? "desc" : "asc";
        } else {
          cleTri = nouvelleCle;
          sensTri = cleTri === "datecreationparc" ? "desc" : "asc";
        }

        afficherTableau();
      });
    });

    await chargerDashboard();

    async function creerFiltres() {
      await window.LCDP_creerFormulaire("lcdp-dashboard-parc-filtres-slot", {
        id: "form-dashboard-parc-filtres",
        titre: "Filtres",
        sousTitre: "Recherche, département, statut et export.",
        champs: [
          {
            id: "filtre-dashboard-parc",
            name: "filtre-dashboard-parc",
            label: "Recherche globale",
            type: "text",
            placeholder: "Nom, statut, département ou arrondissement",
            autocomplete: "off"
          }
        ],
        bouton: {
          id: "btn-export-csv",
          label: "Export CSV",
          type: "button",
          style: "lcdp-button-secondary"
        }
      });

      const form = document.getElementById("form-dashboard-parc-filtres");
      const fields = form?.querySelector("[data-lcdp-formulaire-fields]");

      if (!fields) {
        throw new Error("Structure du formulaire de filtres incomplète.");
      }

      fields.appendChild(await creerChampSelect({
        id: "filtre-dashboard-parc-dptmt",
        label: "Département"
      }));

      fields.appendChild(await creerChampSelect({
        id: "filtre-dashboard-parc-statut",
        label: "Statut"
      }));
    }

    async function creerChampSelect({ id, label }) {
      const fragment = await chargerFragmentObjet("/BOX/03-box-champ-formulaire.html");
      const element = fragment.querySelector("[data-lcdp-box-champ-formulaire]");
      const labelZone = fragment.querySelector("[data-lcdp-champ-label-zone]");
      const control = fragment.querySelector("[data-lcdp-champ-control]");

      if (!element || !labelZone || !control) {
        throw new Error("Structure du champ formulaire V3 incomplète.");
      }

      const labelElement = document.createElement("label");
      labelElement.className = "lcdp-box-champ-formulaire__label";
      labelElement.setAttribute("for", id);
      labelElement.textContent = label;

      const select = document.createElement("select");
      select.id = id;
      select.name = id;

      labelZone.appendChild(labelElement);
      control.appendChild(select);

      return element;
    }

    function creerTableau() {
      const slot = document.getElementById("lcdp-dashboard-parc-table-slot");

      if (!slot) {
        return;
      }

      slot.innerHTML = "";

      const bloc = document.createElement("div");
      bloc.className = "lcdp-box-formulaire";

      const titre = document.createElement("h2");
      titre.className = "lcdp-box-formulaire__title";
      titre.textContent = "Liste des parcs";
      bloc.appendChild(titre);

      const table = document.createElement("table");
      table.id = "dashboard-parc-table";
      table.className = "lcdp-component";

      const thead = document.createElement("thead");
      const trHead = document.createElement("tr");

      [
        ["datecreationparc", "Date création"],
        ["nom", "Nom parc"],
        ["statut", "Statut"],
        ["dptmt", "Département"],
        ["arrdmt", "Arrondissement"]
      ].forEach(([cle, libelle]) => {
        const th = document.createElement("th");
        th.scope = "col";

        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-link-secondary";
        bouton.dataset.sortKey = cle;
        bouton.textContent = libelle;

        th.appendChild(bouton);
        trHead.appendChild(th);
      });

      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbodyElement = document.createElement("tbody");
      tbodyElement.id = "dashboard-parc-tbody";
      table.appendChild(tbodyElement);

      bloc.appendChild(table);

      const message = document.createElement("p");
      message.id = "dashboard-parc-message";
      message.className = "lcdp-text-muted";
      message.setAttribute("aria-live", "polite");
      bloc.appendChild(message);

      slot.appendChild(bloc);
    }

    async function chargerDashboard() {
      afficherChargement();

      try {
        const response = await fetch(endpointDashboardParc, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json"
          }
        });

        const data = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          window.location.href = urlConnexionAdmin;
          return;
        }

        if (!response.ok || !data || data.success !== true) {
          afficherErreur(data?.error || "Impossible de charger le dashboard Parc.");
          return;
        }

        lignes = Array.isArray(data.parcs) ? data.parcs : [];
        remplirFiltresColonnes();
        afficherTableau();

      } catch (error) {
        afficherErreur(String(error?.message || error || "Erreur de connexion au worker."));
      }
    }

    function remplirFiltresColonnes() {
      remplirSelect(document.getElementById("filtre-dashboard-parc-dptmt"), valeursUniques(lignes, "dptmt"), "Tous");
      remplirSelect(document.getElementById("filtre-dashboard-parc-statut"), valeursUniques(lignes, "statut", true), "Tous");
    }

    function remplirSelect(select, valeurs, libelleTous) {
      if (!select) return;

      select.innerHTML = "";

      const optionTous = document.createElement("option");
      optionTous.value = "";
      optionTous.textContent = libelleTous;
      select.appendChild(optionTous);

      valeurs.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
      });
    }

    function valeursUniques(source, cle, inclureVide = false) {
      const valeurs = new Set();
      let contientVide = false;

      source.forEach((ligne) => {
        const valeur = String(ligne?.[cle] || "").trim();

        if (valeur) {
          valeurs.add(valeur);
        } else {
          contientVide = true;
        }
      });

      const resultat = Array.from(valeurs)
        .sort((a, b) => a.localeCompare(b, "fr", {
          numeric: true,
          sensitivity: "base"
        }))
        .map((valeur) => ({
          value: valeur,
          label: valeur
        }));

      if (inclureVide && contientVide) {
        resultat.unshift({
          value: "__VIDE__",
          label: "Statut vide"
        });
      }

      return resultat;
    }

    function afficherChargement() {
      const tbody = document.getElementById("dashboard-parc-tbody");
      const message = document.getElementById("dashboard-parc-message");

      if (tbody) {
        tbody.innerHTML = "";
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.textContent = "Chargement...";
        tr.appendChild(td);
        tbody.appendChild(tr);
      }

      if (message) {
        message.textContent = "";
      }
    }

    function afficherErreur(texte) {
      const tbody = document.getElementById("dashboard-parc-tbody");
      const message = document.getElementById("dashboard-parc-message");

      if (tbody) {
        tbody.innerHTML = "";
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.textContent = texte;
        tr.appendChild(td);
        tbody.appendChild(tr);
      }

      if (message) {
        message.textContent = texte;
      }
    }

    function afficherTableau() {
      const tbody = document.getElementById("dashboard-parc-tbody");
      const message = document.getElementById("dashboard-parc-message");

      if (!tbody || !message) return;

      const lignesAffichees = lignesFiltreesEtTriees();
      tbody.innerHTML = "";

      if (lignesAffichees.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.textContent = "Aucun parc à afficher.";
        tr.appendChild(td);
        tbody.appendChild(tr);
        message.textContent = "0 parc affiché.";
        return;
      }

      lignesAffichees.forEach((parc) => {
        const tr = document.createElement("tr");
        ajouterCellule(tr, formaterDate(parc.datecreationparc));
        ajouterCellule(tr, parc.nom || "");
        ajouterCellule(tr, valeurLisible(parc.statut));
        ajouterCellule(tr, parc.dptmt || "");
        ajouterCellule(tr, parc.arrdmt || "");
        tbody.appendChild(tr);
      });

      message.textContent = `${lignesAffichees.length} parc(s) affiché(s) sur ${lignes.length}.`;
    }

    function lignesFiltreesEtTriees() {
      const filtre = document.getElementById("filtre-dashboard-parc");
      const filtreDptmt = document.getElementById("filtre-dashboard-parc-dptmt");
      const filtreStatut = document.getElementById("filtre-dashboard-parc-statut");

      const recherche = normaliserTexte(filtre?.value || "");
      const dptmtSelectionne = filtreDptmt?.value || "";
      const statutSelectionne = filtreStatut?.value || "";

      const filtrees = lignes.filter((parc) => {
        if (recherche) {
          const texte = normaliserTexte([
            formaterDate(parc.datecreationparc),
            parc.nom,
            parc.statut,
            parc.dptmt,
            parc.arrdmt
          ].join(" "));

          return texte.includes(recherche);
        }

        if (dptmtSelectionne) {
          return correspondValeurFiltre(parc.dptmt, dptmtSelectionne);
        }

        if (statutSelectionne) {
          return correspondValeurFiltre(parc.statut, statutSelectionne);
        }

        return true;
      });

      return filtrees.sort((a, b) => comparerLignes(a, b, cleTri, sensTri));
    }

    function correspondValeurFiltre(value, filtreValue) {
      const valeur = String(value || "").trim();

      if (filtreValue === "__VIDE__") {
        return !valeur;
      }

      return valeur === filtreValue;
    }

    function comparerLignes(a, b, cle, sens) {
      let valeurA = a?.[cle] ?? "";
      let valeurB = b?.[cle] ?? "";

      if (cle === "datecreationparc") {
        valeurA = valeurA ? new Date(valeurA).getTime() : 0;
        valeurB = valeurB ? new Date(valeurB).getTime() : 0;
      } else {
        valeurA = normaliserTexte(String(valeurA));
        valeurB = normaliserTexte(String(valeurB));
      }

      if (valeurA < valeurB) {
        return sens === "asc" ? -1 : 1;
      }

      if (valeurA > valeurB) {
        return sens === "asc" ? 1 : -1;
      }

      return 0;
    }

    function ajouterCellule(tr, texte) {
      const td = document.createElement("td");
      td.textContent = texte;
      tr.appendChild(td);
    }

    function exporterCsv(lignesExport) {
      const message = document.getElementById("dashboard-parc-message");

      if (!Array.isArray(lignesExport) || lignesExport.length === 0) {
        if (message) message.textContent = "Aucune donnée à exporter.";
        return;
      }

      const entetes = [
        "Date création",
        "Nom parc",
        "Statut",
        "Département",
        "Arrondissement"
      ];

      const lignesCsv = [
        entetes,
        ...lignesExport.map((parc) => [
          formaterDate(parc.datecreationparc),
          parc.nom || "",
          valeurLisible(parc.statut),
          parc.dptmt || "",
          parc.arrdmt || ""
        ])
      ];

      const contenu = "\ufeff" + lignesCsv
        .map((ligne) => ligne.map(echapperCsv).join(";"))
        .join("\n");

      const blob = new Blob([contenu], {
        type: "text/csv;charset=utf-8"
      });

      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");

      lien.href = url;
      lien.download = `dashboard-parc-${dateFichier()}.csv`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();

      URL.revokeObjectURL(url);

      if (message) message.textContent = "Export CSV généré.";
    }

    async function afficherAlerte(titre, message) {
      const slot = document.getElementById("lcdp-lightbox-slot");

      if (!slot || typeof chargerFragmentObjet !== "function") {
        window.alert(message);
        return;
      }

      slot.innerHTML = "";

      const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
      slot.appendChild(fragment);

      const alerte = slot.querySelector("[data-lcdp-box-alerte]");
      const texte = slot.querySelector("[data-lcdp-alerte-message]");
      const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
      const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

      if (!alerte || !texte || !boutonFermer || !boutonOk) {
        slot.innerHTML = "";
        window.alert(message);
        return;
      }

      texte.textContent = titre ? `${titre} — ${message}` : message;

      const fermer = () => {
        slot.innerHTML = "";
      };

      boutonFermer.addEventListener("click", fermer);
      boutonOk.addEventListener("click", fermer);
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer();
      });
    }
  }

  function formaterDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function valeurLisible(value) {
    const texte = String(value || "").trim();
    return texte || "—";
  }

  function normaliserTexte(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function echapperCsv(value) {
    const texte = String(value || "");
    return `"${texte.replace(/"/g, '""')}"`;
  }

  function dateFichier() {
    return new Date().toISOString().slice(0, 10);
  }

  function construireUrlAdminFallback(chemin) {
    const adminBaseUrl = nettoyerBaseUrlDashboardParc(
      window.ADMIN_CONFIG?.ADMIN_BASE_URL || window.SITE_CONFIG?.adminBaseUrl || ""
    );

    return joindreBaseEtCheminDashboardParc(adminBaseUrl, chemin);
  }

  function joindreBaseEtCheminDashboardParc(baseUrl, chemin) {
    const base = nettoyerBaseUrlDashboardParc(baseUrl);
    const cheminNettoye = "/" + String(chemin || "").replace(/^\/+/, "");

    if (!base) {
      return cheminNettoye;
    }

    return base + cheminNettoye;
  }

  function nettoyerBaseUrlDashboardParc(value) {
    return String(value || "").replace(/\/+$/, "");
  }
})();
