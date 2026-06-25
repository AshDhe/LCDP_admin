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

  const endpointCreaParc = nettoyerBaseUrl(
    window.ADMIN_CONFIG?.API_CREA_PARC || ""
  );

  const urlRetourParc = construireUrlAdmin("/PAGES/PARC/index-parc.html");
  const urlConnexionAdmin = construireUrlAdmin("/connexion-admin.html");

  let creationTerminee = false;
  let envoiEnCours = false;

  if (!formulaire || !textarea || !bouton || !message || !details) {
    afficherMessage("Erreur technique : formulaire incomplet.", "erreur");
    return;
  }

  if (!endpointCreaParc) {
    textarea.disabled = true;
    bouton.disabled = true;
    afficherMessage("Erreur technique : API_CREA_PARC n’est pas configurée.", "erreur");
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
      afficherMessage("JSON invalide.", "erreur");
      return;
    }

    if (!Array.isArray(parcs)) {
      afficherMessage("Le JSON doit être un tableau de parcs.", "erreur");
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

      const result = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        window.location.href = urlConnexionAdmin;
        return;
      }

      if (!response.ok || !result || result.success !== true) {
        afficherMessage("Erreur lors de la création des parcs.", "erreur");
        details.textContent = JSON.stringify(result || {}, null, 2);
        bouton.textContent = "Envoyer le JSON";
        bouton.disabled = false;
        envoiEnCours = false;
        return;
      }

      afficherMessage(
        `Création terminée : ${result.created} parc(s) créé(s), ${result.skipped} doublon(s) ignoré(s), ${result.errors} erreur(s).`,
        "succes"
      );

      details.textContent = JSON.stringify(result.results || [], null, 2);

      creationTerminee = true;
      bouton.textContent = "OK";
      bouton.disabled = false;
      envoiEnCours = false;

    } catch (error) {
      afficherMessage("Erreur de connexion au worker.", "erreur");
      details.textContent = String(error?.message || error || "");
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

  function afficherMessage(texte, type) {
    message.textContent = texte;
    message.classList.remove("formulaire-message-succes", "formulaire-message-erreur");

    if (type === "succes") {
      message.classList.add("formulaire-message-succes");
    }

    if (type === "erreur") {
      message.classList.add("formulaire-message-erreur");
    }
  }
}

function construireUrlAdmin(chemin) {
  if (typeof window.construireUrlAdmin === "function") {
    return window.construireUrlAdmin(chemin);
  }

  const adminBaseUrl = nettoyerBaseUrl(
    window.ADMIN_CONFIG?.ADMIN_BASE_URL || ""
  );

  return joindreBaseEtChemin(adminBaseUrl, chemin);
}

function joindreBaseEtChemin(baseUrl, chemin) {
  const base = nettoyerBaseUrl(baseUrl);
  const cheminNettoye = "/" + String(chemin || "").replace(/^\/+/, "");

  if (!base) {
    return cheminNettoye;
  }

  return base + cheminNettoye;
}

function nettoyerBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}