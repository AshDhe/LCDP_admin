(() => {
  "use strict";

  const configuration = window.SITE_CONFIG || {};
  const RUBRIQUES = [
    { cle: "entree", titre: "Entrée", images: ["entree1.webp", "entree2.webp"] },
    { cle: "checkin", titre: "Check-in", images: ["checkin1.webp"] },
    { cle: "chemin1", titre: "Chemin", images: ["chemin1.webp"] },
    { cle: "chemin2", titre: "Chemin supplémentaire", images: ["chemin2.webp"], optionnelle: true },
    { cle: "zonereservee1", titre: "Zone réservée", images: ["zonereservee1.webp"] },
    { cle: "zonereservee2", titre: "Zone réservée supplémentaire", images: ["zonereservee2.webp"], optionnelle: true },
    { cle: "presence", titre: "Présence", images: ["presence1.webp"] },
    { cle: "reglement", titre: "Règlement", images: [], liens: true },
    { cle: "reglementparc", titre: "Règlement parc", images: [] }
  ];
  const IMAGE_BASE = "/IMAG/ACCESPARC/";
  let parcCourant = null;
  let formulaires = new Map();
  let contenuOriginal = {};
  let modifie = false;
  let operation = false;

  const urlAdmin = chemin => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(chemin) : chemin;
  const urlPublic = chemin => typeof window.LCDP_urlPublic === "function"
    ? window.LCDP_urlPublic(chemin) : chemin;
  const urlObjet = chemin => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(chemin) : chemin;
  const endpoint = () => String(
    configuration.workerParcAdminUrl || configuration.WORKER_PARC_ADMIN_URL ||
    window.ADMIN_CONFIG?.API_PARC_ADMIN || ""
  ).replace(/\/+$/, "");

  function statut(message, erreur = false) {
    const element = document.getElementById("lcdp-accesdetail-statut");
    if (!element) return;
    element.hidden = !message;
    element.textContent = String(message || "");
    element.dataset.state = erreur ? "error" : "success";
    element.setAttribute("role", erreur ? "alert" : "status");
  }
  function signalerModification() {
    modifie = true;
    statut("Modifications non enregistrées.");
  }
  function demanderAbandon() {
    return !modifie || window.confirm(
      "Des textes n'ont pas été enregistrés. Abandonner ces modifications ?"
    );
  }
  async function chargerFragmentAdmin(path) {
    const response = await fetch(urlAdmin(path), { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error("Fragment ADMIN introuvable : " + path);
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }
  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    slot.appendChild(await chargerFragmentAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"));
    slot.querySelectorAll("[data-site-href]").forEach(element => {
      const chemin = element.dataset.siteHref || "";
      element.href = element.dataset.space === "admin" ? urlAdmin(chemin) : urlPublic(chemin);
    });
    slot.querySelectorAll("[data-site-src]").forEach(element => {
      element.src = urlObjet(String(element.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
  }
  async function chargerFormulaire() {
    if (window.LCDP_creerFormulaire) return;
    const script = document.createElement("script");
    script.src = urlObjet("/JSBASE/03-formulaire.js");
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(new Error("Composant formulaire indisponible."));
      document.body.appendChild(script);
    });
  }
  async function api(path, options = {}) {
    if (!endpoint()) throw new Error("Worker parc admin non configuré.");
    const response = await fetch(endpoint() + path, {
      method: options.method || "GET",
      credentials: "include", cache: "no-store",
      headers: options.body instanceof FormData ? { Accept: "application/json" } :
        { Accept: "application/json", ...(options.body ? {"Content-Type":"application/json"} : {}) },
      body: options.body instanceof FormData ? options.body :
        (options.body ? JSON.stringify(options.body) : undefined)
    });
    const result = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      window.location.replace(urlAdmin("/ESPACE-ADMIN/connexion-admin.html"));
      throw new Error("Session ADMIN à renouveler.");
    }
    if (!response.ok || result?.success !== true) {
      throw new Error(result?.message || "Opération Accès détail impossible.");
    }
    return result;
  }
  function remplacerOptions(select, liste, message, valeur) {
    select.replaceChildren();
    const vide = new Option(message, "");
    select.add(vide);
    for (const item of liste) select.add(new Option(item.label, item.value));
    select.disabled = !liste.length;
    if (valeur && liste.some(item => item.value === valeur)) select.value = valeur;
  }
  async function chargerDepartements() {
    const sel = document.getElementById("lcdp-accesdetail-departement");
    const result = await api("/accesdetail/departements");
    remplacerOptions(sel, result.departements.map(x => ({value:x,label:x})),
      "Sélectionner un département");
  }
  async function chargerParcs(departement) {
    const sel = document.getElementById("lcdp-accesdetail-parc");
    remplacerOptions(sel, [], departement ? "Chargement des parcs…" : "Choisir un département");
    if (!departement) return;
    const data = await api("/accesdetail/parcs?dptmt=" + encodeURIComponent(departement));
    remplacerOptions(sel, (data.parcs || []).map(p => ({
      value:p.idparc,
      label:p.nom + (p.statut ? " (" + p.statut + ")" : "")
    })), "Sélectionner un parc");
  }
  function nomDossier(nom) {
    return String(nom || "").trim().replace(/\s+/g, "_");
  }
  function cheminImage(parc, nomFichier) {
    return urlObjet(IMAGE_BASE + parc.dptmt + "/" + nomDossier(parc.nom) + "/" + nomFichier);
  }
  function creerBouton(label, action, secondaire = true) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (secondaire ? "lcdp-button-secondary" : "lcdp-button-primary");
    bouton.textContent = label;
    bouton.addEventListener("click", action);
    return bouton;
  }
  async function chargerEditeur(parc) {
    const slot = document.getElementById("lcdp-accesdetail-edition");
    slot.innerHTML = "";
    slot.hidden = false;
    parcCourant = parc;
    contenuOriginal = JSON.parse(JSON.stringify(parc.accesdetail || {}));
    formulaires = new Map();
    modifie = false;

    const nom = document.createElement("h2");
    nom.textContent = parc.nom + " — " + parc.dptmt;
    slot.appendChild(nom);
    slot.appendChild(creerBouton("Retour à la sélection des parcs", () => {
      if (!demanderAbandon()) return;
      fermerEdition();
    }));

    const emplacements = new Map();
    for (const rubrique of RUBRIQUES) {
      const bloc = document.createElement("section");
      bloc.id = "lcdp-accesdetail-" + rubrique.cle;
      const id = "lcdp-accesdetail-champ-" + rubrique.cle;
      bloc.className = "lcdp-accesdetail-rubrique";
      if (rubrique.optionnelle && !contenuOriginal[rubrique.cle]?.texte) bloc.hidden = true;
      slot.appendChild(bloc);
      const form = await window.LCDP_creerFormulaire(bloc, {
        id:"lcdp-accesdetail-form-" + rubrique.cle,
        titre: rubrique.titre,
        champs: [{
          name:"texte", id, label:"Texte de la rubrique",
          type:"textarea", value:contenuOriginal[rubrique.cle]?.texte || "",
          maxlength:2000,
          className:"lcdp-box-champ-formulaire--wide"
        }]
      });
      if (!form) throw new Error("Formulaire de rubrique indisponible : " + rubrique.cle);
      form.addEventListener("submit", e => e.preventDefault());
      const textarea = form.elements.namedItem("texte");
      textarea.maxLength = 2000;
      textarea.rows = rubrique.cle === "reglementparc" ? 5 : 3;
      textarea.addEventListener("input", signalerModification);
      formulaires.set(rubrique.cle, {form, textarea, bloc});
      emplacements.set(rubrique.cle, bloc);

      if (rubrique.images.length) {
        const photos = document.createElement("div");
        photos.className = "lcdp-box-formulaire__fields";
        for (const nomImage of rubrique.images) {
          const item = document.createElement("div");
          item.className = "lcdp-box-champ-formulaire";
          const texte = document.createElement("p");
          texte.textContent = "Photo : " + nomImage + " (WEBP, 15 Mo maximum)";
          item.appendChild(texte);
          const apercu = document.createElement("img");
          apercu.alt = "Aperçu de " + nomImage + " pour " + parc.nom;
          apercu.style.maxWidth = "min(100%, 420px)";
          apercu.style.maxHeight = "260px";
          apercu.style.objectFit = "contain";
          apercu.hidden = true;
          apercu.onerror = () => { apercu.hidden = true; };
          apercu.onload = () => { apercu.hidden = false; };
          apercu.src = cheminImage(parc,nomImage);
          item.appendChild(apercu);

          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".webp,image/webp";
          input.setAttribute("aria-label", "Choisir une image pour " + nomImage);
          input.className = "lcdp-box-champ-formulaire__input";
          item.appendChild(input);
          const boutonUpload = creerBouton("Importer " + nomImage, async () => {
            const fichier = input.files?.[0];
            if (!fichier) { statut("Choisissez une image WEBP pour " + nomImage, true); return; }
            if (!/\.webp$/i.test(fichier.name) ||
                (fichier.type && fichier.type !== "image/webp") ||
                fichier.size > 15*1024*1024) {
              statut("Image WEBP uniquement, 15 Mo maximum.", true);
              return;
            }
            boutonUpload.disabled = true;
            statut("Import de " + nomImage + " en cours…");
            try {
              const body = new FormData();
              body.append("idparc", parc.idparc);
              body.append("image", nomImage);
              body.append("fichier", fichier, fichier.name);
              const data = await api("/accesdetail/image",{method:"POST",body});
              apercu.src = cheminImage(parc,nomImage) + "?v=" + Date.now();
              input.value = "";
              statut("Image importée : " + data.chemin +
                (data.version_precedente ? " (ancienne version archivée)" : ""));
            } catch (e) { statut(e.message || String(e),true); }
            finally { boutonUpload.disabled = false; }
          });
          item.appendChild(boutonUpload);
          photos.appendChild(item);
        }
        form.appendChild(photos);
      }
      if (rubrique.liens) {
        const liens = document.createElement("p");
        liens.append("Liens : ");
        for (const item of [
          ["Règlement du parc", "#lcdp-accesdetail-reglementparc"],
          ["Règlement du club", urlPublic("/ESPACE-PUBLIC/reglement-club.html")],
          ["Règlement de l’application", urlPublic("/ESPACE-PUBLIC/reglement-app.html")]
        ]) {
          if (liens.childNodes.length > 1) liens.append(" · ");
          const a = document.createElement("a");
          a.href = item[1];
          a.textContent = item[0];
          if (!item[1].startsWith("#")) { a.target="_blank"; a.rel="noopener noreferrer"; }
          liens.appendChild(a);
        }
        form.appendChild(liens);
      }
    }
    for (const [cle, label] of [
      ["chemin2","Ajouter un chemin"],
      ["zonereservee2","Ajouter une zone réservée"]
    ]) {
      const zone = emplacements.get(cle);
      const bouton = creerBouton(label, () => {
        zone.hidden = false;
        bouton.hidden = true;
        zone.scrollIntoView({behavior:"smooth",block:"start"});
        zone.querySelector("textarea")?.focus();
      });
      if (!zone.hidden) bouton.hidden = true;
      zone.before(bouton);
    }

    const actions = document.createElement("div");
    actions.className = "lcdp-box-formulaire__actions";
    const enregistrer = creerBouton("Enregistrer les rubriques", async () => {
      if (!parcCourant || operation) return;
      const contenu = {};
      for (const [cle, f] of formulaires) {
        const texte = f.textarea.value.trim();
        if (texte) contenu[cle] = { texte };
      }
      if (JSON.stringify(contenu) === JSON.stringify(contenuOriginal)) {
        statut("Aucune modification à enregistrer.");
        modifie = false;
        return;
      }
      operation = true; enregistrer.disabled = true;
      statut("Enregistrement des rubriques en cours…");
      try {
        const data = await api("/accesdetail",{method:"POST",
          body:{idparc:parcCourant.idparc,original:contenuOriginal,accesdetail:contenu}});
        parcCourant = data.parc;
        contenuOriginal = JSON.parse(JSON.stringify(data.parc.accesdetail || {}));
        modifie = false;
        statut(data.modifie ? "Rubriques enregistrées dans la fiche du parc." :
          "Aucune modification à enregistrer.");
      } catch (e) { statut(e.message || String(e),true); }
      finally { operation=false; enregistrer.disabled=false; }
    }, false);
    actions.appendChild(enregistrer);
    actions.appendChild(creerBouton("Retour à la sélection", () => {
      if (demanderAbandon()) fermerEdition();
    }));
    slot.appendChild(actions);
    statut("Rubriques chargées pour " + parc.nom + ".");
  }
  function fermerEdition() {
    parcCourant = null;
    modifie = false;
    formulaires.clear();
    const editeur = document.getElementById("lcdp-accesdetail-edition");
    editeur.hidden = true;
    editeur.innerHTML = "";
    document.getElementById("lcdp-accesdetail-selection").hidden = false;
    statut("");
  }
  async function initialiserSelection() {
    const slot = document.getElementById("lcdp-accesdetail-selection");
    const form = await window.LCDP_creerFormulaire(slot, {
      id:"lcdp-accesdetail-form-selection",
      titre:"Choisir un parc",
      champs:[
        {name:"departement",id:"lcdp-accesdetail-departement",label:"Département",
          type:"select",required:true,options:[{value:"",label:"Chargement…"}]},
        {name:"parc",id:"lcdp-accesdetail-parc",label:"Parc",
          type:"select",required:true,options:[{value:"",label:"Choisir d’abord un département"}]}
      ],
      bouton:{type:"submit",label:"Ouvrir les rubriques du parc",style:"lcdp-button-primary"}
    });
    if (!form) throw new Error("Sélecteur des parcs non initialisé.");
    const departement = form.elements.namedItem("departement");
    const parc = form.elements.namedItem("parc");
    departement.disabled = true; parc.disabled = true;
    departement.addEventListener("change", async () => {
      statut("");
      try { await chargerParcs(departement.value); }
      catch (e) { statut(e.message || String(e),true); }
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!parc.value || !departement.value) { statut("Sélectionnez un parc.",true); return; }
      const bouton = form.querySelector('button[type="submit"]');
      bouton.disabled = true;
      try {
        const resultat = await api("/accesdetail?idparc=" + encodeURIComponent(parc.value));
        await chargerEditeur(resultat.parc);
        slot.hidden = true;
      } catch (e) { statut(e.message || String(e),true); }
      finally { bouton.disabled = false; }
    });
    await chargerDepartements();
  }
  async function initialiser() {
    const guard = window.LCDP_GUARD_ADMIN;
    if (!guard || typeof guard.verifierAccesPageAdmin !== "function") {
      throw new Error("Garde ADMIN non disponible.");
    }
    if (!(await guard.verifierAccesPageAdmin())) return;
    await Promise.all([
      initialiserBandeau(),
      window.LCDP_MENU_GAUCHE_ADMIN.initialiser({
        slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"parcs"
      }),
      chargerFormulaire()
    ]);
    document.getElementById("lcdp-main-admin").hidden = false;
    await initialiserSelection();
  }
  initialiser().catch(e => {
    console.error("Accès détail :",e);
    statut(e.message || String(e),true);
    document.getElementById("lcdp-main-admin").hidden = false;
  });
})();