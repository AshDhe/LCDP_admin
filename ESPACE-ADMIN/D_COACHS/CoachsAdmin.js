(() => {
  "use strict";

  const mode = document.body.dataset.lcdpCoachsMode;
  const inscrit = mode === "inscrits";
  const ressource = inscrit ? "coachs-inscrits" : "coachs-origines";
  const cfg = window.SITE_CONFIG || {};
  const base = String(cfg.workerAdminDataUrl || cfg.WORKER_ADMIN_DATA_URL ||
    window.ADMIN_CONFIG?.API_ADMIN_DATA || "").replace(/\/+$/, "");
  const adm = path => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(path) : path;
  const pub = path => typeof window.LCDP_urlPublic === "function"
    ? window.LCDP_urlPublic(path) : path;
  const obj = path => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(path) : path;
  const parId = nom => document.getElementById("lcdp-coachs-" + nom);

  const colonnes = inscrit
    ? [
      ["dptmtcoach", "Dptmt"], ["nomcoach", "Nom"], ["prenomcoach", "Prénom"],
      ["emailcoach", "Email"], ["telcoach", "Téléphone"], ["metiercoach", "Métier"],
      ["origine", "Origine"], ["email_valide", "Email validé"],
      ["statut", "Statut"], ["datecreation", "Création"],
      ["dateemailvalid", "Validation"]
    ]
    : [
      ["dptmtcoach", "Dptmt"], ["nomcoach", "Nom"], ["prenomcoach", "Prénom"],
      ["emailcoach", "Email"], ["origine", "Origine"],
      ["email_valide", "Email validé"], ["statut", "Statut"],
      ["datecreation", "Création"], ["dateemailvalid", "Validation"]
    ];

  let toutes = [];
  function texte(v) {
    return v == null || String(v).trim() === "" ? "—" : String(v).trim();
  }
  function normaliser(v) {
    return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr").trim();
  }
  function formaterDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—"
      : new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(d);
  }
  function valeur(r, cle) {
    if (cle === "datecreation" || cle === "dateemailvalid") return formaterDate(r[cle]);
    return texte(r[cle]);
  }
  function afficherStatut(message, erreur = false) {
    const el = parId("statut");
    el.textContent = message;
    el.setAttribute("role", erreur ? "alert" : "status");
  }

  async function chargerBandeau() {
    const r = await fetch(adm("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), {
      credentials: "same-origin", cache: "no-cache"
    });
    if (!r.ok) throw Error("Bandeau administrateur indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await r.text()).trim();
    const zone = document.getElementById("lcdp-bandeau-slot");
    zone.replaceChildren(template.content.cloneNode(true));
    zone.querySelectorAll("[data-site-href]").forEach(el => {
      const destination = el.dataset.siteHref || "";
      el.href = el.dataset.space === "admin" ? adm(destination) : pub(destination);
    });
    zone.querySelectorAll("[data-site-src]").forEach(el => {
      el.src = obj(String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
  }

  async function chargerMenu() {
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu || typeof menu.initialiser !== "function")
      throw Error("Menu administrateur indisponible.");
    await menu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot", categorieActive: "coachs"
    });
  }

  async function lirePage(offset) {
    if (!base) throw Error("Service de données administrateur non configuré.");
    const url = new URL(base + "/read");
    url.searchParams.set("resource", ressource);
    url.searchParams.set("limit", "200");
    url.searchParams.set("offset", String(offset));
    const r = await fetch(url.toString(), {
      method: "GET", credentials: "include", cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const data = await r.json().catch(() => null);
    if (r.status === 401) {
      window.location.replace(adm("/ESPACE-ADMIN/connexion-admin.html"));
      throw Error("Session administrateur inactive.");
    }
    if (!r.ok || data?.success !== true || !Array.isArray(data.rows))
      throw Error(data?.message || data?.detail || "Liste des coachs indisponible.");
    return data;
  }

  async function lireToutes() {
    const resultats = [];
    for (let offset = 0; offset < 10000; offset += 200) {
      const page = await lirePage(offset);
      resultats.push(...page.rows);
      if (page.rows.length === 0 ||
          resultats.length >= Number(page.total ?? resultats.length)) return resultats;
    }
    throw Error("Liste trop longue : pagination incomplète.");
  }

  function rafraichirDepartements() {
    const select = parId("departement");
    const ancien = select.value;
    select.querySelectorAll("option:not(:first-child)").forEach(el => el.remove());
    const departements = [...new Set(toutes.map(r => String(r.dptmtcoach || "").trim())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr", {numeric:true}));
    for (const dpt of departements) {
      const option = document.createElement("option");
      option.value = dpt; option.textContent = dpt;
      select.appendChild(option);
    }
    if (departements.includes(ancien)) select.value = ancien;
  }

  function compte(libelle, nombre) {
    const el = document.createElement("div");
    const label = document.createElement("span");
    const valeur = document.createElement("strong");
    label.textContent = libelle;
    valeur.textContent = new Intl.NumberFormat("fr-FR").format(nombre);
    el.append(label, valeur);
    return el;
  }

  function rafraichirChiffres() {
    const zone = parId("chiffres");
    const nombre = critere => toutes.filter(critere).length;
    zone.replaceChildren(
      compte("Fiches coach enregistrées", toutes.length),
      compte("Origine inscription", nombre(r => r.origine === "inscription")),
      compte("Origine contact", nombre(r => r.origine === "contact")),
      compte("Origine liste", nombre(r => r.origine === "liste"))
    );
    zone.hidden = false;
  }

  function afficherEntetes() {
    const tr = parId("entetes");
    const fragment = document.createDocumentFragment();
    for (const [, libelle] of colonnes) {
      const th = document.createElement("th");
      th.scope = "col"; th.textContent = libelle;
      fragment.appendChild(th);
    }
    tr.replaceChildren(fragment);
  }

  function rendre() {
    const dpt = parId("departement").value;
    const saisie = normaliser(parId("recherche").value);
    const lignes = toutes.filter(r =>
      (!dpt || String(r.dptmtcoach || "") === dpt)
      && (!saisie || normaliser([
        r.nomcoach, r.prenomcoach, r.emailcoach,
        r.metiercoach, r.origine, r.statut
      ].join(" ")).includes(saisie))
    );
    const fragment = document.createDocumentFragment();
    for (const item of lignes) {
      const tr = document.createElement("tr");
      for (const [cle] of colonnes) {
        const td = document.createElement("td");
        td.textContent = valeur(item, cle);
        tr.appendChild(td);
      }
      fragment.appendChild(tr);
    }
    parId("lignes").replaceChildren(fragment);
    parId("vide").hidden = lignes.length > 0;
  }

  async function actualiser() {
    const btn = parId("actualiser");
    btn.disabled = true;
    afficherStatut("Chargement des fiches coach…");
    try {
      toutes = await lireToutes();
      toutes.sort((a, b) =>
        (Date.parse(b.datecreation) || 0) - (Date.parse(a.datecreation) || 0)
        || String(a.nomcoach || "").localeCompare(String(b.nomcoach || ""), "fr")
      );
      afficherEntetes(); rafraichirDepartements();
      rafraichirChiffres(); rendre();
      afficherStatut(toutes.length + " fiche(s) coach consultable(s).");
    } catch (erreur) {
      console.error("Administration Coachs", erreur);
      afficherStatut(String(erreur?.message || "Lecture impossible."), true);
    } finally { btn.disabled = false; }
  }

  async function demarrer() {
    const guard = window.LCDP_GUARD_ADMIN;
    if (!guard || typeof guard.verifierAccesPageAdmin !== "function")
      throw Error("Contrôle d'accès administrateur indisponible.");
    if (!await guard.verifierAccesPageAdmin()) return;
    await Promise.all([chargerBandeau(), chargerMenu()]);
    document.getElementById("lcdp-main-admin").hidden = false;
    parId("actualiser").addEventListener("click", actualiser);
    parId("departement").addEventListener("change", rendre);
    parId("recherche").addEventListener("input", rendre);
    await actualiser();
  }
  demarrer().catch(erreur => {
    console.error("Administration Coachs", erreur);
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
    if (parId("statut")) afficherStatut(String(erreur?.message || "Page indisponible."), true);
  });
})();
