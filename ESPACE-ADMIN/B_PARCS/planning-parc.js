
(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const PAGE = {
  "title": "PlanningParc",
  "prefix": "lcdp-planning-parc",
  "identiteId": "lcdp-planning-parc-identite",
  "briefRoute": "/brief",
  "validateRoute": "/valider",
  "resumeTitle": "Résumé du PlanningParc",
  "readyMessage": "Le PlanningParc est prêt à être validé.",
  "confirmTitle": "Validation PlanningParc",
  "confirmMessage": "Valider ce PlanningParc et écrire simultanément DUO, COACH et les fermetures explicites ?",
  "analysisMessage": "Analyse IA du PlanningParc en cours…",
  "analysisReadyMessage": "PlanningParc IA prêt à être vérifié.",
  "validationMessage": "Écriture du PlanningParc en cours. Ne ferme pas cette page.",
  "successMessage": "PlanningParc enregistré.",
  "focusId": "lcdp-planning-parc-date-debut"
};

  let parcCourant = null;
  let briefCourant = null;
  let dicteeCourante = null;

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

  function endpointWorker() {
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
      urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"),
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
    let response;

    try {
      response = await fetch(url, {
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
    } catch (error) {
      throw new Error(
        "Connexion impossible avec le worker. " +
        String(error?.message || error || "")
      );
    }

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success !== true) {
      const message = String(data?.message || "").trim();
      const detail = String(data?.detail || "").trim();
      throw new Error(
        [message, detail]
          .filter((item, index, liste) =>
            item && liste.indexOf(item) === index
          )
          .join(" — ") ||
        "Réponse serveur inexploitable."
      );
    }

    return data;
  }

  async function chargerParc() {
    const endpoint = endpointWorker();
    const selection = lireSelectionUrl();

    if (!endpoint) {
      throw new Error("Endpoint Parc Planning non configuré.");
    }

    if (!selection.dptmt || !selection.idparc) {
      throw new Error("Département ou parc absent de l’URL.");
    }

    const data = await appelerJson(
      endpoint + "/parc?" + new URLSearchParams(selection).toString()
    );

    parcCourant = data.parc;

    const identite = document.getElementById(PAGE.identiteId);
    if (identite) {
      identite.textContent =
        "Parc : " + parcCourant.nom +
        " — Département " + parcCourant.dptmt;
    }
  }

  function afficherStatus(message, erreur = false) {
    const status = document.getElementById(PAGE.prefix + "-status");
    if (!status) return;

    status.textContent = String(message || "");
    status.hidden = !message;
    status.dataset.etat = erreur ? "erreur" : "succes";
  }

  function afficherValidation(data) {
    briefCourant = data;

    const section = document.getElementById(PAGE.prefix + "-validation");
    const resume = document.getElementById(PAGE.prefix + "-resume");
    const alertes = document.getElementById(PAGE.prefix + "-alertes");
    const json = document.getElementById(PAGE.prefix + "-json");
    const boutonValider = document.getElementById(PAGE.prefix + "-valider");

    if (!section || !resume || !alertes || !json || !boutonValider) {
      throw new Error("Bloc de validation incomplet.");
    }

    const jsonbrief = data?.jsonbrief || {};
    const listeAlertes = Array.isArray(jsonbrief.alertes)
      ? jsonbrief.alertes
      : [];
    const resumeOral = String(jsonbrief.resume_oral || "").trim();
    const resumeLisible = Array.isArray(jsonbrief.resume_lisible)
      ? jsonbrief.resume_lisible
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [];

    resume.innerHTML = "";
    const blocResume = document.createElement("div");
    blocResume.className = "lcdp-validation-bloc";

    const titreResume = document.createElement("h3");
    titreResume.textContent = PAGE.resumeTitle;
    blocResume.appendChild(titreResume);

    if (resumeOral) {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = resumeOral;
      blocResume.appendChild(paragraphe);
    }

    if (resumeLisible.length > 0) {
      const liste = document.createElement("ul");
      liste.className = "lcdp-validation-liste";

      for (const ligne of resumeLisible) {
        const item = document.createElement("li");
        item.textContent = ligne;
        liste.appendChild(item);
      }

      blocResume.appendChild(liste);
    }

    if (!resumeOral && resumeLisible.length === 0) {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = "Aucun résumé n’a été produit.";
      blocResume.appendChild(paragraphe);
    }

    resume.appendChild(blocResume);

    alertes.innerHTML = "";
    alertes.hidden = listeAlertes.length === 0;

    if (listeAlertes.length > 0) {
      const titre = document.createElement("h3");
      titre.textContent = "Points à corriger";
      alertes.appendChild(titre);

      const liste = document.createElement("ul");
      liste.className = "lcdp-validation-liste";

      for (const alerte of listeAlertes) {
        const item = document.createElement("li");
        item.textContent = String(alerte || "");
        liste.appendChild(item);
      }

      alertes.appendChild(liste);
    }

    const note = document.createElement("p");
    note.className = "lcdp-validation-note";
    note.textContent = listeAlertes.length > 0
      ? "Le brief doit être corrigé avant validation."
      : PAGE.readyMessage;
    resume.appendChild(note);

    boutonValider.disabled = listeAlertes.length > 0;
    json.textContent = JSON.stringify(jsonbrief, null, 2);
    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function demanderConfirmation(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot de dialogue absent.");
    }

    slot.innerHTML = "";
    const fragment = await chargerFragment(
      urlObjet("/BOX/02-box-dialogue-bouton.html"),
      "Boîte de dialogue"
    );
    slot.appendChild(fragment);

    const dialogue = slot.querySelector(
      "[data-lcdp-box-dialogue-bouton]"
    );
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions) {
      slot.innerHTML = "";
      throw new Error("Structure de la boîte de dialogue incomplète.");
    }

    if (boutonFermer) boutonFermer.remove();

    titre.textContent = PAGE.confirmTitle;
    texte.textContent = String(message || "").trim();

    const boutonAnnuler = document.createElement("button");
    boutonAnnuler.type = "button";
    boutonAnnuler.className = "lcdp-button lcdp-button-secondary";
    boutonAnnuler.textContent = "Annuler";

    const boutonOk = document.createElement("button");
    boutonOk.type = "button";
    boutonOk.className = "lcdp-button lcdp-button-orange";
    boutonOk.textContent = "Valider";

    actions.append(boutonAnnuler, boutonOk);

    return new Promise((resolve) => {
      let resolu = false;

      function terminer(valeur) {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererTouche);
        slot.innerHTML = "";
        resolve(valeur);
      }

      function gererTouche(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          terminer(false);
        }
      }

      boutonAnnuler.addEventListener("click", () => terminer(false));
      boutonOk.addEventListener("click", () => terminer(true));
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) terminer(false);
      });
      document.addEventListener("keydown", gererTouche);

      window.setTimeout(() => boutonOk.focus(), 0);
    });
  }

  function fusionnerTexteDictee(texteInitial, texteReconnu) {
    return [texteInitial, texteReconnu]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(
        /\b(\d{1,2})\s*h(?:\s*(\d{1,2}))?\s+\1\s*h(?:\s*\2)?\s*$/i,
        (_, heure, minutes) =>
          heure + " h" + (minutes ? " " + minutes : "")
      )
      .trim();
  }

  function restaurerBoutonDictee(bouton) {
    if (!bouton) return;
    bouton.disabled = false;
    bouton.textContent = "Dicter";
  }

  function arreterDictee() {
    const etat = dicteeCourante;
    dicteeCourante = null;

    if (!etat) return;

    try {
      etat.reconnaissance.stop();
    } catch {
      try {
        etat.reconnaissance.abort();
      } catch {
        // La reconnaissance est déjà terminée.
      }
    }

    restaurerBoutonDictee(etat.bouton);
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

        if (dicteeCourante?.bouton === bouton) {
          arreterDictee();
          return;
        }

        if (dicteeCourante) arreterDictee();

        const reconnaissance = new SpeechRecognition();
        const texteInitial = String(cible.value || "").trim();
        const resultats = new Map();

        dicteeCourante = {
          reconnaissance,
          bouton,
          cible
        };

        bouton.textContent = "Arrêter";
        bouton.disabled = false;

        reconnaissance.lang = "fr-FR";
        reconnaissance.interimResults = true;
        reconnaissance.continuous = true;
        reconnaissance.maxAlternatives = 1;

        reconnaissance.addEventListener("result", (event) => {
          if (dicteeCourante?.reconnaissance !== reconnaissance) return;

          for (
            let index = event.resultIndex || 0;
            index < event.results.length;
            index += 1
          ) {
            const texte = String(
              event.results[index]?.[0]?.transcript || ""
            ).trim();

            if (texte) {
              resultats.set(index, texte);
            } else {
              resultats.delete(index);
            }
          }

          const texteReconnu = Array.from(resultats.entries())
            .sort(([a], [b]) => a - b)
            .map(([, texte]) => texte)
            .join(" ");

          cible.value = fusionnerTexteDictee(
            texteInitial,
            texteReconnu
          );
        });

        reconnaissance.addEventListener("error", (event) => {
          if (dicteeCourante?.reconnaissance !== reconnaissance) return;

          const code = String(event?.error || "");

          if (
            code === "not-allowed" ||
            code === "service-not-allowed"
          ) {
            afficherStatus("Autorisation du microphone refusée.", true);
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

        reconnaissance.addEventListener("end", () => {
          if (dicteeCourante?.reconnaissance !== reconnaissance) return;
          dicteeCourante = null;
          restaurerBoutonDictee(bouton);
        });

        try {
          reconnaissance.start();
        } catch (error) {
          dicteeCourante = null;
          restaurerBoutonDictee(bouton);
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

  
function valeur(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

function formaterHeure(heure) {
  const [h, m] = String(heure || "").split(":");
  return m === "00" ? String(Number(h)) + " h" : String(Number(h)) + " h " + m;
}

function construireRegleOuverture(libelle, prefix, precisionId) {
  const debut = valeur(prefix + "-debut");
  const fin = valeur(prefix + "-fin");
  const precision = valeur(precisionId);

  if (!debut || !fin) {
    throw new Error("Les heures d’ouverture " + libelle + " sont incomplètes.");
  }

  return (
    "OUVERTURE " + libelle + " de " +
    formaterHeure(debut) + " à " + formaterHeure(fin) +
    (precision ? ". " + precision : ".")
  );
}

function construireBrief() {
  const dateDebut = valeur("lcdp-planning-parc-date-debut");
  const horizon = valeur("lcdp-planning-parc-horizon");
  const capacite = Number.parseInt(
    valeur("lcdp-planning-parc-capacite"),
    10
  );

  if (!dateDebut || !horizon || dateDebut > horizon) {
    throw new Error("La période globale du PlanningParc est invalide.");
  }

  if (!Number.isInteger(capacite) || capacite < 1) {
    throw new Error("La capacité PlanningParc est invalide.");
  }

  const ouvertureSemaine = construireRegleOuverture(
    "du lundi au vendredi",
    "lcdp-planning-parc-semaine",
    "lcdp-planning-parc-semaine-precision"
  );
  const ouvertureWeekend = construireRegleOuverture(
    "du samedi et du dimanche",
    "lcdp-planning-parc-weekend",
    "lcdp-planning-parc-weekend-precision"
  );
  const fermetures = valeur("lcdp-planning-parc-fermetures") ||
    "Aucune fermeture explicite.";

  return {
    dateDebut,
    horizon,
    fermetures,
    ouvertureSemaine,
    ouvertureWeekend,
    capacite
  };
}

function initialiserComportementsFormulaire() {}


  async function analyser(event) {
    event.preventDefault();

    if (!parcCourant) {
      afficherStatus("Parc non chargé.", true);
      return;
    }

    const endpoint = endpointWorker();
    const bouton = document.getElementById(PAGE.prefix + "-analyser");

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    let brief;

    try {
      brief = construireBrief();
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
      return;
    }

    if (bouton) bouton.disabled = true;
    afficherStatus(PAGE.analysisMessage);

    try {
      const data = await appelerJson(
        endpoint + PAGE.briefRoute,
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
      afficherStatus(PAGE.analysisReadyMessage);
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  async function valider() {
    if (!briefCourant || !parcCourant) return;

    const endpoint = endpointWorker();
    const bouton = document.getElementById(PAGE.prefix + "-valider");

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    try {
      const confirmation = await demanderConfirmation(
        PAGE.confirmMessage
      );

      if (!confirmation) return;

      if (bouton) bouton.disabled = true;
      afficherStatus(PAGE.validationMessage);

      const data = await appelerJson(
        endpoint + PAGE.validateRoute,
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
        PAGE.successMessage +
        (
          Number.isInteger(Number(data.joursModifies))
            ? " " + String(data.joursModifies) + " journée(s)."
            : ""
        )
      );
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  function corriger() {
    const section = document.getElementById(
      PAGE.prefix + "-validation"
    );

    if (section) section.hidden = true;
    briefCourant = null;
    document.getElementById(PAGE.focusId)?.focus();
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

    document.getElementById(PAGE.prefix + "-form")
      ?.addEventListener("submit", analyser);

    document.getElementById(PAGE.prefix + "-valider")
      ?.addEventListener("click", valider);

    document.getElementById(PAGE.prefix + "-corriger")
      ?.addEventListener("click", corriger);

    initialiserComportementsFormulaire();
    initialiserDictee();
  }

  initialiserPage().catch((error) => {
    console.error(error);
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
    afficherStatus(
      PAGE.title + " indisponible : " +
      String(error?.message || error || ""),
      true
    );
  });
})();
