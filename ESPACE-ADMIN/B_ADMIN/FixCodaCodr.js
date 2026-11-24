(() => {
  "use strict";
  function urlAdmin(path) {
    const config = window.SITE_CONFIG || {};
    return typeof config.adminUrl === "function" ? config.adminUrl(path) : path;
  }

  function urlObjet(path) {
    const config = window.SITE_CONFIG || {};
    return typeof config.objetUrl === "function" ? config.objetUrl(path) : path;
  }

  async function fragment(url, libelle) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-cache"
    });
    if (!response.ok) throw new Error(libelle + " indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }

  async function script(path) {
    const src = path.startsWith("/JSBASE/") ? urlObjet(path) : urlAdmin(path);
    const existing = [...document.scripts].find(el => el.src === src);
    if (existing) return;
    await new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.src = src;
      element.onload = resolve;
      element.onerror = () => reject(new Error("Script indisponible : " + path));
      document.body.appendChild(element);
    });
  }

  async function afficherBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    slot.replaceChildren(await fragment(
      urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), "Bandeau"));
    slot.querySelectorAll("[data-site-href]").forEach(el => {
      const cible = el.dataset.siteHref;
      if (!cible) return;
      el.href = el.dataset.space === "admin"
        ? urlAdmin(cible)
        : (window.SITE_CONFIG?.publicUrl?.(cible) || cible);
    });
    slot.querySelectorAll("[data-site-src]").forEach(el => {
      const cible = String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/");
      el.src = urlObjet(cible);
    });
  }

  async function afficherMenu() {
    const module = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!module?.initialiser) throw new Error("Menu latéral admin indisponible.");
    await module.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "admin"
    });
  }

  function afficherStatut(message, erreur = false) {
    const p = document.getElementById("lcdp-fix-codes-statut");
    p.textContent = message || "";
    p.hidden = !message;
    p.setAttribute("role", erreur ? "alert" : "status");
  }


  const api=String(window.SITE_CONFIG?.workerAdminDataUrl||window.SITE_CONFIG?.WORKER_ADMIN_DATA_URL||window.ADMIN_CONFIG?.API_ADMIN_DATA||"").replace(/\/+$/,"");
  const el=(tag,texte,classe)=>{const e=document.createElement(tag);if(texte!==undefined)e.textContent=texte;if(classe)e.className=classe;return e;};
  const btn=(texte,action,principal=false)=>{const b=el("button",texte,"lcdp-button "+(principal?"lcdp-button-primary":"lcdp-button-secondary"));b.type="button";b.addEventListener("click",action);return b;};
  const nom=m=>[m.prenommembre,m.nommembre].filter(Boolean).join(" ")||m.idmembre;
  const date=d=>d&&Number.isFinite(Date.parse(d))?new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",dateStyle:"short",timeStyle:"short"}).format(new Date(d)):"–";
  let occupé=false;
  async function appel(params,body){
    if(!api)throw Error("Service ADMIN DATA non configuré.");
    const r=await fetch(api+"/admin/fix-codes"+(params?"?"+new URLSearchParams(params):""),{method:body?"POST":"GET",credentials:"include",cache:"no-store",headers:body?{"Content-Type":"application/json",Accept:"application/json"}:{Accept:"application/json"},body:body?JSON.stringify(body):undefined});
    const d=await r.json().catch(()=>null);
    if(!r.ok||d?.success!==true)throw Error(r.status===404?"Worker ADMIN DATA à mettre à jour.":d?.message||"Service FIX CODA CODR indisponible.");
    return d;
  }
  async function confirmer(m,action,methode){
    const slot=document.getElementById("lcdp-lightbox-slot");
    slot.replaceChildren(await fragment(urlObjet("/HTMLBASE/02-dialogue-reference-choix.html"),"Confirmation"));
    const box=slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
    const titre=slot.querySelector("[data-lcdp-dialogue-titre]"),texte=slot.querySelector("[data-lcdp-dialogue-message]"),non=slot.querySelector('[data-lcdp-dialogue-action="annuler"]'),oui=slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
    if(!box||!titre||!texte||!non||!oui){slot.replaceChildren();throw Error("Confirmation indisponible.");}
    titre.textContent=action==="redefinir"?"Autoriser la redéfinition du CODR ?":"Lever le blocage ?";
    texte.textContent="Je confirme avoir vérifié l’identité de "+nom(m)+" "+(methode==="visio"?"en visioconférence":"en présentiel")+". "+(action==="redefinir"?"Le lien personnel est envoyé à "+m.emailmembre+".":"Cette action ne lève aucun autre blocage du compte.");
    non.textContent="Annuler";oui.textContent=action==="redefinir"?"Autoriser et envoyer":"Débloquer";
    const avant=document.activeElement;
    return new Promise(resolve=>{
      let fini=false;
      const fin=v=>{if(fini)return;fini=true;document.removeEventListener("keydown",clavier);slot.replaceChildren();avant?.focus();resolve(v);};
      const clavier=e=>{if(e.key==="Escape"){e.preventDefault();fin(false);}if(e.key==="Tab"){if(!e.shiftKey&&document.activeElement===oui){e.preventDefault();non.focus();}else if(e.shiftKey&&document.activeElement===non){e.preventDefault();oui.focus();}}};
      document.addEventListener("keydown",clavier);non.addEventListener("click",()=>fin(false));oui.addEventListener("click",()=>fin(true));box.addEventListener("click",e=>{if(e.target===box)fin(false);});non.focus();
    });
  }
  function onglet(zone,type){
    const coda=type==="coda";
    zone.append(el("h2",coda?"Modifications du CODA bloquées":"CODR — Blocages et demandes"));
    zone.append(el("p",coda?"Le déblocage réautorise la modification du CODA sans changer le code.":"Recherchez un membre pour lancer une redéfinition du CODR, même sans demande préalable."));
    const recherche=el("form",undefined,"lcdp-box-formulaire");
    const champ=el("div",undefined,"lcdp-box-champ-formulaire");
    const label=el("label","Rechercher un membre","lcdp-box-champ-formulaire__label");label.htmlFor="fix-recherche-"+type;
    const input=el("input",undefined,"lcdp-box-champ-formulaire__input");input.id=label.htmlFor;input.type="search";input.maxLength=100;input.placeholder="Nom, prénom, e-mail ou identifiant";
    champ.append(label,input);const lancer=el("button","Rechercher","lcdp-button lcdp-button-primary");lancer.type="submit";
    recherche.append(champ,lancer);zone.append(recherche);
    const liste=el("div"),detail=el("section");zone.append(liste,detail);
    let page=0,sequence=0,terme="";
    async function charger(p=0){
      const seq=++sequence;page=p;detail.replaceChildren();liste.replaceChildren(el("p","Chargement…"));
      try{
        const d=await appel({type,q:terme,page});if(seq!==sequence)return;
        liste.replaceChildren();
        if(!d.rows.length){liste.append(el("p",coda?"Aucune modification du CODA bloquée.":"Aucun CODR bloqué ni demande en attente pour cette recherche."));return;}
        const cadre=el("div",undefined,"lcdp-table-lecture-admin"),scroll=el("div",undefined,"lcdp-table-lecture-admin__scroll"),table=el("table",undefined,"lcdp-table-lecture-admin__table"),thead=el("thead"),head=el("tr"),tbody=el("tbody");
        for(const t of ["Membre","État","Dernier échec / blocage",...(coda?[]:["Demande"]),"Action"]){const th=el("th",t);th.scope="col";head.append(th);}thead.append(head);
        for(const m of d.rows){
          const tr=el("tr");tr.append(el("td",nom(m)),el("td",coda?"Modification bloquée":m.codr_bloque?"CODR désactivé":"CODR actif"),el("td",date(coda?m.coda_blocage:m.codr_dernier_echec)));
          if(!coda)tr.append(el("td",m.lien_actif?"Lien envoyé":m.demande?date(m.demande_date)+" · "+m.demande_statut:"–"));
          const td=el("td");td.append(btn("Consulter",()=>fiche(m,d.emailConfigure)));tr.append(td);tbody.append(tr);
        }
        table.append(thead,tbody);scroll.append(table);cadre.append(scroll);liste.append(cadre);
        if(p>0)liste.append(btn("Précédent",()=>charger(p-1)));if(d.suivante)liste.append(btn("Suivant",()=>charger(p+1)));
      }catch(e){if(seq===sequence)liste.replaceChildren(el("p",e.message));}
    }
    function fiche(m,emailConfigure){
      detail.replaceChildren();detail.append(el("h2",nom(m)));
      for(const [k,v] of [["Identifiant",m.idmembre],["E-mail actuel",m.emailmembre],["Téléphone actuel (historique non disponible)",m.tel],["Dernière validation e-mail",date(m.dateemailvalid)],["Dernier selfie biométrique",date(m.selfie_date)],["Dernière modification du navigateur",date(m.navigateur_date)],["Récupération du compte",m.recovery]]){const p=el("p");p.append(el("strong",k+" : "),document.createTextNode(v||"–"));detail.append(p);}
      if(m.recovery!=="normal"&&m.recovery!=="terminee"){detail.append(el("p","Compte en récupération : traitement distinct nécessaire."));return;}
      detail.append(el("p","Vérifiez l’identité et l’historique du membre avant toute intervention. Le numéro actuel et le selfie le plus récent ne constituent pas à eux seuls une preuve d’identité."));
      const select=el("select",undefined,"lcdp-box-champ-formulaire__input");select.id="fix-methode-"+type;for(const [v,t] of [["","Sélectionnez la méthode de vérification"],["visio","Visioconférence"],["presentiel","En présentiel"]]){const option=el("option",t);option.value=v;select.append(option);}
      const label=el("label","Identité vérifiée","lcdp-box-champ-formulaire__label");label.htmlFor=select.id;detail.append(label,select);
      async function agir(action){
        if(occupé)return;
        if(!select.value){afficherStatut("Sélectionnez la méthode de vérification d’identité.",true);return;}
        occupé=true;const methode=select.value;
        try{
          if(!await confirmer(m,action,methode))return;
          const d=await appel(null,{action,type,membre:m.idmembre,methode,identiteVerifiee:true,date:coda?m.coda_blocage:m.codr_dernier_echec,email:m.emailmembre,dateEmail:m.dateemailvalid});
          afficherStatut(d.message);await charger(page);
        }catch(e){afficherStatut(e.message,true);}finally{occupé=false;}
      }
      if(coda||m.codr_bloque)detail.append(btn("Débloquer",()=>agir("debloquer"),true));
      if(!coda){const b=btn("Autoriser la redéfinition du CODR",()=>agir("redefinir"),true);b.disabled=!emailConfigure||!m.emailmembre||!m.dateemailvalid;detail.append(b);if(!emailConfigure)detail.append(el("p","Envoi indisponible : Worker EMAILTOKENZ à raccorder."));}
    }
    recherche.addEventListener("submit",e=>{e.preventDefault();terme=input.value.trim();charger();});
    return charger();
  }
  async function initialiser(){
    const guard=window.LCDP_GUARD_ADMIN;if(!guard?.verifierAccesPageAdmin||!await guard.verifierAccesPageAdmin())return;
    document.getElementById("lcdp-main-admin").hidden=false;
    await Promise.all([afficherBandeau(),afficherMenu(),script("/JSBASE/05-wraper-onglets.js")]);
    const onglets=window.LCDP_WRAPER_ONGLETS.initialiser({racine:document.querySelector("[data-lcdp-wraper-onglets]"),idPrefix:"lcdp-fix-codes",ariaLabel:"Codes de sécurité",onglets:[{key:"coda",label:"CODA"},{key:"codr",label:"CODR"}]});
    await Promise.all([onglet(onglets.zones.coda,"coda"),onglet(onglets.zones.codr,"codr")]);
  }
  initialiser().catch(e=>{afficherStatut(e.message||"Module indisponible.",true);});
})();
