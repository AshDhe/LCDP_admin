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
  function fermer(){selection=null;$("detail").hidden=true;$("form").reset();etat("message","");}
  function rendre(rows,liste){
    const historique=liste==="paye", cols=historique?["Membre","Avoir / commande","Montant TTC","Remboursé le","Mode / référence","Environnement"]:["Membre","Avoir / commande","Notification","Date limite","À rembourser TTC","Mode initial","Titulaire / IBAN / SWIFT","État","Action"];
    $("entetes").replaceChildren(...cols.map(c=>cellule("th",c)));$("lignes").replaceChildren();
    let total=0,retards=0,verifier=0;
    for(const r of rows){
      const montant=montantDu(r), tr=document.createElement("tr"),nom=[r.prenommembre,r.nommembre].filter(Boolean).join(" ");
      const direct=r.environnement==="direct";
      if(direct)total+=Math.round(montant*100);else verifier++;
      if(direct&&r.en_retard)retards++;
      tr.append(cellule("td",nom||"—"),cellule("td",(r.numero_avoir||r.avoirid||"—")+" / "+(r.orderid||"—")));
      if(historique){
        tr.append(cellule("td",euro.format(montant)),cellule("td",date(r.paiement)),cellule("td",[r.mode_remboursement,r.reference_remboursement].filter(Boolean).join(" / ")||"Ancien suivi — référence absente"),cellule("td",r.environnement));
      }else{
        tr.append(cellule("td",date(r.datedemande)),cellule("td",date(r.date_limite)),cellule("td",euro.format(montant)),cellule("td",r.mode_initial==="stripe"?"Stripe"+(r.stripe_intent?" / "+r.stripe_intent:""):r.mode_initial==="virement"?"Virement":"À vérifier"));
        tr.append(cellule("td",[r.titulaire,r.iban,r.swift].filter(Boolean).join(" / ")||"Coordonnées manquantes"));
        tr.append(cellule("td",!direct?(r.environnement==="test"?"Test":"À vérifier"):r.en_retard?"En retard":"À rembourser"));
        const td=document.createElement("td");
        if(estConfirmable(r)){
          const b=document.createElement("button");b.type="button";b.className="lcdp-button lcdp-button-secondary";b.textContent="Confirmer";b.addEventListener("click",()=>ouvrir(r));td.appendChild(b);
        }else td.textContent="Contrôle requis";
        tr.appendChild(td);
      }
      $("lignes").appendChild(tr);
    }
    $("synthese").textContent=(historique?"Remboursé en direct : ":"À rembourser en direct : ")+euro.format(total/100)+" · "+verifier+" dossier(s) test ou à vérifier"+(!historique?" · "+retards+" en retard":"");
    etat("statut",rows.length?rows.length+" dossier(s).":"Aucun dossier pour cette liste.");
  }
  async function charger(){
    if(occupe)return;occupe=true;fermer();$("actualiser").disabled=true;$("liste").disabled=true;
    $("lignes").replaceChildren();$("synthese").textContent="";etat("statut","Chargement…");
    try{const liste=$("liste").value;rendre(await chargerToutes(liste),liste);}
    catch(e){etat("statut",e.message,true);}finally{occupe=false;$("actualiser").disabled=false;$("liste").disabled=false;}
  }
  function modeChange(){
    const autre=selection&&$("mode").value!==selection.mode_initial;
    $("accord-label").hidden=!autre;$("accord").required=!!autre;if(!autre)$("accord").value="";
  }
  function ouvrir(r){
    if(!estConfirmable(r))return;
    fermer();selection=r;$("selection").textContent=[r.prenommembre,r.nommembre,r.avoirid,euro.format(montantDu(r))].filter(Boolean).join(" — ");
    $("montant").value=String(montantDu(r));$("mode").value=r.mode_initial;
    $("detail").hidden=false;modeChange();$("reference").focus();
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
      const payload=construireConfirmation(selection,{montant:$("montant").value,mode:$("mode").value,reference:$("reference").value,date:$("date").value,accord:$("accord").value,confirmation:$("confirme").checked});
      if(!window.confirm("Enregistrer l’opération déjà exécutée de "+euro.format(payload.montant)+" ? Aucun paiement n’est envoyé."))return;
      occupe=true;$("valider").disabled=true;$("actualiser").disabled=true;$("liste").disabled=true;
      await api("",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      fermer();occupe=false;await charger();etat("statut","Remboursement enregistré. "+$("statut").textContent);
    }catch(e){etat("message",e.message,true);}finally{occupe=false;$("valider").disabled=false;$("actualiser").disabled=false;$("liste").disabled=false;}
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
    $("actualiser").addEventListener("click",charger);$("liste").addEventListener("change",charger);$("mode").addEventListener("change",modeChange);$("fermer").addEventListener("click",fermer);$("form").addEventListener("submit",confirmer);await charger();
  }
  initialiser().catch(e=>etat("statut",e.message,true));
})();