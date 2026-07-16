(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};

  let parcCourant = null;
  let briefCourant = null;
  let reconnaissance = null;
  let dicteeActive = false;
  let boutonDicteeActif = null;
  let cibleDicteeActive = null;
  let sessionDictee = 0;

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
      config.endpointParcPlanning ||
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
      "lcdp-planning-parc-identite"
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
        "lcdp-planning-date-debut"
      )?.value || "",
      horizon: document.getElementById(
        "lcdp-planning-horizon"
      )?.value || "",
      fermetures: document.getElementById(
        "lcdp-planning-fermetures"
      )?.value.trim() || "",
      ouvertureSemaine: document.getElementById(
        "lcdp-planning-semaine"
      )?.value.trim() || "",
      ouvertureWeekend: document.getElementById(
        "lcdp-planning-weekend"
      )?.value.trim() || "",
      capacite: Number.parseInt(
        document.getElementById(
          "lcdp-planning-capacite"
        )?.value || "",
        10
      )
    };
  }

  function afficherStatus(message, erreur = false) {
    const status = document.getElementById("lcdp-planning-status");
    if (!status) return;

    status.textContent = String(message || "");
    status.hidden = !message;
    status.dataset.etat = erreur ? "erreur" : "succes";
  }

  function afficherValidation(data) {
    briefCourant = data;

    const section = document.getElementById(
      "lcdp-planning-validation"
    );
    const resume = document.getElementById("lcdp-planning-resume");
    const alertes = document.getElementById("lcdp-planning-alertes");
    const json = document.getElementById("lcdp-planning-json");
    const boutonValider = document.getElementById(
      "lcdp-planning-valider"
    );

    if (!section || !resume || !alertes || !json || !boutonValider) {
      throw new Error("Bloc de validation PlanningParc incomplet.");
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
    const bouton = document.getElementById("lcdp-planning-analyser");

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const brief = construireBriefDepuisFormulaire();

    if (
      !brief.dateDebut ||
      !brief.horizon ||
      brief.dateDebut > brief.horizon ||
      !brief.fermetures ||
      !brief.ouvertureSemaine ||
      !brief.ouvertureWeekend ||
      !Number.isInteger(brief.capacite) ||
      brief.capacite < 1
    ) {
      afficherStatus("Le brief fermé est incomplet.", true);
      return;
    }

    if (bouton) bouton.disabled = true;
    afficherStatus("Analyse IA du brief en cours…");

    try {
      const data = await appelerJson(
        endpoint + "/brief",
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
      afficherStatus("Brief IA prêt à être vérifié.");
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  async function validerBrief() {
    if (!briefCourant || !parcCourant) return;

    const endpoint = endpointParcPlanning();
    const bouton = document.getElementById("lcdp-planning-valider");

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const confirmation = window.confirm(
      "Valider ce brief et écrire le planning DUO et COACH dans hparcs ?"
    );

    if (!confirmation) return;

    if (bouton) bouton.disabled = true;
    afficherStatus(
      "Validation et écriture du planning en cours. Ne ferme pas cette page."
    );

    try {
      const data = await appelerJson(
        endpoint + "/valider",
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
        "Planning DUO et COACH enregistré dans hparcs jusqu’au " +
        String(data.jsonfinal?.horizon || "") + "."
      );
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  function corrigerBrief() {
    const section = document.getElementById(
      "lcdp-planning-validation"
    );

    if (section) section.hidden = true;
    briefCourant = null;

    document.getElementById("lcdp-planning-fermetures")?.focus();
  }

  function restaurerBoutonDictee(bouton) {
    if (!bouton) return;

    bouton.disabled = false;
    bouton.textContent = "Dicter";
  }

  function arreterDictee() {
    dicteeActive = false;
    sessionDictee += 1;

    const instance = reconnaissance;
    const bouton = boutonDicteeActif;

    reconnaissance = null;
    boutonDicteeActif = null;
    cibleDicteeActive = null;

    if (instance) {
      try {
        instance.abort();
      } catch {
        // La reconnaissance peut déjà être terminée.
      }
    }

    restaurerBoutonDictee(bouton);
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

        if (
          dicteeActive &&
          boutonDicteeActif === bouton
        ) {
          arreterDictee();
          return;
        }

        if (dicteeActive || reconnaissance) {
          arreterDictee();
        }

        dicteeActive = true;
        boutonDicteeActif = bouton;
        cibleDicteeActive = cible;
        sessionDictee += 1;

        const sessionCourante = sessionDictee;

        bouton.disabled = false;
        bouton.textContent = "Arrêter";

        function demarrerCycleDictee() {
          if (
            !dicteeActive ||
            sessionDictee !== sessionCourante ||
            boutonDicteeActif !== bouton ||
            cibleDicteeActive !== cible
          ) {
            return;
          }

          const instance = new SpeechRecognition();

          reconnaissance = instance;
          instance.lang = "fr-FR";
          instance.interimResults = false;
          instance.continuous = false;

          instance.addEventListener("result", (event) => {
            const morceaux = [];

            for (
              let index = event.resultIndex || 0;
              index < event.results.length;
              index += 1
            ) {
              const resultat = event.results[index];
              const texte = resultat?.[0]?.transcript || "";

              if (texte.trim()) {
                morceaux.push(texte.trim());
              }
            }

            if (
              !morceaux.length ||
              !dicteeActive ||
              sessionDictee !== sessionCourante ||
              cibleDicteeActive !== cible
            ) {
              return;
            }

            cible.value = [cible.value.trim(), morceaux.join(" ")]
              .filter(Boolean)
              .join(" ");
          });

          instance.addEventListener("end", () => {
            if (reconnaissance === instance) {
              reconnaissance = null;
            }

            if (
              !dicteeActive ||
              sessionDictee !== sessionCourante ||
              boutonDicteeActif !== bouton ||
              cibleDicteeActive !== cible
            ) {
              restaurerBoutonDictee(bouton);
              return;
            }

            window.setTimeout(demarrerCycleDictee, 300);
          });

          instance.addEventListener("error", (event) => {
            const code = String(event?.error || "");

            if (code === "no-speech" || code === "aborted") {
              return;
            }

            if (
              sessionDictee !== sessionCourante ||
              !dicteeActive
            ) {
              return;
            }

            arreterDictee();

            afficherStatus(
              code === "not-allowed" || code === "service-not-allowed"
                ? "Autorisation du microphone refusée."
                : code === "audio-capture"
                  ? "Microphone indisponible."
                  : "Dictée interrompue.",
              true
            );
          });

          try {
            instance.start();
          } catch {
            if (
              dicteeActive &&
              sessionDictee === sessionCourante
            ) {
              reconnaissance = null;
              window.setTimeout(demarrerCycleDictee, 500);
            }
          }
        }

        demarrerCycleDictee();
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

    document.getElementById("lcdp-planning-parc-form")
      ?.addEventListener("submit", analyserBrief);

    document.getElementById("lcdp-planning-valider")
      ?.addEventListener("click", validerBrief);

    document.getElementById("lcdp-planning-corriger")
      ?.addEventListener("click", corrigerBrief);

    initialiserDictee();

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;

    await chargerParc();

    const initialisationsPeripheriques = await Promise.allSettled([
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);

    initialisationsPeripheriques.forEach((resultat) => {
      if (resultat.status === "rejected") {
        console.error(resultat.reason);
      }
    });
  }

  initialiserPage().catch((error) => {
    console.error(error);

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;

    afficherStatus(
      "PlanningParc indisponible : " +
      String(error?.message || error || ""),
      true
    );
  });
})();
