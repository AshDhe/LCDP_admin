(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};

  let parcCourant = null;
  let briefCourant = null;
  let reconnaissance = null;

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

  function endpointParcPlanning() {
    return String(
      config.workerParcPlanningUrl ||
      config.WORKER_PARC_PLANNING_URL ||
      window.ADMIN_CONFIG?.API_PARC_PLANNING ||
      ""
    ).replace(/\/+$/, "");
  }


  function appliquerRoutes(racine = document) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const path = element.dataset.siteHref || "";
      const space = element.dataset.space || "public";

      element.setAttribute(
        "href",
        space === "admin" ? urlAdmin(path) : urlPublic(path)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const path = String(element.dataset.siteSrc || "")
        .replace(/^\/?OBJET\/?/, "/");
      element.setAttribute("src", urlObjet(path));
    });
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

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    if (!slot) return;

    slot.innerHTML = "";
    const fragment = await chargerFragment(
      urlAdmin(
        "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
      ),
      "Bandeau admin"
    );
    slot.appendChild(fragment);
    appliquerRoutes(slot);
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

  async function appelerJson(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {})
      },
      body: options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "Réponse serveur inexploitable."
      );
    }

    return data;
  }

  async function chargerParc() {
    const endpoint = endpointParcPlanning();
    const selection = lireSelectionUrl();

    if (!endpoint) {
      throw new Error("Endpoint Parc Planning non configuré.");
    }

    if (!selection.dptmt || !selection.idparc) {
      throw new Error("Département ou parc absent de l’URL.");
    }

    const params = new URLSearchParams(selection);
    const data = await appelerJson(
      endpoint + "/parc?" + params.toString()
    );

    parcCourant = data.parc;

    const identite = document.getElementById(
      "lcdp-insert-famille-identite"
    );

    if (identite) {
      identite.textContent =
        "Parc : " + parcCourant.nom +
        " — Département " + parcCourant.dptmt;
    }
  }

  function construireBriefDepuisFormulaire() {
    return {
      dateDebut: document.getElementById(
        "lcdp-insert-famille-date-debut"
      )?.value || "",
      horizon: document.getElementById(
        "lcdp-insert-famille-horizon"
      )?.value || "",
      ouvertureSemaine: document.getElementById(
        "lcdp-insert-famille-semaine"
      )?.value.trim() || "",
      ouvertureWeekend: document.getElementById(
        "lcdp-insert-famille-weekend"
      )?.value.trim() || "",
      capacite: Number.parseInt(
        document.getElementById(
          "lcdp-insert-famille-capacite"
        )?.value || "",
        10
      )
    };
  }

  function afficherStatus(message, erreur = false) {
    const status = document.getElementById(
      "lcdp-insert-famille-status"
    );

    if (!status) return;

    status.textContent = String(message || "");
    status.hidden = !message;
    status.dataset.etat = erreur ? "erreur" : "succes";
  }

  function afficherValidation(data) {
    briefCourant = data;

    const section = document.getElementById(
      "lcdp-insert-famille-validation"
    );
    const resume = document.getElementById(
      "lcdp-insert-famille-resume"
    );
    const alertes = document.getElementById(
      "lcdp-insert-famille-alertes"
    );
    const json = document.getElementById(
      "lcdp-insert-famille-json"
    );
    const boutonValider = document.getElementById(
      "lcdp-insert-famille-valider"
    );

    if (!section || !resume || !alertes || !json || !boutonValider) {
      throw new Error("Bloc de validation InsertFamille incomplet.");
    }

    resume.innerHTML = "";
    const listeResume = document.createElement("ul");

    for (const ligne of data.jsonbrief.resume_lisible || []) {
      const item = document.createElement("li");
      item.textContent = String(ligne || "");
      listeResume.appendChild(item);
    }

    resume.appendChild(listeResume);

    const listeAlertes = Array.isArray(data.jsonbrief.alertes)
      ? data.jsonbrief.alertes
      : [];

    alertes.innerHTML = "";
    alertes.hidden = listeAlertes.length === 0;

    if (listeAlertes.length > 0) {
      const titre = document.createElement("p");
      titre.textContent = "Alertes à corriger avant validation :";
      alertes.appendChild(titre);

      const liste = document.createElement("ul");

      for (const alerte of listeAlertes) {
        const item = document.createElement("li");
        item.textContent = String(alerte || "");
        liste.appendChild(item);
      }

      alertes.appendChild(liste);
    }

    boutonValider.disabled = listeAlertes.length > 0;
    json.textContent = JSON.stringify(data.jsonbrief, null, 2);
    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function analyserBrief(event) {
    event.preventDefault();

    if (!parcCourant) {
      afficherStatus("Parc non chargé.", true);
      return;
    }

    const endpoint = endpointParcPlanning();
    const bouton = document.getElementById(
      "lcdp-insert-famille-analyser"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const brief = construireBriefDepuisFormulaire();

    if (
      !brief.dateDebut ||
      !brief.horizon ||
      brief.dateDebut > brief.horizon ||
      !brief.ouvertureSemaine ||
      !brief.ouvertureWeekend ||
      !Number.isInteger(brief.capacite) ||
      brief.capacite < 1
    ) {
      afficherStatus("Le brief FAMILLE est incomplet.", true);
      return;
    }

    if (bouton) bouton.disabled = true;
    afficherStatus("Analyse IA du brief FAMILLE en cours…");

    try {
      const data = await appelerJson(
        endpoint + "/famille/brief",
        {
          method: "POST",
          body: {
            idparc: parcCourant.idparc,
            dptmt: parcCourant.dptmt,
            brief
          }
        }
      );

      afficherValidation(data);
      afficherStatus("Brief IA FAMILLE prêt à être vérifié.");
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  async function validerBrief() {
    if (!briefCourant || !parcCourant) return;

    const endpoint = endpointParcPlanning();
    const bouton = document.getElementById(
      "lcdp-insert-famille-valider"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const confirmation = window.confirm(
      "Valider ce brief et écrire FAMILLE dans hparcs ?"
    );

    if (!confirmation) return;

    if (bouton) bouton.disabled = true;
    afficherStatus(
      "Validation et écriture FAMILLE en cours. Ne ferme pas cette page."
    );

    try {
      const data = await appelerJson(
        endpoint + "/famille/valider",
        {
          method: "POST",
          body: {
            idbrief: briefCourant.idbrief,
            idparc: parcCourant.idparc,
            dptmt: parcCourant.dptmt
          }
        }
      );

      afficherStatus(
        "Planning FAMILLE enregistré jusqu’au " +
        String(data.horizon || "") +
        ". Capacités DUO et COACH relevées sur " +
        String(data.capacitesRelevees || 0) +
        " plage(s)."
      );
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  function corrigerBrief() {
    const section = document.getElementById(
      "lcdp-insert-famille-validation"
    );

    if (section) section.hidden = true;
    briefCourant = null;

    document.getElementById("lcdp-insert-famille-semaine")?.focus();
  }

  function initialiserDictee() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    document.querySelectorAll("[data-dictee-cible]").forEach((bouton) => {
      if (!SpeechRecognition) {
        bouton.disabled = true;
        bouton.title = "Dictée non prise en charge par ce navigateur.";
        return;
      }

      bouton.addEventListener("click", () => {
        const cible = document.getElementById(
          bouton.dataset.dicteeCible || ""
        );

        if (!cible) return;

        if (reconnaissance) {
          reconnaissance.stop();
          reconnaissance = null;
        }

        reconnaissance = new SpeechRecognition();
        reconnaissance.lang = "fr-FR";
        reconnaissance.interimResults = false;
        reconnaissance.continuous = false;

        bouton.disabled = true;
        bouton.textContent = "Écoute…";

        reconnaissance.addEventListener("result", (event) => {
          const texte = event.results?.[0]?.[0]?.transcript || "";
          cible.value = [cible.value.trim(), texte.trim()]
            .filter(Boolean)
            .join(" ");
        });

        reconnaissance.addEventListener("end", () => {
          bouton.disabled = false;
          bouton.textContent = "Dicter";
          reconnaissance = null;
        });

        reconnaissance.addEventListener("error", () => {
          afficherStatus("Dictée interrompue.", true);
        });

        reconnaissance.start();
      });
    });
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

    document.getElementById("lcdp-insert-famille-form")
      ?.addEventListener("submit", analyserBrief);

    document.getElementById("lcdp-insert-famille-valider")
      ?.addEventListener("click", validerBrief);

    document.getElementById("lcdp-insert-famille-corriger")
      ?.addEventListener("click", corrigerBrief);

    initialiserDictee();
  }

  initialiserPage().catch((error) => {
    console.error(error);

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;

    afficherStatus(
      "InsertFamille indisponible : " +
      String(error?.message || error || ""),
      true
    );
  });
})();
