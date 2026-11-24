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
  const valeur=v=>String(v??"");
  const normaliser=v=>valeur(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr");
  function contact(v,type){
    const texte=valeur(v).trim(), numero=texte.replace(/[\s().-]/g,"");
    const a=el("a",texte);
    if(type==="tel"&&/^\+?\d{6,15}$/.test(numero))a.href="tel:"+numero;
    else if(type==="mail"&&/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(texte))a.href="mailto:"+encodeURIComponent(texte);
    else return document.createTextNode(texte||"—");
    return a;
  }
  async function dialogue(titreTexte,contenu,libelle,validation){
    const slot=document.getElementById("lcdp-lightbox-slot");
    slot.replaceChildren(await fragment(urlObjet("/HTMLBASE/02-dialogue-reference-choix.html"),"Dialogue"));
    const box=slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
    const titre=slot.querySelector("[data-lcdp-dialogue-titre]"),texte=slot.querySelector("[data-lcdp-dialogue-message]"),non=slot.querySelector('[data-lcdp-dialogue-action="annuler"]'),oui=slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
    if(!box||!titre||!texte||!non||!oui){slot.replaceChildren();throw Error("Dialogue indisponible.");}
    titre.textContent=titreTexte;
    texte.textContent="";
    const corps=el("div");texte.after(corps);corps.append(contenu);
    non.textContent=validation?"Annuler":"Fermer";
    oui.textContent=libelle||"Confirmer";
    if(!validation)oui.remove();
    const avant=document.activeElement;
    return new Promise(resolve=>{
      let fini=false;
      const fin=v=>{if(fini)return;fini=true;document.removeEventListener("keydown",clavier);slot.replaceChildren();avant?.focus();resolve(v);};
      const clavier=e=>{
        if(e.key==="Escape"){e.preventDefault();fin(null);}
        if(e.key==="Tab"){
          const focus=[...box.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]")].filter(x=>x.getClientRects().length);
          const premier=focus[0],dernier=focus.at(-1);
          if(!e.shiftKey&&document.activeElement===dernier){e.preventDefault();premier?.focus();}
          else if(e.shiftKey&&document.activeElement===premier){e.preventDefault();dernier?.focus();}
        }
      };
      document.addEventListener("keydown",clavier);
      non.addEventListener("click",()=>fin(null));
      oui.addEventListener("click",()=>{if(validation){const v=validation();if(v)fin(v);}});
      box.addEventListener("click",e=>{if(e.target===box)fin(null);});
      non.focus();
    });
  }
  async function confirmer(m,coda){
    const corps=el("div");
    corps.append(el("p",nom(m)));
    const p=el("p");p.append(document.createTextNode("Téléphone : "),contact(m.tel,"tel"));corps.append(p);
    const pMail=el("p");pMail.append(document.createTextNode("E-mail : "),contact(m.emailmembre,"mail"));corps.append(pMail);
    if(!coda){
      const visio=el("a","Proposer un rendez-vous en visio");
      if(/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(valeur(m.emailmembre))){
        visio.href="mailto:"+encodeURIComponent(m.emailmembre)+"?subject="+encodeURIComponent("La Clé du Parc — rendez-vous en visio")+"&body="+encodeURIComponent("Bonjour,\n\nMerci de m’indiquer vos disponibilités pour un rendez-vous en visioconférence afin de traiter votre demande.\n\nLa Clé du Parc");
        corps.append(visio);
      }
    }
    const lab=el("label","Identité vérifiée : ");const methode=el("select",undefined,"lcdp-table-lecture-admin__filter-input");
    for(const [v,t] of [["","Choisir la méthode"],["visio","En visioconférence"],["presentiel","En présentiel"]]){const o=el("option",t);o.value=v;methode.append(o);}
    lab.append(methode);corps.append(lab);
    const check=el("input");check.type="checkbox";
    if(!coda){const l=el("label");l.append(check,document.createTextNode(" Je confirme avec le membre son adresse e-mail enregistrée."));const p=el("p");p.append(l);corps.append(p);}
    const msg=el("p");msg.setAttribute("role","alert");corps.append(msg);
    return dialogue(coda?"Débloquer CODA":"Mail CODR",corps,coda?"Débloquer CODA":"Envoyer le lien sécurisé",()=>{
      if(!methode.value){msg.textContent="Sélectionnez la méthode de vérification d’identité.";return null;}
      if(!coda&&!check.checked){msg.textContent="Confirmez l’adresse e-mail avec le membre.";return null;}
      return methode.value;
    });
  }
  function onglet(zone,type){
    const coda=type==="coda";
    const actualiser=btn("Actualiser",()=>{if(!occupé)charger();});
    actualiser.classList.add("lcdp-button-mini");
    zone.append(actualiser);
    const cadre=el("div",undefined,"lcdp-table-lecture-admin");
    const scroll=el("div",undefined,"lcdp-table-lecture-admin__scroll");
    const table=el("table",undefined,"lcdp-table-lecture-admin__table");
    const thead=el("thead"),head=el("tr"),filtres=el("tr",undefined,"lcdp-table-lecture-admin__filters"),body=el("tbody");
    const colonnes=[
      {key:"nommembre",label:"Nom",tri:true},
      {key:"prenommembre",label:"Prénom",tri:true},
      {key:"selfie",label:"Selfie"},
      {key:"tel",label:"Tél.",tri:true},
      {key:"emailmembre",label:"E-mail",tri:true},
      {key:"date",label:"Date",tri:true},
      {key:"action",label:"Action"},
      {key:"historique",label:"Historique"}
    ];
    let rows=[],page=0,sortKey="nommembre",direction=1,emailConfigure=false,chargement=false;
    const filters={},photos=new Map(),pageSize=25;
    const triBoutons=[];
    const statut=el("p",undefined,"lcdp-table-lecture-admin__status");statut.setAttribute("role","status");
    statut.classList.add("lcdp-hidden");
    zone.append(cadre,statut);
    const dateBrute=m=>coda?m.coda_blocage:m.demande_date||m.codr_dernier_echec;
    const champ=(m,k)=>k==="date"?date(dateBrute(m)):valeur(m[k]);
    function mini(texte,action,principal=false){
      const b=btn(texte,action,principal);b.classList.add("lcdp-button-mini");return b;
    }
    for(const c of colonnes){
      const th=el("th");th.scope="col";
      const filtre=el("th");
      if(c.tri){
        const b=el("button",c.label+" ↕","lcdp-button lcdp-button-secondary lcdp-button-mini");
        b.type="button";b.setAttribute("aria-label","Trier par "+c.label);
        b.addEventListener("click",()=>{direction=sortKey===c.key?-direction:1;sortKey=c.key;page=0;rendre();});
        triBoutons.push({b,th,key:c.key,label:c.label});th.append(b);
        const i=el("input",undefined,"lcdp-table-lecture-admin__filter-input");
        i.type="search";i.placeholder="Filtrer";i.setAttribute("aria-label","Filtrer "+c.label);
        i.addEventListener("input",()=>{page=0;rendre();});filters[c.key]=i;filtre.append(i);
      }else th.textContent=c.label;
      head.append(th);filtres.append(filtre);
    }
    const reset=mini("Effacer",()=>{Object.values(filters).forEach(f=>f.value="");page=0;rendre();});
    reset.setAttribute("aria-label","Effacer les filtres");reset.title="Effacer les filtres";
    filtres.lastElementChild.append(reset);
    thead.append(head,filtres);table.append(thead,body);scroll.append(table);cadre.append(scroll);
    const pagination=el("div");
    const precedent=mini("Précédent",()=>{page--;rendre();});
    const suivant=mini("Suivant",()=>{page++;rendre();});
    const pageTexte=el("span");pagination.append(precedent,pageTexte,suivant);zone.append(pagination);
    function visibles(){
      return rows.filter(m=>Object.entries(filters).every(([k,i])=>normaliser(champ(m,k)).includes(normaliser(i.value))))
      .sort((a,b)=>direction*(sortKey==="date"?(Date.parse(dateBrute(a))||0)-(Date.parse(dateBrute(b))||0):champ(a,sortKey).localeCompare(champ(b,sortKey),"fr",{sensitivity:"base",numeric:true})));
    }
    async function selfie(m,td){
      const img=el("img");img.width=56;img.height=56;img.alt="Selfie actif de "+nom(m);
      td.textContent="…";
      try{
        if(!photos.has(m.idmembre))photos.set(m.idmembre,appel({type,vue:"selfie",membre:m.idmembre}).then(d=>{
          if(!Object.hasOwn(d,"photo"))throw Error("Worker à mettre à jour.");
          return d.photo;
        }).catch(e=>{photos.delete(m.idmembre);throw e;}));
        const photo=await photos.get(m.idmembre);
        if(!td.isConnected)return;
        if(!photo){td.textContent="—";return;}
        if(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))throw Error("Selfie invalide");
        img.src=photo;img.addEventListener("error",()=>{td.textContent="Photo illisible";});td.replaceChildren(img);
      }catch{if(td.isConnected)td.textContent="Indisponible";}
    }
    async function historique(m){
      if(occupé)return;occupé=true;
      try{
        const d=await appel({type,vue:"historique",membre:m.idmembre});
        if(d.vue!=="historique"||!Array.isArray(d.rows)||d.rows.some(x=>!Object.hasOwn(x,"action")))throw Error("Historique non raccordé.");
        const contenu=el("div");
        if(!d.rows.length)contenu.append(el("p","Aucune intervention administrative enregistrée."));
        else for(const x of d.rows){contenu.append(el("p",date(x.creation)+" — "+x.action+(x.methode?" · "+x.methode:"")));}
        await dialogue("Historique — "+nom(m),contenu);
      }catch(e){afficherStatut(e.message,true);}finally{occupé=false;}
    }
    async function agir(m){
      if(occupé)return;occupé=true;
      try{
        const methode=await confirmer(m,coda);
        if(!methode)return;
        const d=await appel(null,{action:coda?"debloquer":"redefinir",type,membre:m.idmembre,methode,identiteVerifiee:true,date:coda?m.coda_blocage:m.codr_dernier_echec,email:m.emailmembre,dateEmail:m.dateemailvalid});
        afficherStatut(d.message);await charger();
      }catch(e){afficherStatut(e.message,true);}finally{occupé=false;}
    }
    function rendre(){
      const liste=visibles(),pages=Math.max(1,Math.ceil(liste.length/pageSize));page=Math.max(0,Math.min(page,pages-1));
      const courant=liste.slice(page*pageSize,(page+1)*pageSize);
      triBoutons.forEach(({b,th,key,label})=>{b.textContent=label+(key===sortKey?(direction===1?" ↑":" ↓"):" ↕");th.setAttribute("aria-sort",key===sortKey?(direction===1?"ascending":"descending"):"none");});
      reset.disabled=!Object.values(filters).some(f=>f.value);
      pagination.classList.toggle("lcdp-hidden",pages<=1);
      body.replaceChildren();
      if(!courant.length){const tr=el("tr"),td=el("td",chargement?"Chargement…":rows.length?"Aucun résultat.":coda?"Aucun CODA bloqué.":"Aucune demande CODR ni aucun CODR bloqué.");td.colSpan=colonnes.length;tr.append(td);body.append(tr);}
      for(const m of courant){
        const tr=el("tr");
        const photo=el("td"),tel=el("td"),email=el("td"),actions=el("td"),hist=el("td");
        tel.append(contact(m.tel,"tel"));email.append(contact(m.emailmembre,"mail"));
        const b=mini(coda?"Débloquer CODA":m.lien_actif?"Mail envoyé":"Mail CODR",()=>agir(m),true);
        const recuperation=m.recovery!=="normal"&&m.recovery!=="terminee";
        b.disabled=chargement||recuperation||(coda?!m.coda_blocage:!emailConfigure||!m.emailmembre||!m.dateemailvalid||m.lien_actif);
        if(b.disabled)b.title=recuperation?"Compte en récupération":coda?"Date de blocage absente":m.lien_actif?"Lien déjà envoyé":"Service e-mail ou adresse validée indisponible";
        actions.append(b);hist.append(mini("Historique",()=>historique(m)));
        tr.append(el("td",m.nommembre||"—"),el("td",m.prenommembre||"—"),photo,tel,email,el("td",date(dateBrute(m))),actions,hist);
        body.append(tr);selfie(m,photo);
      }
      precedent.disabled=page===0;suivant.disabled=page>=pages-1;pageTexte.textContent=" Page "+(page+1)+" / "+pages+" ";
    }
    async function charger(){
      if(chargement)return;chargement=true;actualiser.disabled=true;statut.textContent="";statut.classList.add("lcdp-hidden");statut.setAttribute("role","status");rendre();
      try{
        const all=new Map();let p=0,d;
        do{
          d=await appel({type,q:"",page:p++});
          if(!Array.isArray(d.rows))throw Error("Liste invalide.");
          for(const m of d.rows)all.set(m.idmembre,m);
          if(p>10000)throw Error("Liste trop volumineuse.");
        }while(d.suivante);
        rows=[...all.values()];emailConfigure=d.emailConfigure===true;photos.clear();
        statut.textContent=!coda&&!emailConfigure?"Envoi CODR indisponible : service EMAILTOKENZ non raccordé.":"";
      }catch(e){rows=[];photos.clear();statut.textContent=e.message;statut.setAttribute("role","alert");}
      finally{chargement=false;actualiser.disabled=false;statut.classList.toggle("lcdp-hidden",!statut.textContent);rendre();}
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
