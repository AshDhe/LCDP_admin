(() => {
  "use strict";
  const config = window.SITE_CONFIG;
  const route = "/ESPACE-ADMIN/B_ADMIN/temoignages-admin.html";
  const endpoint = String(config.workerEditingAdminUrl || "").replace(/\/+$/, "");
  const q = id => document.getElementById(id);
  const form = q("temoignages-form"), liste = q("temoignages-liste");
  const filtre = q("temoignages-filtre");
  const ajouter = q("temoignages-ajouter"), enregistrer = q("temoignages-enregistrer");
  const status = message => { q("temoignages-status").textContent = message; };
  const types = [["membre", "Membre"], ["coach", "Coach"], ["parc", "Parc"]];
  let items = [], version, dirty = false, busy = false;
  const el = (tag, classe, texte) => {
    const node = document.createElement(tag);
    if (classe) node.className = classe;
    if (texte !== undefined) node.textContent = texte;
    return node;
  };
  function modifier() {
    dirty = true;
    enregistrer.disabled = busy;
    status("Modifications non enregistrées.");
  }
  function bouton(texte, label, action, disabled) {
    const node = el("button", "lcdp-button lcdp-editeur-contenu__petit-bouton", texte);
    node.type = "button"; node.setAttribute("aria-label", label);
    node.disabled = busy || disabled; node.addEventListener("click", action);
    return node;
  }
  function rendre() {
    liste.replaceChildren();
    const categorie = filtre.value;
    const visibles = items.map((item, i) => ({item, i})).filter(({item}) => !categorie || item.auteur === categorie);
    if (!visibles.length) liste.append(el("p", "", categorie ? "Aucun témoignage dans cette catégorie." : "Aucun témoignage."));
    visibles.forEach(({item, i}, position) => {
      const bloc = el("div", "lcdp-editeur-contenu__bloc");
      const entete = el("div", "lcdp-editeur-contenu__bloc-entete");
      const champType = el("label", "lcdp-editeur-contenu__titre-zone");
      champType.append(el("span", "lcdp-editeur-contenu__label", "Cité par"));
      const select = el("select", "lcdp-editeur-contenu__titre");
      select.required = true; select.disabled = busy;
      const placeholder = el("option", "", "Sélectionner"); placeholder.value = ""; placeholder.disabled = true;
      select.append(placeholder);
      for (const [valeur, libelle] of types) {
        const option = el("option", "", libelle); option.value = valeur; select.append(option);
      }
      select.value = item.auteur;
      select.addEventListener("change", () => {
        item.auteur = select.value; modifier();
        if (filtre.value && item.auteur !== filtre.value) { rendre(); filtre.focus(); }
      });
      champType.append(select);
      const ordre = el("div", "lcdp-editeur-contenu__ordre");
      const deplacer = delta => {
        const cible = visibles[position + delta];
        if (busy || !cible) return;
        const autre = cible.i;
        [items[i], items[autre]] = [items[autre], items[i]];
        modifier(); rendre();
        liste.children[position + delta]?.querySelector("textarea")?.focus();
      };
      ordre.append(
        bouton("↑", "Monter le témoignage " + (i+1), () => deplacer(-1), position === 0),
        bouton("↓", "Descendre le témoignage " + (i+1), () => deplacer(1), position === visibles.length-1)
      );
      if (item.nouveau) ordre.append(bouton("Annuler", "Annuler ce nouveau témoignage", () => {
        items.splice(i, 1); modifier(); rendre();
      }, false));
      entete.append(champType, ordre);
      const champTexte = el("label", "lcdp-editeur-contenu__titre-zone");
      champTexte.append(el("span", "lcdp-editeur-contenu__label", "Verbatim " + (i+1)));
      const texte = el("textarea", "lcdp-editeur-contenu__titre");
      texte.rows = 3; texte.required = true; texte.disabled = busy; texte.value = item.texte;
      texte.addEventListener("input", () => { item.texte = texte.value; modifier(); });
      champTexte.append(texte); bloc.append(entete, champTexte); liste.append(bloc);
    });
    filtre.disabled = busy;
    ajouter.disabled = busy;
    enregistrer.disabled = busy || !dirty;
  }
  async function api(method, body) {
    if (!endpoint) throw new Error("Worker editing-admin non configuré.");
    const response = await fetch(endpoint + "/admin/temoignages", {
      method, credentials: "include", cache: "no-store",
      headers: {Accept:"application/json", ...(body ? {"Content-Type":"application/json"} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401) { window.location.replace(config.adminUrl("/ESPACE-ADMIN/connexion-admin.html")); throw new Error("Session expirée."); }
    if (!response.ok || data?.success !== true) throw new Error(data?.message || "Impossible d’accéder aux témoignages.");
    if (!Array.isArray(data.temoignages) || !Number.isInteger(data.version)) throw new Error("Réponse du Worker invalide.");
    return data;
  }
  function charger(data) {
    version = data.version; items = data.temoignages.map(t => ({texte:t.texte, auteur:t.auteur}));
    dirty = false;
  }
  filtre.addEventListener("change", rendre);
  ajouter.addEventListener("click", () => {
    if (busy) return;
    items.push({texte:"", auteur:filtre.value, nouveau:true}); modifier(); rendre();
    liste.lastElementChild.querySelector("textarea").focus();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !dirty) return;
    if (items.some(t => !t.texte.trim() || !types.some(([code]) => code === t.auteur))) {
      filtre.value = ""; rendre();
      status("Le texte et l’attribution sont obligatoires."); return;
    }
    busy = true; rendre(); status("Enregistrement…");
    try {
      charger(await api("POST", {version, temoignages:items.map(({texte,auteur}) => ({texte,auteur}))}));
      status("Témoignages enregistrés.");
    } catch (error) { status(error.message); }
    finally { busy = false; rendre(); }
  });
  window.addEventListener("beforeunload", event => {
    if (dirty) { event.preventDefault(); event.returnValue = ""; }
  });
  async function initialiser() {
    if (!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin({path:route})) return;
    const response = await fetch(config.adminUrl("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), {credentials:"same-origin",cache:"no-cache"});
    if (!response.ok) throw new Error("Bandeau admin indisponible.");
    const template = document.createElement("template"); template.innerHTML = await response.text();
    const slot = q("lcdp-bandeau-slot"); slot.replaceChildren(template.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(e => e.href = e.dataset.space === "admin" ? config.adminUrl(e.dataset.siteHref) : config.publicUrl(e.dataset.siteHref));
    slot.querySelectorAll("[data-site-src]").forEach(e => e.src = config.objetUrl(e.dataset.siteSrc.replace(/^\/?OBJET\/?/, "/")));
    await window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"admin"});
    q("lcdp-main-admin").hidden = false;
    charger(await api("GET")); rendre(); form.hidden = false;
    status("");
  }
  initialiser().catch(error => { status(error.message); console.error(error); });
})();
