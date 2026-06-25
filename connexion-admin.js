if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiserConnexionAdmin);
} else {
  initialiserConnexionAdmin();
}

function initialiserConnexionAdmin() {
  const formulaire = document.getElementById("formulaire-connexion-admin");
  const champMdp = document.getElementById("adminpwd");
  const afficherMotDePasse = document.getElementById("afficher-mdp-admin");

  const endpointLogSessAdmin = String(
    window.ADMIN_CONFIG?.API_LOG_SESS_AD || "https://ad-log-sess-api.lacleduparc.fr"
  ).replace(/\/+$/, "");

  if (formulaire) {
    formulaire.action = endpointLogSessAdmin + "/login-form";
    formulaire.method = "POST";
  }

  if (afficherMotDePasse && champMdp) {
    afficherMotDePasse.addEventListener("change", () => {
      champMdp.type = afficherMotDePasse.checked ? "text" : "password";
    });
  }

  const params = new URLSearchParams(window.location.search);
  const erreur = params.get("erreur");

  if (erreur === "identifiants") {
    afficherInformation(
      "Connexion impossible",
      "Identifiant ou mot de passe incorrect.",
      "erreur"
    );
  }

  if (erreur === "technique") {
    afficherInformation(
      "Erreur technique",
      "La connexion admin n’a pas pu être effectuée.",
      "erreur"
    );
  }
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