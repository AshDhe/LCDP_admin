(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const ETAPES = [
    { key: "inscription", label: "Inscription" },
    { key: "localisation", label: "Localisation" },
    { key: "qualification", label: "Qualification" },
    { key: "card1", label: "Card1" },
    { key: "photos", label: "Photos" },
    { key: "finalisation", label: "Finalisation" }
  ];
  let onglets = null;
  let operationEnCours = false;

  function urlObjet(path) {
    return typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet(path) : path;
  }

  function urlAdmin(path) {
    return typeof window.LCDP_urlAdmin === "function"
      ? window.LCDP_urlAdmin(path) : path;
  }

  function endpointParcAdmin() {
    return String(
      config.workerParcAdminUrl ||
      config.WORKER_PARC_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_PARC_ADMIN ||
      window.ADMIN_CONFIG?.API_PARC_ADMIN_URL || ""
    ).replace(/\/+$/, "");
  }

  function chargerScriptUneFois(src, marqueur) {
    if (document.querySelector('script[data-lcdp-creation-module="' + marqueur + '"]')) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.lcdpCreationModule = marqueur;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Module indisponible : " + marqueur)), { once: true });
      document.body.appendChild(script);
    });
  }

  function normaliserDepartement(value) {
    const texte = String(value || "").trim().toUpperCase();
    if (/^\d{1,2}$/.test(texte)) return texte.padStart(2, "0");
    if (/^\d{3}$/.test(texte) || texte === "2A" || texte === "2B") return texte;
    return "";
  }

  function afficherCompteRendu(status, data, type, dptmt, limit) {
    const mesures = {
      localisation: [["traites", "Parcs traités"], ["modifies", "Parcs modifiés"], ["erreurs", "Erreurs"]],
      qualification: [["traites", "Parcs traités"], ["qualifies", "Parcs qualifiés"], ["passesPrepa", "Passés en prépa"], ["passesNonConforme", "Non conformes"], ["erreurs", "Erreurs"]],
      card1: [["traites", "Parcs traités"], ["stagings", "Brouillons créés"], ["ignores", "Ignorés"], ["erreurs", "Erreurs"]]
    }[type] || [];
    const lignes = [data.message || "Opération terminée.", "Département : " + dptmt,
      "Limite : " + String(data.limite ?? limit)];
    for (const [cle, libelle] of mesures) lignes.push(libelle + " : " + String(data[cle] ?? 0));
    status.textContent = lignes.join("\n");
    status.dataset.state = "success";
  }

  async function initialiserEtapeAutomatique(key, titre) {
    const zone = onglets.zones[key];
    const champSlot = document.createElement("div");
    champSlot.id = "lcdp-creation-" + key + "-form-slot";
    zone.appendChild(champSlot);

    const form = await window.LCDP_creerFormulaire(champSlot.id, {
      id: "lcdp-creation-" + key + "-form",
      titre,
      ariaLabel: titre,
      champs: [
        { label: "Département", name: "dptmt", id: "lcdp-creation-" + key + "-dptmt",
          type: "text", required: true, autocomplete: "off" },
        { label: "Nombre maximum de parcs (1 à 50)", name: "limit",
          id: "lcdp-creation-" + key + "-limit", type: "number", required: true }
      ],
      bouton: {
        id: "lcdp-creation-" + key + "-executer",
        type: "submit", label: "Lancer " + titre.toLowerCase(),
        style: "lcdp-button-primary"
      }
    });
    if (!form) throw new Error("Formulaire " + titre + " indisponible.");
    const limiteChamp = form.elements.namedItem("limit");
    limiteChamp.value = "10";
    limiteChamp.min = "1";
    limiteChamp.max = "50";
    limiteChamp.step = "1";

    const avertissement = document.createElement("p");
    avertissement.textContent = "Traitement par lot : tous les parcs éligibles de ce département peuvent être concernés, pas seulement ceux qui viennent d’être inscrits.";
    avertissement.className = "lcdp-box-formulaire__note";
    avertissement.hidden = false;
    form.querySelector("[data-lcdp-formulaire-fields]")?.prepend(avertissement);

    const statut = document.createElement("p");
    statut.role = "status";
    statut.setAttribute("aria-live", "polite");
    statut.style.whiteSpace = "pre-line";
    zone.appendChild(statut);

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (operationEnCours) return;
      const dptmt = normaliserDepartement(form.elements.namedItem("dptmt").value);
      const limit = Number(limiteChamp.value);
      if (!dptmt || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        statut.textContent = "Département ou limite invalide (1 à 50).";
        statut.dataset.state = "error";
        return;
      }
      const endpoint = endpointParcAdmin();
      if (!endpoint) {
        statut.textContent = "Endpoint du worker parc admin non configuré.";
        statut.dataset.state = "error";
        return;
      }
      operationEnCours = true;
      const boutons = Array.from(document.querySelectorAll(
        "[data-lcdp-wraper-onglets] button[type='submit']"
      ));
      boutons.forEach(b => b.disabled = true);
      statut.textContent = "Traitement en cours pour le département " + dptmt + "…";
      statut.dataset.state = "";
      try {
        const reponse = await fetch(endpoint + "/" + key, {
          method: "POST", credentials: "include", cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ dptmt, limit })
        });
        const data = await reponse.json().catch(() => null);
        if (reponse.status === 401 || reponse.status === 403) {
          window.location.replace(urlAdmin("/ESPACE-ADMIN/connexion-admin.html"));
          return;
        }
        if (!reponse.ok || !data || data.success !== true) {
          throw new Error(data?.message || data?.detail || "Traitement impossible.");
        }
        afficherCompteRendu(statut, data, key, dptmt, limit);
      } catch (erreur) {
        statut.textContent = String(erreur?.message || erreur);
        statut.dataset.state = "error";
      } finally {
        operationEnCours = false;
        boutons.forEach(b => b.disabled = false);
      }
    });
  }

  function creerBouton(texte, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-primary";
    bouton.textContent = texte;
    bouton.addEventListener("click", action);
    return bouton;
  }

  function initialiserEtapePhotos() {
    const zone = onglets.zones.photos;
    const aide = document.createElement("p");
    aide.textContent = "Importer jusqu’à six images pour un parc en statut prépa ou en ligne, avec l’outil UploadIMG existant.";
    zone.appendChild(aide);
    zone.appendChild(creerBouton("Importer des photographies", async () => {
      try {
        if (operationEnCours) return;
        await chargerScriptUneFois(
          urlAdmin("/ESPACE-ADMIN/B_PARCS/upload-img-admin.js"), "upload-img-admin"
        );
        if (typeof window.LCDP_UPLOAD_IMG_ADMIN?.ouvrirWorkflow !== "function") {
          throw new Error("Outil UploadIMG indisponible.");
        }
        await window.LCDP_UPLOAD_IMG_ADMIN.ouvrirWorkflow();
      } catch (erreur) {
        const erreurElt = document.createElement("p");
        erreurElt.role = "alert";
        erreurElt.textContent = String(erreur?.message || erreur);
        zone.appendChild(erreurElt);
      }
    }));
  }

  function initialiserFinalisation() {
    const zone = onglets.zones.finalisation;
    const texte = document.createElement("p");
    texte.textContent =
      "Les étapes précédentes n’entraînent pas automatiquement la mise en ligne du parc. " +
      "La fiche et son statut restent à contrôler avant publication.";
    zone.appendChild(texte);
    const lien = document.createElement("a");
    lien.href = urlAdmin("/ESPACE-ADMIN/B_PARCS/MiseAJourParc.html");
    lien.className = "lcdp-button lcdp-button-primary";
    lien.textContent = "Consulter ou modifier une fiche Parc";
    zone.appendChild(lien);
  }

  async function initialiser() {
    const slot = document.getElementById("lcdp-creation-onglets-slot");
    const menu = document.getElementById("lcdp-nouveauparc-menu-slot");
    const formulaire = document.getElementById("lcdp-nouveauparc-form-slot");
    const statut = document.getElementById("lcdp-nouveauparc-status");
    if (!slot || !menu || !formulaire || !statut) {
      throw new Error("Structure des étapes Création Parc incomplète.");
    }
    await Promise.all([
      chargerScriptUneFois(urlObjet("/JSBASE/05-wraper-onglets.js"), "onglets"),
      chargerScriptUneFois(urlObjet("/JSBASE/03-formulaire.js"), "formulaire")
    ]);

    slot.innerHTML = '<section class="lcdp-wraper-onglets" data-lcdp-wraper-onglets>' +
      '<div class="lcdp-wraper-onglets__navigation" data-lcdp-wraper-onglets-navigation></div>' +
      '<div class="lcdp-wraper-onglets__contenu"></div></section>';
    const racine = slot.querySelector("[data-lcdp-wraper-onglets]");
    onglets = window.LCDP_WRAPER_ONGLETS.initialiser({
      racine, onglets: ETAPES, idPrefix: "lcdp-creation-parc",
      ariaLabel: "Étapes de création du parc"
    });
    onglets.zones.inscription.append(menu, formulaire, statut);

    await initialiserEtapeAutomatique("localisation", "Localisation");
    await initialiserEtapeAutomatique("qualification", "Qualification");
    await initialiserEtapeAutomatique("card1", "Card1");
    initialiserEtapePhotos();
    initialiserFinalisation();

    const bouton = menu.querySelector("button");
    if (bouton) bouton.click();
  }

  function apresInscription(parcs, resultat) {
    if (!onglets || Number(resultat?.inserted || 0) < 1) return;
    const departements = [...new Set(
      (Array.isArray(parcs) ? parcs : []).map(p => normaliserDepartement(p?.dptmt)).filter(Boolean)
    )];
    if (departements.length === 1) {
      for (const key of ["localisation", "qualification", "card1"]) {
        const input = onglets.zones[key].querySelector('input[name="dptmt"]');
        if (input) input.value = departements[0];
      }
      onglets.activer("localisation");
    }
  }

  window.LCDP_INITIALISER_CREATION_PARC = initialiser;
  window.LCDP_CREATION_PARC_ENREGISTRE = apresInscription;
})();