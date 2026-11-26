(() => {
  "use strict";
  const CHEMIN="/ESPACE-ADMIN/C_MEMBRES/Resiliations.html";
  const cfg=window.SITE_CONFIG||{};
  const BASE=String(cfg.workerAdminDataUrl||cfg.WORKER_ADMIN_DATA_URL||window.ADMIN_CONFIG?.API_ADMIN_DATA||"").replace(/\/+$/,"");
  const $=id=>document.getElementById("resil-"+id);
  const euro=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
  const date=v=>v?new Date(String(v).length===10?v+"T12:00:00Z":v).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"}):"—";
  const montant=v=>v!=null&&Number.isFinite(Number(v))?euro.format(Number(v)):"—";
  const labels={en_attente:"En attente",acceptee:"Acceptée",refusee:"Refusée"};
  let rows=[],occupe=false,capacites=false,lectureConfirmee=false;
  const cellule=(v,tag="td")=>{const el=document.createElement(tag);el.textContent=String(v??"—");return el;};
  function etat(v,erreur=false){$("statut").textContent=v;$("statut").setAttribute("role",erreur?"alert":"status");}
  async function api(path,options={}){
    if(!BASE)throw Error("Service administratif non configuré.");
    const r=await fetch(BASE+path,{credentials:"include",cache:"no-store",...options,headers:{Accept:"application/json",...(options.headers||{})}});
    const d=await r.json().catch(()=>null);
    if(!r.ok||d?.success!==true)throw Error(d?.message||"Service indisponible.");
    return d;
  }
  function filtre(r){
    const f=$("filtre").value;
    if(f==="tous")return true;
    if(f==="cloturee")return !!r.resiliation_cloturee_le;
    if(f==="a_payer")return r.resiliation_decision==="acceptee"&&Number(r.resiliation_remboursement_ttc)>0&&!r.resiliation_payee_le&&!r.resiliation_cloturee_le;
    return r.resiliation_decision===f;
  }
  function champ(type,value,label){const el=document.createElement("input");el.type=type;el.className="lcdp-table-lecture-admin__filter-input";el.setAttribute("aria-label",label);el.value=value??"";return el;}
  function bouton(label){const b=document.createElement("button");b.type="button";b.className="lcdp-button lcdp-button-secondary";b.textContent=label;return b;}
  function confirmation(action,texte,execution){
    const b=document.createElement("div");b.className="lcdp-stack";b.setAttribute("role","group");b.setAttribute("aria-label","Confirmation de l’enregistrement");
    b.append(cellule(texte,"p"));const non=bouton("Non"),oui=bouton("Oui");b.append(non,oui);
    action.replaceChildren(b);non.addEventListener("click",rendre);oui.addEventListener("click",()=>void execution());non.focus();
  }
  async function enregistrer(payload){
    if(occupe||!capacites)return;
    occupe=true;$("actualiser").disabled=true;$("filtre").disabled=true;
    $("lignes").querySelectorAll("button,input,select").forEach(e=>e.disabled=true);
    try{
      const d=await api("/membres/resiliations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,confirmation:true})});
      if(d.enregistree!==true)throw Error("Enregistrement non confirmé.");
    }catch(e){occupe=false;$("actualiser").disabled=false;$("filtre").disabled=false;rendre();etat(e.message,true);return;}
    occupe=false;await charger();
  }
  function rendre(){
    $("lignes").replaceChildren();
    for(const r of rows.filter(filtre)){
      const tr=document.createElement("tr"),nom=[r.nommembre,r.prenommembre].filter(Boolean).join(" ");
      const membre=cellule(nom||"—");if(r.emailmembre)membre.append(document.createElement("br"),cellule(r.emailmembre,"small"));
      const abo=cellule(r.typabo||"—");abo.append(document.createElement("br"),cellule(date(r.debut)+" – "+date(r.fin),"small"));
      if(r.orderid)abo.append(document.createElement("br"),cellule(r.orderid,"small"));
      tr.append(membre,abo,cellule(date(r.resiliation_demandee_le)));
      const d=cellule(labels[r.resiliation_decision]||"—"),effet=cellule(date(r.resiliation_effet)),remb=cellule(montant(r.resiliation_remboursement_ttc)),action=cellule("—");
      if(r.resiliation_decision==="en_attente"&&capacites){
        const sel=document.createElement("select");sel.className="lcdp-table-lecture-admin__filter-input";sel.setAttribute("aria-label","Décision : "+nom);
        for(const [v,l] of Object.entries(labels)){const opt=document.createElement("option");opt.value=v;opt.textContent=l;sel.append(opt);}
        d.replaceChildren(sel);
        const prise=champ("date","","Date de prise d’effet : "+nom),somme=champ("number","","Remboursement TTC : "+nom);somme.min="0";somme.step="0.01";
        effet.replaceChildren(prise);remb.replaceChildren(somme);
        const enregistrerLigne=bouton("Enregistrer");action.replaceChildren(enregistrerLigne);
        const maj=()=>{const accepte=sel.value==="acceptee";prise.disabled=!accepte;somme.disabled=!accepte;enregistrerLigne.disabled=sel.value==="en_attente";};
        sel.addEventListener("change",maj);maj();
        enregistrerLigne.addEventListener("click",()=>{
          const accepte=sel.value==="acceptee",m=Number(somme.value);
          if(accepte&&(!prise.value||somme.value.trim()===""||!somme.checkValidity()||!Number.isFinite(m)||m<0)){etat("Date de prise d’effet et montant TTC obligatoires.",true);return;}
          const payload={action:"decision",idabo:r.idabo,decision:sel.value,date_effet:accepte?prise.value:null,remboursement_ttc:accepte?somme.value:null};
          const texte=(accepte&&m===0?"Vous accordez une résiliation sans aucun remboursement. ":"")+"Confirmez-vous les valeurs renseignées ? "+labels[sel.value]+(accepte?" · "+date(prise.value)+" · "+montant(m):"");
          confirmation(action,texte,()=>enregistrer(payload));
        });
      }else if(r.resiliation_decision==="acceptee"&&Number(r.resiliation_remboursement_ttc)>0&&!r.resiliation_payee_le&&!r.resiliation_cloturee_le&&capacites){
        const b=bouton("Enregistrer le règlement");action.replaceChildren(b);
        b.addEventListener("click",()=>confirmation(action,"Confirmez-vous le règlement effectué de "+montant(r.resiliation_remboursement_ttc)+" ?",()=>enregistrer({action:"paiement",idabo:r.idabo})));
      }else if(!capacites&&!r.resiliation_cloturee_le){action.textContent="Lecture seule";}
      tr.append(d,cellule(date(r.resiliation_decidee_le)),effet,cellule(montant(r.resiliation_echeances_annulees_ttc)),remb,cellule(date(r.resiliation_remboursement_limite)),cellule(date(r.resiliation_payee_le)),cellule(date(r.resiliation_cloturee_le)),action);
      $("lignes").append(tr);
    }
    const n=rows.filter(filtre).length;
    etat(!lectureConfirmee?"Lecture non confirmée.":(capacites?"":"Consultation uniquement — décisions et règlements non raccordés. ")+(n?n+" demande(s).":"Aucune demande pour ce filtre."));
  }
  async function charger(){
    if(occupe)return;occupe=true;lectureConfirmee=false;$("actualiser").disabled=true;$("filtre").disabled=true;$("lignes").replaceChildren();etat("Chargement…");
    try{
      capacites=false;
      try{const c=await api("/membres/resiliations/capabilities");capacites=c.version===1&&c.decisions===true&&c.paiements===true;}catch{}
      const toutes=[];
      for(let offset=0;offset<=1000000;offset+=100){
        const d=await api("/read?resource=membres-resiliations&limit=100&offset="+offset);
        if(d.resource!=="membres-resiliations"||!Array.isArray(d.rows))throw Error("Liste non confirmée.");
        toutes.push(...d.rows);if(d.rows.length<100)break;if(offset===1000000)throw Error("Volume trop important.");
      }
      rows=toutes;lectureConfirmee=true;rendre();
    }catch(e){rows=[];etat(e.message,true);}
    finally{occupe=false;$("actualiser").disabled=false;$("filtre").disabled=false;}
  }
  async function initialiser(){
    const garde=window.LCDP_GUARD_ADMIN;
    if(!garde||!await garde.verifierAccesPageAdmin({path:CHEMIN})||window.LCDP_ADMIN_AUTORISATION?.admin?.type!=="root")return;
    const r=await fetch(window.LCDP_urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"),{credentials:"same-origin",cache:"no-cache"});
    if(!r.ok)throw Error("Bandeau indisponible.");
    const t=document.createElement("template");t.innerHTML=(await r.text()).trim();const slot=document.getElementById("lcdp-bandeau-slot");slot.replaceChildren(t.content.cloneNode(true));
    slot.querySelectorAll("[data-site-href]").forEach(el=>{el.href=el.dataset.space==="admin"?window.LCDP_urlAdmin(el.dataset.siteHref):window.LCDP_urlPublic(el.dataset.siteHref);});
    slot.querySelectorAll("[data-site-src]").forEach(el=>{el.src=window.LCDP_urlObjet(String(el.dataset.siteSrc||"").replace(/^\/?OBJET\/?/,"/"));});
    await window.LCDP_MENU_GAUCHE_ADMIN.initialiser({slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"membres"});
    document.getElementById("lcdp-main-admin").hidden=false;
    $("actualiser").addEventListener("click",charger);$("filtre").addEventListener("change",()=>{if(!occupe&&lectureConfirmee)rendre();});await charger();
  }
  initialiser().catch(e=>{document.getElementById("lcdp-main-admin").hidden=false;etat(e.message,true);});
})();