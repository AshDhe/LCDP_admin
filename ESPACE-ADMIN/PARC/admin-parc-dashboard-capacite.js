(function () {
  "use strict";

  window.LCDP_initialiserAdminParcDashboardCapacite = initialiserAdminParcDashboardCapacite;

  async function initialiserAdminParcDashboardCapacite(outils = {}) {
    const config = window.SITE_CONFIG || {};

    const construireUrlAdmin = typeof outils.construireUrlAdmin === "function"
      ? outils.construireUrlAdmin
      : construireUrlAdminFallback;

    const chargerFragmentObjet = typeof outils.chargerFragmentObjet === "function"
      ? outils.chargerFragmentObjet
      : window.LCDP_chargerFragmentObjet;

    const endpointDashboardCapacite = nettoyerBaseUrlDashboardCapacite(
      config.workerDashboardCapaciteUrl ||
      config.WORKER_DASHBOARD_CAPACITE_URL ||
      window.ADMIN_CONFIG?.API_DASHBOARD_CAPACITE ||
      ""
    );

    const endpointWriteInHparcs = nettoyerBaseUrlDashboardCapacite(
      config.workerWriteInHparcsUrl ||
      config.WORKER_WRITE_IN_HPARCS_URL ||
      window.ADMIN_CONFIG?.API_WRITE_IN_HPARCS ||
      ""
    );

    const urlConnexionAdmin = construireUrlAdmin("/ESPACE-ADMIN/connexion-admin.html");
    const urlRetourParc = construireUrlAdmin("/ESPACE-ADMIN/PARC/admin-parc-accueil-parc.html");

    const etat = {
      dptmt: "",
      idparc: "",
      plage: "plage1",
      annee: new Date().getFullYear(),
      mois: new Date().getMonth() + 1,
      jours: [],
      parcs: [],
      recalculEnCours: false
    };

    if (typeof window.LCDP_creerFormulaire !== "function" || typeof chargerFragmentObjet !== "function") {
      await afficherAlerte("Erreur technique", "Les composants V3 nécessaires au dashboard capacité ne sont pas disponibles.");
      return;
    }

    if (!endpointDashboardCapacite) {
      await afficherAlerte("Configuration manquante", "L’adresse du service dashboard capacité n’est pas configurée.");
      return;
    }

    initialiserEtatDepuisUrl();
    await creerFiltres();
    creerCalendrier();

    const elements = {
      valeurDepartement: document.getElementById("valeur-departement-dashboard"),
      champDepartement: document.getElementById("champ-departement-dashboard"),
      boutonAfficherDepartement: document.getElementById("bouton-afficher-departement"),
      selectPlage: document.getElementById("select-plage-dashboard"),
      selectParc: document.getElementById("select-parc-dashboard"),
      boutonRecalculerHparcsDptmt: document.getElementById("bouton-recalculer-hparcsdptmt"),
      boutonMoisPrecedent: document.getElementById("bouton-mois-precedent"),
      boutonMoisSuivant: document.getElementById("bouton-mois-suivant"),
      titreMois: document.getElementById("titre-mois-dashboard"),
      message: document.getElementById("message-dashboard-capacite"),
      grille: document.getElementById("grille-dashboard-capacite")
    };

    if (Object.values(elements).some((element) => !element)) {
      await afficherAlerte("Erreur technique", "La page dashboard capacité est incomplète.");
      return;
    }

    elements.champDepartement.value = etat.dptmt;
    elements.selectPlage.value = etat.plage;

    installerEcouteurs();
    await chargerDashboard();

    function initialiserEtatDepuisUrl() {
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
    }

    async function creerFiltres() {
      await window.LCDP_creerFormulaire("lcdp-dashboard-capacite-filtres-slot", {
        id: "form-dashboard-capacite-filtres",
        titre: "Filtres",
        sousTitre: "Département, plage horaire, parc et maintenance.",
        champs: [
          {
            id: "champ-departement-dashboard",
            name: "champ-departement-dashboard",
            label: "Département",
            type: "text",
            inputmode: "numeric",
            placeholder: "41",
            autocomplete: "off"
          }
        ],
        bouton: {
          id: "bouton-afficher-departement",
          label: "Afficher",
          type: "submit",
          style: "lcdp-button-primary"
        }
      });

      const form = document.getElementById("form-dashboard-capacite-filtres");
      const fields = form?.querySelector("[data-lcdp-formulaire-fields]");
      const actions = form?.querySelector("[data-lcdp-formulaire-actions]");

      if (!form || !fields || !actions) {
        throw new Error("Structure du formulaire de filtres incomplète.");
      }

      fields.appendChild(await creerChampSelect({
        id: "select-plage-dashboard",
        label: "Plage affichée",
        options: [
          ["plage1", "Matin"],
          ["plage2", "Après-midi"],
          ["plage3", "Soir"]
        ]
      }));

      fields.appendChild(await creerChampSelect({
        id: "select-parc-dashboard",
        label: "Parc",
        options: [["", "Tous les parcs du département"]]
      }));

      const boutonRecalcul = document.createElement("button");
      boutonRecalcul.type = "button";
      boutonRecalcul.id = "bouton-recalculer-hparcsdptmt";
      boutonRecalcul.className = "lcdp-button lcdp-button-secondary";
      boutonRecalcul.textContent = "Recalculer toute la capacité département";
      actions.appendChild(boutonRecalcul);

      const retour = document.createElement("a");
      retour.className = "lcdp-link-secondary";
      retour.href = urlRetourParc;
      retour.textContent = "← Retour menu Parc";
      form.appendChild(retour);
    }

    async function creerChampSelect({ id, label, options }) {
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

      options.forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
      });

      labelZone.appendChild(labelElement);
      control.appendChild(select);

      return element;
    }

    function creerCalendrier() {
      const slot = document.getElementById("lcdp-dashboard-capacite-calendrier-slot");

      if (!slot) {
        return;
      }

      slot.innerHTML = "";

      const bloc = document.createElement("div");
      bloc.className = "lcdp-box-formulaire";

      const titre = document.createElement("h2");
      titre.className = "lcdp-box-formulaire__title";
      titre.id = "titre-mois-dashboard";
      titre.textContent = "";
      bloc.appendChild(titre);

      const departement = document.createElement("p");
      departement.className = "lcdp-text-strong-left";
      departement.innerHTML = 'Département <span id="valeur-departement-dashboard">-</span>';
      bloc.appendChild(departement);

      const nav = document.createElement("div");
      nav.className = "lcdp-stack-small";

      const precedent = document.createElement("button");
      precedent.type = "button";
      precedent.id = "bouton-mois-precedent";
      precedent.className = "lcdp-button lcdp-button-secondary";
      precedent.textContent = "Mois précédent";

      const suivant = document.createElement("button");
      suivant.type = "button";
      suivant.id = "bouton-mois-suivant";
      suivant.className = "lcdp-button lcdp-button-secondary";
      suivant.textContent = "Mois suivant";

      nav.appendChild(precedent);
      nav.appendChild(suivant);
      bloc.appendChild(nav);

      const message = document.createElement("p");
      message.id = "message-dashboard-capacite";
      message.className = "lcdp-text-muted";
      message.setAttribute("aria-live", "polite");
      bloc.appendChild(message);

      const table = document.createElement("table");
      table.className = "lcdp-component";
      table.setAttribute("aria-label", "Calendrier de capacité");

      const thead = document.createElement("thead");
      const trHead = document.createElement("tr");

      ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].forEach((jour) => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = jour;
        trHead.appendChild(th);
      });

      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      tbody.id = "grille-dashboard-capacite";
      table.appendChild(tbody);

      bloc.appendChild(table);
      slot.appendChild(bloc);
    }

    function installerEcouteurs() {
      const form = document.getElementById("form-dashboard-capacite-filtres");

      form.addEventListener("submit", (event) => {
        event.preventDefault();
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
          form.requestSubmit();
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

      elements.boutonRecalculerHparcsDptmt.addEventListener("click", recalculerTouteCapaciteDepartement);

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
        elements.titreMois.textContent = nomMois(etat.annee, etat.mois);
        return;
      }

      afficherMessage("Chargement des capacités...");

      try {
        const response = await fetch(endpointDashboardCapacite, {
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

        if (response.status === 401 || response.status === 403) {
          window.location.href = urlConnexionAdmin;
          return;
        }

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

    async function recalculerTouteCapaciteDepartement() {
      if (etat.recalculEnCours) {
        return;
      }

      if (!endpointWriteInHparcs) {
        afficherMessage("Adresse du service write-in-hparcs non configurée.");
        return;
      }

      const confirmation = window.confirm(
        "Recalculer toute la table hparcsdptmt à partir des données hparcs existantes ?"
      );

      if (!confirmation) {
        return;
      }

      etat.recalculEnCours = true;
      elements.boutonRecalculerHparcsDptmt.disabled = true;
      elements.boutonRecalculerHparcsDptmt.textContent = "Recalcul en cours...";
      afficherMessage("Recalcul complet de hparcsdptmt en cours...");

      try {
        const response = await fetch(endpointWriteInHparcs, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            action: "recalculer_hparcsdptmt",
            tous: true
          })
        });

        const data = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          window.location.href = urlConnexionAdmin;
          return;
        }

        if (!response.ok || !data || data.success !== true) {
          throw new Error(data?.error || "Impossible de recalculer hparcsdptmt.");
        }

        afficherMessage("hparcsdptmt a été recalculée. Rechargement du dashboard...");
        await chargerDashboard();

      } catch (error) {
        afficherMessage(error.message || "Erreur pendant le recalcul de hparcsdptmt.");
      } finally {
        etat.recalculEnCours = false;
        elements.boutonRecalculerHparcsDptmt.disabled = false;
        elements.boutonRecalculerHparcsDptmt.textContent = "Recalculer toute la capacité département";
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
      const joursParDate = new Map(etat.jours.map((jour) => [jour.datejour, jour]));

      let jourCourant = 1;
      const totalCellules = Math.ceil((decalageLundi + nombreJours) / 7) * 7;

      for (let index = 0; index < totalCellules; index += 7) {
        const tr = document.createElement("tr");

        for (let colonne = 0; colonne < 7; colonne += 1) {
          const position = index + colonne;
          const td = document.createElement("td");

          if (position < decalageLundi || jourCourant > nombreJours) {
            td.textContent = "";
            tr.appendChild(td);
            continue;
          }

          const dateISO = construireDateISO(etat.annee, etat.mois, jourCourant);
          const donneesJour = joursParDate.get(dateISO) || null;
          const capacite = capacitePourJour(donneesJour, etat.plage);

          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = capacite <= 0
            ? "lcdp-button lcdp-button-secondary"
            : "lcdp-button lcdp-button-primary";
          bouton.dataset.datejour = dateISO;
          bouton.dataset.numero = String(jourCourant);
          bouton.dataset.capacite = String(capacite);
          bouton.title = "Jour " + jourCourant + " | capacité " + capacite;
          bouton.textContent = String(capacite);

          if (estAujourdHui(dateISO)) {
            bouton.setAttribute("aria-label", "Aujourd’hui, jour " + jourCourant + ", capacité " + capacite);
          }

          bouton.addEventListener("click", () => {
            afficherNumeroTemporairement(bouton);
          });

          td.appendChild(bouton);
          tr.appendChild(td);
          jourCourant += 1;
        }

        elements.grille.appendChild(tr);
      }
    }

    function afficherNumeroTemporairement(bouton) {
      window.clearTimeout(bouton._dashboardCapaciteTimer);
      bouton.textContent = bouton.dataset.numero || "";

      bouton._dashboardCapaciteTimer = window.setTimeout(() => {
        bouton.textContent = bouton.dataset.capacite || "0";
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

  function construireUrlAdminFallback(chemin) {
    const adminBaseUrl = nettoyerBaseUrlDashboardCapacite(
      window.ADMIN_CONFIG?.ADMIN_BASE_URL || window.SITE_CONFIG?.adminBaseUrl || ""
    );

    return joindreBaseEtCheminDashboardCapacite(adminBaseUrl, chemin);
  }

  function joindreBaseEtCheminDashboardCapacite(baseUrl, chemin) {
    const base = nettoyerBaseUrlDashboardCapacite(baseUrl);
    const cheminNettoye = "/" + String(chemin || "").replace(/^\/+/, "");

    if (!base) {
      return cheminNettoye;
    }

    return base + cheminNettoye;
  }

  function nettoyerBaseUrlDashboardCapacite(value) {
    return String(value || "").replace(/\/+$/, "");
  }
})();
