(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const CHEMIN_ROUTE =
    "/ESPACE-ADMIN/B_ADMIN/reglement-club-admin.html";

  let controleurEditeur = null;
  let documentCharge = null;
  let modificationsLocales = false;
  let requeteEnCours = false;
  const DELAI_AUTO = 900, INTERVALLE_AUTO = 4000;
  let revisionLocale = 0, sauvegardeEnCours = null, minuteurAuto = null;
  let conflitVersion = false, prochaineTentative = 0;
  let versionnementDisponible = false, chargementVersions = null;
  let planificationDisponible = false;

  function annulerMinuteur() {
    if (minuteurAuto !== null) { clearTimeout(minuteurAuto); minuteurAuto = null; }
  }
  function planifierSauvegarde() {
    annulerMinuteur();
    if (!modificationsLocales || conflitVersion) return;
    minuteurAuto = setTimeout(() => { minuteurAuto = null; void tenterSauvegardeAuto(); }, DELAI_AUTO);
  }
  function tenterSauvegardeAuto(force = false) {
    if (!modificationsLocales || requeteEnCours || sauvegardeEnCours || conflitVersion ||
        (!force && Date.now() < prochaineTentative)) return;
    return sauvegarderUneFois();
  }


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

  function chargerScriptAdminUneFois(path) {
    if (
      document.querySelector(
        `script[data-lcdp-script-admin="${path}"]`
      )
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = urlAdmin(path);
      script.defer = true;
      script.dataset.lcdpScriptAdmin = path;
      script.onload = resolve;
      script.onerror = () => reject(
        new Error("Script ADMIN introuvable : " + path)
      );
      document.body.appendChild(script);
    });
  }

  function chargerScriptObjetUneFois(path) {
    if (
      document.querySelector(
        `script[data-lcdp-script-objet="${path}"]`
      )
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = urlObjet(path);
      script.defer = true;
      script.dataset.lcdpScriptObjet = path;
      script.onload = resolve;
      script.onerror = () => reject(
        new Error("Script OBJET introuvable : " + path)
      );
      document.body.appendChild(script);
    });
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
      if (!modificationsLocales && !sauvegardeEnCours) redirigerConnexion();
      const erreur = new Error("Session administrateur expirée.");
      erreur.status = 401;
      throw erreur;
    }

    if (response.status === 403) {
      throw new Error(
        data?.message ||
        "Permission administrateur insuffisante."
      );
    }

    if (!response.ok || !data || data.success !== true) {
      const erreur = new Error(
        data?.message ||
        data?.detail ||
        "Réponse du worker editing-admin inexploitable."
      );
      erreur.status = response.status;
      throw erreur;
    }

    return data;
  }

  async function chargerDocument() {
    return appelerJson("/admin/reglement-club");
  }

  async function initialiserEditeur(data) {
    const slot = document.querySelector(
      "[data-lcdp-reglement-club-editeur-slot]"
    );

    if (!slot) {
      throw new Error("Slot de l’éditeur introuvable.");
    }

    slot.innerHTML = "";

    const fragment = await chargerFragmentAdmin(
      "/ESPACE-ADMIN/A_STRUCTURE/box-editeur-contenu.html"
    );

    slot.appendChild(fragment);

    await chargerScriptAdminUneFois(
      "/ESPACE-ADMIN/A_STRUCTURE/box-editeur-contenu.js?v=20261119-editeur-listes"
    );

    const moduleEditeur = window.LCDP_EDITEUR_CONTENU;
    const racine = slot.querySelector(
      "[data-lcdp-editeur-contenu]"
    );

    if (
      !moduleEditeur ||
      typeof moduleEditeur.initialiser !== "function" ||
      !racine
    ) {
      throw new Error("Objet éditeur de contenu indisponible.");
    }

    const blocsInitiaux =
      Array.isArray(data?.brouillon?.blocs) &&
      data.brouillon.blocs.length > 0
        ? data.brouillon.blocs
        : [
            {
              id: "bloc-1",
              titre: "",
              html: "<p><br></p>"
            }
          ];

    controleurEditeur = moduleEditeur.initialiser({
      root: racine,
      blocs: blocsInitiaux,
      brouillon: { code: "reglement-club", version: data.version, sauvegardeAuto: true },
      onChange: signalerModificationLocale
    });

    const barreVersion = document.createElement("div");
    barreVersion.className = "lcdp-editeur-contenu__entete";
    const espace = document.createElement("p");
    espace.className = "lcdp-editeur-contenu__aide";
    espace.setAttribute("aria-hidden","true");
    const boutonVersion = document.createElement("button");
    boutonVersion.type = "button";
    boutonVersion.className = "lcdp-button lcdp-button-orange";
    boutonVersion.setAttribute("data-cgv-creer-version","");
    boutonVersion.textContent = "Créer une version";
    boutonVersion.disabled = true;
    barreVersion.append(espace,boutonVersion);
    racine.prepend(barreVersion);
    slot.hidden = false;
  }

  function signalerModificationLocale(sauvegardeLocale) {
    modificationsLocales = true;
    revisionLocale++;
    afficherStatus(
      conflitVersion ? "Conflit de version : la copie locale reste conservée, recharge la page pour réconcilier les versions."
        : sauvegardeLocale ? "Modifications en cours — sauvegarde automatique…"
          : "Copie locale indisponible. Sauvegarde en base en attente.",
      conflitVersion || !sauvegardeLocale ? "error" : "dirty"
    );
    planifierSauvegarde();
  }

  function afficherEtatBrouillonLocal() {
    if (controleurEditeur?.brouillonRestaure) {
      signalerModificationLocale(controleurEditeur.sauvegarderBrouillon());
      afficherStatus("Brouillon local restauré — sauvegarde automatique en attente.", "dirty");
    } else if (!controleurEditeur?.protectionDisponible()) {
      afficherStatus("Stockage de secours local indisponible.", "error");
    } else {
      afficherStatus("Sauvegarde automatique active.", "ready");
    }
  }

  function lireDocumentLocal() {
    if (!controleurEditeur) {
      throw new Error("Éditeur non initialisé.");
    }

    if (!controleurEditeur.valider()) {
      throw new Error(
        "Complète le titre et le contenu de chaque section."
      );
    }

    return {
      titre: "Règlement club",
      blocs: controleurEditeur.lire()
    };
  }

  function afficherStatus(message, etat = "") {
    const status = document.querySelector(
      "[data-lcdp-reglement-club-status]"
    );

    if (!status) return;

    const suivi = document.querySelector("[data-faq-suivi]");
    if (suivi) {
      suivi.hidden = !message;
      suivi.dataset.state = etat;
    }
    if (status.textContent !== (message || "")) status.textContent = message || "";
    status.dataset.state = etat;
  }

  function actualiserMeta() {
    const meta = document.querySelector(
      "[data-lcdp-reglement-club-meta]"
    );

    if (!meta || !documentCharge) return;

    const morceaux = [];

    if (documentCharge.datemaj) {
      morceaux.push(
        "Brouillon enregistré : " +
        formaterDateHeure(documentCharge.datemaj)
      );
    }

    meta.textContent = morceaux.join(" — ");
    afficherHeureSauvegarde(documentCharge.datemaj);
  }

  function afficherHeureSauvegarde(value) {
    const cible = document.querySelector("[data-faq-suivi-heure]");
    if (!cible) return;
    const date = value ? new Date(value) : null;
    const texte = date && !Number.isNaN(date.getTime())
      ? "Dernière sauvegarde en base : " + new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris", day: "2-digit", month: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
        }).format(date)
      : "Aucun horaire de sauvegarde confirmé.";
    if (cible.textContent !== texte) cible.textContent = texte;
  }

  function verrouillerActions(verrouiller) {
    requeteEnCours = verrouiller === true;

    document
      .querySelectorAll(
        "[data-lcdp-reglement-club-actions] button"
      )
      .forEach((bouton) => {
        bouton.disabled = requeteEnCours;
      });
    const editeur = document.querySelector("[data-lcdp-reglement-club-editeur-slot]");
    if (editeur) editeur.inert = requeteEnCours;
    document.querySelectorAll("[data-cgv-onglet]").forEach(b => b.disabled = requeteEnCours);
    const panneau = document.getElementById("lcdp-cgv-versions");
    if (panneau) panneau.inert = requeteEnCours;
    const creer = document.querySelector("[data-cgv-creer-version]");
    if (creer) creer.disabled = requeteEnCours || !versionnementDisponible || !planificationDisponible;
  }

  function sauvegarderUneFois() {
    if (sauvegardeEnCours) return sauvegardeEnCours;
    if (!modificationsLocales) return Promise.resolve(true);
    if (conflitVersion || !documentCharge || !controleurEditeur) return Promise.resolve(false);
    annulerMinuteur();
    const version = Number(documentCharge.version), revision = revisionLocale;
    const travail = (async () => {
      try {
        if (!Number.isFinite(version)) throw new Error("Version du brouillon inconnue.");
        const blocs = controleurEditeur.lireBrouillon();
        afficherStatus("Sauvegarde automatique en base…", "dirty");
        const data = await appelerJson("/admin/reglement-club/brouillon", {
          method: "POST", body: { version, titre: "Règlement club", blocs }
        });
        if (Number(data.version) !== version + 1 || !Array.isArray(data.brouillon?.blocs) ||
            JSON.stringify(data.brouillon.blocs.map(b => b.id)) !== JSON.stringify(blocs.map(b => b.id))) {
          throw new Error("Le Worker ne confirme pas la totalité du brouillon.");
        }
        documentCharge = data;
        modificationsLocales = revisionLocale !== revision;
        const secours = controleurEditeur.confirmerBrouillon(data.version, modificationsLocales);
        prochaineTentative = 0;
        actualiserMeta();
        afficherStatus(modificationsLocales
          ? secours ? "Sauvegarde effectuée — nouvelles modifications en attente…" : "Sauvegarde effectuée — copie locale indisponible."
          : "Sauvegarde automatique effectuée.", modificationsLocales ? secours ? "dirty" : "error" : "saved");
        return true;
      } catch (error) {
        conflitVersion = error?.status === 409;
        prochaineTentative = Date.now() + 5000;
        const secours = controleurEditeur?.sauvegarderBrouillon();
        afficherStatus("Sauvegarde en base non confirmée : " + String(error?.message || error) +
          (secours ? " Copie locale conservée." : " ATTENTION : copie locale indisponible."), "error");
        return false;
      }
    })();
    sauvegardeEnCours = travail.finally(() => {
      sauvegardeEnCours = null;
      if (modificationsLocales && !conflitVersion) planifierSauvegarde();
    });
    return sauvegardeEnCours;
  }

  async function synchroniserBrouillon() {
    annulerMinuteur();
    if (sauvegardeEnCours && !await sauvegardeEnCours) return false;
    while (modificationsLocales) {
      if (!await sauvegarderUneFois()) return false;
    }
    return true;
  }

  const cgvBase = "/admin/reglement-club/versions";
  const parCgv = s => document.querySelector(s);
  const dateCgv = value => new Intl.DateTimeFormat("fr-FR", {timeZone:"Europe/Paris",dateStyle:"long"}).format(new Date(value));
  function elementCgv(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }
  function boutonCgv(texte, action, primaire=false) {
    const b=elementCgv("button","lcdp-button "+(primaire?"lcdp-button-primary":"lcdp-button-secondary")+" lcdp-editeur-contenu__petit-bouton",texte);
    b.type="button"; b.addEventListener("click",action); return b;
  }
  function montrerOngletCgv(onglet) {
    document.getElementById("lcdp-cgv-redaction").hidden=onglet!=="redaction";
    document.getElementById("lcdp-cgv-versions").hidden=onglet!=="versions";
    document.querySelectorAll("[data-cgv-onglet]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.cgvOnglet===onglet)));
    if(onglet==="versions")void actualiserVersionsCgv();
  }
  function rendreDisponibiliteCgv(disponible, message="") {
    versionnementDisponible=disponible;
    const b=parCgv("[data-cgv-creer-version]");
    if(b)b.disabled=!disponible||requeteEnCours||!planificationDisponible;
    const m=parCgv("[data-cgv-disponibilite]");
    if(m)m.textContent=message;
  }
  async function consulterVersionCgv(id) {
    const d=await appelerJson(cgvBase+"/"+encodeURIComponent(id));
    const v=d.version, contenu=parCgv("[data-cgv-archive-contenu]");
    if(!v||!Array.isArray(v.contenu?.blocs))throw new Error("Archive officielle inexploitable.");
    contenu.replaceChildren();
    for(const bloc of v.contenu.blocs){
      const box=elementCgv("section","lcdp-component lcdp-boxtext");
      const titre=elementCgv("h2","lcdp-boxtext__title",bloc.titre);
      const texte=elementCgv("div","lcdp-boxtext__content");
      texte.innerHTML=nettoyerHtmlPourApercu(bloc.html);
      box.append(titre,texte); contenu.append(box);
    }
    appliquerRoutes(contenu);
    parCgv("[data-cgv-archive-titre]").textContent=v.nom+" — "+dateCgv(v.datecreation);
    const panneau=parCgv("[data-cgv-archive]");panneau.hidden=false;
    panneau.scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function telechargerVersionCgv(id) {
    const r=await fetch(endpointEditingAdmin()+cgvBase+"/"+encodeURIComponent(id)+"/pdf",{credentials:"include",cache:"no-store",headers:{Accept:"application/pdf"}});
    if(!r.ok||!String(r.headers.get("Content-Type")).includes("application/pdf"))throw new Error("PDF officiel indisponible.");
    const url=URL.createObjectURL(await r.blob());
    const lien=elementCgv("a"); lien.href=url;lien.download="reglement-club-"+id+".pdf";
    document.body.append(lien);lien.click();lien.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function operationCgv(action) {
    if(requeteEnCours)return;
    verrouillerActions(true);
    try { await action(); }
    catch(error){const m=String(error?.message||error); afficherStatus(m,"error");parCgv("[data-cgv-versions-etat]").textContent=m;}
    finally{verrouillerActions(false);}
  }
  function afficherListeCgv(data) {
    const liste=parCgv("[data-cgv-versions-liste]");
    liste.replaceChildren();
    const etat=parCgv("[data-cgv-versions-etat]");
    // Le Worker doit confirmer le nouveau contrat : jamais d’activation immédiate via une ancienne API.
    planificationDisponible = data.planificationReglements === true && Array.isArray(data.applicables);
    const applicables = new Set(planificationDisponible ? data.applicables : [data.applicable].filter(Boolean));
    const aujourdhui = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const dateValide = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v.dateapplication || ""));
    const enVigueur = data.versions.filter(v=>applicables.has(v.id)&&dateValide(v)&&v.dateapplication<=aujourdhui);
    const futures = data.versions.filter(v=>applicables.has(v.id)&&dateValide(v)&&v.dateapplication>aujourdhui);
    if (planificationDisponible && (enVigueur.length>1 || futures.length>1 || applicables.size>2 ||
        enVigueur.length+futures.length!==applicables.size)) {
      planificationDisponible=false;
    }
    etat.textContent=!planificationDisponible
      ?"Planification des règlements indisponible : mise à jour du Worker editing-admin nécessaire. Les archives restent consultables."
      :data.versions.length?"Une version en vigueur et une version future au maximum.":"Aucune version officielle créée.";
    if(!data.versions.length)return;
    const tableWrap=elementCgv("div","lcdp-table-lecture-admin");
    const scroll=elementCgv("div","lcdp-table-lecture-admin__scroll");
    const tableau=elementCgv("table","lcdp-table-lecture-admin__table");
    tableau.setAttribute("aria-label","Versions officielles du règlement");
    const thead=elementCgv("thead"),entete=elementCgv("tr"),tbody=elementCgv("tbody");
    for(const titre of ["Version","Création","Date de mise en application","En application","Actions"]){
      const th=elementCgv("th","",titre);th.scope="col";entete.append(th);
    }
    thead.append(entete);tableau.append(thead,tbody);scroll.append(tableau);tableWrap.append(scroll);liste.append(tableWrap);
    for(const v of data.versions){
      const card=elementCgv("tr");
      const actif=applicables.has(v.id);
      const future=dateValide(v)&&v.dateapplication>aujourdhui;
      const statut=actif?(future?" — Version future":" — Version en vigueur"):"";
      const creation=elementCgv("td","",dateCgv(v.datecreation));
      const dateLabel=elementCgv("label","lcdp-editeur-contenu__titre-zone");
      dateLabel.setAttribute("aria-label","Date de mise en application de "+v.nom);
      const dateInput=elementCgv("input","lcdp-editeur-contenu__titre");
      dateInput.type="date";dateInput.value=dateValide(v)?v.dateapplication:"";dateInput.readOnly=true;
      dateLabel.append(dateInput);
      const cocheLabel=elementCgv("label","lcdp-editeur-contenu__aide");
      const coche=elementCgv("input");coche.type="checkbox";coche.checked=actif;
      coche.disabled=!planificationDisponible||!dateValide(v)||actif&&!future||!actif&&v.dateapplication<aujourdhui||!actif&&future&&futures.length>0||!actif&&!future&&enVigueur.length>0;
      coche.setAttribute("aria-label","En application : "+v.nom);
      cocheLabel.append(coche);
      coche.addEventListener("change",()=>{
        const selection=coche.checked;coche.checked=actif;
        void operationCgv(async()=>{
          const titre=selection?"Mettre cette version en application ?":"Retirer la version future ?";
          const message=selection?"La date de mise en application est le "+dateCgv(v.dateapplication+"T12:00:00Z")+". Les membres reçoivent une demande d’accord.":"Les demandes d’accord de cette version future ne sont plus exigibles.";
          if(!await demanderConfirmationVersion(titre,message))return;
          const resultat=await appelerJson(cgvBase+"/"+encodeURIComponent(v.id)+"/activer",{method:"POST",body:{applicable:selection,dateapplication:v.dateapplication}});
          if(resultat.planificationReglements!==true)throw new Error("Planification non confirmée par le serveur.");
          await actualiserVersionsCgv();
        });
      });
      const label=elementCgv("label","lcdp-editeur-contenu__titre-zone");
      label.setAttribute("aria-label","Nom de la version");
      const input=elementCgv("input","lcdp-editeur-contenu__titre");input.type="text";input.maxLength=160;input.value=v.nom;label.append(input);
      const actions=elementCgv("div","lcdp-editeur-contenu__ordre");
      actions.append(
        boutonCgv("Renommer",()=>operationCgv(async()=>{const nom=input.value.trim();if(!nom)throw new Error("Nom de version obligatoire.");await appelerJson(cgvBase+"/"+v.id+"/renommer",{method:"POST",body:{nom}});await actualiserVersionsCgv();})),
        boutonCgv("Consulter",()=>operationCgv(()=>consulterVersionCgv(v.id))),
        boutonCgv("PDF",()=>operationCgv(()=>telechargerVersionCgv(v.id)))
      );
      const nomCell=elementCgv("td"),dateCell=elementCgv("td"),cocheCell=elementCgv("td"),actionsCell=elementCgv("td");
      nomCell.append(label);
      if(statut)nomCell.append(elementCgv("p","lcdp-editeur-contenu__aide",statut.slice(3)));
      dateCell.append(dateLabel);cocheCell.append(cocheLabel);actionsCell.append(actions);
      card.append(nomCell,creation,dateCell,cocheCell,actionsCell);tbody.append(card);
    }
  }
  function actualiserVersionsCgv() {
    if(chargementVersions)return chargementVersions;
    const travail=(async()=>{
      try{
        let data=await appelerJson(cgvBase);
        if(data.initialisationNecessaire){
          // Reprendre à l'identique l'ancienne publication, pas le brouillon courant.
          await appelerJson(cgvBase+"/initialiser",{method:"POST",body:{}});
          data=await appelerJson(cgvBase);
        }
        if(!Array.isArray(data.versions))throw new Error("Inventaire des versions inexploitable.");
        afficherListeCgv(data);rendreDisponibiliteCgv(true,planificationDisponible?"":"La date de mise en application nécessite le Worker actualisé.");
        return true;
      }catch(e){
        const msg=e?.status===404?"Versionnement indisponible : mise à jour du Worker editing-admin nécessaire.":String(e?.message||e);
        rendreDisponibiliteCgv(false,msg);
        parCgv("[data-cgv-versions-etat]").textContent=msg;
        parCgv("[data-cgv-versions-liste]").replaceChildren();
        return false;
      }
    })();
    chargementVersions=travail.finally(()=>{chargementVersions=null;});
    return chargementVersions;
  }
  async function creerVersionCgv() {
    if(requeteEnCours||!documentCharge||!versionnementDisponible||!planificationDisponible)return;
    verrouillerActions(true);
    try{
      lireDocumentLocal();
      const dateapplication=await demanderConfirmationVersion("Créer une version de ce document ?","Choisissez la date de mise en application. La version ne devient pas automatiquement applicable.",{dateApplication:true});
      if(!dateapplication)return;
      if(!await synchroniserBrouillon())return;
      const d=await appelerJson(cgvBase,{method:"POST",body:{version:documentCharge.version,dateapplication}});
      if(d.dateapplication!==dateapplication)throw new Error("Date de mise en application non confirmée par le serveur.");
      if(!d.id)throw new Error("Création de la version non confirmée.");
      await actualiserVersionsCgv();
      afficherStatus("Version officielle créée.","saved");
      await afficherAlerte("Version officielle créée.");
    }catch(error){afficherStatus(String(error?.message||error),"error");await afficherAlerte(String(error?.message||error));}
    finally{verrouillerActions(false);}
  }

  async function previsualiser() {
    try {
      if (!controleurEditeur) throw new Error("Éditeur non initialisé.");
      if (!window.LCDP_APERCU_DOCUMENT_LEGAL?.ouvrir) throw new Error("Module de prévisualisation indisponible.");
      // Prévisualiser la rédaction actuelle, y compris les sections incomplètes.
      await window.LCDP_APERCU_DOCUMENT_LEGAL.ouvrir("reglement-club", {
        blocs: controleurEditeur.lireBrouillon()
      });
    } catch (error) {
      afficherStatus(String(error?.message || error || ""), "error");
    }
  }

  function nettoyerHtmlPourApercu(value) {
    const moduleEditeur = window.LCDP_EDITEUR_CONTENU;

    return typeof moduleEditeur?.nettoyerHtml === "function"
      ? moduleEditeur.nettoyerHtml(value)
      : "";
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
      "/HTMLBASE/02-alerte.html"
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

  async function demanderConfirmationVersion(titre, message, options = {}) {
    if (true) {
      const slotChoix = document.getElementById('lcdp-lightbox-slot');
      if (!slotChoix) return false;
      const hrefCss = typeof window.LCDP_urlObjet === 'function'
        ? window.LCDP_urlObjet('/CSSBASE/lcdp-lightbox-convergence.css')
        : null;
      if (!hrefCss) return false;
      if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href === hrefCss)) {
        await new Promise((resolve, reject) => {
          const lien = document.createElement('link');
          lien.rel = 'stylesheet';
          lien.href = hrefCss;
          lien.onload = resolve;
          lien.onerror = () => { lien.remove(); reject(new Error('CSS CHOIX indisponible.')); };
          document.head.appendChild(lien);
        });
      }
      slotChoix.replaceChildren();
      try {
        slotChoix.appendChild(await chargerFragmentObjet('/HTMLBASE/02-dialogue-reference-choix.html'));
        const dialogue = slotChoix.querySelector('[data-lcdp-dialogue-reference="choix"]');
        const heading = slotChoix.querySelector('[data-lcdp-dialogue-titre]');
        const texte = slotChoix.querySelector('[data-lcdp-dialogue-message]');
        const non = slotChoix.querySelector('[data-lcdp-dialogue-action="annuler"]');
        const oui = slotChoix.querySelector('[data-lcdp-dialogue-action="confirmer"]');
        if (!dialogue || !heading || !texte || !non || !oui) throw new Error('Structure CHOIX incomplète.');
        heading.textContent = titre;
        texte.textContent = message;
        non.textContent = 'Non';
        oui.textContent = options.dateApplication ? 'Créer' : 'Oui';
        let champDate=null;
        if(options.dateApplication){
          const label=elementCgv("label","lcdp-editeur-contenu__titre-zone");
          label.append(elementCgv("span","lcdp-editeur-contenu__label","Date de mise en application"));
          champDate=elementCgv("input","lcdp-editeur-contenu__titre");
          champDate.type="date";champDate.required=true;
          champDate.min=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
          label.append(champDate);texte.after(label);oui.disabled=true;
          champDate.addEventListener("input",()=>{oui.disabled=!champDate.value||!champDate.validity.valid;});
        }
        return await new Promise(resolve => {
          let termine = false;
          function fermer(valeur) {
            if (termine) return;
            termine = true;
            document.removeEventListener('keydown', onEscape);
            slotChoix.replaceChildren();
            resolve(valeur);
          }
          function onEscape(e) { if(e.key === 'Escape') {e.preventDefault(); fermer(false);} }
          document.addEventListener('keydown', onEscape);
          non.addEventListener('click', () => fermer(false), {once:true});
          oui.addEventListener('click', () => {
            if(champDate && (!champDate.value || !champDate.reportValidity()))return;
            fermer(champDate ? champDate.value : true);
          });
          dialogue.addEventListener('click', e => {if(e.target===dialogue)fermer(false);});
          (champDate || non).focus();
        });
      } catch (error) {
        slotChoix.replaceChildren();
        throw error;
      }
    }

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

    return guard.verifierAccesPageAdmin();
  }

  function installerSauvegardeAuto() {
    setInterval(() => { void tenterSauvegardeAuto(); }, INTERVALLE_AUTO);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && modificationsLocales) {
        controleurEditeur?.sauvegarderBrouillon();
        void tenterSauvegardeAuto(true);
      }
    });
    window.addEventListener("online", () => {
      prochaineTentative = 0;
      void tenterSauvegardeAuto(true);
    });
    window.addEventListener("pagehide", () => {
      if (modificationsLocales) controleurEditeur?.sauvegarderBrouillon();
    });
    document.addEventListener("click", async event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
          event.metaKey || event.shiftKey || event.altKey) return;
      const lien = event.target.closest?.("a[href]");
      if (!lien || (lien.target && lien.target !== "_self") || lien.hasAttribute("download")) return;
      if (lien.closest("[data-lcdp-mentions-editeur-slot], [data-lcdp-reglement-club-editeur-slot], [data-lcdp-reglement-app-editeur-slot]")) return;
      let url;
      try { url = new URL(lien.href, window.location.href); } catch (_) { return; }
      if (!["http:", "https:"].includes(url.protocol) ||
          (url.origin === location.origin && url.pathname === location.pathname &&
           url.search === location.search && url.hash)) return;
      if (!modificationsLocales && !sauvegardeEnCours && !requeteEnCours) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (requeteEnCours) return;
      verrouillerActions(true);
      try {
        if (await synchroniserBrouillon()) window.location.assign(url.href);
      } catch (error) {
        afficherStatus(String(error?.message || error), "error");
      } finally {
        verrouillerActions(false);
      }
    }, true);
  }

  async function initialiserPage() {
    const autorise = await verifierAcces();

    if (!autorise) return;

    const [data] = await Promise.all([
      chargerDocument(),
      initialiserBandeau(),
      initialiserMenuGauche()
    ]);

    documentCharge = data;
    await initialiserEditeur(data);

    const loading = document.querySelector(
      "[data-lcdp-reglement-club-loading]"
    );
    const actions = document.querySelector(
      "[data-lcdp-reglement-club-actions]"
    );

    loading.hidden = true;
    actions.hidden = false;

    document
      .querySelector("[data-lcdp-reglement-club-previsualiser]")
      ?.addEventListener("click", previsualiser);

    document.querySelector("[data-cgv-creer-version]")?.addEventListener("click", creerVersionCgv);
    document.querySelectorAll("[data-cgv-onglet]").forEach(b=>b.addEventListener("click",()=>montrerOngletCgv(b.dataset.cgvOnglet)));
    void actualiserVersionsCgv();

    actualiserMeta();
    afficherEtatBrouillonLocal();
    installerSauvegardeAuto();
    document.getElementById("lcdp-main-admin").hidden = false;
  }

  window.addEventListener("beforeunload", (event) => {
    if (!modificationsLocales && !sauvegardeEnCours) return;
    if (modificationsLocales) controleurEditeur?.sauvegarderBrouillon();
    event.preventDefault();
    event.returnValue = "";
  });

  initialiserPage().catch(async (error) => {
    console.error(error);

    const loading = document.querySelector(
      "[data-lcdp-reglement-club-loading]"
    );

    if (loading) {
      loading.textContent = String(
        error?.message ||
        error ||
        "Impossible d’initialiser l’éditeur."
      );
    }

    const main = document.getElementById("lcdp-main-admin");

    if (main) {
      main.hidden = false;
    }
  });
})();
