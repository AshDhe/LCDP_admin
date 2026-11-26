(() => {
  "use strict";
  const CHEMIN="/ESPACE-ADMIN/C_MEMBRES/SuiviDFA.html";
  const cfg=window.SITE_CONFIG||{};
  const BASE=String(cfg.workerAdminDataUrl||cfg.WORKER_ADMIN_DATA_URL||window.ADMIN_CONFIG?.API_ADMIN_DATA||"").replace(/\/+$/,"");
  const $=id=>document.getElementById("dfa-"+id);
  const urlAdmin = path => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(path) : path;
  const urlPublic = path => typeof window.LCDP_urlPublic === "function"
    ? window.LCDP_urlPublic(path) : path;
  const urlObjet = path => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(path) : path;


  async function bandeauMenu() {
    const r = await fetch(urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"), {
      credentials: "same-origin", cache: "no-cache"
    });
    if (!r.ok) throw new Error("Bandeau administrateur indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await r.text()).trim();
    const zone = document.getElementById("lcdp-bandeau-slot");
    zone.replaceChildren(template.content.cloneNode(true));
    zone.querySelectorAll("[data-site-href]").forEach(el => {
      el.href = el.dataset.space === "admin"
        ? urlAdmin(el.dataset.siteHref) : urlPublic(el.dataset.siteHref);
    });
    zone.querySelectorAll("[data-site-src]").forEach(el => {
      el.src = urlObjet(String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu || typeof menu.initialiser !== "function") {
      throw new Error("Menu administrateur indisponible.");
    }
    await menu.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot", categorieActive: "membres"
    });
  }


  const date=v=>v?new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Paris"}).format(new Date(v)):"—";
  const montant=v=>v===null||v===undefined?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(v/100);
  let offset=0, busy=false;
  async function api(params){
    if(!BASE)throw Error("Service administratif non configuré.");
    const r=await fetch(BASE+"/membres/dfa?"+new URLSearchParams(params),{credentials:"include",cache:"no-store",headers:{Accept:"application/json"}});
    const d=await r.json().catch(()=>null);if(!r.ok||!d?.success)throw Error(d?.message||"Données indisponibles.");return d;
  }
  function td(tr,v){const c=document.createElement("td");c.textContent=String(v??"—");tr.appendChild(c);return c;}
  async function incidents(id){
    $("incidents").hidden=false;$("incidents-statut").textContent=id;$("incidents-lignes").replaceChildren();
    try{const r=await api({iddfa:id});for(const i of r.incidents){const tr=document.createElement("tr");[date(i.dateincident),i.code,i.occurrences,date(i.derniere_occurrence),date(i.resolution_le)].forEach(v=>td(tr,v));$("incidents-lignes").appendChild(tr);}if(!r.incidents.length)$("incidents-statut").textContent="Aucun incident enregistré.";}
    catch(e){$("incidents-statut").textContent=e.message;}
  }
  async function charger(){
    if(busy)return;busy=true;$("actualiser").disabled=true;$("mode").disabled=true;$("filtre").disabled=true;$("precedent").disabled=true;$("suivant").disabled=true;$("statut").textContent="Chargement…";$("lignes").replaceChildren();$("incidents").hidden=true;
    try{const r=await api({mode:$("mode").value,statut:$("filtre").value,limit:100,offset});for(const d of r.rows){const tr=document.createElement("tr");[d.nommembre,d.prenommembre,date(d.datecreation),date(d.date_limite),d.statut,d.mode_test?"TEST":"Réel",montant(d.montant_brut_centimes),montant(d.frais_stripe_centimes),montant(d.montant_net_centimes),date(d.datepaiement),d.numero_recu,date(d.email_demande_le),date(d.email_recu_le),d.diagnostic,d.iddfa].forEach(v=>td(tr,v));const c=td(tr,"");const b=document.createElement("button");b.type="button";b.className="lcdp-button lcdp-button-secondary";b.textContent="Voir";b.addEventListener("click",()=>incidents(d.iddfa));c.appendChild(b);$("lignes").appendChild(tr);}$("statut").textContent=r.total+" opération(s)";$("precedent").disabled=offset===0;$("suivant").disabled=offset+r.rows.length>=r.total;}
    catch(e){$("statut").textContent=e.message;$("statut").setAttribute("role","alert");}
    finally{busy=false;$("actualiser").disabled=false;$("mode").disabled=false;$("filtre").disabled=false;}
  }
  async function initialiser(){
    const garde=window.LCDP_GUARD_ADMIN;if(!garde||!await garde.verifierAccesPageAdmin({path:CHEMIN}))return;
    if(window.LCDP_ADMIN_AUTORISATION?.admin?.type!=="root")return;
    document.getElementById("lcdp-main-admin").hidden=false;
    $("actualiser").addEventListener("click",charger);["mode","filtre"].forEach(id=>$(id).addEventListener("change",()=>{offset=0;charger();}));$("precedent").addEventListener("click",()=>{offset=Math.max(0,offset-100);charger();});$("suivant").addEventListener("click",()=>{offset+=100;charger();});
    await Promise.all([bandeauMenu(),charger()]);
  }
  initialiser().catch(e=>{$("statut").textContent=e.message;});
})();