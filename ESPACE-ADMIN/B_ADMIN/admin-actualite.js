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
      credentials: "omit",
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

  async function demanderConfirmationPublication() {
    return demanderConfirmation({
      titre: "Publier l’actualité",
      texte:
        "La version publique du carrousel sera remplacée par le contenu actuel.",
      confirmer: "Publier"
    });
  }

  async function demanderConfirmationRetrait() {
    return demanderConfirmation({
      titre: "Retirer cette image",
      texte:
        "L’image sera retirée du carrousel. Le fichier conservé dans GitHub ne sera pas supprimé.",
      confirmer: "Retirer"
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


  let articles=[], popupId=null;
  function afficherStatus(message) { const e=document.querySelector('[data-lcdp-actualite-status]'); if(e)e.textContent=message; }
  function actualiserMeta() { document.querySelector('[data-lcdp-actualite-meta]').textContent='Version '+documentCharge.version; }
  function dirty(){modificationsLocales=true;afficherStatus('Modifications non publiées.');}
  function el(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
  function rendre(){
    const list=document.querySelector('[data-liste-articles]');list.replaceChildren();
    for(const a of articles){
      const card=el('article');card.className='lcdp-actualite-editeur';
      const image=el('img');image.src=urlImage(a.image);image.alt=a.alt||'';image.className='lcdp-actualite-image';card.append(image);
      for(const [key,label,multi] of [['titre','Titre court',false],['alt','Description de l’image',false],['texte','Texte',true]]){
        const l=el('label',label),input=el(multi?'textarea':'input');input.value=a[key]||'';input.maxLength=multi?20000:key==='titre'?160:250;
        input.addEventListener('input',()=>{a[key]=input.value;dirty();});l.append(input);card.append(l);
      }
      const l=el('label','Publier cette actualité'),c=el('input');c.type='checkbox';c.checked=a.active;
      c.onchange=()=>{a.active=c.checked;if(!a.active&&popupId===a.id)popupId=null;dirty();rendre();};l.prepend(c);card.append(l);
      const p=el('label','Afficher en pop-up à l’accueil'),r=el('input');r.type='radio';r.name='popup';r.checked=popupId===a.id;r.disabled=!a.active;
      r.onchange=()=>{popupId=a.id;dirty();};p.prepend(r);card.append(p);
      const replace=el('input');replace.type='file';replace.accept='image/webp,.webp';replace.setAttribute('aria-label','Remplacer l’image');
      replace.onchange=()=>operation(async()=>{const f=replace.files[0];if(!f)return;await verifierImage(f);const data=await appelerUpload([f]);if(!data.slides?.length)throw Error('Image non enregistrée.');a.image=data.slides[0].image;dirty();rendre();});card.append(replace);
      const previewButton=el('button','Prévisualiser');previewButton.type='button';previewButton.className='lcdp-button';
      previewButton.onclick=()=>{const old=card.querySelector('[data-preview]');if(old){old.remove();return;}const preview=el('section');preview.dataset.preview='true';const title=el('h2',a.titre||'Titre à renseigner'),im=el('img'),text=el('div',a.texte||'Texte à renseigner'),contact=el('a','Contact');im.src=urlImage(a.image);im.alt=a.alt||'';im.className='lcdp-actualite-image';text.style.whiteSpace='pre-wrap';contact.href=urlPublic('/ESPACE-PUBLIC/contact.html');preview.append(title,im,text,contact);card.append(preview);};card.append(previewButton);
      const remove=el('button','Supprimer cette actualité');remove.type='button';remove.className='lcdp-button';
      remove.onclick=()=>operation(async()=>{if(!await demanderConfirmation({titre:'Supprimer l’actualité',texte:'Retirer cette actualité du brouillon ? La publication applique ensuite ce retrait au site.',confirmer:'Supprimer'}))return;articles=articles.filter(x=>x!==a);if(popupId===a.id)popupId=null;dirty();rendre();});card.append(remove);list.append(card);
    }
    if(!articles.length)list.append(el('p','Aucune actualité.'));
  }
  async function verifierImage(f){
    if(!f||f.size>15*1024*1024||f.type!=='image/webp')throw Error('Choisissez une image WebP de 15 Mio maximum.');
    const bytes=new Uint8Array(await f.slice(0,12).arrayBuffer());
    if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')throw Error('Fichier WebP invalide.');
    const bitmap=await createImageBitmap(f);bitmap.close();
  }
  let busy=false;
  async function operation(fn){if(busy)return;busy=true;document.querySelectorAll('button,input,textarea').forEach(e=>e.disabled=true);try{await fn();}catch(e){afficherStatus(e.message);}finally{busy=false;document.querySelectorAll('button,input,textarea').forEach(e=>e.disabled=false);rendre();}}
  async function enregistrer(publication){
    if(publication&&!await demanderConfirmation({titre:'Publier les modifications',texte:'Appliquer toutes les modifications au site public ?',confirmer:'Publier'}))return;
    const d=await appelerJson('/admin/actualite/'+(publication?'publier':'brouillon'),{method:'POST',body:{version:documentCharge.version,titre:'Actualité',slides:articles,popupId}});
    documentCharge=d;articles=d.brouillon.slides;popupId=d.brouillon.popupId;modificationsLocales=false;actualiserMeta();afficherStatus(publication?'Modifications publiées.':'Brouillon enregistré.');
  }
  async function initialiser(){
    if(!await verifierAcces())return;
    const [d]=await Promise.all([appelerJson('/admin/actualite'),initialiserBandeau(),initialiserMenuGauche()]);
    documentCharge=d;articles=d.brouillon.slides;popupId=d.brouillon.popupId;actualiserMeta();rendre();
    document.querySelector('[data-lcdp-actualite-loading]').hidden=true;document.querySelector('[data-lcdp-actualite-contenu]').hidden=false;document.getElementById('lcdp-main-admin').hidden=false;
    document.querySelector('[data-ajouter]').onclick=()=>operation(async()=>{if(articles.length>=40)throw Error('Maximum : 40 actualités.');const input=document.querySelector('[data-image-nouvelle]'),f=input.files[0];await verifierImage(f);const d=await appelerUpload([f]);if(!d.slides?.length)throw Error('Image non enregistrée.');articles.unshift({...d.slides[0],titre:'',texte:'',active:false});input.value='';dirty();});
    document.querySelector('[data-sans-popup]').onclick=()=>{popupId=null;dirty();rendre();};
    document.querySelector('[data-enregistrer]').onclick=()=>operation(()=>enregistrer(false));
    document.querySelector('[data-publier]').onclick=()=>operation(()=>enregistrer(true));
  }
  window.addEventListener('beforeunload',e=>{if(modificationsLocales){e.preventDefault();e.returnValue='';}});
  initialiser().catch(e=>{afficherStatus(e.message);document.getElementById('lcdp-main-admin').hidden=false;});
})();
