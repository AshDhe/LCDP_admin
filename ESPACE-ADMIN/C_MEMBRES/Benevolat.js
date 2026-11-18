(() => {
  "use strict";
  const cfg=window.SITE_CONFIG||{}, route="/ESPACE-ADMIN/C_MEMBRES/Benevolat.html";
  const endpoint=String(cfg.workerAdminDataUrl||cfg.WORKER_ADMIN_DATA_URL||"").replace(/\/+$/,"");
  const q=id=>document.getElementById(id), admin=p=>window.LCDP_urlAdmin(p), objet=p=>window.LCDP_urlObjet(p);
  const plages=["06h–10h","10h–13h","13h–17h","17h–21h","21h–02h"];
  const depValide=d=>/^(?:0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(d);
  const normaliser=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const dep=p=>String(p.dptmt||"").trim().toUpperCase();
  const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;};
  const bouton=(txt,fn,style="secondary")=>{const b=el("button",txt,"lcdp-button lcdp-button-"+style);b.type="button";if(fn)b.addEventListener("click",fn);return b;};
  const status=(txt,err=false)=>{const p=q("benevolat-statut");p.setAttribute("role",err?"alert":"status");p.textContent=txt;};
  const champ=(label,control)=>{const l=el("label",undefined,"lcdp-editeur-contenu__titre-zone");l.append(el("span",label,"lcdp-editeur-contenu__label"),control);return l;};
  let parcs=[],rows=[],offsetHorloge=0,onglets,edition=null,busy=false,pret=false,formulaire,date,plage,choixNouveau,zoneTitre,btnEnregistrer,btnAnnuler;
  const listes={};
  const maintenant=()=>Date.now()+offsetHorloge;
  const passe=r=>Date.parse(r.fin)<=maintenant();
  const formatDate=d=>d.split("-").reverse().join("/");
  const dateParis=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(maintenant())).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day;};
  async function fragment(url){const r=await fetch(url,{cache:"no-cache",credentials:"same-origin"});if(!r.ok)throw Error("Composant indisponible.");const t=el("template");t.innerHTML=await r.text();return t.content;}
  function script(url){return new Promise((ok,ko)=>{const s=el("script");s.src=url;s.onload=ok;s.onerror=()=>ko(Error("Composant indisponible."));document.head.append(s);});}
  async function api(body){
    if(!endpoint)throw Error("Worker admin-data non configuré.");
    const r=await fetch(endpoint+"/membres/benevolat",{method:body?"POST":"GET",credentials:"include",cache:"no-store",headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json().catch(()=>null);
    if(!r.ok||d?.success!==true)throw Error(d?.message||"Service Bénévolat indisponible.");
    return d;
  }
  function verrou(v){busy=v;q("benevolat-onglets").querySelectorAll("button,input,select").forEach(e=>{e.disabled=v;});if(!v&&btnEnregistrer)btnEnregistrer.disabled=!pret; }
  function creerChoix(zone,mode,changer){
    const depts=new Set(),ids=new Set();
    const blocD=el("div"),blocP=el("div"),dBar=el("div",undefined,"benevolat-departements");
    blocD.append(el("p","Département(s)","lcdp-editeur-contenu__label"),dBar);
    const recherche=el("input",undefined,"lcdp-editeur-contenu__titre");recherche.type="search";recherche.placeholder="Rechercher un parc";recherche.setAttribute("aria-label","Rechercher un parc");
    const resultats=el("div",undefined,"benevolat-choix"),resume=el("p",undefined,"lcdp-editeur-contenu__aide");
    blocP.append(el("p","Parc(s)","lcdp-editeur-contenu__label"),recherche,resume,resultats);zone.append(blocD,blocP);
    function source(){if(mode==="nouveau")return parcs;const m=new Map();for(const r of rows)if(passe(r)===(mode==="passe"))m.set(r.idparc,r);return [...m.values()].sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));}
    function disponibles(){return source().filter(p=>mode==="nouveau"?depts.has(dep(p)):!depts.size||depts.has(dep(p)));}
    function rendreD(){
      dBar.replaceChildren(bouton("+ Ajouter",async()=>{
        if(busy||!pret)return;
        try {const d=await window.LCDP_diginum.ouvrir({titre:"Ajouter un département",placeholder:"Exemple 41",longueurMax:3,codesSpeciaux:["2A","2B"],autoValider:c=>c.length===2&&!c.startsWith("97")||c.length===3&&c.startsWith("97"),verifier:c=>depValide(c)?null:"Code de département invalide."});if(d){depts.add(d);actualiser();changer();}}catch(e){status(e.message,true);}
      }));
      for(const d of depts){const b=bouton(d+" ×",()=>{if(!busy){depts.delete(d);actualiser();changer();}});b.setAttribute("aria-label","Retirer le département "+d);dBar.append(b);}
      if(mode!=="nouveau"&&(depts.size||ids.size))dBar.append(bouton("Tout effacer",()=>{if(!busy){depts.clear();ids.clear();recherche.value="";actualiser();changer();}}));
    }
    function rendreP(){
      const tous=disponibles(),valides=new Set(tous.map(p=>p.idparc));
      for(const id of ids)if(!valides.has(id))ids.delete(id);
      resume.textContent=ids.size?ids.size+" parc(s) sélectionné(s)":mode==="nouveau"?"Aucun parc sélectionné":"Tous les parcs";
      const terme=normaliser(recherche.value);
      const filtres=tous.filter(p=>ids.has(p.idparc)||normaliser(p.nom+" "+(p.localite||"")+" "+dep(p)).includes(terme));
      resultats.replaceChildren();
      if(!filtres.length){resultats.append(el("p",mode==="nouveau"&&!depts.size?"Sélectionne d’abord un département.":"Aucun parc correspondant."));return;}
      for(const p of filtres){
        const l=el("label"),c=el("input");c.type="checkbox";c.checked=ids.has(p.idparc);c.disabled=busy;
        c.addEventListener("change",()=>{if(c.checked){if(mode==="nouveau"&&edition)ids.clear();ids.add(p.idparc);}else ids.delete(p.idparc);if(edition&&mode==="nouveau"){rendreP();resultats.querySelector("input:checked")?.focus();}else resume.textContent=ids.size?ids.size+" parc(s) sélectionné(s)":mode==="nouveau"?"Aucun parc sélectionné":"Tous les parcs";changer();});
        l.append(c,el("span",p.nom+" ("+dep(p)+")"));resultats.append(l);
      }
    }
    function actualiser(){rendreD();rendreP();}
    recherche.addEventListener("input",rendreP);
    actualiser();
    return {depts,ids,actualiser,reset(){depts.clear();ids.clear();recherche.value="";actualiser();}};
  }
  function formulaireNouveau(zone){
    formulaire=el("form",undefined,"benevolat-form");zoneTitre=el("h2","Nouveau rendez-vous");formulaire.append(zoneTitre);
    date=el("input",undefined,"lcdp-editeur-contenu__titre");date.type="date";date.required=true;
    formulaire.append(champ("Date",date));
    choixNouveau=creerChoix(formulaire,"nouveau",()=>{});
    plage=el("select",undefined,"lcdp-editeur-contenu__titre");plage.required=true;
    const vide=el("option","Choisir une plage");vide.value="";plage.append(vide);
    plages.forEach((p,i)=>{const o=el("option",p);o.value=String(i+1);plage.append(o);});
    formulaire.append(champ("Plage horaire",plage));
    const actions=el("div",undefined,"benevolat-actions");
    btnEnregistrer=bouton("Enregistrer",null,"primary");btnEnregistrer.type="submit";btnEnregistrer.disabled=true;
    btnAnnuler=bouton("Annuler la modification",()=>{if(!busy){resetNouveau();status("");}});btnAnnuler.hidden=true;
    actions.append(btnEnregistrer,btnAnnuler);formulaire.append(actions);zone.append(formulaire);
    formulaire.addEventListener("submit",async e=>{
      e.preventDefault();if(busy||!pret)return;
      if(!choixNouveau.depts.size||!choixNouveau.ids.size){status("Choisis au moins un département et un parc.",true);return;}
      if(edition&&choixNouveau.ids.size!==1){status("Choisis un seul parc pour cette modification.",true);return;}
      const body={action:edition?"modifier":"creer",idparcs:[...choixNouveau.ids],datejour:date.value,plage:Number(plage.value),...(edition?{idbenevolat:edition.idbenevolat,version:edition.updated_at}:{})};
      let msg="";
      verrou(true);status("Enregistrement…");
      try{const d=await api(body);msg=d.nombre+" rendez-vous enregistré(s).";resetNouveau();onglets.activer("liste");await charger();status(msg);}catch(err){status(msg?msg+" Actualisation impossible : "+err.message:err.message,true);}finally{verrou(false);}
    });
  }
  function resetNouveau(){edition=null;date.value="";date.min=dateParis();plage.value="";zoneTitre.textContent="Nouveau rendez-vous";btnAnnuler.hidden=true;choixNouveau.reset();}
  function modifier(r){if(busy||!pret||passe(r))return;edition=r;choixNouveau.reset();choixNouveau.depts.add(dep(r));choixNouveau.ids.add(r.idparc);choixNouveau.actualiser();date.min=r.datejour<dateParis()?r.datejour:dateParis();date.value=r.datejour;plage.value=String(r.plage);zoneTitre.textContent="Modifier le rendez-vous";btnAnnuler.hidden=false;onglets.activer("nouveau");date.focus();status("");}
  async function confirmer(r){
    const slot=q("lcdp-lightbox-slot");slot.replaceChildren(await fragment(objet("/HTMLBASE/02-dialogue-reference-suppression.html")));
    const box=slot.querySelector('[data-lcdp-dialogue-reference="suppression"]'),titre=slot.querySelector("[data-lcdp-dialogue-titre]"),texte=slot.querySelector("[data-lcdp-dialogue-message]"),non=slot.querySelector('[data-lcdp-dialogue-action="conserver"]'),oui=slot.querySelector('[data-lcdp-dialogue-action="supprimer"]');
    if(!box||!titre||!texte||!non||!oui){slot.replaceChildren();throw Error("Confirmation indisponible.");}
    titre.textContent="Supprimer ce rendez-vous ?";texte.textContent=formatDate(r.datejour)+" · "+r.nom+" · "+plages[r.plage-1]+". Cette suppression est définitive.";non.textContent="Annuler";oui.textContent="Supprimer";
    const avant=document.activeElement;
    return new Promise(resolve=>{let fini=false;
      function terminer(v){if(fini)return;fini=true;document.removeEventListener("keydown",clavier);slot.replaceChildren();avant?.focus({preventScroll:true});resolve(v);}
      function clavier(e){if(e.key==="Escape"){e.preventDefault();terminer(false);}if(e.key==="Tab"&&((e.shiftKey&&document.activeElement===non)||(!e.shiftKey&&document.activeElement===oui))){e.preventDefault();(e.shiftKey?oui:non).focus();}}
      document.addEventListener("keydown",clavier);non.onclick=()=>terminer(false);oui.onclick=()=>terminer(true);box.addEventListener("click",e=>{if(e.target===box)terminer(false);});non.focus();
    });
  }
  async function supprimer(r){if(busy||!pret||passe(r))return;verrou(true);let supprime=false;try{if(!await confirmer(r))return;await api({action:"supprimer",idbenevolat:r.idbenevolat,version:r.updated_at});supprime=true;if(edition?.idbenevolat===r.idbenevolat)resetNouveau();await charger();status("Rendez-vous supprimé.");}catch(e){status((supprime?"Rendez-vous supprimé. Actualisation impossible : ":"")+e.message,true);}finally{verrou(false);}}
  function creerListe(zone,mode){
    const filtres=el("div",undefined,"benevolat-filtres"),sortie=el("div",undefined,"benevolat-table");
    zone.append(filtres,sortie);
    listes[mode]={choix:creerChoix(filtres,mode,()=>rendreListe(mode)),sortie};
  }
  function rendreListe(mode){
    const {choix,sortie}=listes[mode],historique=mode==="passe";
    const selection=rows.filter(r=>passe(r)===historique&&(!choix.depts.size||choix.depts.has(dep(r)))&&(!choix.ids.size||choix.ids.has(r.idparc))).sort((a,b)=>a.datejour.localeCompare(b.datejour)||a.plage-b.plage||a.nom.localeCompare(b.nom,"fr"));
    sortie.replaceChildren();
    if(!selection.length){sortie.append(el("p","Aucun rendez-vous."));return;}
    const wrap=el("div",undefined,"lcdp-table-lecture-admin__scroll"),table=el("table",undefined,"lcdp-table-lecture-admin__table"),thead=el("thead"),tr=el("tr"),tbody=el("tbody");
    for(const label of ["Date","Département","Parc","Plage horaire",...(!historique?["Actions"]:[])]){const th=el("th",label);th.scope="col";tr.append(th);}
    thead.append(tr);table.append(thead,tbody);
    for(const r of selection){const ligne=el("tr");for(const v of [formatDate(r.datejour),dep(r),r.nom,plages[r.plage-1]])ligne.append(el("td",v));if(!historique){const td=el("td"),act=el("div",undefined,"benevolat-actions");act.append(bouton("Modifier",()=>modifier(r)),bouton("Supprimer",()=>supprimer(r),"orange"));td.append(act);ligne.append(td);}tbody.append(ligne);}
    wrap.append(table);sortie.append(wrap);
  }
  function rafraichirListes(){for(const mode of ["liste","passe"]){listes[mode].choix.actualiser();rendreListe(mode);}}
  async function charger(){
    const debut=Date.now(),d=await api();
    if(!Array.isArray(d.parcs)||!Array.isArray(d.rows)||!Number.isFinite(Date.parse(d.maintenant)))throw Error("Réponse Bénévolat invalide.");
    parcs=d.parcs;rows=d.rows;offsetHorloge=Date.parse(d.maintenant)-(debut+Date.now())/2;pret=true;
    choixNouveau.actualiser();rafraichirListes();date.min=edition&&edition.datejour<dateParis()?edition.datejour:dateParis();
  }
  async function init(){
    if(!await window.LCDP_GUARD_ADMIN.verifierAccesPageAdmin({path:route}))return;
    await Promise.all([fragment(admin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html")).then(f=>{const slot=q("lcdp-bandeau-slot");slot.replaceChildren(f);slot.querySelectorAll("[data-site-href]").forEach(e=>e.href=e.dataset.space==="admin"?admin(e.dataset.siteHref):window.LCDP_urlPublic(e.dataset.siteHref));slot.querySelectorAll("[data-site-src]").forEach(e=>e.src=objet(e.dataset.siteSrc.replace(/^\/?OBJET\/?/,"/")));}),window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"membres"}),script(objet("/JSBASE/05-wraper-onglets.js")),script(objet("/JSBASE/07-diginum.js"))]);
    onglets=window.LCDP_WRAPER_ONGLETS.initialiser({racine:q("benevolat-onglets"),onglets:[{key:"nouveau",label:"Nouveau"},{key:"liste",label:"Liste"},{key:"passe",label:"Passé"}],actif:"nouveau",idPrefix:"benevolat",ariaLabel:"Bénévolat"});
    formulaireNouveau(onglets.zones.nouveau);creerListe(onglets.zones.liste,"liste");creerListe(onglets.zones.passe,"passe");
    q("lcdp-main-admin").hidden=false;verrou(true);
    try{await charger();resetNouveau();status("");}finally{verrou(false);}
    let compte=rows.filter(passe).length;
    setInterval(()=>{if(busy||!pret)return;const n=rows.filter(passe).length;if(n!==compte){compte=n;rafraichirListes();}},15000);
  }
  init().catch(e=>{q("lcdp-main-admin").hidden=false;status(e.message,true);});
})();
