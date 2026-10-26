(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const CHEMIN_ROUTE =
    "/ESPACE-ADMIN/B_ADMIN/admin-actualite.html";

  const TYPES_IMAGES_ACCEPTES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif"
  ]);

  const EXTENSIONS_IMAGES_ACCEPTEES = new Set([
    "jpg",
    "jpeg",
    "png",
    "webp",
    "avif",
    "gif"
  ]);

  const MAX_FICHIERS = 6;
  const MAX_OCTETS_PAR_FICHIER = 15 * 1024 * 1024;
  const MAX_OCTETS_TOTAL = 60 * 1024 * 1024;

  let documentCharge = null;
  let slidesLocales = [];
  let modificationsLocales = false;
  let requeteEnCours = false;

  function urlAdmin(path) {
    return typeof window.LCDP_urlAdmin === "function"
      ? window.LCDP_urlAdmin(path)
      : path;
  }

  function urlPublic(path) {
    return typeof window.LCDP_urlPublic === "function"
      ? window.LCDP_urlPublic(path)
      : path;
  }

  function urlObjet(path) {
    return typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet(path)
      : path;
  }

  function urlImage(path) {
    const valeur = String(path || "");

    if (
      valeur.startsWith("http://") ||
      valeur.startsWith("https://") ||
      valeur.startsWith("data:")
    ) {
      return valeur;
    }

    const cheminObjet = valeur
      .replace(/^\/?OBJET\/?/, "/");

    return urlObjet(cheminObjet);
  }

  function urlArticle(path) {
    const valeur = String(path || "").trim();

    if (
      valeur.startsWith("http://") ||
      valeur.startsWith("https://")
    ) {
      return valeur;
    }

    return urlPublic(valeur);
  }

  function endpointEditingAdmin() {
    return String(
      config.workerEditingAdminUrl ||
      config.WORKER_EDITING_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_EDITING_ADMIN ||
      ""
    ).replace(/\/+$/, "");
  }

  function appliquerRoutes(racine = document) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const path = element.dataset.siteHref || "";
      const space = element.dataset.space || "public";

      element.setAttribute(
        "href",
        space === "admin" ? urlAdmin(path) : urlPublic(path)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const path = String(element.dataset.siteSrc || "")
        .replace(/^\/?OBJET\/?/, "/");

      element.setAttribute("src", urlObjet(path));
    });
  }

  async function chargerFragment(url, libelle) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(libelle + " introuvable.");
    }

    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();

    return template.content.cloneNode(true);
  }

  function chargerFragmentAdmin(path) {
    return chargerFragment(
      urlAdmin(path),
      "Fragment ADMIN " + path
    );
  }

  function chargerFragmentObjet(path) {
    return chargerFragment(
      urlObjet(path),
      "Fragment OBJET " + path
    );
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentAdmin(
      "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
    );

    slot.appendChild(fragment);
    appliquerRoutes(slot);
  }

  async function initialiserMenuGauche() {
    const moduleMenu = window.LCDP_MENU_GAUCHE_ADMIN;

    if (!moduleMenu || typeof moduleMenu.initialiser !== "function") {
      throw new Error("Menu gauche admin centralisé indisponible.");
    }

    await moduleMenu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "admin"
    });
  }

  async function appelerJson(path, options = {}) {
    const endpoint = endpointEditingAdmin();

    if (!endpoint) {
      throw new Error(
        "Endpoint editing-admin-api non configuré."
      );
    }

    let response;

    try {
      response = await fetch(endpoint + path, {
        method: options.method || "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {})
        },
        body: options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined
      });
    } catch (_) {
      throw new Error(
        "Impossible de joindre editing-admin-api.lacleduparc.fr."
      );
    }

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      redirigerConnexion();
      throw new Error("Session administrateur expirée.");
    }

    if (response.status === 403) {
      throw new Error(
        data?.message ||
        "Permission administrateur insuffisante."
      );
    }

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "Réponse du worker editing-admin inexploitable."
      );
    }

    return data;
  }

  async function appelerUpload(fichiers) {
    const endpoint = endpointEditingAdmin();

    if (!endpoint) {
      throw new Error(
        "Endpoint editing-admin-api non configuré."
      );
    }

    const formData = new FormData();

    fichiers.forEach((fichier) => {
      formData.append("images", fichier, fichier.name);
    });

    let response;

    try {
      response = await fetch(endpoint + "/admin/actualite/upload", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        },
        body: formData
      });
    } catch (_) {
      throw new Error(
        "Impossible de joindre editing-admin-api.lacleduparc.fr."
      );
    }

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      redirigerConnexion();
      throw new Error("Session administrateur expirée.");
    }

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "L’ajout des images a échoué."
      );
    }

    return data;
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      window.alert(message || "");
      return;
    }

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet(
      "/BOX/02-box-alerte.html"
    );

    slot.appendChild(fragment);

    const texte = slot.querySelector(
      "[data-lcdp-alerte-message]"
    );
    const fermer = slot.querySelector(
      "[data-lcdp-alerte-close]"
    );
    const ok = slot.querySelector(
      "[data-lcdp-alerte-ok]"
    );

    if (!texte || !ok) {
      slot.innerHTML = "";
      window.alert(message || "");
      return;
    }

    texte.textContent = message || "";

    if (fermer) {
      fermer.hidden = true;
    }

    await new Promise((resolve) => {
      ok.addEventListener("click", () => {
        slot.innerHTML = "";
        resolve();
      }, { once: true });
    });
  }

  async function demanderConfirmation(options) {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );

    if (!slot) {
      return window.confirm(options.texte || "");
    }

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet(
      "/BOX/02-box-dialogue-bouton.html"
    );

    slot.appendChild(fragment);

    const dialogue = slot.querySelector(
      "[data-lcdp-box-dialogue-bouton]"
    );
    const titre = slot.querySelector(
      "[data-lcdp-dialogue-title]"
    );
    const texte = slot.querySelector(
      "[data-lcdp-dialogue-text]"
    );
    const actions = slot.querySelector(
      "[data-lcdp-dialogue-actions]"
    );
    const fermer = slot.querySelector(
      "[data-lcdp-dialogue-close]"
    );

    if (!dialogue || !titre || !texte || !actions) {
      slot.innerHTML = "";
      return false;
    }

    titre.textContent = options.titre || "Confirmation";
    texte.textContent = options.texte || "";

    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className =
      "lcdp-button lcdp-button-secondary";
    annuler.textContent = "Annuler";

    const confirmer = document.createElement("button");
    confirmer.type = "button";
    confirmer.className =
      "lcdp-button lcdp-button-orange";
    confirmer.textContent = options.confirmer || "Confirmer";

    actions.appendChild(annuler);
    actions.appendChild(confirmer);

    return new Promise((resolve) => {
      let resolu = false;

      function terminer(valeur) {
        if (resolu) return;
        resolu = true;
        document.removeEventListener(
          "keydown",
          gererClavier
        );
        slot.innerHTML = "";
        resolve(valeur);
      }

      function gererClavier(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          terminer(false);
        }
      }

      document.addEventListener("keydown", gererClavier);

      fermer?.addEventListener("click", () => {
        terminer(false);
      });

      annuler.addEventListener("click", () => {
        terminer(false);
      });

      confirmer.addEventListener("click", () => {
        terminer(true);
      });

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          terminer(false);
        }
      });
    });
  }

  function formaterDateHeure(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function redirigerConnexion() {
    const path = "/ESPACE-ADMIN/connexion-admin.html";

    if (typeof config.adminUrl === "function") {
      window.location.replace(config.adminUrl(path));
      return;
    }

    window.location.replace(urlAdmin(path));
  }

  async function verifierAcces() {
    const guard = window.LCDP_GUARD_ADMIN;

    if (
      !guard ||
      typeof guard.verifierAccesPageAdmin !== "function"
    ) {
      throw new Error("Garde admin centralisé indisponible.");
    }

    return guard.verifierAccesPageAdmin({
      path: CHEMIN_ROUTE
    });
  }


  const edition = location.pathname.endsWith("admin-actualite-edition.html");
  let articles = [], popupId = null, article = null, fichier = null, busy = false;
  const q = s => document.querySelector(s);
  const copie = value => JSON.parse(JSON.stringify(value));
  function afficherStatus(message) { q('[data-lcdp-actualite-status]').textContent = message; }
  function el(tag, text) { const e = document.createElement(tag); if(text) e.textContent = text; return e; }
  function publie(id) { return documentCharge.publie.slides.find(a => a.id === id && a.active); }
  function bouton(label, fn) { const b=el('button',label); b.type='button'; b.className='lcdp-button'; b.onclick=()=>operation(fn); return b; }
  function rendreInventaire() {
    const tbody=q('[data-inventaire]'); tbody.replaceChildren();
    const tableFrame=tbody.closest('.lcdp-table-lecture-admin');
    if(tableFrame)tableFrame.style.marginTop='1rem';
    q('[data-popup-status]').textContent = popupId ? (publie(popupId)?'Une actualité est en pop-up.':'L’actualité sélectionnée en pop-up est hors ligne. Aucune pop-up publique.') : 'Aucune actualité en pop-up';
    q('[data-vide]').hidden=articles.length>0;
    for(const a of articles) {
      const p=publie(a.id), tr=el('tr');
      tr.append(el('td',a.titre || 'Sans titre'),el('td',p?'En ligne':'Hors ligne'),el('td',popupId===a.id?'Oui':'Non'));
      const actions=el('td'), wrap=el('div');wrap.className='lcdp-box-formulaire__actions';wrap.style.cssText='display:flex;flex-wrap:nowrap;justify-content:flex-start;align-items:center;gap:.4rem;margin:0';actions.style.whiteSpace='nowrap';
      const modifier=el('a','Modifier');modifier.className='lcdp-button';modifier.href='./admin-actualite-edition.html?id='+encodeURIComponent(a.id);wrap.append(modifier);
      const publication = bouton(p?'Dépublier':'Publier',async()=>{
        if(!await demanderConfirmation({
          titre:p?'Dépublier l’actualité':'Publier l’actualité',
          texte:p?'Retirer cet article du site public et de la pop-up éventuelle ?':'Publier cet article sur le site ?',
          confirmer:p?'Dépublier':'Publier'
        }))return;
        await sauver(p?'depublier':'publier',a.id);
        afficherStatus(p?'Article hors ligne.':'Article en ligne.');
      });
      if(p)publication.classList.add('lcdp-button-orange');
      wrap.append(publication);
      wrap.append(bouton('Supprimer',async()=>{
        if(!await demanderConfirmation({titre:'Supprimer l’actualité',texte:'Supprimer cet article du brouillon, du site public et de la pop-up éventuelle ? Le fichier image est conservé.',confirmer:'Supprimer'}))return;
        await sauver('supprimer',a.id);afficherStatus('Article supprimé.');
      }));
      for (const control of wrap.children) {
        control.style.cssText='display:inline-flex;flex:0 0 auto;width:auto;min-width:0;min-height:2rem;margin:0;padding:.4rem .65rem;font-size:.8rem;line-height:1.2;align-items:center;justify-content:center;white-space:nowrap';
      }
      actions.append(wrap);tr.append(actions);tbody.append(tr);
    }
  }
  async function sauver(actionArticle,id) {
    const data=await appelerJson('/admin/actualite/brouillon',{method:'POST',body:{version:documentCharge.version,titre:'Actualité',slides:articles,popupId,actionArticle,idArticle:id}});
    documentCharge=data;articles=copie(data.brouillon.slides);popupId=data.brouillon.popupId;
    modificationsLocales=false;
  }
  async function verifierImage(f) {
    if(!f || f.size>15*1024*1024 || f.type!=='image/webp' || !/\.webp$/i.test(f.name))throw Error('Choisissez une image WebP de 15 Mio maximum.');
    const bytes=new Uint8Array(await f.slice(0,12).arrayBuffer());
    if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')throw Error('Fichier WebP invalide.');
    const bitmap=await createImageBitmap(f);bitmap.close();
  }
  async function operation(fn) {
    if(busy)return;busy=true;
    const controls=Array.from(document.querySelectorAll('button,input,textarea')).map(e=>[e,e.disabled]);controls.forEach(([e])=>e.disabled=true);
    try{await fn();}catch(e){afficherStatus(e.message);}finally{busy=false;controls.forEach(([e,d])=>e.disabled=d);if(!edition)rendreInventaire();}
  }
  function initialiserEdition() {
    const id=new URLSearchParams(location.search).get('id');
    article=id?articles.find(a=>a.id===id):{id:crypto.randomUUID(),titre:'',texte:'',contact:'',image:'',alt:'',active:false};
    if(!article)throw Error('Actualité introuvable. Revenez à la liste.');
    if(!id && articles.length>=40)throw Error('Maximum : 40 actualités.');
    const form=q('[data-edition]');
    for(const key of ['titre','alt','texte','contact'])form.elements[key].value=article[key]||'';
    const checkbox=form.elements.popup;checkbox.checked=popupId===article.id;checkbox.disabled=false;
    q('[data-popup-aide]').textContent='La pop-up apparaît uniquement si cet article est en ligne. Cocher cette case ne publie pas l’article.';
    const preview=q('[data-image-preview]');if(article.image){preview.src=urlImage(article.image);preview.alt=article.alt||'';q('[data-image-frame]').hidden=false;}
    form.oninput=()=>{modificationsLocales=true;};
    form.elements.image.onchange=()=>operation(async()=>{
      const next=form.elements.image.files[0];if(!next)return;
      try {await verifierImage(next);}catch(e){form.elements.image.value='';throw e;}
      fichier=next;const url=URL.createObjectURL(next);preview.onload=()=>URL.revokeObjectURL(url);preview.src=url;q('[data-image-frame]').hidden=false;
    });
    form.onsubmit=e=>{e.preventDefault();operation(async()=>{
      if(!form.reportValidity())return;
      const selectionChange = checkbox.checked ? popupId!==article.id : popupId===article.id;
      if(selectionChange && !await demanderConfirmation({titre:'Pop-up',texte:checkbox.checked?'Sélectionner cet article pour la pop-up ? Elle apparaît uniquement lorsque l’article est en ligne.':'Retirer cet article de la pop-up ?',confirmer:'Confirmer'}))return;
      const next={...article};for(const key of ['titre','alt','texte','contact'])next[key]=form.elements[key].value.trim();
      if(!next.titre||!next.texte||!next.alt)throw Error('Titre, texte et description de l’image obligatoires.');
      if(fichier){await verifierImage(fichier);const data=await appelerUpload([fichier]);if(!data.slides?.[0]?.image)throw Error('Image non enregistrée.');next.image=data.slides[0].image;article.image=next.image;fichier=null;}
      if(!next.image)throw Error('Ajoutez une image WebP.');
      const oldArticles=articles,oldPopup=popupId;
      articles=articles.some(a=>a.id===next.id)?articles.map(a=>a.id===next.id?next:a):[next,...articles];
      if(checkbox.checked){popupId=next.id;}else if(popupId===next.id)popupId=null;
      try{await sauver(publie(next.id)?'publier':'enregistrer',next.id);}catch(e){articles=oldArticles;popupId=oldPopup;throw e;}
      location.assign('./admin-actualite.html');
    });};
  }
  async function initialiser() {
    if(!await verifierAcces())return;
    const [data]=await Promise.all([appelerJson('/admin/actualite'),initialiserBandeau(),initialiserMenuGauche()]);
    documentCharge=data;articles=copie(data.brouillon.slides);popupId=data.brouillon.popupId;
    if(edition)initialiserEdition();else rendreInventaire();
    q('[data-lcdp-actualite-loading]').hidden=true;q('[data-lcdp-actualite-contenu]').hidden=false;
    document.getElementById('lcdp-main-admin').hidden=false;
  }
  window.addEventListener('beforeunload',e=>{if(modificationsLocales){e.preventDefault();e.returnValue='';}});
  initialiser().catch(e=>{afficherStatus(e.message);document.getElementById('lcdp-main-admin').hidden=false;});
})();
