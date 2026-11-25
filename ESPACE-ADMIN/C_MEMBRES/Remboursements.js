(() => {
  "use strict";
  const CHEMIN="/ESPACE-ADMIN/C_MEMBRES/Remboursements.html";
  const cfg=window.SITE_CONFIG||{};
  const BASE=String(cfg.workerAdminDataUrl||cfg.WORKER_ADMIN_DATA_URL||window.ADMIN_CONFIG?.API_ADMIN_DATA||"").replace(/\/+$/,"");
  const $=id=>document.getElementById("remb-"+id);
  const euro=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
  const date=v=>v?new Date(v.length===10?v+"T12:00:00Z":v).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"}):"—";
  let occupe=false, onglet="faire", suivi=[], capacites={};
  const libellesStripe={failed:"Échec définitif",canceled:"Annulé",requires_action:"Action requise",pending:"En cours",succeeded:"Remboursé"};
  const statutFinalEchec=s=>s==="failed"||s==="canceled";
  function cellule(tag,v){const el=document.createElement(tag);el.textContent=String(v??"—");return el;}
  function etat(id,v,erreur=false){$(id).textContent=v;$(id).setAttribute("role",erreur?"alert":"status");}
  async function api(query="",options={},route=""){
    if(!BASE)throw Error("Service administratif non configuré.");
    const r=await fetch(BASE+"/membres/remboursements"+route+query,{credentials:"include",cache:"no-store",...options,headers:{Accept:"application/json",...(options.headers||{})}});
    const d=await r.json().catch(()=>null);
    if(!r.ok||d?.success!==true)throw Error(d?.message||"Service indisponible.");
    return d;
  }
  async function lireCapacites(){
    try{
      const d=await api("",{},"/v2/capabilities");
      if(d.version===2)return {manuel:d.manuel===true,stripe:d.stripe===true,suiviStripe:d.suiviStripe===true};
    }catch{}
    return {manuel:false,stripe:false,suiviStripe:false};
  }
  async function chargerToutes(liste){
    const rows=[];
    for(let offset=0;offset<1000000;offset+=100){
      const d=await api("?liste="+encodeURIComponent(liste)+"&offset="+offset,{},liste==="stripe"?"/v2":"");
      if(liste==="stripe"&&(d.version!==2||d.liste!=="stripe"))throw Error("Suivi Stripe non disponible.");
      if(!Array.isArray(d.rows))throw Error("Liste invalide.");
      rows.push(...d.rows);if(d.rows.length<100)return rows;
    }
    throw Error("Liste trop importante.");
  }
  function valide(r){
    return !!r.idavoir&&r.environnement==="direct"&&r.montant_ttc!=null&&Number.isFinite(Number(r.montant_ttc))&&Number(r.montant_ttc)>0;
  }
  function selectionManuelle(r,incident){
    const select=document.createElement("select");
    select.className="lcdp-table-lecture-admin__filter-input";
    select.setAttribute("aria-label","Remboursement manuel : "+[r.nommembre,r.prenommembre].filter(Boolean).join(" "));
    const autorise=capacites.manuel&&valide(r)&&r.manuel_autorise===true&&(!incident||statutFinalEchec(r.statut_stripe));
    if(!autorise)return cellule("span","Bloqué");
    for(const [valeur,libelle] of [["non","Non"],["oui","Oui"]]){
      const option=document.createElement("option");option.value=valeur;option.textContent=libelle;select.appendChild(option);
    }
    select.value="non";
    select.addEventListener("change",()=>{if(select.value==="oui")void confirmer(r,"manuel",select);});
    return select;
  }
  function boutonStripe(r){
    const b=document.createElement("button");b.type="button";b.className="lcdp-button lcdp-button-secondary";b.textContent="Rembourser";
    b.disabled=!(capacites.stripe&&valide(r)&&r.stripe_autorise===true);
    b.dataset.indisponible=String(b.disabled);
    b.addEventListener("click",()=>void confirmer(r,"stripe"));
    return b;
  }
  function ligneCommune(r){
    const tr=document.createElement("tr"),nom=[r.nommembre,r.prenommembre].filter(Boolean).join(" ");
    const membre=cellule("td",nom||"—");
    const mention=r.environnement==="direct"?"":r.environnement==="test"?"Test":"À vérifier";
    const detail=[r.numero_avoir||r.avoirid,mention].filter(Boolean).join(" · ");
    if(detail)membre.append(document.createElement("br"),cellule("small",detail));
    tr.append(membre,cellule("td",r.iban||"—"),
      cellule("td",r.montant_ttc!=null&&Number.isFinite(Number(r.montant_ttc))?euro.format(Number(r.montant_ttc)):"—"),
      cellule("td",date(r.date_limite)));
    return tr;
  }
  function rendreFaire(rows){
    $("lignes-faire").replaceChildren();
    for(const r of rows){
      const tr=ligneCommune(r),manuel=document.createElement("td"),stripe=document.createElement("td");
      manuel.append(selectionManuelle(r,false));stripe.append(boutonStripe(r));
      tr.append(manuel,stripe,cellule("td",date(r.paiement)));$("lignes-faire").appendChild(tr);
    }
    etat("statut",(!capacites.manuel||!capacites.stripe?"Actions non raccordées au Worker : consultation seule ou partielle. ":"")+(rows.length?rows.length+" remboursement(s) à faire.":"Aucun remboursement à effectuer."));
  }
  function rendreSuivi(){
    const filtre=$("filtre-stripe").value;
    const rows=suivi.filter(r=>r.statut_stripe!=="succeeded"&&r.statutremboursement!=="paye"&&
      (filtre==="tous"||(filtre==="definitif"?statutFinalEchec(r.statut_stripe):r.statut_stripe===filtre)));
    $("lignes-stripe").replaceChildren();
    for(const r of rows){
      const tr=ligneCommune(r),manuel=document.createElement("td");
      manuel.append(selectionManuelle(r,true));
      tr.append(cellule("td",libellesStripe[r.statut_stripe]||"Statut non confirmé"),cellule("td",date(r.date_declenchement_stripe)),manuel,cellule("td",date(r.paiement)));
      $("lignes-stripe").appendChild(tr);
    }
    etat("statut",rows.length?rows.length+" dossier(s) Stripe.":"Aucun dossier Stripe pour ce filtre.");
  }
  function verrouiller(actif){
    occupe=actif;$("actualiser").disabled=actif;$("filtre-stripe").disabled=actif;
    for(const id of ["faire","stripe"])$(id).querySelectorAll("tbody button,tbody select").forEach(el=>{el.disabled=actif||el.dataset.indisponible==="true";});
  }
  async function charger(){
    if(occupe)return;
    verrouiller(true);
    $("lignes-"+onglet).replaceChildren();etat("statut","Chargement…");
    try{
      capacites=await lireCapacites();
      if(onglet==="faire"){
        const rows=await chargerToutes("a_payer");
        rendreFaire(rows.filter(r=>!r.statut_stripe&&!r.date_declenchement_stripe));
      }else{
        if(!capacites.suiviStripe){suivi=[];etat("statut","Suivi Stripe non raccordé au Worker.",true);return;}
        suivi=await chargerToutes("stripe");rendreSuivi();
      }
    }catch(e){etat("statut",e.message,true);}
    finally{verrouiller(false);}
  }
  async function confirmer(r,mode,select){
    if(occupe||!valide(r)){if(select)select.value="non";return;}
    const texte=mode==="stripe"?"Déclencher le remboursement Stripe de "+euro.format(Number(r.montant_ttc))+" ?":"Confirmer le virement bancaire déjà effectué de "+euro.format(Number(r.montant_ttc))+" ?";
    if(!window.confirm(texte)){if(select)select.value="non";return;}
    verrouiller(true);
    try{
      await api("",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:mode==="stripe"?"declencher_stripe":"confirmer_manuel",idavoir:r.idavoir,confirmation:true})},"/v2");
    }catch(e){
      if(select)select.value="non";etat("statut","Opération non confirmée : "+e.message,true);verrouiller(false);return;
    }
    verrouiller(false);await charger();
  }
  function activer(id){
    if(occupe||onglet===id)return;
    onglet=id;
    for(const cle of ["faire","stripe"]){
      const tab=$("tab-"+cle),actif=cle===id;
      tab.setAttribute("aria-selected",String(actif));tab.tabIndex=actif?0:-1;
      if(actif)tab.setAttribute("aria-current","page");else tab.removeAttribute("aria-current");
      $(cle).hidden=!actif;
    }
    void charger();
  }
  async function initialiser(){
    const garde=window.LCDP_GUARD_ADMIN;
    if(!garde||!await garde.verifierAccesPageAdmin({path:CHEMIN})||window.LCDP_ADMIN_AUTORISATION?.admin?.type!=="root")return;
    document.getElementById("lcdp-main-admin").hidden=false;
    const r=await fetch(window.LCDP_urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"),{credentials:"same-origin",cache:"no-cache"});
    if(!r.ok)throw Error("Bandeau indisponible.");
    const t=document.createElement("template");t.innerHTML=(await r.text()).trim();const slot=document.getElementById("lcdp-bandeau-slot");slot.replaceChildren(t.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(el=>{el.href=el.dataset.space==="admin"?window.LCDP_urlAdmin(el.dataset.siteHref):window.LCDP_urlPublic(el.dataset.siteHref);});
    slot.querySelectorAll("[data-site-src]").forEach(el=>{el.src=window.LCDP_urlObjet(String(el.dataset.siteSrc||"").replace(/^\/?OBJET\/?/,"/"));});
    await window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"membres"});
    $("actualiser").addEventListener("click",charger);
    $("filtre-stripe").addEventListener("change",()=>{if(!occupe&&capacites.suiviStripe)rendreSuivi();});
    for(const id of ["faire","stripe"]){
      const tab=$("tab-"+id);
      tab.addEventListener("click",event=>{event.preventDefault();activer(id);});
      tab.addEventListener("keydown",event=>{
        if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)||occupe)return;
        event.preventDefault();const cible=event.key==="Home"?"faire":event.key==="End"?"stripe":id==="faire"?"stripe":"faire";
        activer(cible);$("tab-"+cible).focus();
      });
    }
    await charger();
  }
  initialiser().catch(e=>etat("statut",e.message,true));
})();