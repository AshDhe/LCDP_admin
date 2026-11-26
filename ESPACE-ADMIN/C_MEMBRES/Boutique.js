(() => {
  "use strict";
  const config = window.SITE_CONFIG || {};
  const q = id => document.getElementById(id);
  const racine = q("lcdp-boutique-admin");
  const statut = q("lcdp-boutique-admin-statut");
  const endpoint = String(config.workerBoutiqueAdminUrl || "").replace(/\/+$/, "");
  const categories = [{key:"cadeau", label:"Accessoires cadeau"}, {key:"acces", label:"Accessoires d’accès"}];
  let articles = [], version = null, busy = false, brouillons = false;
  const vues = {};
  const texte = (message) => { statut.textContent = message || ""; statut.hidden = !message; };
  const el = (tag, classe, contenu) => {
    const n = document.createElement(tag); if (classe) n.className = classe;
    if (contenu !== undefined) n.textContent = contenu; return n;
  };
  const monnaie = cents => (cents / 100).toLocaleString("fr-FR", {style:"currency",currency:"EUR"});
  function photoSure(url) {
    if (!url) return "";
    try {
      const u = new URL(url, location.href);
      return ["https:","blob:"].includes(u.protocol) ? u.href : "";
    } catch { return ""; }
  }
  function fermer(vue) {
    vue.form.reset(); vue.formSlot.hidden = true; vue.id = null; vue.photo = null;
    if (vue.url) URL.revokeObjectURL(vue.url);
    vue.url = null; vue.apercu.removeAttribute("src"); vue.apercuSlot.hidden = true;
  }
  function ouvrir(vue, article) {
    fermer(vue);
    vue.id = article?.id || null;
    vue.form.querySelector("[data-boutique-form-titre]").textContent = article ? "Modifier l’article" : "Créer un article";
    vue.form.elements.nom.value = article?.nom || "";
    vue.form.elements.description.value = article?.description || "";
    vue.form.elements.prix.value = article ? (article.prix_centimes / 100).toFixed(2) : "";
    vue.form.elements.publie.value = String(article?.publie === true);
    const photo = photoSure(article?.image);
    if (photo) { vue.apercu.src = photo; vue.apercuSlot.hidden = false; }
    vue.formSlot.hidden = false; vue.form.elements.nom.focus();
  }
  function rendre(vue) {
    vue.liste.replaceChildren();
    const selection = articles.filter(a => a.categorie === vue.categorie);
    if (!selection.length) vue.liste.append(el("p","","Aucun article dans cette catégorie."));
    for (const article of selection) {
      const bloc = el("article","lcdp-editeur-contenu__bloc");
      const entete = el("div","lcdp-editeur-contenu__bloc-entete");
      const titre = el("div","lcdp-editeur-contenu__titre-zone");
      titre.append(el("h3","",article.nom),el("p","",monnaie(article.prix_centimes) + " · " +
        (endpoint ? (article.publie ? "En ligne" : "Non publié") : (article.publie ? "Publication souhaitée" : "Non publié"))));
      const modifier = el("button","lcdp-button lcdp-button-primary lcdp-editeur-contenu__petit-bouton","Modifier");
      modifier.type = "button"; modifier.addEventListener("click", () => ouvrir(vue,article));
      entete.append(titre,modifier); bloc.append(entete);
      const photo = photoSure(article.image);
      if (photo) { const image = el("img","lcdp-box-card-parc__image"); image.src = photo; image.alt = article.nom; bloc.append(image); }
      bloc.append(el("p","",article.description)); vue.liste.append(bloc);
    }
  }
  // Contrat de raccordement : service admin authentifié, réponse versionnée.
  // Aucun appel réseau tant que l’URL dédiée n’est pas configurée.
  async function api(method, body) {
    const response = await fetch(endpoint + "/admin/articles", {
      method, credentials:"include", cache:"no-store",
      headers:{Accept:"application/json", ...(body ? {"Content-Type":"application/json"} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})
    });
    if (response.status === 401) { location.replace(config.adminUrl("/ESPACE-ADMIN/connexion-admin.html")); throw Error("Session expirée."); }
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Array.isArray(data.articles) || !Number.isInteger(data.version)) throw Error(data?.message || "Catalogue indisponible.");
    if (!data.articles.every(a => typeof a.id === "string" && categories.some(c=>c.key===a.categorie) && typeof a.nom==="string" && typeof a.description==="string" && Number.isSafeInteger(a.prix_centimes) && a.prix_centimes>0 && typeof a.publie==="boolean")) throw Error("Catalogue invalide.");
    articles = data.articles; version = data.version;
  }
  async function enregistrer(vue) {
    if (busy || !vue.form.reportValidity()) return;
    const ancien = articles.find(a=>a.id===vue.id);
    const f = vue.form.elements;
    const nom = f.nom.value.trim(), description = f.description.value.trim(), prix = Math.round(Number(f.prix.value)*100);
    if (!nom || !description || !Number.isSafeInteger(prix) || prix<1 || prix>9999999) {texte("Vérifiez le nom, la description et le prix.");return;}
    if (!vue.photo && !ancien?.image) {texte("Ajoutez une photo de l’article.");return;}
    const article = {id:vue.id || crypto.randomUUID(),categorie:vue.categorie,nom,description,prix_centimes:prix,publie:f.publie.value==="true"};
    busy = true;
    const submit = vue.form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      if (endpoint) {
        // Envoi de la photo au worker avec l’article, en une opération versionnée.
        let photo = null;
        if (vue.photo) photo = await new Promise((resolve,reject) => { const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error("Photo illisible."));reader.readAsDataURL(vue.photo); });
        await api("POST",{version,article,photo});
        texte("Article enregistré.");
      } else {
        const image = vue.photo ? URL.createObjectURL(vue.photo) : ancien.image;
        if (vue.photo && ancien?.image?.startsWith("blob:")) URL.revokeObjectURL(ancien.image);
        article.image=image;
        articles = articles.filter(a=>a.id!==article.id).concat(article);
        brouillons = true;
        texte("Brouillon de session : le service boutique n’est pas raccordé. Rien n’est publié.");
      }
      fermer(vue); Object.values(vues).forEach(rendre);
    } catch(error) { texte(error.message || "Enregistrement impossible."); }
    finally {busy=false;submit.disabled=false;}
  }
  function construireVues() {
    const onglets = window.LCDP_WRAPER_ONGLETS.initialiser({racine,onglets:categories,idPrefix:"lcdp-boutique-admin",ariaLabel:"Catégories de la boutique"});
    for (const {key} of categories) {
      const zone=onglets.zones[key];
      zone.append(q("lcdp-boutique-admin-liste").content.cloneNode(true));
      const vue={categorie:key,liste:zone.querySelector("[data-boutique-liste]"),form:zone.querySelector("[data-boutique-form]"),formSlot:zone.querySelector("[data-boutique-form-slot]"),apercu:zone.querySelector("[data-boutique-apercu]"),apercuSlot:zone.querySelector("[data-boutique-apercu-slot]")};
      vues[key]=vue;
      zone.querySelector("[data-boutique-ajouter]").addEventListener("click",()=>ouvrir(vue,null));
      zone.querySelector("[data-boutique-annuler]").addEventListener("click",()=>fermer(vue));
      vue.form.elements.photo.addEventListener("change",()=>{
        const fichier=vue.form.elements.photo.files[0];
        if (!fichier) return;
        if (!["image/webp","image/jpeg","image/png"].includes(fichier.type)||fichier.size>5*1024*1024) {vue.form.elements.photo.value="";texte("Photo JPEG, PNG ou WebP, 5 Mo maximum.");return;}
        if(vue.url)URL.revokeObjectURL(vue.url);
        vue.photo=fichier;vue.url=URL.createObjectURL(fichier);vue.apercu.src=vue.url;vue.apercuSlot.hidden=false;
      });
      vue.form.addEventListener("submit",event=>{event.preventDefault();void enregistrer(vue);});
      rendre(vue);
    }
  }
  async function initialiser() {
    if (!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin({path:"/ESPACE-ADMIN/C_MEMBRES/Boutique.html"})) return;
    const r=await fetch(config.adminUrl("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"),{credentials:"same-origin",cache:"no-cache"});
    if(!r.ok)throw Error("Bandeau administrateur indisponible.");
    const template=document.createElement("template");template.innerHTML=(await r.text()).trim();
    const slot=q("lcdp-bandeau-slot");slot.replaceChildren(template.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(e=>e.href=e.dataset.space==="admin"?config.adminUrl(e.dataset.siteHref):config.publicUrl(e.dataset.siteHref));
    slot.querySelectorAll("[data-site-src]").forEach(e=>e.src=config.objetUrl(e.dataset.siteSrc.replace(/^\/?OBJET\/?/,"/")));
    await window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"membres"});
    q("lcdp-main-admin").hidden=false;
    if(endpoint) await api("GET"); else texte("Service boutique non raccordé : création et modification en brouillon de session uniquement.");
    construireVues();racine.hidden=false;
  }
  window.addEventListener("beforeunload",event=>{if(brouillons){event.preventDefault();event.returnValue="";}});
  initialiser().catch(error=>{console.error(error);texte(error.message||"Boutique indisponible.");});
})();
