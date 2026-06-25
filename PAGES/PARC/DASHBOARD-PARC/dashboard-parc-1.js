if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", preparerDashboardParc);
} else {
  preparerDashboardParc();
}

function preparerDashboardParc() {
  if (window.sessionAdminVerifiee === true) {
    initialiserDashboardParc();
    return;
  }

  document.addEventListener("admin-session-validee", initialiserDashboardParc, {
    once: true
  });
}

function initialiserDashboardParc() {
  const tbody = document.getElementById("dashboard-parc-tbody");
  const filtre = document.getElementById("filtre-dashboard-parc");
  const message = document.getElementById("dashboard-parc-message");
  const boutonExport = document.getElementById("btn-export-csv");
  const boutonsTri = document.querySelectorAll("[data-sort-key]");

  const endpointDashboardParc = nettoyerBaseUrlDashboardParc(
    window.ADMIN_CONFIG?.API_DASHBOARD_PARC || ""
  );

  const urlConnexionAdmin = construireUrlAdminDashboardParc("/connexion-admin.html");

  let lignes = [];
  let cleTri = "datecreationparc";
  let sensTri = "desc";

  if (!tbody || !filtre || !message || !boutonExport) {
    return;
  }

  if (!endpointDashboardParc) {
    afficherErreur("API_DASHBOARD_PARC n’est pas configurée dans config.js.");
    return;
  }

  filtre.addEventListener("input", afficherTableau);

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

  chargerDashboard();

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
        afficherErreur(data?.error || "Impossible de charger le dashboard parc.");
        return;
      }

      lignes = Array.isArray(data.parcs) ? data.parcs : [];
      afficherTableau();

    } catch (error) {
      afficherErreur(String(error?.message || error || "Erreur de connexion au worker."));
    }
  }

  function afficherChargement() {
    tbody.innerHTML = "";

    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = 5;
    td.textContent = "Chargement...";
    tr.appendChild(td);
    tbody.appendChild(tr);

    message.textContent = "";
  }

  function afficherErreur(texte) {
    tbody.innerHTML = "";

    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = 5;
    td.textContent = texte;
    tr.appendChild(td);
    tbody.appendChild(tr);

    message.textContent = texte;
  }

  function afficherTableau() {
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

    message.textContent =
      `${lignesAffichees.length} parc(s) affiché(s) sur ${lignes.length}.`;
  }

  function lignesFiltreesEtTriees() {
    const recherche = normaliserTexte(filtre.value);

    const filtrees = lignes.filter((parc) => {
      if (!recherche) return true;

      const texte = normaliserTexte([
        formaterDate(parc.datecreationparc),
        parc.nom,
        parc.statut,
        parc.dptmt,
        parc.arrdmt
      ].join(" "));

      return texte.includes(recherche);
    });

    return filtrees.sort((a, b) => comparerLignes(a, b, cleTri, sensTri));
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
    if (!Array.isArray(lignesExport) || lignesExport.length === 0) {
      message.textContent = "Aucune donnée à exporter.";
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

    message.textContent = "Export CSV généré.";
  }
}

function formaterDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

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

function construireUrlAdminDashboardParc(chemin) {
  if (typeof window.construireUrlAdmin === "function") {
    return window.construireUrlAdmin(chemin);
  }

  const adminBaseUrl = nettoyerBaseUrlDashboardParc(
    window.ADMIN_CONFIG?.ADMIN_BASE_URL || ""
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