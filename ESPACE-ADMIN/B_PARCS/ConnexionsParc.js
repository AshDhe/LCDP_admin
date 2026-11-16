(() => {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const BASE = String(cfg.workerAdminDataUrl || cfg.WORKER_ADMIN_DATA_URL ||
    window.ADMIN_CONFIG?.API_ADMIN_DATA || "").replace(/\/+$/, "");
  const ROOT = "/ESPACE-ADMIN/";
  const byId = id => document.getElementById("lcdp-connexionsparc-" + id);
  const normaliser = v => String(v ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr").trim();
  const nombre = n => Number.isFinite(Number(n))
    ? new Intl.NumberFormat("fr-FR").format(Number(n)) : "—";
  const dateHeure = raw => {
    if (!raw) return "Jamais";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("fr-FR",{
      timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit"
    }).format(d);
  };
  const urlAdmin = path => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(path) : path;
  const urlPublic = path => typeof window.LCDP_urlPublic === "function"
    ? window.LCDP_urlPublic(path) : path;
  const urlObjet = path => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(path) : path;

  let responsables = [];
  let historique = [];
  let totalHistorique = 0;
  let chargement = false;

  async function fragment(path, admin = true) {
    const response = await fetch(admin ? urlAdmin(path) : urlObjet(path),{
      credentials:"same-origin",cache:"no-cache"
    });
    if(!response.ok) throw Error("Composant indisponible : "+path);
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }

  async function initialiserStructure() {
    const bandeau = byId("bandeau") || document.getElementById("lcdp-bandeau-slot");
    bandeau.replaceChildren(await fragment(ROOT+"A_STRUCTURE/box-bandeau-nav-admin.html"));
    bandeau.querySelectorAll("[data-site-href]").forEach(el => {
      el.href = el.dataset.space === "admin"
        ? urlAdmin(el.dataset.siteHref) : urlPublic(el.dataset.siteHref);
    });
    bandeau.querySelectorAll("[data-site-src]").forEach(el => {
      el.src = urlObjet(String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/,"/"));
    });
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu || typeof menu.initialiser !== "function")
      throw Error("Menu gauche de l’espace admin indisponible.");
    await menu.initialiser({
      slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"parcs"
    });
  }

  function definirStatut(message, erreur = false) {
    const status = byId("statut");
    status.textContent = message;
    status.setAttribute("role",erreur?"alert":"status");
  }

  async function lireDonnees(resource, limit, offset) {
    if (!BASE) throw Error("Endpoint admin data non configuré.");
    const url = new URL(BASE+"/read");
    url.searchParams.set("resource",resource);
    url.searchParams.set("limit",String(limit));
    url.searchParams.set("offset",String(offset));
    const response = await fetch(url.toString(),{
      credentials:"include",cache:"no-store",
      headers:{Accept:"application/json"}
    });
    const data = await response.json().catch(()=>null);
    if(response.status === 401) {
      window.location.replace(urlAdmin(ROOT+"connexion-admin.html"));
      throw Error("Session administrateur inactive.");
    }
    if(!response.ok || data?.success !== true || !Array.isArray(data.rows)) {
      throw Error(data?.message || data?.detail ||
        "Lecture des connexions impossible.");
    }
    return data;
  }

  function ligneTableau(valeurs, premiereEnTete = false) {
    const tr = document.createElement("tr");
    valeurs.forEach((valeur,index)=>{
      const cellule = document.createElement(premiereEnTete && index===0?"th":"td");
      if(premiereEnTete && index===0) cellule.scope = "row";
      cellule.textContent = String(valeur ?? "");
      tr.appendChild(cellule);
    });
    return tr;
  }

  function filtresActifs() {
    return {
      dpt:byId("departement").value,
      recherche:normaliser(byId("recherche").value)
    };
  }

  function estVisible(ligne,f) {
    const dpt=String(ligne.dptmt||"");
    if (f.dpt && dpt!==f.dpt) return false;
    if(!f.recherche) return true;
    return normaliser([
      ligne.parc,ligne.dptmt,ligne.nomresp,ligne.prenomresp,ligne.emailresp
    ].join(" ")).includes(f.recherche);
  }

  function rendre() {
    const f = filtresActifs();
    const personnes = responsables.filter(x=>estVisible(x,f));
    const frag = document.createDocumentFragment();
    for(const item of personnes) {
      frag.appendChild(ligneTableau([
        item.dptmt || "—",
        item.parc || "—",
        item.nomresp || "—",
        item.prenomresp || "—",
        item.emailresp || "—",
        item.statut_acces || "—",
        dateHeure(item.derniere_connexion),
        nombre(item.connexions_30j),
        nombre(item.connexions_total)
      ],true));
    }
    byId("responsables").replaceChildren(frag);
    byId("vide").hidden = personnes.length > 0;
    const hist = historique.filter(x=>estVisible(x,f));
    const journal = document.createDocumentFragment();
    for(const item of hist) {
      journal.appendChild(ligneTableau([
        dateHeure(item.dateconnexion),
        item.dptmt || "—",
        item.parc || "—",
        item.nomresp || "—",
        item.prenomresp || "—",
        item.emailresp || "—"
      ]));
    }
    byId("historique").replaceChildren(journal);
    byId("aucun").hidden = hist.length > 0;
    byId("plus").hidden = historique.length >= totalHistorique;
  }

  function initialiserFiltreDepartement() {
    const select=byId("departement");
    const ancienne = select.value;
    select.querySelectorAll("option:not(:first-child)").forEach(o=>o.remove());
    const dpts=[...new Set(responsables.map(x=>String(x.dptmt||""))
      .filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
    for(const code of dpts){
      const option=document.createElement("option");
      option.value=code;
      option.textContent=code;
      select.appendChild(option);
    }
    if(dpts.includes(ancienne)) select.value=ancienne;
    else select.value="";
  }

  function afficherChiffres() {
    byId("nb-responsables").textContent=nombre(responsables.length);
    byId("nb-connectes").textContent=nombre(
      responsables.filter(x=>Number(x.connexions_total)>0).length);
    byId("nb-30j").textContent=nombre(
      responsables.reduce((s,x)=>s+Number(x.connexions_30j||0),0));
    byId("nb-total").textContent=nombre(
      responsables.reduce((s,x)=>s+Number(x.connexions_total||0),0));
    byId("chiffres").hidden=false;
  }

  async function chargerResponsables() {
    const tous=[];
    for(let offset=0;offset<5000;offset+=200) {
      const data=await lireDonnees("parcs-connexions",200,offset);
      tous.push(...data.rows);
      if(data.rows.length===0 || tous.length>=Number(data.total ?? tous.length))
        return tous;
    }
    throw Error("La liste dépasse la capacité du tableau : 5 000 responsables.");
  }

  async function chargerHistorique(ajouter) {
    const offset=ajouter?historique.length:0;
    const data=await lireDonnees("parcs-connexions-detail",100,offset);
    totalHistorique=Number(data.total ?? data.rows.length);
    if (ajouter) {
      const ids=new Set(historique.map(x=>String(x.idsession)));
      for(const item of data.rows){
        if(!ids.has(String(item.idsession))) historique.push(item);
      }
    } else historique=data.rows.slice();
  }

  async function actualiser() {
    if(chargement) return;
    chargement=true;
    byId("actualiser").disabled=true;
    byId("plus").disabled=true;
    definirStatut("Lecture des connexions enregistrées…");
    try {
      const [r,h] = await Promise.all([
        chargerResponsables(),lireDonnees("parcs-connexions-detail",100,0)
      ]);
      responsables=r.sort((a,b)=>
        (Date.parse(b.derniere_connexion)||0)-(Date.parse(a.derniere_connexion)||0) ||
        String(a.parc||"").localeCompare(String(b.parc||""),"fr")
      );
      historique=h.rows;
      totalHistorique=Number(h.total??h.rows.length);
      initialiserFiltreDepartement();
      afficherChiffres();
      rendre();
      definirStatut("Données actualisées le "+dateHeure(new Date().toISOString()));
    } catch(e) {
      console.error("ConnexionsParc",e);
      definirStatut(String(e?.message || "Chargement impossible."),true);
    } finally {
      chargement=false;
      byId("actualiser").disabled=false;
      byId("plus").disabled=false;
    }
  }

  async function plus() {
    if(chargement || historique.length>=totalHistorique) return;
    chargement=true;
    byId("plus").disabled=true;
    try {
      await chargerHistorique(true);
      rendre();
    } catch(e) {
      definirStatut(String(e?.message || "Historique indisponible."),true);
    } finally {
      chargement=false;
      byId("plus").disabled=false;
    }
  }

  async function demarrer() {
    const guard=window.LCDP_GUARD_ADMIN;
    if(!guard || typeof guard.verifierAccesPageAdmin!=="function")
      throw Error("Garde administrateur indisponible.");
    if(!await guard.verifierAccesPageAdmin()) return;
    await initialiserStructure();
    document.getElementById("lcdp-main-admin").hidden=false;
    byId("actualiser").addEventListener("click",actualiser);
    byId("plus").addEventListener("click",plus);
    byId("departement").addEventListener("change",rendre);
    byId("recherche").addEventListener("input",rendre);
    await actualiser();
  }
  demarrer().catch(e=>{
    console.error("ConnexionsParc",e);
    if(document.getElementById("lcdp-main-admin"))
      document.getElementById("lcdp-main-admin").hidden=false;
    if(byId("statut")) definirStatut(String(e?.message||"Page indisponible."),true);
  });
})();
