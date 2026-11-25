(() => {
  "use strict";
  const CHEMIN="/ESPACE-ADMIN/C_MEMBRES/Remboursements.html";
  const cfg=window.SITE_CONFIG||{};
  const BASE=String(cfg.workerAdminDataUrl||cfg.WORKER_ADMIN_DATA_URL||window.ADMIN_CONFIG?.API_ADMIN_DATA||"").replace(/\/+$/,"");
  const $=id=>document.getElementById("remb-"+id);
  const euro=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
  const date=v=>v?new Date(v.length===10?v+"T12:00:00Z":v).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"}):"—";
  let selection=null, occupe=false;
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
  function montantDu(r){const v=Number(r.montant_ttc);if(r.montant_ttc==null||!Number.isFinite(v)||v<=0)throw Error("Montant de remboursement invalide.");return v;}
  function estConfirmable(r){return r.statutremboursement==="a_payer"&&r.environnement==="direct"&&["stripe","virement"].includes(r.mode_initial);}
  function fermer(){selection=null;$("detail").replaceChildren();}
  function rendre(rows){
    $("table-slot").replaceChildren($("table-template").content.cloneNode(true));
    for(const r of rows){
      const tr=document.createElement("tr");
      const nom=[r.nommembre,r.prenommembre].filter(Boolean).join(" ");
      const historique=r.statutremboursement==="paye";
      const mention=r.environnement==="direct"?"":r.environnement==="test"?" — Test":" — À vérifier";
      const membre=cellule("td",(nom||"—")+mention);
      const ref=cellule("small",r.numero_avoir||r.avoirid||"");
      if(ref.textContent)membre.append(document.createElement("br"),ref);
      const montant=Number(r.montant_ttc);
      tr.append(membre,cellule("td",r.iban||"—"),
        cellule("td",r.montant_ttc!=null&&Number.isFinite(montant)&&montant>0?euro.format(montant):"—"),
        cellule("td",date(r.date_limite)));
      const statut=cellule("td",historique?"Oui":"Non");
      const action=document.createElement("td");
      if(estConfirmable(r)&&r.montant_ttc!=null&&Number.isFinite(montant)&&montant>0){
        const bouton=document.createElement("button");
        bouton.type="button";
        bouton.className="lcdp-table-lecture-admin__cell-action";
        bouton.textContent="Enregistrer";
        bouton.setAttribute("aria-label","Enregistrer le remboursement de "+(nom||"ce membre"));
        bouton.addEventListener("click",()=>ouvrir(r));
        action.appendChild(bouton);
        if(r.mode_initial==="virement"&&r.iban&&r.titulaire){
          const virement=document.createElement("button");
          virement.type="button";
          virement.className="lcdp-table-lecture-admin__cell-action";
          virement.textContent="Déclencher un virement";
          virement.disabled=true;
          virement.title="Service bancaire non raccordé";
          action.append(document.createElement("br"),virement,document.createElement("br"),cellule("small","Non raccordé"));
        }
      }else action.textContent=historique?"—":"À vérifier";
      tr.append(statut,cellule("td",historique?date(r.paiement):"—"),action);
      $("lignes").appendChild(tr);
    }
    etat("statut",rows.length?rows.length+" remboursement(s).":"Aucun remboursement enregistré.");
  }
  async function charger(){
    if(occupe)return;
    occupe=true;fermer();$("actualiser").disabled=true;
    $("table-slot").replaceChildren();etat("statut","Chargement…");
    try{
      const [attente,historique]=await Promise.all([chargerToutes("a_payer"),chargerToutes("paye")]);
      const dejaVus=new Set();
      const rows=[...historique.map(r=>({...r,statutremboursement:"paye"})),...attente]
        .filter(r=>{if(r.idavoir==null)return true;const id=String(r.idavoir);if(dejaVus.has(id))return false;dejaVus.add(id);return true;})
        .sort((a,b)=>Number(a.statutremboursement==="paye")-Number(b.statutremboursement==="paye")||
          String(a.date_limite||"9999").localeCompare(String(b.date_limite||"9999")));
      rendre(rows);
    }catch(e){etat("statut",e.message,true);}
    finally{occupe=false;$("actualiser").disabled=false;}
  }
  function modeChange(){
    const autre=selection&&$("mode").value!==selection.mode_initial;
    $("accord-slot").replaceChildren();
    if(autre)$("accord-slot").appendChild($("accord-template").content.cloneNode(true));
  }
  function ouvrir(r){
    if(!estConfirmable(r)||occupe)return;
    fermer();selection=r;
    $("detail").appendChild($("form-template").content.cloneNode(true));
    $("selection").textContent=[r.prenommembre,r.nommembre,r.numero_avoir||r.avoirid,euro.format(montantDu(r))].filter(Boolean).join(" — ");
    $("montant").value=String(montantDu(r));$("mode").value=r.mode_initial;
    const maintenant=new Date();
    $("date").value=new Date(maintenant.getTime()-maintenant.getTimezoneOffset()*60000).toISOString().slice(0,16);
    $("mode").addEventListener("change",modeChange);$("fermer").addEventListener("click",fermer);$("form").addEventListener("submit",confirmer);
    modeChange();$("detail").scrollIntoView({block:"nearest"});$("reference").focus();
  }
  function construireConfirmation(r,form){
    if(!estConfirmable(r)||form.confirmation!==true)throw Error("Remboursement non confirmable.");
    const montant=Number(form.montant),d=new Date(form.date);
    if(!Number.isFinite(montant)||Math.abs(montant*100-Math.round(montant*100))>0.000001||Math.round(montant*100)!==Math.round(montantDu(r)*100))throw Error("Le montant doit correspondre exactement à l’avoir.");
    if(!Number.isFinite(d.getTime())||d.getTime()>Date.now()||d.getTime()<Date.parse(r.datedemande))throw Error("Date réelle invalide.");
    const reference=String(form.reference||"").trim(),accord=String(form.accord||"").trim(),mode=form.mode;
    if(!["stripe","virement","autre"].includes(mode)||reference.length<3||reference.length>200)throw Error("Référence ou mode invalide.");
    if(mode!==r.mode_initial&&!accord)throw Error("Accord exprès requis.");
    if(mode==="stripe"&&!/^re_[A-Za-z0-9]+$/.test(reference))throw Error("Référence de remboursement Stripe requise.");
    if(mode==="virement"&&(!r.iban||!r.titulaire))throw Error("IBAN et titulaire requis.");
    return {idavoir:r.idavoir,montant,mode,reference,date:d.toISOString(),accord:accord||null,confirmation:true};
  }
  async function confirmer(event){
    event.preventDefault();if(!selection||occupe)return;
    try{
      const payload=construireConfirmation(selection,{montant:$("montant").value,mode:$("mode").value,reference:$("reference").value,date:$("date").value,accord:$("accord")?.value||"",confirmation:true});
      occupe=true;$("valider").disabled=true;$("actualiser").disabled=true;
      await api("",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      fermer();occupe=false;await charger();etat("statut","Remboursement enregistré. "+$("statut").textContent);
    }catch(e){if($("message"))etat("message",e.message,true);else etat("statut",e.message,true);}finally{occupe=false;if($("valider"))$("valider").disabled=false;$("actualiser").disabled=false;}
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
    $("actualiser").addEventListener("click",charger);await charger();
  }
  initialiser().catch(e=>etat("statut",e.message,true));
})();