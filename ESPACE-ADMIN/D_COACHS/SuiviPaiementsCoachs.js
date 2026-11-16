(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const endpoint = String(config.workerAdminDataUrl || config.WORKER_ADMIN_DATA_URL ||
    window.ADMIN_CONFIG?.API_ADMIN_DATA || "").replace(/\/+$/, "");
  const ressource = "coachs-paiements";
  const $ = id => document.getElementById(id);
  const adminUrl = path => typeof window.LCDP_urlAdmin === "function" ? window.LCDP_urlAdmin(path) : path;
  const publicUrl = path => typeof window.LCDP_urlPublic === "function" ? window.LCDP_urlPublic(path) : path;
  const objetUrl = path => typeof window.LCDP_urlObjet === "function" ? window.LCDP_urlObjet(path) : path;

  let toutes = [];
  let charge = false;
  let actualisation = false;

  function texte(v) {
    return v === null || v === undefined || String(v).trim() === "" ? "—" : String(v).trim();
  }
  function normaliser(v) {
    return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr").trim();
  }
  function date(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" :
      new Intl.DateTimeFormat("fr-FR", {dateStyle:"short",timeStyle:"short",timeZone:"Europe/Paris"}).format(d);
  }
  function euros(v) {
    return v === null || v === undefined || v === "" || !Number.isFinite(Number(v))
      ? "—" : new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(v));
  }
  function element(tag, valeur) {
    const el = document.createElement(tag);
    if (valeur !== undefined) el.textContent = texte(valeur);
    return el;
  }
  function nomCoach(item) {
    const nom = [item.prenomcoach, item.nomcoach].filter(Boolean).join(" ").trim();
    return nom || (item.idcoach ? "Coach " + item.idcoach : "Coach non identifié");
  }
  function statut(message, erreur = false) {
    const el = $("coach-paiements-statut");
    el.textContent = message;
    el.setAttribute("role", erreur ? "alert" : "status");
  }

  async function chargerBandeau() {
    const r = await fetch(adminUrl("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), {
      credentials: "same-origin",cache:"no-cache"
    });
    if (!r.ok) throw new Error("Bandeau administrateur indisponible.");
    const t = document.createElement("template");
    t.innerHTML = (await r.text()).trim();
    const slot = $("lcdp-bandeau-slot");
    slot.replaceChildren(t.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(el => {
      const path = el.dataset.siteHref || "";
      el.href = el.dataset.space === "admin" ? adminUrl(path) : publicUrl(path);
    });
    slot.querySelectorAll("[data-site-src]").forEach(el => {
      el.src = objetUrl(String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
  }

  async function lirePage(offset) {
    if (!endpoint) throw new Error("Service de données administrateur non configuré.");
    const url = new URL(endpoint + "/read");
    url.searchParams.set("resource", ressource);
    url.searchParams.set("limit", "200");
    url.searchParams.set("offset", String(offset));
    const r = await fetch(url.toString(), {
      method:"GET",credentials:"include",cache:"no-store",
      headers:{Accept:"application/json"}
    });
    const result = await r.json().catch(() => null);
    if (r.status === 401) {
      window.location.replace(adminUrl("/ESPACE-ADMIN/connexion-admin.html"));
      throw new Error("Session administrateur inactive.");
    }
    if (!r.ok || result?.success !== true || !Array.isArray(result.rows))
      throw new Error(result?.message || result?.detail || "Lecture des écritures coach impossible.");
    return result;
  }
  async function lireToutes() {
    const lignes = [];
    for (let offset=0;offset<10000;offset+=200) {
      const page = await lirePage(offset);
      lignes.push(...page.rows);
      if (!page.rows.length || lignes.length >= Number(page.total ?? lignes.length)) return lignes;
    }
    throw new Error("Pagination incomplète : plus de 10 000 écritures.");
  }

  function remplirFiltreCoachs() {
    const select = $("coach-paiements-coach");
    const choix = select.value;
    select.querySelectorAll("option:not(:first-child)").forEach(el => el.remove());
    const coaches = new Map();
    for (const item of toutes) {
      if (item.idcoach) coaches.set(String(item.idcoach), nomCoach(item));
    }
    for (const [id,nom] of [...coaches].sort((a,b)=>a[1].localeCompare(b[1],"fr"))) {
      const opt = element("option",nom);
      opt.value = id;
      select.appendChild(opt);
    }
    if (coaches.has(choix)) select.value = choix;
  }

  function afficherDetail(item) {
    $("coach-paiements-detail-titre").textContent = "Écriture " + texte(item.orderid);
    const tbody = $("coach-paiements-identite");
    tbody.replaceChildren();
    [
      ["Commande",item.orderid],["Date",date(item.orderdate)],
      ["Coach",nomCoach(item)],["Email du coach",item.emailcoach],
      ["Identifiant coach",item.idcoach],["Montant HT",euros(item.ht)],
      ["TVA",euros(item.tva)],["Montant TTC",euros(item.ttc)]
    ].forEach(([libelle,valeur])=>{
      const tr=element("tr"),th=element("th",libelle),td=element("td",valeur);
      th.scope="row";tr.append(th,td);tbody.appendChild(tr);
    });
    $("coach-paiements-detail").hidden=false;
    $("coach-paiements-detail").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function rendre() {
    if (!charge) return;
    const recherche = normaliser($("coach-paiements-recherche").value);
    const idcoach = $("coach-paiements-coach").value;
    const resultat = toutes.filter(item =>
      (!idcoach || String(item.idcoach || "") === idcoach) &&
      (!recherche || normaliser([item.orderid,item.nomcoach,item.prenomcoach,
        item.emailcoach,item.idcoach].join(" ")).includes(recherche)));
    const tbody = $("coach-paiements-lignes");
    const fragment = document.createDocumentFragment();
    for (const item of resultat) {
      const tr=element("tr");
      [date(item.orderdate),item.orderid,nomCoach(item),euros(item.ht),euros(item.tva),
       euros(item.ttc),"Non disponible"].forEach(v=>tr.appendChild(element("td",v)));
      const td=element("td"),b=element("button","Détails");
      b.type="button";b.className="lcdp-button lcdp-button-secondary";
      b.addEventListener("click",()=>afficherDetail(item));
      td.appendChild(b);tr.appendChild(td);fragment.appendChild(tr);
    }
    tbody.replaceChildren(fragment);
    $("coach-paiements-vide").hidden = resultat.length > 0;
    $("coach-paiements-synthese").textContent = toutes.length +
      " écriture(s) de CA coach enregistrée(s) · Total TTC : " +
      euros(toutes.reduce((total,item)=>total+(Number(item.ttc)||0),0));
    $("coach-paiements-detail").hidden=true;
  }

  async function actualiser() {
    if (actualisation) return;
    actualisation=true;
    $("coach-paiements-actualiser").disabled=true;
    statut("Actualisation des écritures coach…");
    try {
      const result = await lireToutes();
      toutes = result.sort((a,b) => (Date.parse(b.orderdate)||0)-(Date.parse(a.orderdate)||0));
      charge=true;
      remplirFiltreCoachs();
      rendre();
      statut(toutes.length
        ? toutes.length+" écriture(s) de chiffre d’affaires coach consultable(s)."
        : "Aucune écriture de chiffre d’affaires liée à un coach dans le registre comptable.");
    } catch (erreur) {
      console.error("Suivi paiements coach",erreur);
      statut(String(erreur?.message||"Lecture impossible."),true);
    } finally {
      actualisation=false;
      $("coach-paiements-actualiser").disabled=false;
    }
  }

  async function initialiser() {
    const guard=window.LCDP_GUARD_ADMIN;
    if (!guard || typeof guard.verifierAccesPageAdmin !== "function")
      throw new Error("Contrôle d’accès administrateur indisponible.");
    if (!await guard.verifierAccesPageAdmin()) return;
    const menu=window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu || typeof menu.initialiser !== "function")
      throw new Error("Menu administrateur indisponible.");
    await Promise.all([
      chargerBandeau(),
      menu.initialiser({slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"coachs"})
    ]);
    $("lcdp-main-admin").hidden=false;
    $("coach-paiements-recherche").addEventListener("input",rendre);
    $("coach-paiements-coach").addEventListener("change",rendre);
    $("coach-paiements-actualiser").addEventListener("click",actualiser);
    $("coach-paiements-fermer").addEventListener("click",()=>{
      $("coach-paiements-detail").hidden=true;
    });
    await actualiser();
  }
  initialiser().catch(error=>{
    console.error("Suivi paiements coach",error);
    const main=$("lcdp-main-admin");
    if(main) main.hidden=false;
    statut(String(error?.message||"Page indisponible."),true);
  });
})();
