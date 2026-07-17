(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};

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
      "lcdp-privatisation-identite"
    );

    if (identite) {
      identite.textContent =
        "Parc : " + parcCourant.nom +
        " — Département " + parcCourant.dptmt;
    }
  }

  function lireCategoriesOuvertes() {
    return Array.from(
      document.querySelectorAll(
        'input[name="lcdp-privatisation-categorie"]:checked'
      )
    ).map((input) => input.value);
  }

  function construireBriefDepuisFormulaire() {
    const capaciteBrute = document.getElementById(
      "lcdp-privatisation-capacite"
    )?.value.trim() || "";

    return {
      privatisation: document.getElementById(
        "lcdp-privatisation-texte"
      )?.value.trim() || "",
      categoriesOuvertes: lireCategoriesOuvertes(),
      capacite: capaciteBrute
        ? Number.parseInt(capaciteBrute, 10)
        : null
    };
  }

  function afficherStatus(message, erreur = false) {
    const status = document.getElementById(
      "lcdp-privatisation-status"
    );

    if (!status) return;

    status.textContent = String(message || "");
    status.hidden = !message;
    status.dataset.etat = erreur ? "erreur" : "succes";
  }

  function afficherValidation(data) {
    briefCourant = data;

    const section = document.getElementById(
      "lcdp-privatisation-validation"
    );
    const resume = document.getElementById(
      "lcdp-privatisation-resume"
    );
    const alertes = document.getElementById(
      "lcdp-privatisation-alertes"
    );
    const json = document.getElementById(
      "lcdp-privatisation-json"
    );
    const boutonValider = document.getElementById(
      "lcdp-privatisation-valider"
    );

    if (!section || !resume || !alertes || !json || !boutonValider) {
      throw new Error("Bloc de validation privatisation incomplet.");
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

  async function analyserPrivatisation(event) {
    event.preventDefault();

    if (!parcCourant) {
      afficherStatus("Parc non chargé.", true);
      return;
    }

    const endpoint = endpointParcPlanning();
    const bouton = document.getElementById(
      "lcdp-privatisation-analyser"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const brief = construireBriefDepuisFormulaire();

    if (!brief.privatisation) {
      afficherStatus("La privatisation est incomplète.", true);
      return;
    }

    if (
      brief.capacite !== null &&
      (!Number.isInteger(brief.capacite) || brief.capacite < 1)
    ) {
      afficherStatus("La capacité est invalide.", true);
      return;
    }

    if (bouton) bouton.disabled = true;
    afficherStatus("Analyse IA de la privatisation en cours…");

    try {
      const data = await appelerJson(
        endpoint + "/privatisation/brief",
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
      afficherStatus("Privatisation prête à être vérifiée.");
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  async function validerPrivatisation() {
    if (!briefCourant || !parcCourant) return;

    const endpoint = endpointParcPlanning();
    const bouton = document.getElementById(
      "lcdp-privatisation-valider"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const confirmation = window.confirm(
      "Valider cette privatisation et modifier hparcs ?"
    );

    if (!confirmation) return;

    if (bouton) bouton.disabled = true;
    afficherStatus(
      "Écriture de la privatisation en cours. Ne ferme pas cette page."
    );

    try {
      const data = await appelerJson(
        endpoint + "/privatisation/valider",
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
        "Privatisation " + String(data.code || "") +
        " enregistrée sur " +
        String(data.joursModifies || 0) +
        " journée(s)."
      );
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  function corrigerPrivatisation() {
    const section = document.getElementById(
      "lcdp-privatisation-validation"
    );

    if (section) section.hidden = true;
    briefCourant = null;

    document.getElementById(
      "lcdp-privatisation-texte"
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

  function fermerFluxMicroDictee() {
    if (!fluxMicroDictee) return;

    for (const piste of fluxMicroDictee.getTracks()) {
      piste.stop();
    }

    fluxMicroDictee = null;
  }

  async function ouvrirFluxMicroDictee() {
    fermerFluxMicroDictee();

    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      return;
    }

    fluxMicroDictee = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  }

  function arreterDictee() {
    dicteeActive = false;
    sessionDictee += 1;

    if (minuterieRelanceDictee) {
      window.clearTimeout(minuterieRelanceDictee);
      minuterieRelanceDictee = null;
    }

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

    fermerFluxMicroDictee();
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

      bouton.addEventListener("click", async () => {
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
        let texteValideSession = String(cible.value || "").trim();
        let resultatsCycle = new Map();
        let delaiRelanceCycle = 0;
        let tentativeDemarrage = 0;

        dicteeActive = true;
        boutonDicteeActif = bouton;
        cibleDicteeActive = cible;
        bouton.disabled = false;
        bouton.textContent = "Arrêter";

        const sessionToujoursActive = () => {
          return (
            dicteeActive &&
            sessionDictee === sessionCourante &&
            boutonDicteeActif === bouton &&
            cibleDicteeActive === cible
          );
        };

        const texteResultatsCycle = () => {
          return Array.from(resultatsCycle.entries())
            .sort(([indexA], [indexB]) => indexA - indexB)
            .map(([, resultat]) => resultat.texte)
            .filter(Boolean)
            .join(" ")
            .trim();
        };

        const afficherCycle = () => {
          if (!sessionToujoursActive()) return;

          cible.value = joindreSegmentsDictee(
            texteValideSession,
            texteResultatsCycle()
          );
        };

        const instance = new SpeechRecognition();
        reconnaissance = instance;

        instance.lang = "fr-FR";
        instance.interimResults = true;
        instance.continuous = true;
        instance.maxAlternatives = 1;

        const planifierRelance = (delai = 0) => {
          if (!sessionToujoursActive()) return;

          if (minuterieRelanceDictee) {
            window.clearTimeout(minuterieRelanceDictee);
          }

          minuterieRelanceDictee = window.setTimeout(() => {
            minuterieRelanceDictee = null;

            if (!sessionToujoursActive()) return;

            try {
              instance.start();
              tentativeDemarrage = 0;
            } catch {
              tentativeDemarrage += 1;

              planifierRelance(
                Math.min(25 * tentativeDemarrage, 150)
              );
            }
          }, Math.max(0, delai));
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
              resultatsCycle.delete(index);
              continue;
            }

            resultatsCycle.set(index, {
              texte,
              final: Boolean(resultat.isFinal)
            });
          }

          afficherCycle();
        });

        instance.addEventListener("error", (event) => {
          const code = String(event?.error || "");

          if (!sessionToujoursActive()) return;

          if (
            code === "not-allowed" ||
            code === "service-not-allowed"
          ) {
            arreterDictee();
            afficherStatus("Autorisation du microphone refusée.", true);
            return;
          }

          if (code === "audio-capture") {
            // Certains navigateurs refusent le partage entre le flux
            // permanent et SpeechRecognition. On libère alors uniquement
            // le flux de maintien ; la dictée continue de se relancer.
            fermerFluxMicroDictee();
            delaiRelanceCycle = 120;
            return;
          }

          if (code === "network") {
            delaiRelanceCycle = 300;
            return;
          }

          if (
            code === "no-speech" ||
            code === "aborted"
          ) {
            delaiRelanceCycle = 0;
            return;
          }

          delaiRelanceCycle = 100;
        });

        instance.addEventListener("end", () => {
          if (!sessionToujoursActive()) return;

          const texteCycle = texteResultatsCycle();

          if (texteCycle) {
            texteValideSession = joindreSegmentsDictee(
              texteValideSession,
              terminerPhraseDictee(texteCycle)
            );
            cible.value = texteValideSession;
          }

          resultatsCycle = new Map();

          const delai = delaiRelanceCycle;
          delaiRelanceCycle = 0;

          // Relance immédiate après un silence : le bouton reste actif
          // et la session de dictée ne s’arrête qu’au clic sur « Arrêter ».
          planifierRelance(delai);
        });

        try {
          await ouvrirFluxMicroDictee();
        } catch {
          // SpeechRecognition peut fonctionner même si le navigateur
          // refuse le flux de maintien séparé.
          fermerFluxMicroDictee();
        }

        if (!sessionToujoursActive()) {
          fermerFluxMicroDictee();
          return;
        }

        planifierRelance(0);
      });
    });

    window.addEventListener("beforeunload", fermerFluxMicroDictee);
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

    document.getElementById("lcdp-privatisation-form")
      ?.addEventListener("submit", analyserPrivatisation);

    document.getElementById("lcdp-privatisation-valider")
      ?.addEventListener("click", validerPrivatisation);

    document.getElementById("lcdp-privatisation-corriger")
      ?.addEventListener("click", corrigerPrivatisation);

    initialiserDictee();
  }

  initialiserPage().catch((error) => {
    console.error(error);

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;

    afficherStatus(
      "privatisation indisponible : " +
      String(error?.message || error || ""),
      true
    );
  });
})();
