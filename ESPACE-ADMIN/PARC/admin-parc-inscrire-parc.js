(function () {
  "use strict";

  window.LCDP_initialiserAdminParcInscrireParc = initialiserAdminParcInscrireParc;

  function initialiserAdminParcInscrireParc() {
    const config = window.SITE_CONFIG || {};

    const formulaire = document.getElementById("formulaire-insert-parc");
    const textarea = document.getElementById("json-parcs");
    const bouton = document.getElementById("btn-creer-parcs");
    const message = document.getElementById("message-resultat");
    const details = document.getElementById("details-resultat");
    const detailsBloc = document.getElementById("details-resultat-bloc");

    const endpointCreaParc = nettoyerBaseUrl(
      config.workerCreaParcUrl ||
      config.WORKER_CREA_PARC_URL ||
      window.ADMIN_CONFIG?.API_CREA_PARC ||
      ""
    );

    const urlRetourParc = construireUrlAdmin("/ESPACE-ADMIN/PARC/admin-parc-accueil-parc.html");
    const urlConnexionAdmin = construireUrlAdmin("/ESPACE-ADMIN/connexion-admin.html");

    let creationTerminee = false;
    let envoiEnCours = false;

    if (!formulaire || !textarea || !bouton || !message || !details) {
      afficherRetourInscrireParc(
        "Erreur technique",
        "Formulaire incomplet.",
        "erreur"
      );
      return;
    }

    if (!endpointCreaParc) {
      textarea.disabled = true;
      bouton.disabled = true;

      afficherRetourInscrireParc(
        "Configuration manquante",
        "L’adresse du service de création des parcs n’est pas configurée.",
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
        afficherRetourInscrireParc(
          "JSON invalide",
          "Le contenu collé n’est pas un JSON valide.",
          "erreur"
        );
        return;
      }

      if (!Array.isArray(parcs)) {
        afficherRetourInscrireParc(
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
        const reponse = await fetch(endpointCreaParc, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(parcs)
        });

        const texte = await reponse.text();
        const result = parserJsonSansErreur(texte);

        if (reponse.status === 401 || reponse.status === 403) {
          await afficherRetourInscrireParc(
            "Session expirée",
            "Votre session admin n’est plus valide. Vous allez être redirigé vers la page de connexion.",
            "erreur",
            urlConnexionAdmin
          );
          return;
        }

        if (!reponse.ok || !result || result.success !== true) {
          afficherDetails(JSON.stringify(result || { error: texte }, null, 2));

          await afficherRetourInscrireParc(
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

        afficherDetails(JSON.stringify(result.results || [], null, 2));

        creationTerminee = true;
        bouton.textContent = "OK";
        bouton.disabled = false;
        envoiEnCours = false;

        const messageFinal =
          `Création terminée : ${created} parc(s) créé(s), ${skipped} doublon(s) ignoré(s), ${errors} erreur(s).`;

        await afficherRetourInscrireParc(
          errors > 0 ? "Import terminé avec erreurs" : "Import terminé",
          messageFinal,
          errors > 0 ? "erreur" : "validation"
        );

        afficherMessageInline(messageFinal);

      } catch (erreur) {
        afficherDetails(String(erreur?.message || erreur || ""));

        await afficherRetourInscrireParc(
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
      afficherDetails("");
    }

    function afficherMessageInline(texte) {
      message.textContent = texte;
    }

    function afficherDetails(texte) {
      if ("value" in details) {
        details.value = texte || "";
      } else {
        details.textContent = texte || "";
      }

      if (detailsBloc) {
        detailsBloc.hidden = !texte;
      }
    }

    async function afficherRetourInscrireParc(titre, texte, type, redirectUrl = null) {
      afficherMessageInline(texte);

      if (typeof window.LCDP_afficherAlerte === "function") {
        try {
          const affichageOk = await window.LCDP_afficherAlerte(titre, texte, {
            type,
            redirectUrl
          });

          if (affichageOk === true) {
            return;
          }
        } catch (erreur) {
          console.error("Erreur alerte inscrire parc :", erreur);
        }
      }

      alert(texte);

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    }
  }

  function parserJsonSansErreur(texte) {
    try {
      return texte ? JSON.parse(texte) : null;
    } catch {
      return null;
    }
  }

  function construireUrlAdmin(chemin) {
    const config = window.SITE_CONFIG || {};
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof config.adminUrl === "function") {
      return config.adminUrl(valeur);
    }

    const adminBaseUrl = nettoyerBaseUrl(
      config.adminBaseUrl ||
      config.ADMIN_BASE ||
      config.siteBase ||
      window.ADMIN_CONFIG?.ADMIN_BASE_URL ||
      ""
    );

    return construireUrlDepuisBase(adminBaseUrl, valeur);
  }

  function construireUrlDepuisBase(baseUrl, chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) {
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

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }
})();
