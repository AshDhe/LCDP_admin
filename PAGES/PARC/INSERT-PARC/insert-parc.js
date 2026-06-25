if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiserInsertParc);
} else {
  initialiserInsertParc();
}

function initialiserInsertParc() {
  const formulaire = document.getElementById("formulaire-insert-parc");
  const textarea = document.getElementById("json-parcs");
  const bouton = document.getElementById("btn-creer-parcs");
  const message = document.getElementById("message-resultat");
  const details = document.getElementById("details-resultat");

  const endpointCreaParc = nettoyerBaseUrlInsertParc(
    window.ADMIN_CONFIG?.API_CREA_PARC || ""
  );

  const urlRetourParc = construireUrlAdminInsertParc("/PAGES/PARC/index-parc.html");
  const urlConnexionAdmin = construireUrlAdminInsertParc("/connexion-admin.html");

  let creationTerminee = false;
  let envoiEnCours = false;

  if (!formulaire || !textarea || !bouton || !message || !details) {
    afficherRetourInsertParc(
      "Erreur technique",
      "Formulaire incomplet.",
      "erreur"
    );
    return;
  }

  if (!endpointCreaParc) {
    textarea.disabled = true;
    bouton.disabled = true;

    afficherRetourInsertParc(
      "Configuration manquante",
      "API_CREA_PARC n’est pas configurée dans config.js.",
      "erreur"
    );
    return;
  }

  formulaire.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (creationTerminee) {
      window.location.href = urlRetourParc;
      return;
    }

    if (envoiEnCours) {
      return;
    }

    await creerParcs();
  });

  async function creerParcs() {
    viderMessages();

    let parcs;

    try {
      parcs = JSON.parse(textarea.value);
    } catch {
      afficherRetourInsertParc(
        "JSON invalide",
        "Le contenu collé n’est pas un JSON valide.",
        "erreur"
      );
      return;
    }

    if (!Array.isArray(parcs)) {
      afficherRetourInsertParc(
        "Format incorrect",
        "Le JSON doit être un tableau de parcs.",
        "erreur"
      );
      return;
    }

    envoiEnCours = true;
    bouton.disabled = true;
    bouton.textContent = "Création en cours...";

    try {
      const response = await fetch(endpointCreaParc, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(parcs)
      });

      const texte = await response.text();
      const result = texte ? JSON.parse(texte) : null;

      if (response.status === 401 || response.status === 403) {
        await afficherRetourInsertParc(
          "Session expirée",
          "Votre session admin n’est plus valide. Vous allez être redirigé vers la page de connexion.",
          "erreur",
          urlConnexionAdmin
        );
        return;
      }

      if (!response.ok || !result || result.success !== true) {
        details.textContent = JSON.stringify(result || { error: texte }, null, 2);

        await afficherRetourInsertParc(
          "Erreur insert parc",
          result?.error || "Erreur lors de la création des parcs.",
          "erreur"
        );

        bouton.textContent = "Envoyer le JSON";
        bouton.disabled = false;
        envoiEnCours = false;
        return;
      }

      const created = Number(result.created || 0);
      const skipped = Number(result.skipped || 0);
      const errors = Number(result.errors || 0);

      details.textContent = JSON.stringify(result.results || [], null, 2);

      creationTerminee = true;
      bouton.textContent = "OK";
      bouton.disabled = false;
      envoiEnCours = false;

      const messageFinal =
        `Création terminée : ${created} parc(s) créé(s), ${skipped} doublon(s) ignoré(s), ${errors} erreur(s).`;

      await afficherRetourInsertParc(
        errors > 0 ? "Import terminé avec erreurs" : "Import terminé",
        messageFinal,
        errors > 0 ? "erreur" : "validation"
      );

      afficherMessageInline(messageFinal, errors > 0 ? "erreur" : "succes");

    } catch (error) {
      details.textContent = String(error?.message || error || "");

      await afficherRetourInsertParc(
        "Erreur de connexion",
        "Le worker de création des parcs n’a pas pu être appelé.",
        "erreur"
      );

      bouton.textContent = "Envoyer le JSON";
      bouton.disabled = false;
      envoiEnCours = false;
    }
  }

  function viderMessages() {
    message.textContent = "";
    message.classList.remove("formulaire-message-succes", "formulaire-message-erreur");
    details.textContent = "";
  }

  function afficherMessageInline(texte, type) {
    message.textContent = texte;
    message.classList.remove("formulaire-message-succes", "formulaire-message-erreur");

    if (type === "succes") {
      message.classList.add("formulaire-message-succes");
    }

    if (type === "erreur") {
      message.classList.add("formulaire-message-erreur");
    }
  }

  async function afficherRetourInsertParc(titre, texte, type, redirectUrl = null) {
    afficherMessageInline(texte, type === "validation" ? "succes" : "erreur");

    if (typeof window.afficherLightboxInformation === "function") {
      const affichageOk = await window.afficherLightboxInformation(titre, texte, {
        type,
        redirectUrl
      });

      if (affichageOk === true) {
        return;
      }
    }

    alert(texte);

    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  }
}

function construireUrlAdminInsertParc(chemin) {
  if (typeof window.construireUrlAdmin === "function") {
    return window.construireUrlAdmin(chemin);
  }

  const adminBaseUrl = nettoyerBaseUrlInsertParc(
    window.ADMIN_CONFIG?.ADMIN_BASE_URL || ""
  );

  return joindreBaseEtCheminInsertParc(adminBaseUrl, chemin);
}

function joindreBaseEtCheminInsertParc(baseUrl, chemin) {
  const base = nettoyerBaseUrlInsertParc(baseUrl);
  const cheminNettoye = "/" + String(chemin || "").replace(/^\/+/, "");

  if (!base) {
    return cheminNettoye;
  }

  return base + cheminNettoye;
}

function nettoyerBaseUrlInsertParc(value) {
  return String(value || "").replace(/\/+$/, "");
}