(() => {
  "use strict";
  const form = document.getElementById("lcdp-activation-form");
  const statut = document.getElementById("lcdp-activation-statut");
  const info = document.getElementById("lcdp-activation-info");
  const passwd = document.getElementById("lcdp-activation-pwd");
  const confirmation = document.getElementById("lcdp-activation-confirm");
  const submit = document.getElementById("lcdp-activation-submit");
  const connexion = document.getElementById("lcdp-activation-connexion");
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("token") || "";
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    statut.textContent = "Ce lien d'activation est invalide. Demande au root de renvoyer une invitation.";
    statut.setAttribute("role", "alert");
    return;
  }
  form.hidden = false;

  const config = window.SITE_CONFIG || {};
  const endpoint = String(
    config.workerAdminComptesUrl ||
    config.WORKER_ADMIN_COMPTES_URL ||
    window.ADMIN_CONFIG?.API_ADMIN_COMPTES ||
    ""
  ).replace(/\/+$/, "");
  if (!endpoint) {
    form.hidden = true;
    statut.textContent = "Service d'activation non configuré.";
    statut.setAttribute("role", "alert");
    return;
  }

  let envoi = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (envoi) return;
    if (passwd.value !== confirmation.value) {
      statut.textContent = "La confirmation ne correspond pas au mot de passe.";
      statut.setAttribute("role", "alert");
      return;
    }
    if (passwd.value.length < 12 || passwd.value.length > 128) {
      statut.textContent = "Le mot de passe doit comprendre entre 12 et 128 caractères.";
      statut.setAttribute("role", "alert");
      return;
    }
    envoi = true;
    submit.disabled = true;
    statut.textContent = "Activation en cours…";
    try {
      const response = await fetch(endpoint + "/admin/activate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ token, password: passwd.value })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success !== true) {
        throw new Error(data?.message || "Impossible d'activer le compte.");
      }
      passwd.value = "";
      confirmation.value = "";
      form.hidden = true;
      info.hidden = true;
      statut.textContent = "Ton mot de passe est défini. Tu peux maintenant te connecter à l'espace admin.";
      connexion.hidden = false;
    } catch (error) {
      statut.textContent = error?.message || "Erreur technique pendant l'activation.";
      statut.setAttribute("role", "alert");
      submit.disabled = false;
      envoi = false;
    }
  });
})();