(() => {
  "use strict";
  const CHEMIN="/ESPACE-ADMIN/C_MEMBRES/Remboursements.html";
  const cfg=window.SITE_CONFIG||{};
  const BASE=String(cfg.workerAdminDataUrl||cfg.WORKER_ADMIN_DATA_URL||window.ADMIN_CONFIG?.API_ADMIN_DATA||"").replace(/\/+$/,"");
  const $=id=>document.getElementById("remb-"+id);
  const euro=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
  const date=v=>v?new Date(v.length===10?v+"T12:00:00Z":v).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"}):"—";
  let occupe=false;
  function cellule(tag,v){const el=document.createElement(tag);el.textContent=String(v??"—");return el;}
  function etat(id,v,erreur=false){$(id).textContent=v;$(id).setAttribute("role",erreur?"alert":"status");}
  async function api(query="",options={}){
    if(!BASE)throw Error("Service administratif non configuré.");
    const r=await fetch(BASE+"/membres/remboursements"+query,{credentials:"include",cache:"no-store",...options,headers:{Accept:"application/json",...(options.headers||{})}});
    const d=await r.json().catch(()=>null);
    if(r.status===404&&/route inconnue/i.test(d?.message||""))throw Error("Service remboursements non installé : importer le dernier w-admin-data dans Cloudflare.");
    if(!r.ok||d?.success!==true)throw Error(d?.message||"Service indisponible.");
    return d;
  }
  async function chargerToutes(liste){
    const rows=[];
    for(let offset=0;offset<1000000;offset+=100){
      const d=await api("?liste="+encodeURIComponent(liste)+"&offset="+offset);
      if(!Array.isArray(d.rows))throw Error("Liste invalide.");
      rows.push(...d.rows);if(d.rows.length<100)return rows;
    }
    throw Error("Liste trop importante.");
  }
  function selectionRembourse(r){
    const select=document.createElement("select");
    select.className="lcdp-table-lecture-admin__filter-input";
    select.setAttribute("aria-label","Remboursé : "+[r.nommembre,r.prenommembre].filter(Boolean).join(" "));
    for(const [valeur,libelle] of [["non","Non"],["oui","Oui"]]){
      const option=document.createElement("option");
      option.value=valeur;option.textContent=libelle;select.appendChild(option);
    }
    select.value="non";
    select.dataset.indisponible=String(r.idavoir==null);
    select.disabled=r.idavoir==null;
    select.addEventListener("change",()=>{if(select.value==="oui")void confirmer(r,select);});
    return select;
  }
  function rendre(rows,liste){
    $("lignes").replaceChildren();
    for(const r of rows){
      const tr=document.createElement("tr");
      const nom=[r.nommembre,r.prenommembre].filter(Boolean).join(" ");
      const historique=liste==="paye";
      const montant=Number(r.montant_ttc);
      const membre=cellule("td",nom||"—");
      const mention=r.environnement==="direct"?"":r.environnement==="test"?"Test":"À vérifier";
      const detail=[r.numero_avoir||r.avoirid,mention].filter(Boolean).join(" · ");
      if(detail)membre.append(document.createElement("br"),cellule("small",detail));
      tr.append(membre,cellule("td",r.iban||"—"),
        cellule("td",r.montant_ttc!=null&&Number.isFinite(montant)?euro.format(montant):"—"),
        cellule("td",date(r.date_limite)));
      const statut=cellule("td",historique?"Oui":"");
      if(!historique)statut.appendChild(selectionRembourse(r));
      tr.append(statut,cellule("td",historique?date(r.paiement):"—"));
      $("lignes").appendChild(tr);
    }
    etat("statut",rows.length?rows.length+" remboursement(s).":liste==="paye"?"Aucun remboursement enregistré.":"Aucun remboursement à effectuer.");
  }
  function verrouiller(actif){
    occupe=actif;
    $("actualiser").disabled=actif;
    $("filtre").disabled=actif;
    $("lignes").querySelectorAll("select").forEach(el=>{el.disabled=actif||el.dataset.indisponible==="true";});
  }
  async function charger(){
    if(occupe)return;
    verrouiller(true);
    $("lignes").replaceChildren();etat("statut","Chargement…");
    try{
      const liste=$("filtre").value;
      const rows=await chargerToutes(liste);
      rows.sort((a,b)=>String(a.date_limite||"9999").localeCompare(String(b.date_limite||"9999")));
      rendre(rows,liste);
    }catch(e){etat("statut",e.message,true);}
    finally{verrouiller(false);}
  }
  async function confirmer(r,select){
    if(occupe||r.idavoir==null){select.value="non";return;}
    if(!window.confirm("Confirmer que le remboursement a déjà été effectué ?")){select.value="non";return;}
    verrouiller(true);
    try{
      // Contrat à implémenter dans w-admin-data : identité administrateur vérifiée,
      // transition a_payer -> paye atomique, date de paiement générée côté serveur.
      await api("",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"confirmer_remboursement",idavoir:r.idavoir,confirmation:true})});
    }catch(e){
      select.value="non";
      etat("statut","Remboursement non enregistré : "+e.message,true);
      verrouiller(false);
      return;
    }
    verrouiller(false);
    await charger();
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
    $("actualiser").addEventListener("click",charger);$("filtre").addEventListener("change",charger);await charger();
  }
  initialiser().catch(e=>etat("statut",e.message,true));
})();