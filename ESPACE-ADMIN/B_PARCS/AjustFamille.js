(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};

  const GROUPE_CIBLE = "FAMILLE";

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

  async function demanderConfirmationAjustement(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot de dialogue d’ajustement absent.");
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
    const titre = slot.querySelector(
      "[data-lcdp-dialogue-title]"
    );
    const texte = slot.querySelector(
      "[data-lcdp-dialogue-text]"
    );
    const actions = slot.querySelector(
      "[data-lcdp-dialogue-actions]"
    );
    const boutonFermer = slot.querySelector(
      "[data-lcdp-dialogue-close]"
    );

    if (!dialogue || !titre || !texte || !actions) {
      slot.innerHTML = "";
      throw new Error("Structure de la boîte de dialogue incomplète.");
    }

    if (boutonFermer) {
      boutonFermer.remove();
    }

    titre.textContent = "Validation " + GROUPE_CIBLE;
    texte.textContent = String(message || "").trim();

    const boutonAnnuler = document.createElement("button");
    boutonAnnuler.type = "button";
    boutonAnnuler.className =
      "lcdp-button lcdp-button-secondary";
    boutonAnnuler.textContent = "Annuler";

    const boutonOk = document.createElement("button");
    boutonOk.type = "button";
    boutonOk.className =
      "lcdp-button lcdp-button-orange";
    boutonOk.textContent = "OK";

    actions.append(boutonAnnuler, boutonOk);

    return new Promise((resolve) => {
      let resolu = false;

      function terminer(valeur) {
        if (resolu) return;

        resolu = true;
        document.removeEventListener(
          "keydown",
          gererToucheDialogue
        );
        slot.innerHTML = "";
        resolve(valeur);
      }

      function gererToucheDialogue(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          terminer(false);
        }
      }

      boutonAnnuler.addEventListener(
        "click",
        () => terminer(false)
      );

      boutonOk.addEventListener(
        "click",
        () => terminer(true)
      );

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          terminer(false);
        }
      });

      document.addEventListener(
        "keydown",
        gererToucheDialogue
      );

      window.setTimeout(() => {
        boutonOk.focus();
      }, 0);
    });
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
      "lcdp-ajust-famille-identite"
    );

    if (identite) {
      identite.textContent =
        "Parc : " + parcCourant.nom +
        " — Département " + parcCourant.dptmt;
    }
  }

  function construireBriefDepuisFormulaire() {
    return {
      ajustement: document.getElementById(
        "lcdp-ajust-famille-ajustement"
      )?.value.trim() || "",
      capacite: document.getElementById(
        "lcdp-ajust-famille-capacite"
      )?.value.trim() || ""
    };
  }

  function afficherStatus(message, erreur = false) {
    const status = document.getElementById(
      "lcdp-ajust-famille-status"
    );

    if (!status) return;

    status.textContent = String(message || "");
    status.hidden = !message;
    status.dataset.etat = erreur ? "erreur" : "succes";
  }

  function afficherValidation(data) {
    briefCourant = data;

    const section = document.getElementById(
      "lcdp-ajust-famille-validation"
    );
    const resume = document.getElementById(
      "lcdp-ajust-famille-resume"
    );
    const alertes = document.getElementById(
      "lcdp-ajust-famille-alertes"
    );
    const json = document.getElementById(
      "lcdp-ajust-famille-json"
    );
    const boutonValider = document.getElementById(
      "lcdp-ajust-famille-valider"
    );

    if (!section || !resume || !alertes || !json || !boutonValider) {
      throw new Error("Bloc de validation AjustFamille incomplet.");
    }

    const jsonbrief = data?.jsonbrief || {};
    const lignesResume = Array.isArray(jsonbrief.resume_lisible)
      ? jsonbrief.resume_lisible
      : [];
    const listeAlertes = Array.isArray(jsonbrief.alertes)
      ? jsonbrief.alertes
      : [];

    resume.innerHTML = "";
    alertes.innerHTML = "";
    alertes.hidden = true;

    const blocResume = document.createElement("div");
    blocResume.className = "lcdp-validation-bloc";

    const titreResume = document.createElement("h3");
    titreResume.textContent = "Résumé de l’ajustement FAMILLE";
    blocResume.appendChild(titreResume);

    if (lignesResume.length > 0) {
      const liste = document.createElement("ul");
      liste.className = "lcdp-validation-liste";

      for (const ligne of lignesResume) {
        const item = document.createElement("li");
        item.textContent = String(ligne || "");
        liste.appendChild(item);
      }

      blocResume.appendChild(liste);
    } else {
      const texte = document.createElement("p");
      texte.textContent =
        "Aucun résumé de l’ajustement FAMILLE n’a été produit.";
      blocResume.appendChild(texte);
    }

    resume.appendChild(blocResume);

    if (listeAlertes.length > 0) {
      alertes.hidden = false;
      alertes.className = "lcdp-validation-bloc";

      const titreAlertes = document.createElement("h3");
      titreAlertes.textContent = "Points à corriger";
      alertes.appendChild(titreAlertes);

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
      ? "L’ajustement doit être corrigé avant son écriture dans hparcs."
      : "L’ajustement FAMILLE est prêt à être validé.";
    resume.appendChild(note);

    boutonValider.disabled = listeAlertes.length > 0;
    json.textContent = JSON.stringify(jsonbrief, null, 2);
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
      "lcdp-ajust-famille-analyser"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const brief = construireBriefDepuisFormulaire();

    if (!brief.ajustement) {
      afficherStatus("L’ajustement FAMILLE est incomplet.", true);
      return;
    }

    if (bouton) bouton.disabled = true;
    afficherStatus("Analyse IA de l’ajustement en cours…");

    try {
      const data = await appelerJson(
        endpoint + "/famille/ajust/brief",
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
      "lcdp-ajust-famille-valider"
    );

    if (!endpoint) {
      afficherStatus("Endpoint Parc Planning non configuré.", true);
      return;
    }

    const confirmation = await demanderConfirmationAjustement(
      "Valider cet ajustement et modifier le planning FAMILLE dans hparcs ?"
    );

    if (!confirmation) return;

    if (bouton) bouton.disabled = true;
    afficherStatus(
      "Ajustement de hparcs en cours. Ne ferme pas cette page."
    );

    try {
      const data = await appelerJson(
        endpoint + "/famille/ajust/valider",
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
        "Ajustement FAMILLE enregistré sur " +
        String(data.joursModifies || 0) +
        " journée(s). Capacités DUO et COACH relevées sur " +
        String(data.capacitesGlobalesRelevees || 0) +
        " plage(s)."
      );
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), true);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  function corrigerAjustement() {
    const section = document.getElementById(
      "lcdp-ajust-famille-validation"
    );

    if (section) section.hidden = true;
    briefCourant = null;

    document.getElementById(
      "lcdp-ajust-famille-ajustement"
    )?.focus();
  }

  function restaurerBoutonDictee(bouton) {
    if (!bouton) return;

    bouton.disabled = false;
    bouton.textContent = "Dicter";
  }

  function normaliserMotDictee(value) {
    return String(value || "")
      .toLocaleLowerCase("fr-FR")
      .replace(/^[\s.,;:!?…'’"()\[\]{}-]+|[\s.,;:!?…'’"()\[\]{}-]+$/g, "");
  }

  function joindreDeuxSegmentsDictee(baseValue, ajoutValue) {
    const base = String(baseValue || "").trim();
    const ajout = String(ajoutValue || "").trim();

    if (!base) return ajout;
    if (!ajout) return base;

    const motsBase = base.split(/\s+/);
    const motsAjout = ajout.split(/\s+/);
    const limite = Math.min(
      motsBase.length,
      motsAjout.length,
      20
    );
    let chevauchement = 0;

    for (let taille = limite; taille >= 1; taille -= 1) {
      const finBase = motsBase
        .slice(motsBase.length - taille)
        .map(normaliserMotDictee);
      const debutAjout = motsAjout
        .slice(0, taille)
        .map(normaliserMotDictee);

      if (
        finBase.every((mot, index) => {
          return mot && mot === debutAjout[index];
        })
      ) {
        chevauchement = taille;
        break;
      }
    }

    return [...motsBase, ...motsAjout.slice(chevauchement)]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function joindreSegmentsDictee(...segments) {
    return segments.reduce(
      (texte, segment) => joindreDeuxSegmentsDictee(
        texte,
        segment
      ),
      ""
    );
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

    document.getElementById("lcdp-ajust-famille-form")
      ?.addEventListener("submit", analyserAjustement);

    document.getElementById("lcdp-ajust-famille-valider")
      ?.addEventListener("click", validerAjustement);

    document.getElementById("lcdp-ajust-famille-corriger")
      ?.addEventListener("click", corrigerAjustement);

    initialiserDictee();
  }

  initialiserPage().catch((error) => {
    console.error(error);

    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;

    afficherStatus(
      "AjustFamille indisponible : " +
      String(error?.message || error || ""),
      true
    );
  });
})();
