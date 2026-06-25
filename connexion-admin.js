if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiserConnexionAdmin);
} else {
  initialiserConnexionAdmin();
}

function initialiserConnexionAdmin() {
  const formulaire = document.getElementById("formulaire-connexion-admin");
  const champEmail = document.getElementById("adminemail");
  const champMdp = document.getElementById("adminpwd");
  const bouton = document.getElementById("bouton-valider-formulaire");
  const afficherMotDePasse = document.getElementById("afficher-mdp-admin");

  const endpointLogSessAdmin = nettoyerBaseUrl(
    window.ADMIN_CONFIG?.API_LOG_SESS_AD || ""
  );

  const urlAccueilAdmin = construireUrlAdmin("/index.html");

  let envoiEnCours = false;

  if (!formulaire || !champEmail || !champMdp || !bouton) {
    afficherInformation(
      "Erreur technique",
      "Le formulaire de connexion admin est incomplet. Veuillez réessayer plus tard.",
      "erreur"
    );
    return;
  }

  if (!endpointLogSessAdmin) {
    champEmail.disabled = true;
    champMdp.disabled = true;
    bouton.disabled = true;

    afficherInformation(
      "Configuration manquante",
      "L’adresse du service de connexion admin n’est pas configurée.",
      "erreur"
    );
    return;
  }

  if (afficherMotDePasse) {
    afficherMotDePasse.addEventListener("change", () => {
      champMdp.type = afficherMotDePasse.checked ? "text" : "password";
    });
  }

  formulaire.addEventListener("submit", (event) => {
    event.preventDefault();
    connecterAdmin();
  });

  async function connecterAdmin() {
    if (envoiEnCours) return;

    const adminemail = champEmail.value.trim().toLowerCase();
    const adminpwd = champMdp.value;

    if (!adminemail) {
      afficherInformation(
        "Identifiant manquant",
        "Veuillez renseigner votre email admin.",
        "erreur"
      );
      return;
    }

    if (!adminpwd) {
      afficherInformation(
        "Mot de passe manquant",
        "Veuillez renseigner votre mot de passe.",
        "erreur"
      );
      return;
    }

    envoiEnCours = true;
    bouton.disabled = true;
    bouton.textContent = "Connexion en cours...";

    try {
      const urlLogin = endpointLogSessAdmin + "/login";

      console.log("LOGIN ADMIN - URL appelée :", urlLogin);
      console.log("LOGIN ADMIN - Origine :", window.location.origin);

      const response = await fetch(urlLogin, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          adminemail,
          adminpwd
        })
      });

      const texte = await response.text();

      console.log("LOGIN ADMIN - Status :", response.status);
      console.log("LOGIN ADMIN - Réponse brute :", texte);

      let data = null;

      try {
        data = texte ? JSON.parse(texte) : null;
      } catch {
        data = null;
      }

      if (!response.ok || !data || data.success !== true) {
        afficherInformation(
          "Connexion impossible",
          data?.detail || data?.message || texte || "Identifiant ou mot de passe incorrect.",
          "erreur"
        );

        envoiEnCours = false;
        bouton.disabled = false;
        bouton.textContent = "Connexion";
        return;
      }

      window.location.href = urlAccueilAdmin;

    } catch (error) {
      console.error("LOGIN ADMIN - Erreur complète :", error);

      afficherInformation(
        "Erreur technique",
        String(error?.message || error || "Erreur inconnue"),
        "erreur"
      );

      envoiEnCours = false;
      bouton.disabled = false;
      bouton.textContent = "Connexion";
    }
  }
}

function construireUrlAdmin(chemin) {
  const adminBaseUrl = nettoyerBaseUrl(
    window.ADMIN_CONFIG?.ADMIN_BASE_URL || ""
  );

  return construireUrlDepuisBase(adminBaseUrl, chemin);
}

function construireUrlDepuisBase(baseUrl, chemin) {
  const valeur = String(chemin || "");

  if (
    valeur.startsWith("#") ||
    valeur.startsWith("mailto:") ||
    valeur.startsWith("tel:") ||
    valeur.startsWith("http://") ||
    valeur.startsWith("https://")
  ) {
    return valeur;
  }

  if (baseUrl) {
    return joindreBaseEtChemin(baseUrl, valeur);
  }

  return valeur.startsWith("/") ? valeur : "/" + valeur;
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

async function afficherInformation(titre, message, type = "information", redirectUrl = null) {
  if (typeof window.afficherLightboxInformation === "function") {
    const affichageOk = await window.afficherLightboxInformation(titre, message, {
      type,
      redirectUrl
    });

    if (affichageOk === true) {
      return;
    }
  }

  alert(message);

  if (redirectUrl) {
    window.location.href = redirectUrl;
  }
}