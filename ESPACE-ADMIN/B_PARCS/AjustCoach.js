(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};

  const GROUPE_CIBLE = "COACH";
  const ROUTE_GROUPE = "coach";

  let parcCourant = null;
  let briefCourant = null;
  let reconnaissance = null;
  let dicteeActive = false;
  let boutonDicteeActif = null;
  let cibleDicteeActive = null;
  let minuterieRelanceDictee = null;
  let sessionDictee = 0;
  let fluxMicroDictee = null;

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
      "lcdp-adjust-identite"
    );

    if (identite) {
      identite.textContent =
        "Parc : " + parcCourant.nom +
        " — Département " + parcCourant.dptmt +
        " — Groupe " + GROUPE_CIBLE;
    }
  }

  function construireBriefDepuisFormulaire() {
    return {
      ajustement: document.getElementById(
        "lcdp-adjust-instruction"
      )?.value.trim() || "",
      capacite: document.getElementById(
        "lcdp-adjust-capacite"
      )?.value.trim() || ""
    };
  }

  function afficherStatus(message, erreur = false) {
    const status = document.getElementById(
      "lcdp-adjust-status"
    );

    if (!status) return;

    status.textContent = String(message || "");
    status.hidden = !message;
    status.dataset.etat = erreur ? "erreur" : "succes";
  }

  function afficherValidation(data) {
    briefCourant = data;

    const section = document.getElementById(
      "lcdp-adjust-validation"
    );
    const resume = document.getElementById(
      "lcdp-adjust-resume"
    );
    const alertes = document.getElementById(
      "lcdp-adjust-alertes"
    );
    const json = document.getElementById(
      "lcdp-adjust-json"
    );
    const boutonValider = document.getElementById(
      "lcdp-adjust-valider"
    );

    if (!section || !resume || !alertes || !json || !boutonValider) {
      throw new Error("Bloc de validation AjustCoach incomplet.");
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

  async function analyserAjustement(event) {
    event.preventDefault();

    if (!parcCourant) {
      afficherStatus("Parc non chargé.", true);
      return;
    }

    const endpoint = endpointParcPlanning();
    const bouton = document.getElementById(
      "lcdp-adjust-analyser"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const brief = construireBriefDepuisFormulaire();

    if (!brief.ajustement) {
      afficherStatus("L’ajustement COACH est incomplet.", true);
      return;
    }

    if (bouton) bouton.disabled = true;
    afficherStatus("Analyse IA de l’ajustement en cours…");

    try {
      const data = await appelerJson(
        endpoint + "/" + ROUTE_GROUPE + "/ajust/brief",
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
      afficherStatus("Ajustement IA prêt à être vérifié.");
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  async function validerAjustement() {
    if (!briefCourant || !parcCourant) return;

    const endpoint = endpointParcPlanning();
    const bouton = document.getElementById(
      "lcdp-adjust-valider"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const confirmation = window.confirm(
      "Valider cet ajustement et modifier le planning " +
      GROUPE_CIBLE + " dans hparcs ?"
    );

    if (!confirmation) return;

    if (bouton) bouton.disabled = true;
    afficherStatus(
      "Ajustement de hparcs en cours. Ne ferme pas cette page."
    );

    try {
      const data = await appelerJson(
        endpoint + "/" + ROUTE_GROUPE + "/ajust/valider",
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
        "Ajustement " + GROUPE_CIBLE + " enregistré sur " +
        String(data.joursModifies || 0) + " journée(s)."
      );
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  function corrigerAjustement() {
    const section = document.getElementById(
      "lcdp-adjust-validation"
    );

    if (section) section.hidden = true;
    briefCourant = null;

    document.getElementById(
      "lcdp-adjust-instruction"
    )?.focus();
  }

  function restaurerBoutonDictee(bouton) {
    if (!bouton) return;

    bouton.disabled = false;
    bouton.textContent = "Dicter";
  }

  function joindreSegmentsDictee(...segments) {
    return segments
      .map((segment) => String(segment || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function terminerPhraseDictee(value) {
    const texte = String(value || "").trim();

    if (!texte) {
      return "";
    }

    if (/[.!?…]$/.test(texte)) {
      return texte;
    }

    return texte.replace(/[,:;]+$/, "") + ".";
  }

  function terminerEtatDictee(
    instance,
    bouton,
    sessionCourante
  ) {
    if (
      reconnaissance !== instance ||
      sessionDictee !== sessionCourante
    ) {
      return;
    }

    dicteeActive = false;
    reconnaissance = null;
    boutonDicteeActif = null;
    cibleDicteeActive = null;
    restaurerBoutonDictee(bouton);
  }

  function arreterDictee() {
    const instance = reconnaissance;
    const bouton = boutonDicteeActif;

    dicteeActive = false;
    reconnaissance = null;
    boutonDicteeActif = null;
    cibleDicteeActive = null;
    sessionDictee += 1;

    if (instance) {
      try {
        instance.stop();
      } catch {
        try {
          instance.abort();
        } catch {
          // La reconnaissance est déjà arrêtée.
        }
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

        const sessionCourante = ++sessionDictee;
        const texteInitial = String(cible.value || "").trim();
        const resultats = new Map();
        const instance = new SpeechRecognition();

        dicteeActive = true;
        reconnaissance = instance;
        boutonDicteeActif = bouton;
        cibleDicteeActive = cible;

        bouton.disabled = false;
        bouton.textContent = "Arrêter";

        instance.lang = "fr-FR";
        instance.interimResults = true;
        instance.continuous = true;
        instance.maxAlternatives = 1;

        const sessionToujoursActive = () => {
          return (
            dicteeActive &&
            reconnaissance === instance &&
            sessionDictee === sessionCourante &&
            boutonDicteeActif === bouton &&
            cibleDicteeActive === cible
          );
        };

        const texteReconnu = () => {
          return Array.from(resultats.entries())
            .sort(([indexA], [indexB]) => indexA - indexB)
            .map(([, resultat]) => resultat.texte)
            .filter(Boolean)
            .join(" ")
            .trim();
        };

        instance.addEventListener("result", (event) => {
          if (!sessionToujoursActive()) return;

          for (
            let index = event.resultIndex || 0;
            index < event.results.length;
            index += 1
          ) {
            const resultat = event.results[index];
            const texte = String(
              resultat?.[0]?.transcript || ""
            ).trim();

            if (!texte) {
              resultats.delete(index);
              continue;
            }

            resultats.set(index, {
              texte,
              final: Boolean(resultat.isFinal)
            });
          }

          cible.value = joindreSegmentsDictee(
            texteInitial,
            texteReconnu()
          );
        });

        instance.addEventListener("error", (event) => {
          if (!sessionToujoursActive()) return;

          const code = String(event?.error || "");

          if (
            code === "not-allowed" ||
            code === "service-not-allowed"
          ) {
            afficherStatus(
              "Autorisation du microphone refusée.",
              true
            );
          } else if (
            code !== "no-speech" &&
            code !== "aborted"
          ) {
            afficherStatus(
              "La dictée a été interrompue : " + code + ".",
              true
            );
          }
        });

        instance.addEventListener("end", () => {
          if (
            reconnaissance !== instance ||
            sessionDictee !== sessionCourante
          ) {
            return;
          }

          cible.value = joindreSegmentsDictee(
            texteInitial,
            texteReconnu()
          );

          terminerEtatDictee(
            instance,
            bouton,
            sessionCourante
          );
        });

        try {
          instance.start();
        } catch (error) {
          terminerEtatDictee(
            instance,
            bouton,
            sessionCourante
          );

          afficherStatus(
            "Impossible de démarrer la dictée : " +
            String(error?.message || error || ""),
            true
          );
        }
      });
    });

    window.addEventListener("beforeunload", arreterDictee);
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

    document.getElementById("lcdp-adjust-form")
      ?.addEventListener("submit", analyserAjustement);

    document.getElementById("lcdp-adjust-valider")
      ?.addEventListener("click", validerAjustement);

    document.getElementById("lcdp-adjust-corriger")
      ?.addEventListener("click", corrigerAjustement);

    initialiserDictee();
  }

  initialiserPage().catch((error) => {
    console.error(error);

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;

    afficherStatus(
      "AjustCoach indisponible : " +
      String(error?.message || error || ""),
      true
    );
  });
})();
