if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", preparerIaBriefParcs);
} else {
  preparerIaBriefParcs();
}

function preparerIaBriefParcs() {
  if (window.sessionAdminVerifiee === true) {
    initialiserIaBriefParcs();
    return;
  }

  document.addEventListener("admin-session-validee", initialiserIaBriefParcs, {
    once: true
  });
}

function initialiserIaBriefParcs() {
  const inputNomParc = document.getElementById("nom-parc");
  const inputDptmtParc = document.getElementById("dptmt-parc");
  const suggestionsParcs = document.getElementById("suggestions-parcs");

  const formSelectionParc = document.getElementById("form-selection-parc");
  const messageSelectionParc = document.getElementById("message-selection-parc");

  const sectionBriefIa = document.getElementById("section-brief-ia");
  const parcSelectionne = document.getElementById("parc-selectionne");

  const formBriefIa = document.getElementById("form-brief-ia");
  const texteBrief = document.getElementById("texte-brief");
  const messageBriefIa = document.getElementById("message-brief-ia");
  const btnDemarrerDictee = document.getElementById("btn-demarrer-dictee");
  const btnArreterDictee = document.getElementById("btn-arreter-dictee");
  const messageDictee = document.getElementById("message-dictee");

  const sectionValidationJson = document.getElementById("section-validation-json");
  const resumeJsonBrief = document.getElementById("resume-json-brief");
  const resultatJsonBrief = document.getElementById("resultat-json-brief");
  const btnCorrigerBrief = document.getElementById("btn-corriger-brief");
  const btnValiderJson = document.getElementById("btn-valider-json");
  const messageValidationJson = document.getElementById("message-validation-json");

  const dialogValidationBrief = document.getElementById("dialog-validation-brief");
  const btnDialogLancerMaj = document.getElementById("btn-dialog-lancer-maj");
  const dialogFinTraitement = document.getElementById("dialog-fin-traitement");
  const btnRetourAdmin = document.getElementById("btn-retour-admin");
  const resumeFinalHoraire = document.getElementById("resume-final-horaire");

  const endpointListeParcs = endpointIaBriefDepuisConfig(
    "API_AUTOCOMPLETE_PARC",
    "https://autocomplete-parc-api.lacleduparc.fr"
  );

  const endpointIaShiftHparcs1 = endpointIaBriefDepuisConfig(
    "API_IA_SHIFT_HPARCS_1",
    "https://ia-shift-hparcs-1-api.lacleduparc.fr"
  );

  const endpointIaShiftHparcs2 = endpointIaBriefDepuisConfig(
    "API_IA_SHIFT_HPARCS_2",
    "https://ia-shift-hparcs-2-api.lacleduparc.fr"
  );

  const urlConnexionAdmin = construireUrlAdminIaBrief("/connexion-admin.html");
  const urlRetourAdmin = construireUrlAdminIaBrief("/PAGES/PARC/index-parc.html");

  let parcsDisponibles = [];
  let parcActif = null;
  let briefEnregistre = null;

  let recognition = null;
  let dicteeActive = false;

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
    !messageValidationJson ||
    !dialogValidationBrief ||
    !btnDialogLancerMaj ||
    !dialogFinTraitement ||
    !btnRetourAdmin ||
    !resumeFinalHoraire
  ) {
    return;
  }

  if (!endpointListeParcs || !endpointIaShiftHparcs1 || !endpointIaShiftHparcs2) {
    messageSelectionParc.textContent =
      "Configuration incomplète : les endpoints IA Brief ne sont pas disponibles.";
    return;
  }

  initialiserDicteeVocale();
  chargerParcs();

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

    ouvrirDialog(dialogValidationBrief);
  });

  btnDialogLancerMaj.addEventListener("click", () => {
    fermerDialog(dialogValidationBrief);
    lancerMiseAJourPlanning();
  });

  btnRetourAdmin.addEventListener("click", () => {
    window.location.href = urlRetourAdmin;
  });

  async function chargerParcs() {
    messageSelectionParc.textContent = "Chargement des parcs...";

    try {
      const response = await fetch(endpointListeParcs, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const result = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        window.location.href = urlConnexionAdmin;
        return;
      }

      if (!response.ok || !result || result.success !== true) {
        messageSelectionParc.textContent = "Impossible de charger la liste des parcs.";
        return;
      }

      parcsDisponibles = Array.isArray(result.parcs) ? result.parcs : [];
      messageSelectionParc.textContent = "";

    } catch (error) {
      messageSelectionParc.textContent =
        String(error?.message || error || "Erreur de connexion au serveur des parcs.");
    }
  }

  function afficherSuggestionsParcs() {
    const saisie = normaliserRechercheIaBrief(inputNomParc.value);

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
      return normaliserRechercheIaBrief(parc.nom).includes(saisie);
    });

    resultats.slice(0, 8).forEach((parc) => {
      const item = document.createElement("button");

      item.type = "button";
      item.className = "ia-brief-suggestion";
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
    const nomSaisi = normaliserRechercheIaBrief(inputNomParc.value);
    const dptmtSaisi = String(inputDptmtParc.value || "").trim();

    const parcTrouve = parcsDisponibles.find((parc) => {
      return (
        normaliserRechercheIaBrief(parc.nom) === nomSaisi &&
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

    parcSelectionne.textContent =
      `${parcActif.nom || ""} - département ${parcActif.dptmt || ""} - ${parcActif.localite || ""}`;

    sectionBriefIa.hidden = false;
    sectionValidationJson.hidden = true;
    resumeJsonBrief.innerHTML = "";
    resultatJsonBrief.textContent = "";
    messageBriefIa.textContent = "";
    messageValidationJson.textContent = "";
  }

  async function lancerBriefIa() {
    messageBriefIa.textContent = "";
    messageValidationJson.textContent = "";
    resultatJsonBrief.textContent = "";
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

    const boutonSubmit = formBriefIa.querySelector("button[type='submit']");

    boutonSubmit.disabled = true;
    boutonSubmit.textContent = "Analyse IA en cours...";

    try {
      const response = await fetch(endpointIaShiftHparcs1, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        window.location.href = urlConnexionAdmin;
        return;
      }

      if (!response.ok || !result || result.success !== true) {
        messageBriefIa.textContent = "Erreur pendant l’analyse IA.";
        resultatJsonBrief.textContent = JSON.stringify(result, null, 2);
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

    } catch (error) {
      messageBriefIa.textContent = "Erreur de connexion au worker IA.";
      resultatJsonBrief.textContent = String(error?.message || error);
      sectionValidationJson.hidden = false;
    } finally {
      boutonSubmit.disabled = false;
      boutonSubmit.textContent = "JSON IA";
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
    btnDialogLancerMaj.disabled = true;

    try {
      const response = await fetch(endpointIaShiftHparcs2, {
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

      const result = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        window.location.href = urlConnexionAdmin;
        return;
      }

      if (!response.ok || !result || result.success !== true) {
        messageValidationJson.textContent = "Erreur pendant la mise à jour du planning.";
        resultatJsonBrief.textContent = JSON.stringify(result, null, 2);
        btnValiderJson.disabled = false;
        btnCorrigerBrief.disabled = false;
        btnDialogLancerMaj.disabled = false;
        return;
      }

      messageValidationJson.textContent = "Planning mis à jour.";
      resultatJsonBrief.textContent = JSON.stringify(result, null, 2);

      afficherResumeFinal(result.jsonfinal);
      ouvrirDialog(dialogFinTraitement);

    } catch (error) {
      messageValidationJson.textContent = "Erreur de connexion au worker de mise à jour.";
      resultatJsonBrief.textContent = String(error?.message || error);
      btnValiderJson.disabled = false;
      btnCorrigerBrief.disabled = false;
      btnDialogLancerMaj.disabled = false;
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

    let html = "";

    html += "<h3>Interprétation du brief</h3>";
    html += `<p>Parc : ${escapeHtmlIaBrief(data.nom)}</p>`;
    html += `<p>Département : ${escapeHtmlIaBrief(data.dptmt)}</p>`;

    if (resumeLisible.length > 0) {
      resumeLisible.forEach((phrase) => {
        html += `<p>${escapeHtmlIaBrief(phrase)}</p>`;
      });
    } else {
      html += "<p>Aucun résumé lisible n’a été généré.</p>";
    }

    if (alertes.length > 0) {
      html += "<h3>Alertes</h3>";

      alertes.forEach((alerte) => {
        html += `<p>${escapeHtmlIaBrief(alerte)}</p>`;
      });
    }

    resumeJsonBrief.innerHTML = html;
    resultatJsonBrief.textContent = JSON.stringify(data, null, 2);
  }

  function afficherResumeFinal(jsonfinal) {
    const resumeLisible = Array.isArray(jsonfinal?.resume_lisible)
      ? jsonfinal.resume_lisible
      : [];

    let html = "";

    html += "<h3>Compte-rendu horaire final</h3>";

    if (resumeLisible.length > 0) {
      resumeLisible.forEach((phrase) => {
        html += `<p>${escapeHtmlIaBrief(phrase)}</p>`;
      });
    } else {
      html += "<p>Aucun compte-rendu final lisible n’a été retourné.</p>";
    }

    resumeFinalHoraire.innerHTML = html;
  }

  function initialiserDicteeVocale() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      btnDemarrerDictee.disabled = true;
      btnArreterDictee.disabled = true;
      messageDictee.textContent =
        "La dictée vocale n’est pas disponible sur ce navigateur.";
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
        texteBrief.value =
          `${texteBrief.value.trim()} ${texteFinal.trim()}`.trim();
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
      if (!recognition || dicteeActive) return;

      try {
        recognition.start();
      } catch (error) {
        messageDictee.textContent = "Impossible de démarrer la dictée.";
      }
    });

    btnArreterDictee.addEventListener("click", () => {
      if (!recognition || !dicteeActive) return;
      recognition.stop();
    });
  }

  function ouvrirDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "open");
    }
  }

  function fermerDialog(dialog) {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }
}

function endpointIaBriefDepuisConfig(cle, fallback) {
  return nettoyerBaseUrlIaBrief(
    window.ADMIN_CONFIG?.[cle] ||
    fallback ||
    ""
  );
}

function construireUrlAdminIaBrief(chemin) {
  if (typeof window.construireUrlAdmin === "function") {
    return window.construireUrlAdmin(chemin);
  }

  const adminBaseUrl = nettoyerBaseUrlIaBrief(
    window.ADMIN_CONFIG?.ADMIN_BASE_URL || ""
  );

  return joindreBaseEtCheminIaBrief(adminBaseUrl, chemin);
}

function joindreBaseEtCheminIaBrief(baseUrl, chemin) {
  const base = nettoyerBaseUrlIaBrief(baseUrl);
  const cheminNettoye = "/" + String(chemin || "").replace(/^\/+/, "");

  if (!base) {
    return cheminNettoye;
  }

  return base + cheminNettoye;
}

function nettoyerBaseUrlIaBrief(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normaliserRechercheIaBrief(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function escapeHtmlIaBrief(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}