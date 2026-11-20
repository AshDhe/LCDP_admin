(() => {
  "use strict";
  const OWNER = "AshDhe";
  const REPO = "LCDP_admin";
  const WORKFLOW = "lcdp-audit.yml";
  const BASE = "https://api.github.com/repos/" + OWNER + "/" + REPO;
  const DEPOTS = Object.freeze([
    "LCDP_public", "LCDP_membre", "LCDP_parc", "LCDP_coach", "LCDP_admin"
  ]);
  const libelles = Object.freeze({
    success: "Réussi",
    failure: "Échec",
    cancelled: "Annulé",
    timed_out: "Délai dépassé",
    skipped: "Ignoré",
    action_required: "Action requise",
    running: "En cours",
    neutral: "Neutre",
    unknown: "Non vérifié"
  });
  let executions = [];
  let controleActif = false;

  function element(id) {
    const valeur = document.getElementById(id);
    if (!valeur) throw new Error("Élément ADMIN 13 introuvable : " + id);
    return valeur;
  }
  function urlAdmin(path) {
    return typeof window.LCDP_urlAdmin === "function" ? window.LCDP_urlAdmin(path) : path;
  }
  function urlObjet(path) {
    return typeof window.LCDP_urlObjet === "function" ? window.LCDP_urlObjet(path) : path;
  }
  function dateParis(date) {
    if (!date || !Number.isFinite(Date.parse(date))) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short"
    }).format(new Date(date));
  }
  function etatLigne(item) {
    if (!item || typeof item !== "object") return "unknown";
    if (item.status !== "completed") return "running";
    return typeof item.conclusion === "string" ? item.conclusion : "unknown";
  }
  function texteEtat(statut) {
    return libelles[statut] || "Inconnu (" + String(statut).slice(0, 30) + ")";
  }
  function lienGitHub(href, label) {
    const lien = document.createElement("a");
    lien.href = href;
    lien.target = "_blank";
    lien.rel = "noopener noreferrer";
    lien.textContent = label;
    return lien;
  }
  function afficherEtat(message, erreur = false) {
    const statut = element("lcdp-tests-etat");
    statut.textContent = message;
    statut.setAttribute("role", erreur ? "alert" : "status");
  }
  async function api(path) {
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), 15000);
    try {
      const response = await fetch(BASE + path, {
        credentials: "omit",
        method: "GET",
        cache: "no-store",
        signal: controleur.signal,
        headers: { "Accept": "application/vnd.github+json" }
      });
      if (!response.ok) {
        const raison = response.status === 403 || response.status === 429
          ? "Limite des requêtes publiques GitHub atteinte."
          : response.status === 404 ? "Workflow GitHub non disponible."
          : "GitHub ne répond pas correctement (" + response.status + ").";
        throw new Error(raison);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("GitHub ne répond pas dans le délai prévu.");
      throw error;
    } finally {
      clearTimeout(delai);
    }
  }
  async function bandeau() {
    const url = urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html");
    const response = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error("Bandeau administrateur indisponible.");
    const tpl = document.createElement("template");
    tpl.innerHTML = (await response.text()).trim();
    const slot = element("lcdp-bandeau-slot");
    slot.replaceChildren(tpl.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(a => {
      if (a.dataset.space === "admin") a.href = urlAdmin(a.dataset.siteHref || "");
    });
    slot.querySelectorAll("[data-site-src]").forEach(img => {
      img.src = urlObjet(String(img.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
  }
  async function menu() {
    const module = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!module || typeof module.initialiser !== "function") {
      throw new Error("Navigation administrateur indisponible.");
    }
    await module.initialiser({slotId: "lcdp-menu-gauche-admin-slot", categorieActive: "admin"});
  }
  function statutNode(statut) {
    const e = document.createElement("span");
    e.className = "lcdp-tests__statut";
    e.dataset.etat = statut === "success" ? "success" :
      ["failure", "timed_out", "action_required"].includes(statut) ? "failure" : "running";
    e.textContent = texteEtat(statut);
    return e;
  }
  function afficherModules(run, jobs) {
    const target = element("lcdp-tests-modules");
    const frag = document.createDocumentFragment();
    let reussis = 0, erreurs = 0, connus = 0;
    for (const depot of DEPOTS) {
      const job = (jobs || []).find(j => typeof j.name === "string" &&
        (j.name === "Contrôle / " + depot || j.name.endsWith("/ " + depot)));
      const statut = etatLigne(job);
      if (job) connus++;
      if (statut === "success") reussis++;
      if (["failure", "timed_out", "action_required"].includes(statut)) erreurs++;
      const article = document.createElement("article");
      article.className = "lcdp-tests__module";
      const titre = document.createElement("h3");
      titre.textContent = depot;
      const pEtat = document.createElement("p");
      pEtat.append("Résultat : ", statutNode(statut));
      const pDate = document.createElement("p");
      pDate.textContent = "Contrôle : " + dateParis(job?.started_at || run?.run_started_at || run?.created_at);
      article.append(titre, pEtat, pDate);
      if (run && job && Number.isSafeInteger(Number(job.id))) {
        article.appendChild(lienGitHub(
          "https://github.com/" + OWNER + "/" + REPO + "/actions/runs/" +
          encodeURIComponent(String(run.id)) + "/job/" + encodeURIComponent(String(job.id)),
          "Voir le contrôle"
        ));
      }
      frag.appendChild(article);
    }
    target.replaceChildren(frag);
    element("lcdp-tests-valides").textContent = connus ? reussis + " / " + DEPOTS.length : "—";
    element("lcdp-tests-echecs").textContent = connus ? String(erreurs) : "—";
  }
  function afficherSynthese(run) {
    element("lcdp-tests-dernier").textContent = run ? dateParis(run.run_started_at || run.created_at) : "—";
    const target = element("lcdp-tests-global");
    const statut = run ? etatLigne(run) : "unknown";
    target.replaceChildren(statutNode(statut));
  }
  function afficherHistorique() {
    const filtre = element("lcdp-tests-filtre").value;
    const rows = executions.filter(r => {
      const statut = etatLigne(r);
      return filtre === "tous" || (filtre === "running" ? statut === "running" : statut === filtre);
    });
    const tbody = element("lcdp-tests-historique");
    const frag = document.createDocumentFragment();
    if (!rows.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = executions.length ? "Aucune exécution dans ce filtre." : "Aucune exécution disponible.";
      tr.appendChild(td);
      frag.appendChild(tr);
    }
    for (const run of rows) {
      const tr = document.createElement("tr");
      const cells = [
        dateParis(run.run_started_at || run.created_at),
        null,
        ({ workflow_dispatch: "Manuel", schedule: "Programmé", push: "Mise à jour GitHub" })[run.event] || String(run.event || "—"),
        typeof run.head_sha === "string" ? run.head_sha.slice(0, 9) : "—",
        null
      ];
      cells.forEach((value, i) => {
        const td = document.createElement("td");
        if (i === 1) td.appendChild(statutNode(etatLigne(run)));
        else if (i === 4 && Number.isSafeInteger(Number(run.id))) td.appendChild(lienGitHub(
          "https://github.com/" + OWNER + "/" + REPO + "/actions/runs/" +
          encodeURIComponent(String(run.id)), "Journal GitHub"
        ));
        else td.textContent = value ?? "—";
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    }
    tbody.replaceChildren(frag);
  }
  async function actualiser() {
    if (controleActif) return;
    controleActif = true;
    element("lcdp-tests-refresh").disabled = true;
    afficherEtat("Vérification des exécutions GitHub…");
    try {
      const rapport = await api("/actions/workflows/" + encodeURIComponent(WORKFLOW) + "/runs?per_page=30");
      if (!Array.isArray(rapport.workflow_runs)) throw new Error("Format de réponse GitHub inattendu.");
      executions = rapport.workflow_runs.filter(r => Number.isSafeInteger(Number(r.id)));
      const actuel = executions[0] || null;
      afficherSynthese(actuel);
      afficherHistorique();
      if (actuel) {
        try {
          const detail = await api("/actions/runs/" + encodeURIComponent(String(actuel.id)) + "/jobs?per_page=100");
          if (!Array.isArray(detail.jobs)) throw new Error("Liste des contrôles incomplète.");
          afficherModules(actuel, detail.jobs);
          afficherEtat("Consultation actualisée le " + dateParis(new Date().toISOString()) + ".");
        } catch (error) {
          afficherModules(actuel, []);
          afficherEtat("Historique disponible, détail par espace indisponible : " + error.message, true);
        }
      } else {
        afficherModules(null, []);
        afficherEtat("Aucune exécution publiée par GitHub. Un lancement manuel est accessible dans GitHub.");
      }
    } catch (error) {
      executions = [];
      afficherSynthese(null);
      afficherModules(null, []);
      afficherHistorique();
      afficherEtat("Résultats non vérifiables : " + String(error?.message || "Erreur de connexion."), true);
    } finally {
      element("lcdp-tests-refresh").disabled = false;
      controleActif = false;
    }
  }
  async function demarrer() {
    const garde = window.LCDP_GUARD_ADMIN;
    if (!garde || typeof garde.verifierAccesPageAdmin !== "function") {
      throw new Error("Contrôle de session admin indisponible.");
    }
    if (!await garde.verifierAccesPageAdmin()) return;
    if (window.LCDP_ADMIN_AUTORISATION?.admin?.type !== "root") {
      throw new Error("ADMIN 13 est réservé à l’administrateur principal.");
    }
    await Promise.all([bandeau(), menu()]);
    element("lcdp-main-admin").hidden = false;
    element("lcdp-tests-refresh").addEventListener("click", () => { actualiser().catch(console.error); });
    element("lcdp-tests-filtre").addEventListener("change", afficherHistorique);
    await actualiser();
  }
  demarrer().catch(error => {
    console.error("ADMIN 13 :", error);
    afficherEtat(String(error?.message || "ADMIN 13 indisponible."), true);
    if (window.LCDP_ADMIN_AUTORISATION?.admin?.type === "root") {
      element("lcdp-main-admin").hidden = false;
    }
  });
})();
