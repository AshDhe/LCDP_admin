(() => {
  const etat = {
    dptmt: "",
    idparc: "",
    plage: "plage1",
    annee: new Date().getFullYear(),
    mois: new Date().getMonth() + 1,
    jours: [],
    parcs: [],
    demarre: false
  };

  const elements = {};

  function initialiser() {
    if (etat.demarre) return;
    etat.demarre = true;

    elements.valeurDepartement = document.getElementById("valeur-departement-dashboard");
    elements.champDepartement = document.getElementById("champ-departement-dashboard");
    elements.boutonAfficherDepartement = document.getElementById("bouton-afficher-departement");
    elements.selectPlage = document.getElementById("select-plage-dashboard");
    elements.selectParc = document.getElementById("select-parc-dashboard");
    elements.boutonMoisPrecedent = document.getElementById("bouton-mois-precedent");
    elements.boutonMoisSuivant = document.getElementById("bouton-mois-suivant");
    elements.titreMois = document.getElementById("titre-mois-dashboard");
    elements.message = document.getElementById("message-dashboard-capacite");
    elements.grille = document.getElementById("grille-dashboard-capacite");

    const params = new URLSearchParams(window.location.search);

    etat.dptmt = nettoyerDptmt(
      params.get("dptmt") ||
      window.localStorage.getItem("adminDashboardCapaciteDptmt") ||
      ""
    );

    const moisParam = Number(params.get("mois"));
    const anneeParam = Number(params.get("annee"));

    if (Number.isInteger(anneeParam) && anneeParam >= 2020 && anneeParam <= 2100) {
      etat.annee = anneeParam;
    }

    if (Number.isInteger(moisParam) && moisParam >= 1 && moisParam <= 12) {
      etat.mois = moisParam;
    }

    etat.plage = params.get("plage") || "plage1";
    etat.idparc = params.get("idparc") || "";

    elements.champDepartement.value = etat.dptmt;
    elements.selectPlage.value = etat.plage;

    installerEcouteurs();
    chargerDashboard();
  }

  function installerEcouteurs() {
    elements.boutonAfficherDepartement.addEventListener("click", () => {
      const dptmt = nettoyerDptmt(elements.champDepartement.value);

      if (!dptmt) {
        afficherMessage("Indique un département.");
        return;
      }

      etat.dptmt = dptmt;
      etat.idparc = "";
      window.localStorage.setItem("adminDashboardCapaciteDptmt", dptmt);
      chargerDashboard();
    });

    elements.champDepartement.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.boutonAfficherDepartement.click();
      }
    });

    elements.selectPlage.addEventListener("change", () => {
      etat.plage = elements.selectPlage.value || "plage1";
      mettreAJourUrl();
      afficherCalendrier();
    });

    elements.selectParc.addEventListener("change", () => {
      etat.idparc = elements.selectParc.value || "";
      chargerDashboard();
    });

    elements.boutonMoisPrecedent.addEventListener("click", () => {
      changerMois(-1);
    });

    elements.boutonMoisSuivant.addEventListener("click", () => {
      changerMois(1);
    });
  }

  function changerMois(delta) {
    const date = new Date(Date.UTC(etat.annee, etat.mois - 1 + delta, 1));

    etat.annee = date.getUTCFullYear();
    etat.mois = date.getUTCMonth() + 1;

    chargerDashboard();
  }

  async function chargerDashboard() {
    if (!etat.dptmt) {
      afficherMessage("Choisis un département pour afficher la capacité.");
      elements.valeurDepartement.textContent = "-";
      elements.grille.innerHTML = "";
      return;
    }

    const endpoint = String(window.ADMIN_CONFIG?.API_DASHBOARD_CAPACITE || "").replace(/\/+$/, "");

    if (!endpoint) {
      afficherMessage("Adresse du service dashboard capacité non configurée.");
      return;
    }

    afficherMessage("Chargement des capacités...");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          dptmt: etat.dptmt,
          idparc: etat.idparc || null,
          annee: etat.annee,
          mois: etat.mois
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || data.success !== true) {
        throw new Error(data?.error || "Impossible de charger les capacités.");
      }

      etat.jours = Array.isArray(data.jours) ? data.jours : [];
      etat.parcs = Array.isArray(data.parcs) ? data.parcs : [];

      remplirSelectParcs();
      elements.valeurDepartement.textContent = etat.dptmt;

      mettreAJourUrl();
      afficherMessage(construireMessageContexte(data));
      afficherCalendrier();

    } catch (error) {
      afficherMessage(error.message || "Erreur de chargement.");
      elements.grille.innerHTML = "";
    }
  }

  function remplirSelectParcs() {
    const valeurCourante = etat.idparc;

    elements.selectParc.innerHTML = "";

    const optionTous = document.createElement("option");
    optionTous.value = "";
    optionTous.textContent = "Tous les parcs du département";
    elements.selectParc.appendChild(optionTous);

    etat.parcs.forEach((parc) => {
      const option = document.createElement("option");
      option.value = parc.idparc;
      option.textContent = parc.nom || "Parc sans nom";
      elements.selectParc.appendChild(option);
    });

    const existe = etat.parcs.some((parc) => parc.idparc === valeurCourante);

    etat.idparc = existe ? valeurCourante : "";
    elements.selectParc.value = etat.idparc;
  }

  function construireMessageContexte(data) {
    const nomPlage = nomPlageDepuisCle(etat.plage);

    if (data.mode === "parc" && data.parc?.nom) {
      return "Vue parc : " + data.parc.nom + " | " + nomPlage + ".";
    }

    return "Vue département " + etat.dptmt + " | " + nomPlage + ".";
  }

  function afficherCalendrier() {
    elements.grille.innerHTML = "";
    elements.titreMois.textContent = nomMois(etat.annee, etat.mois);

    const premierJour = new Date(Date.UTC(etat.annee, etat.mois - 1, 1));
    const dernierJour = new Date(Date.UTC(etat.annee, etat.mois, 0));
    const decalageLundi = (premierJour.getUTCDay() + 6) % 7;
    const nombreJours = dernierJour.getUTCDate();

    for (let i = 0; i < decalageLundi; i += 1) {
      const celluleVide = document.createElement("div");
      celluleVide.className = "jour-capacite jour-capacite-vide";
      elements.grille.appendChild(celluleVide);
    }

    const joursParDate = new Map(
      etat.jours.map((jour) => [jour.datejour, jour])
    );

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      const dateISO = construireDateISO(etat.annee, etat.mois, jour);
      const donneesJour = joursParDate.get(dateISO) || null;
      const capacite = capacitePourJour(donneesJour, etat.plage);

      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "jour-capacite";
      bouton.dataset.datejour = dateISO;
      bouton.dataset.numero = String(jour);
      bouton.dataset.capacite = String(capacite);
      bouton.title = "Jour " + jour + " | capacité " + capacite;

      if (capacite <= 0) {
        bouton.classList.add("jour-capacite-zero");
      }

      if (estAujourdHui(dateISO)) {
        bouton.classList.add("jour-capacite-aujourdhui");
      }

      const valeur = document.createElement("span");
      valeur.className = "jour-capacite-valeur";
      valeur.textContent = String(capacite);

      bouton.appendChild(valeur);

      bouton.addEventListener("click", () => {
        afficherNumeroTemporairement(bouton);
      });

      elements.grille.appendChild(bouton);
    }
  }

  function afficherNumeroTemporairement(bouton) {
    const valeur = bouton.querySelector(".jour-capacite-valeur");

    if (!valeur) return;

    window.clearTimeout(bouton._dashboardCapaciteTimer);

    bouton.classList.add("jour-capacite-numero-affiche");
    valeur.textContent = bouton.dataset.numero || "";

    bouton._dashboardCapaciteTimer = window.setTimeout(() => {
      valeur.textContent = bouton.dataset.capacite || "0";
      bouton.classList.remove("jour-capacite-numero-affiche");
    }, 2000);
  }

  function capacitePourJour(donneesJour, plage) {
    const valeur = donneesJour?.capacite?.[plage];

    if (valeur === null || valeur === undefined || valeur === "") {
      return 0;
    }

    const nombre = Number(valeur);

    return Number.isFinite(nombre) ? nombre : 0;
  }

  function mettreAJourUrl() {
    const url = new URL(window.location.href);

    url.searchParams.set("dptmt", etat.dptmt);
    url.searchParams.set("annee", String(etat.annee));
    url.searchParams.set("mois", String(etat.mois));
    url.searchParams.set("plage", etat.plage);

    if (etat.idparc) {
      url.searchParams.set("idparc", etat.idparc);
    } else {
      url.searchParams.delete("idparc");
    }

    window.history.replaceState(null, "", url.toString());
  }

  function afficherMessage(message) {
    elements.message.textContent = message || "";
  }

  function nettoyerDptmt(value) {
    return String(value || "").trim();
  }

  function nomPlageDepuisCle(plage) {
    if (plage === "plage2") return "après-midi";
    if (plage === "plage3") return "soir";
    return "matin";
  }

  function nomMois(annee, mois) {
    const date = new Date(Date.UTC(annee, mois - 1, 1));

    return date.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    });
  }

  function construireDateISO(annee, mois, jour) {
    return (
      String(annee).padStart(4, "0") +
      "-" +
      String(mois).padStart(2, "0") +
      "-" +
      String(jour).padStart(2, "0")
    );
  }

  function estAujourdHui(dateISO) {
    const maintenant = new Date();

    const aujourdhui =
      String(maintenant.getFullYear()).padStart(4, "0") +
      "-" +
      String(maintenant.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(maintenant.getDate()).padStart(2, "0");

    return dateISO === aujourdhui;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.classList.contains("admin-page-verrouillee")) {
      window.addEventListener("admin-session-validee", initialiser, { once: true });
    } else {
      initialiser();
    }
  });
})();