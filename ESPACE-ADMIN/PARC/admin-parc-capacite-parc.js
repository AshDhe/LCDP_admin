(function () {
  "use strict";

  window.LCDP_initialiserAdminParcCapaciteParc = initialiserAdminParcCapaciteParc;

  async function initialiserAdminParcCapaciteParc(outils = {}) {
    const config = window.SITE_CONFIG || {};

    const construireUrlAdmin = typeof outils.construireUrlAdmin === "function"
      ? outils.construireUrlAdmin
      : construireUrlAdminFallback;

    const chargerFragmentObjet = typeof outils.chargerFragmentObjet === "function"
      ? outils.chargerFragmentObjet
      : window.LCDP_chargerFragmentObjet;

    const endpointListeParcs = endpointDepuisConfig(
      config.workerAutocompleteParcUrl ||
      config.WORKER_AUTOCOMPLETE_PARC_URL ||
      window.ADMIN_CONFIG?.API_AUTOCOMPLETE_PARC ||
      ""
    );

    const endpointIaShiftHparcs1 = endpointDepuisConfig(
      config.workerIaShiftHparcs1Url ||
      config.WORKER_IA_SHIFT_HPARCS_1_URL ||
      window.ADMIN_CONFIG?.API_IA_SHIFT_HPARCS_1 ||
      ""
    );

    const endpointIaShiftHparcs2 = endpointDepuisConfig(
      config.workerIaShiftHparcs2Url ||
      config.WORKER_IA_SHIFT_HPARCS_2_URL ||
      window.ADMIN_CONFIG?.API_IA_SHIFT_HPARCS_2 ||
      ""
    );

    const urlConnexionAdmin = construireUrlAdmin("/ESPACE-ADMIN/connexion-admin.html");
    const urlRetourParc = construireUrlAdmin("/ESPACE-ADMIN/PARC/admin-parc-accueil-parc.html");

    let parcsDisponibles = [];
    let parcActif = null;
    let briefEnregistre = null;
    let recognition = null;
    let dicteeActive = false;

    if (typeof window.LCDP_creerFormulaire !== "function") {
      await afficherAlerte("Erreur technique", "Le composant formulaire V3 n’est pas disponible.");
      return;
    }

    if (!endpointListeParcs || !endpointIaShiftHparcs1 || !endpointIaShiftHparcs2) {
      await afficherAlerte(
        "Configuration incomplète",
        "Les endpoints nécessaires à la capacité parc ne sont pas configurés."
      );
      return;
    }

    await creerFormulaireSelectionParc();
    await creerFormulaireBriefIa();
    await creerFormulaireValidationJson();

    const inputNomParc = document.getElementById("nom-parc");
    const inputDptmtParc = document.getElementById("dptmt-parc");
    const suggestionsParcs = document.getElementById("suggestions-parcs");
    const formSelectionParc = document.getElementById("form-selection-parc");
    const messageSelectionParc = document.getElementById("message-selection-parc");

    const sectionBriefIa = document.getElementById("lcdp-form-brief-ia-slot");
    const parcSelectionne = document.getElementById("parc-selectionne");
    const formBriefIa = document.getElementById("form-brief-ia");
    const texteBrief = document.getElementById("texte-brief");
    const messageBriefIa = document.getElementById("message-brief-ia");
    const btnDemarrerDictee = document.getElementById("btn-demarrer-dictee");
    const btnArreterDictee = document.getElementById("btn-arreter-dictee");
    const messageDictee = document.getElementById("message-dictee");

    const sectionValidationJson = document.getElementById("lcdp-form-validation-json-slot");
    const resumeJsonBrief = document.getElementById("resume-json-brief");
    const resultatJsonBrief = document.getElementById("resultat-json-brief");
    const btnCorrigerBrief = document.getElementById("btn-corriger-brief");
    const btnValiderJson = document.getElementById("btn-valider-json");
    const messageValidationJson = document.getElementById("message-validation-json");

    if (
      !inputNomParc ||
      !inputDptmtParc ||
      !suggestionsParcs ||
      !formSelectionParc ||
      !messageSelectionParc ||
      !sectionBriefIa ||
      !parcSelectionne ||
      !formBriefIa ||
      !texteBrief ||
      !messageBriefIa ||
      !btnDemarrerDictee ||
      !btnArreterDictee ||
      !messageDictee ||
      !sectionValidationJson ||
      !resumeJsonBrief ||
      !resultatJsonBrief ||
      !btnCorrigerBrief ||
      !btnValiderJson ||
      !messageValidationJson
    ) {
      await afficherAlerte("Erreur technique", "La page capacité parc est incomplète.");
      return;
    }

    resultatJsonBrief.readOnly = true;
    resultatJsonBrief.rows = 14;

    inputNomParc.addEventListener("input", afficherSuggestionsParcs);

    formSelectionParc.addEventListener("submit", (event) => {
      event.preventDefault();
      validerSelectionParc();
    });

    formBriefIa.addEventListener("submit", (event) => {
      event.preventDefault();
      lancerBriefIa();
    });

    btnCorrigerBrief.addEventListener("click", () => {
      sectionValidationJson.hidden = true;
      messageBriefIa.textContent = "Corriger le brief puis relancer l’IA.";
    });

    btnValiderJson.addEventListener("click", () => {
      if (!briefEnregistre || !briefEnregistre.idbrief) {
        messageValidationJson.textContent = "Aucun brief enregistré à valider.";
        return;
      }

      afficherDialogueBouton({
        titre: "Brief enregistré",
        texte: "La mise à jour du planning du parc va maintenant être lancée.",
        actions: [
          {
            label: "Lancer la mise à jour",
            style: "lcdp-button-primary",
            action: lancerMiseAJourPlanning
          },
          {
            label: "Annuler",
            style: "lcdp-button-secondary",
            action: null
          }
        ]
      });
    });

    initialiserDicteeVocale();
    await chargerParcs();

    async function creerFormulaireSelectionParc() {
      await window.LCDP_creerFormulaire("lcdp-form-selection-parc-slot", {
        id: "form-selection-parc",
        titre: "1. Sélection du parc",
        sousTitre: "Choisissez le parc concerné.",
        champs: [
          {
            id: "nom-parc",
            name: "nom-parc",
            label: "Nom du parc",
            type: "text",
            autocomplete: "off",
            required: true
          },
          {
            id: "dptmt-parc",
            name: "dptmt-parc",
            label: "Département",
            type: "text",
            autocomplete: "off",
            required: true
          }
        ],
        bouton: {
          id: "btn-valider-parc",
          label: "Valider le parc",
          type: "submit",
          style: "lcdp-button-primary"
        }
      });

      const inputNom = document.getElementById("nom-parc");
      const champNom = inputNom?.closest("[data-lcdp-box-champ-formulaire]");
      const suggestions = document.createElement("div");
      suggestions.id = "suggestions-parcs";
      suggestions.className = "lcdp-stack-small";
      suggestions.hidden = true;

      if (champNom) {
        champNom.appendChild(suggestions);
      }

      const form = document.getElementById("form-selection-parc");
      const message = document.createElement("p");
      message.id = "message-selection-parc";
      message.className = "lcdp-text-muted";
      message.setAttribute("aria-live", "polite");
      form?.appendChild(message);
    }

    async function creerFormulaireBriefIa() {
      await window.LCDP_creerFormulaire("lcdp-form-brief-ia-slot", {
        id: "form-brief-ia",
        titre: "2. Brief IA du parc",
        sousTitre: "Décrivez les horaires, fermetures et capacités du parc.",
        champs: [
          {
            id: "texte-brief",
            name: "texte-brief",
            label: "Brief administrateur",
            type: "textarea",
            required: true
          }
        ],
        bouton: {
          id: "btn-lancer-brief-ia",
          label: "Lancer le brief IA",
          type: "submit",
          style: "lcdp-button-primary"
        }
      });

      const form = document.getElementById("form-brief-ia");
      const fields = form?.querySelector("[data-lcdp-formulaire-fields]");
      const actions = form?.querySelector("[data-lcdp-formulaire-actions]");
      const header = form?.querySelector(".lcdp-box-formulaire__header");

      const parc = document.createElement("p");
      parc.id = "parc-selectionne";
      parc.className = "lcdp-text-strong-left";
      header?.appendChild(parc);

      const dictee = document.createElement("div");
      dictee.className = "lcdp-stack-small";

      const btnDemarrer = document.createElement("button");
      btnDemarrer.type = "button";
      btnDemarrer.id = "btn-demarrer-dictee";
      btnDemarrer.className = "lcdp-button lcdp-button-secondary";
      btnDemarrer.textContent = "Dicter le brief";

      const btnArreter = document.createElement("button");
      btnArreter.type = "button";
      btnArreter.id = "btn-arreter-dictee";
      btnArreter.className = "lcdp-button lcdp-button-secondary";
      btnArreter.textContent = "Arrêter la dictée";
      btnArreter.disabled = true;

      const messageDicteeElement = document.createElement("p");
      messageDicteeElement.id = "message-dictee";
      messageDicteeElement.className = "lcdp-text-muted";
      messageDicteeElement.setAttribute("aria-live", "polite");

      dictee.appendChild(btnDemarrer);
      dictee.appendChild(btnArreter);
      dictee.appendChild(messageDicteeElement);
      fields?.appendChild(dictee);

      const message = document.createElement("p");
      message.id = "message-brief-ia";
      message.className = "lcdp-text-muted";
      message.setAttribute("aria-live", "polite");
      actions?.after(message);
    }

    async function creerFormulaireValidationJson() {
      await window.LCDP_creerFormulaire("lcdp-form-validation-json-slot", {
        id: "form-validation-json",
        titre: "3. Validation du brief",
        sousTitre: "Vérifiez l’interprétation IA avant la mise à jour.",
        champs: [
          {
            id: "resultat-json-brief",
            name: "resultat-json-brief",
            label: "JSON technique",
            type: "textarea"
          }
        ]
      });

      const form = document.getElementById("form-validation-json");
      const fields = form?.querySelector("[data-lcdp-formulaire-fields]");
      const actions = form?.querySelector("[data-lcdp-formulaire-actions]");

      const resume = document.createElement("div");
      resume.id = "resume-json-brief";
      resume.className = "lcdp-stack-small";
      fields?.insertBefore(resume, fields.firstChild);

      const btnCorriger = document.createElement("button");
      btnCorriger.type = "button";
      btnCorriger.id = "btn-corriger-brief";
      btnCorriger.className = "lcdp-button lcdp-button-secondary";
      btnCorriger.textContent = "Corriger le brief";

      const btnValider = document.createElement("button");
      btnValider.type = "button";
      btnValider.id = "btn-valider-json";
      btnValider.className = "lcdp-button lcdp-button-primary";
      btnValider.textContent = "Valider le brief";

      actions?.appendChild(btnCorriger);
      actions?.appendChild(btnValider);

      const message = document.createElement("p");
      message.id = "message-validation-json";
      message.className = "lcdp-text-muted";
      message.setAttribute("aria-live", "polite");
      form?.appendChild(message);
    }

    async function chargerParcs() {
      messageSelectionParc.textContent = "Chargement des parcs...";

      try {
        const reponse = await fetch(endpointListeParcs, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json"
          }
        });

        const result = await reponse.json().catch(() => null);

        if (reponse.status === 401 || reponse.status === 403) {
          window.location.href = urlConnexionAdmin;
          return;
        }

        if (!reponse.ok || !result || result.success !== true) {
          messageSelectionParc.textContent = "Impossible de charger la liste des parcs.";
          return;
        }

        parcsDisponibles = Array.isArray(result.parcs) ? result.parcs : [];
        messageSelectionParc.textContent = "";

      } catch (erreur) {
        messageSelectionParc.textContent = String(
          erreur?.message || erreur || "Erreur de connexion au serveur des parcs."
        );
      }
    }

    function afficherSuggestionsParcs() {
      const saisie = normaliserRecherche(inputNomParc.value);

      suggestionsParcs.innerHTML = "";
      suggestionsParcs.hidden = true;

      parcActif = null;
      inputDptmtParc.value = "";
      sectionBriefIa.hidden = true;
      sectionValidationJson.hidden = true;

      if (!saisie) {
        return;
      }

      const resultats = parcsDisponibles.filter((parc) => {
        return normaliserRecherche(parc.nom).includes(saisie);
      });

      resultats.slice(0, 8).forEach((parc) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "lcdp-button lcdp-button-secondary";
        item.textContent = `${parc.nom || ""} - ${parc.dptmt || ""}`;

        item.addEventListener("click", () => {
          inputNomParc.value = parc.nom || "";
          inputDptmtParc.value = parc.dptmt || "";
          parcActif = parc;
          suggestionsParcs.innerHTML = "";
          suggestionsParcs.hidden = true;
          messageSelectionParc.textContent = "";
        });

        suggestionsParcs.appendChild(item);
      });

      suggestionsParcs.hidden = resultats.length === 0;
    }

    function validerSelectionParc() {
      const nomSaisi = normaliserRecherche(inputNomParc.value);
      const dptmtSaisi = String(inputDptmtParc.value || "").trim();

      const parcTrouve = parcsDisponibles.find((parc) => {
        return (
          normaliserRecherche(parc.nom) === nomSaisi &&
          String(parc.dptmt || "").trim() === dptmtSaisi
        );
      });

      if (!parcTrouve) {
        messageSelectionParc.textContent = "Aucun parc trouvé avec ce nom et ce département.";
        sectionBriefIa.hidden = true;
        sectionValidationJson.hidden = true;
        parcActif = null;
        return;
      }

      parcActif = parcTrouve;
      briefEnregistre = null;

      messageSelectionParc.textContent = "Parc validé.";
      parcSelectionne.textContent = `${parcActif.nom || ""} - département ${parcActif.dptmt || ""} - ${parcActif.localite || ""}`;

      sectionBriefIa.hidden = false;
      sectionValidationJson.hidden = true;
      resumeJsonBrief.innerHTML = "";
      resultatJsonBrief.value = "";
      messageBriefIa.textContent = "";
      messageValidationJson.textContent = "";
    }

    async function lancerBriefIa() {
      messageBriefIa.textContent = "";
      messageValidationJson.textContent = "";
      resultatJsonBrief.value = "";
      resumeJsonBrief.innerHTML = "";
      sectionValidationJson.hidden = true;
      briefEnregistre = null;

      if (!parcActif) {
        messageBriefIa.textContent = "Aucun parc sélectionné.";
        return;
      }

      const texte = texteBrief.value.trim();

      if (!texte) {
        messageBriefIa.textContent = "Le brief est vide.";
        return;
      }

      const payload = {
        idparc: parcActif.idparc,
        nom: parcActif.nom,
        dptmt: parcActif.dptmt,
        textebrief: texte
      };

      const boutonSubmit = document.getElementById("btn-lancer-brief-ia");

      if (boutonSubmit) {
        boutonSubmit.disabled = true;
        boutonSubmit.textContent = "Analyse IA en cours...";
      }

      try {
        const reponse = await fetch(endpointIaShiftHparcs1, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const result = await reponse.json().catch(() => null);

        if (reponse.status === 401 || reponse.status === 403) {
          window.location.href = urlConnexionAdmin;
          return;
        }

        if (!reponse.ok || !result || result.success !== true) {
          messageBriefIa.textContent = "Erreur pendant l’analyse IA.";
          resultatJsonBrief.value = JSON.stringify(result, null, 2);
          sectionValidationJson.hidden = false;
          return;
        }

        briefEnregistre = {
          idbrief: result.idbrief,
          idparc: result.idparc,
          nom: result.nom,
          dptmt: result.dptmt,
          textebrief: result.textebrief,
          increment: result.increment,
          jsonbrief: result.jsonbrief
        };

        afficherValidationJson(briefEnregistre);

        messageBriefIa.textContent = "Analyse IA terminée. Validation du résultat ci-dessous.";
        sectionValidationJson.hidden = false;

      } catch (erreur) {
        messageBriefIa.textContent = "Erreur de connexion au worker IA.";
        resultatJsonBrief.value = String(erreur?.message || erreur || "");
        sectionValidationJson.hidden = false;
      } finally {
        if (boutonSubmit) {
          boutonSubmit.disabled = false;
          boutonSubmit.textContent = "Lancer le brief IA";
        }
      }
    }

    async function lancerMiseAJourPlanning() {
      if (!briefEnregistre || !briefEnregistre.idbrief || !briefEnregistre.idparc) {
        messageValidationJson.textContent = "Aucun brief valide à envoyer.";
        return;
      }

      messageValidationJson.textContent = "Mise à jour du planning en cours...";
      btnValiderJson.disabled = true;
      btnCorrigerBrief.disabled = true;

      try {
        const reponse = await fetch(endpointIaShiftHparcs2, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            idbrief: briefEnregistre.idbrief,
            idparc: briefEnregistre.idparc
          })
        });

        const result = await reponse.json().catch(() => null);

        if (reponse.status === 401 || reponse.status === 403) {
          window.location.href = urlConnexionAdmin;
          return;
        }

        if (!reponse.ok || !result || result.success !== true) {
          messageValidationJson.textContent = "Erreur pendant la mise à jour du planning.";
          resultatJsonBrief.value = JSON.stringify(result, null, 2);
          btnValiderJson.disabled = false;
          btnCorrigerBrief.disabled = false;
          return;
        }

        messageValidationJson.textContent = "Planning mis à jour.";
        resultatJsonBrief.value = JSON.stringify(result, null, 2);

        await afficherDialogueBouton({
          titre: "Planning mis à jour",
          texte: construireResumeFinal(result.jsonfinal),
          actions: [
            {
              label: "Retour menu Parc",
              style: "lcdp-button-primary",
              action: () => {
                window.location.href = urlRetourParc;
              }
            }
          ]
        });

      } catch (erreur) {
        messageValidationJson.textContent = "Erreur de connexion au worker de mise à jour.";
        resultatJsonBrief.value = String(erreur?.message || erreur || "");
        btnValiderJson.disabled = false;
        btnCorrigerBrief.disabled = false;
      }
    }

    function afficherValidationJson(data) {
      const json = data.jsonbrief || {};
      const resumeLisible = Array.isArray(json.resume_lisible)
        ? json.resume_lisible
        : [];

      const alertes = Array.isArray(json.alertes)
        ? json.alertes
        : [];

      resumeJsonBrief.innerHTML = "";

      const titre = document.createElement("p");
      titre.className = "lcdp-text-strong-left";
      titre.textContent = `Interprétation du brief — ${data.nom || ""} (${data.dptmt || ""})`;
      resumeJsonBrief.appendChild(titre);

      if (resumeLisible.length > 0) {
        resumeLisible.forEach((phrase) => {
          const p = document.createElement("p");
          p.className = "lcdp-text-muted";
          p.textContent = String(phrase || "");
          resumeJsonBrief.appendChild(p);
        });
      } else {
        const p = document.createElement("p");
        p.className = "lcdp-text-muted";
        p.textContent = "Aucun résumé lisible n’a été généré.";
        resumeJsonBrief.appendChild(p);
      }

      if (alertes.length > 0) {
        const titreAlertes = document.createElement("p");
        titreAlertes.className = "lcdp-text-strong-left";
        titreAlertes.textContent = "Alertes";
        resumeJsonBrief.appendChild(titreAlertes);

        alertes.forEach((alerte) => {
          const p = document.createElement("p");
          p.className = "lcdp-text-muted";
          p.textContent = String(alerte || "");
          resumeJsonBrief.appendChild(p);
        });
      }

      resultatJsonBrief.value = JSON.stringify(data, null, 2);
    }

    function construireResumeFinal(jsonfinal) {
      const resumeLisible = Array.isArray(jsonfinal?.resume_lisible)
        ? jsonfinal.resume_lisible
        : [];

      const lignes = resumeLisible
        .map((ligne) => String(ligne || "").trim())
        .filter(Boolean);

      if (!lignes.length) {
        return "Le planning du parc a été mis à jour.";
      }

      return "Le planning du parc a été mis à jour.\n\n" + lignes.join("\n");
    }

    function initialiserDicteeVocale() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        btnDemarrerDictee.disabled = true;
        btnArreterDictee.disabled = true;
        messageDictee.textContent = "La dictée vocale n’est pas disponible sur ce navigateur.";
        return;
      }

      recognition = new SpeechRecognition();
      recognition.lang = "fr-FR";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.addEventListener("result", (event) => {
        let texteFinal = "";
        let texteIntermediaire = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;

          if (event.results[i].isFinal) {
            texteFinal += transcript + " ";
          } else {
            texteIntermediaire += transcript;
          }
        }

        if (texteFinal) {
          texteBrief.value = `${texteBrief.value.trim()} ${texteFinal.trim()}`.trim();
        }

        if (texteIntermediaire) {
          messageDictee.textContent = `Dictée en cours : ${texteIntermediaire}`;
        }
      });

      recognition.addEventListener("start", () => {
        dicteeActive = true;
        btnDemarrerDictee.disabled = true;
        btnArreterDictee.disabled = false;
        messageDictee.textContent = "Dictée en cours...";
      });

      recognition.addEventListener("end", () => {
        dicteeActive = false;
        btnDemarrerDictee.disabled = false;
        btnArreterDictee.disabled = true;

        if (messageDictee.textContent.startsWith("Dictée en cours")) {
          messageDictee.textContent = "Dictée arrêtée.";
        }
      });

      recognition.addEventListener("error", (event) => {
        messageDictee.textContent = `Erreur dictée : ${event.error}`;
        btnDemarrerDictee.disabled = false;
        btnArreterDictee.disabled = true;
        dicteeActive = false;
      });

      btnDemarrerDictee.addEventListener("click", () => {
        if (!recognition || dicteeActive) {
          return;
        }

        try {
          recognition.start();
        } catch {
          messageDictee.textContent = "Impossible de démarrer la dictée.";
        }
      });

      btnArreterDictee.addEventListener("click", () => {
        if (!recognition || !dicteeActive) {
          return;
        }

        recognition.stop();
      });
    }

    async function afficherDialogueBouton({ titre, texte, actions = [] }) {
      const slot = document.getElementById("lcdp-lightbox-slot");

      if (!slot || typeof chargerFragmentObjet !== "function") {
        alert(texte || titre || "");
        return false;
      }

      slot.innerHTML = "";

      const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
      slot.appendChild(fragment);

      const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
      const titreElement = slot.querySelector("[data-lcdp-dialogue-title]");
      const texteElement = slot.querySelector("[data-lcdp-dialogue-text]");
      const actionsElement = slot.querySelector("[data-lcdp-dialogue-actions]");
      const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

      if (!dialogue || !titreElement || !texteElement || !actionsElement || !boutonFermer) {
        slot.innerHTML = "";
        alert(texte || titre || "");
        return false;
      }

      titreElement.textContent = titre || "Information";
      texteElement.textContent = texte || "";

      const fermer = () => {
        slot.innerHTML = "";
      };

      boutonFermer.addEventListener("click", fermer);
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          fermer();
        }
      });

      actions.forEach((action) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button " + (action.style || "lcdp-button-primary");
        bouton.textContent = action.label || "OK";
        bouton.addEventListener("click", () => {
          fermer();

          if (typeof action.action === "function") {
            action.action();
          }
        });
        actionsElement.appendChild(bouton);
      });

      if (!actions.length) {
        const boutonOk = document.createElement("button");
        boutonOk.type = "button";
        boutonOk.className = "lcdp-button lcdp-button-primary";
        boutonOk.textContent = "OK";
        boutonOk.addEventListener("click", fermer);
        actionsElement.appendChild(boutonOk);
      }

      return true;
    }

    async function afficherAlerte(titre, message) {
      const slot = document.getElementById("lcdp-lightbox-slot");

      if (!slot || typeof chargerFragmentObjet !== "function") {
        alert(message || titre || "");
        return false;
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
        alert(message || titre || "");
        return false;
      }

      texte.textContent = message || titre || "";

      const fermer = () => {
        slot.innerHTML = "";
      };

      boutonFermer.addEventListener("click", fermer);
      boutonOk.addEventListener("click", fermer);
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) {
          fermer();
        }
      });

      return true;
    }
  }

  function endpointDepuisConfig(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function normaliserRecherche(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
  }

  function construireUrlAdminFallback(chemin) {
    const config = window.SITE_CONFIG || {};
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof config.adminUrl === "function") {
      return config.adminUrl(valeur);
    }

    const adminBase = String(
      config.adminBaseUrl ||
      config.ADMIN_BASE ||
      config.siteBase ||
      window.ADMIN_CONFIG?.ADMIN_BASE_URL ||
      ""
    ).replace(/\/+$/, "");

    return adminBase
      ? adminBase + "/" + valeur.replace(/^\/+/, "")
      : valeur;
  }

  function estUrlExterneOuAncre(chemin) {
    const valeur = String(chemin || "");

    return (
      valeur.startsWith("#") ||
      valeur.startsWith("mailto:") ||
      valeur.startsWith("tel:") ||
      valeur.startsWith("http://") ||
      valeur.startsWith("https://") ||
      valeur.startsWith("data:")
    );
  }
})();
