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
  // Les listes de travail sont affichées sans recherche préalable.
  // Coordonnées lues depuis le serveur ; aucun code ni jeton dans cette page.
  function coordonnees(m) {
    const bloc=el("div");
    const tel=String(m.tel||"").trim(), email=String(m.emailmembre||"").trim();
    const numero=tel.replace(/[\s().-]/g,"");
    const pTel=el("p");
    if(/^\+?\d{6,15}$/.test(numero)){
      const a=el("a",tel);a.href="tel:"+numero;pTel.append(a);
    }else pTel.textContent=tel||"Téléphone non renseigné";
    const pMail=el("p");
    if(/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)){
      const a=el("a",email);a.href="mailto:"+encodeURIComponent(email);pMail.append(a);
    }else pMail.textContent=email||"E-mail non renseigné";
    bloc.append(pTel,pMail);
    return bloc;
  }
  function ligneInfo(parent,libelle,valeur){
    const p=el("p");p.append(el("strong",libelle+" : "),document.createTextNode(valeur||"Non renseigné"));parent.append(p);
  }
  function onglet(zone,type){
    const coda=type==="coda";
    const titreListe=coda?"CODA bloqués":"Demandes de redéfinition du CODR";
    zone.append(el("h2",titreListe));
    zone.append(el("p",coda?"Débloquez la modification du CODA après vérification de l’identité du membre. Le code lui-même ne change pas.":"Contactez le membre, vérifiez son identité et son adresse e-mail, puis autorisez l’envoi du lien sécurisé de redéfinition."));
    const rafraichir=btn("Actualiser la liste",()=>{if(!occupé)charger(0);});
    zone.append(rafraichir);
    const info=el("p");info.setAttribute("role","status");zone.append(info);
    const liste=el("div"), detail=el("section",undefined,"lcdp-box-formulaire");
    detail.hidden=true;
    zone.append(liste,detail);
    let page=0,sequence=0,terme="";
    function etatMessage(m){
      if(coda)return "Modification bloquée";
      if(m.lien_actif)return "Lien sécurisé envoyé — en attente du membre";
      if(m.demande)return "Demande à traiter";
      if(m.codr_bloque)return "CODR bloqué — sans demande";
      return "Aucune demande en cours";
    }
    function fermerFiche(){detail.replaceChildren();detail.hidden=true;}
    async function charger(p=0){
      const seq=++sequence;
      page=p;fermerFiche();rafraichir.disabled=true;
      info.textContent=terme?"Recherche : "+terme:"";
      liste.replaceChildren(el("p","Chargement de la liste…"));
      try{
        const d=await appel({type,q:terme,page:p});
        if(seq!==sequence)return;
        if(!Array.isArray(d.rows))throw Error("Réponse de liste invalide.");
        const rows=d.rows.slice().sort((a,b)=>coda?0:Number(Boolean(b.demande))-Number(Boolean(a.demande)));
        liste.replaceChildren();
        if(!coda&&!d.emailConfigure){
          const avert=el("p","Envoi du lien sécurisé indisponible : le service EMAILTOKENZ n’est pas raccordé.");avert.setAttribute("role","alert");liste.append(avert);
        }
        if(!rows.length){
          liste.append(el("p",terme?"Aucun membre trouvé.":coda?"Aucun CODA bloqué.":"Aucune demande de redéfinition ni aucun CODR bloqué."));
        }else{
          info.textContent=(terme?"Résultats pour « "+terme+" » — ":"")+rows.length+" dossier"+(rows.length>1?"s":"")+" sur cette page.";
          const cadre=el("div",undefined,"lcdp-table-lecture-admin"),scroll=el("div",undefined,"lcdp-table-lecture-admin__scroll"),table=el("table",undefined,"lcdp-table-lecture-admin__table"),thead=el("thead"),head=el("tr"),tbody=el("tbody");
          for(const t of ["Membre","Coordonnées",coda?"Blocage":"Demande / situation","Traitement"]){const th=el("th",t);th.scope="col";head.append(th);}
          thead.append(head);
          for(const m of rows){
            const tr=el("tr"),identite=el("td"),contact=el("td"),etat=el("td"),actions=el("td");
            identite.append(el("strong",nom(m)),el("p",m.idmembre));
            contact.append(coordonnees(m));
            etat.append(el("strong",etatMessage(m)));
            if(coda){
              etat.append(el("p",date(m.coda_blocage)),el("p",String(m.coda_echecs??0)+" échec(s)"));
            }else{
              if(m.demande)etat.append(el("p","Demande du "+date(m.demande_date)));
              if(m.codr_bloque)etat.append(el("p","CODR bloqué · "+date(m.codr_dernier_echec)));
            }
            actions.append(btn(coda?"Traiter le blocage":"Traiter le dossier",()=>{if(!occupé)fiche(m,d.emailConfigure);},true));
            tr.append(identite,contact,etat,actions);tbody.append(tr);
          }
          table.append(thead,tbody);scroll.append(table);cadre.append(scroll);liste.append(cadre);
        }
        if(p>0)liste.append(btn("Page précédente",()=>{if(!occupé)charger(p-1);}));
        if(d.suivante)liste.append(btn("Page suivante",()=>{if(!occupé)charger(p+1);}));
      }catch(e){
        if(seq===sequence){
          const msg=el("p",e.message,"lcdp-table-lecture-admin__status lcdp-table-lecture-admin__status--error");
          msg.setAttribute("role","alert");liste.replaceChildren(msg);
        }
      }finally{if(seq===sequence)rafraichir.disabled=false;}
    }
    function fiche(m,emailConfigure){
      detail.replaceChildren();detail.hidden=false;
      const h=el("h3",nom(m));h.tabIndex=-1;
      detail.append(h,el("p",etatMessage(m)),coordonnees(m));
      ligneInfo(detail,"Identifiant membre",m.idmembre);
      ligneInfo(detail,coda?"Date du blocage":"Date de la demande",date(coda?m.coda_blocage:m.demande_date));
      ligneInfo(detail,"Dernière validation e-mail",date(m.dateemailvalid));
      ligneInfo(detail,"Dernier selfie enregistré",date(m.selfie_date));
      ligneInfo(detail,"Dernière modification du navigateur",date(m.navigateur_date));
      ligneInfo(detail,"Récupération du compte",m.recovery);
      if(!coda&&m.emailmembre&&/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(m.emailmembre)){
        const visio=el("a","Proposer un rendez-vous en visio","lcdp-button lcdp-button-secondary");
        visio.href="mailto:"+encodeURIComponent(m.emailmembre)+"?subject="+encodeURIComponent("La Clé du Parc — rendez-vous de vérification")+"&body="+encodeURIComponent("Bonjour,\n\nJe vous propose un rendez-vous en visioconférence afin de vérifier votre identité et de traiter votre demande. Merci de m’indiquer vos disponibilités.\n\nLa Clé du Parc");
        detail.append(visio);
      }
      const retour=btn("Fermer le dossier",()=>{if(!occupé)fermerFiche();});
      if(m.recovery!=="normal"&&m.recovery!=="terminee"){
        detail.append(el("p","Compte en récupération : traitement distinct nécessaire."),retour);
        h.focus();detail.scrollIntoView({block:"nearest"});return;
      }
      detail.append(el("p","Vérifiez l’identité en visioconférence ou en présentiel. Un appel téléphonique sert à prendre contact et à confirmer l’adresse e-mail, mais ne remplace pas cette vérification."));
      const champ=el("p");
      const select=el("select",undefined,"lcdp-table-lecture-admin__filter-input");
      select.id="fix-methode-"+type;
      for(const [v,t] of [["","Choisir la méthode"],["visio","Identité vérifiée en visioconférence"],["presentiel","Identité vérifiée en présentiel"]]){
        const option=el("option",t);option.value=v;select.append(option);
      }
      const label=el("label","Vérification d’identité : ");label.htmlFor=select.id;champ.append(label,select);detail.append(champ);
      let emailConfirme=null;
      if(!coda){
        const p=el("p"),lab=el("label");
        emailConfirme=el("input");emailConfirme.type="checkbox";
        lab.append(emailConfirme,document.createTextNode(" Je confirme avec le membre l’adresse enregistrée : "+(m.emailmembre||"non renseignée")));
        p.append(lab);detail.append(p);
      }
      const statut=el("p",undefined,"lcdp-table-lecture-admin__status");statut.setAttribute("role","status");
      const action=coda?"debloquer":"redefinir";
      const possible=coda?Boolean(m.coda_blocage):Boolean(emailConfigure&&m.emailmembre&&m.dateemailvalid&&!m.lien_actif);
      const bouton=btn(coda?"Débloquer le CODA":"Envoyer le lien sécurisé CODR",agir,true);
      function etatBouton(){bouton.disabled=occupé||!possible||!select.value||(!coda&&!emailConfirme.checked);}
      select.addEventListener("change",etatBouton);
      emailConfirme?.addEventListener("change",etatBouton);
      etatBouton();
      if(!possible)detail.append(el("p",coda?"Date de blocage absente : intervention impossible.":m.lien_actif?"Un lien valide est déjà envoyé.":"Envoi indisponible : vérifier le raccordement du service et l’adresse e-mail validée."));
      async function agir(){
        if(occupé||!possible||!select.value||(!coda&&!emailConfirme.checked))return;
        occupé=true;etatBouton();retour.disabled=true;statut.textContent="";
        const methode=select.value;
        try{
          if(!await confirmer(m,action,methode))return;
          const d=await appel(null,{action,type,membre:m.idmembre,methode,identiteVerifiee:true,date:coda?m.coda_blocage:m.codr_dernier_echec,email:m.emailmembre,dateEmail:m.dateemailvalid});
          afficherStatut(d.message);
          info.textContent=d.message;
          await charger(page);
          info.textContent=d.message;
        }catch(e){statut.textContent=e.message;statut.classList.add("lcdp-table-lecture-admin__status--error");statut.setAttribute("role","alert");}
        finally{occupé=false;retour.disabled=false;etatBouton();}
      }
      detail.append(bouton,retour,statut);
      h.focus();detail.scrollIntoView({block:"nearest"});
    }
    // Recherche secondaire : conserver l’intervention spontanée prévue par le service.
    if(!coda){
      const recherche=el("details");recherche.append(el("summary","Rechercher un autre membre (sans demande préalable)"));
      const form=el("form"),label=el("label","Nom, prénom, e-mail ou identifiant"),input=el("input",undefined,"lcdp-table-lecture-admin__filter-input");
      input.id="fix-recherche-codr";label.htmlFor=input.id;input.type="search";input.maxLength=100;
      const lancer=el("button","Rechercher","lcdp-button lcdp-button-primary");lancer.type="submit";
      const tout=btn("Revenir à toutes les demandes",()=>{if(occupé)return;input.value="";terme="";recherche.open=false;charger(0);});
      form.append(label,input,lancer,tout);recherche.append(form);zone.append(recherche);
      form.addEventListener("submit",e=>{e.preventDefault();if(occupé)return;terme=input.value.trim();charger(0);});
    }
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
