(() => {
  "use strict";
  // Lecture privée en mémoire : aucun appel d’écriture ni de publication.
  const cfg=window.SITE_CONFIG||{};
  const urlPublic=p=>window.LCDP_urlPublic(p);
  const urlObjet=p=>window.LCDP_urlObjet(p);
  const urlMembre=p=>typeof cfg.membreUrl==="function"?cfg.membreUrl(p):String(cfg.membreBaseUrl||cfg.MEMBRE_BASE||"https://membre.lacleduparc.fr").replace(/\/+$/,"")+p;
  const ouverts=new Map();
  const types={
    cgv:{titre:"CGV",membre:true,path:"/ESPACE-MEMBRE/cgv-lcdp.html",slot:"lcdp-cgv-contenu"},
    "reglement-app":{titre:"Règlement application",path:"/ESPACE-PUBLIC/reglement-app.html",slot:"lcdp-boxtext-reglement-app-slot"},
    "reglement-club":{titre:"Règlement club",path:"/ESPACE-PUBLIC/reglement-club.html",slot:"lcdp-boxtext-reglement-club-slot"}
  };
  function element(doc,tag,classe,texte){
    const e=doc.createElement(tag);if(classe)e.className=classe;if(texte!==undefined)e.textContent=texte;return e;
  }
  function nettoyerCgv(doc,html){
    const tpl=doc.createElement("template");tpl.innerHTML=String(html||"");
    tpl.content.querySelectorAll("script,style,iframe,object,embed,svg,math,form,input,button,textarea,select,template").forEach(n=>n.remove());
    const autorises=new Set(["P","BR","STRONG","EM","UL","OL","LI","A"]);
    [...tpl.content.querySelectorAll("*")].reverse().forEach(n=>{
      if(!autorises.has(n.tagName)){n.replaceWith(...n.childNodes);return;}
      [...n.attributes].forEach(a=>{
        if(n.tagName==="A"&&a.name.toLowerCase()==="href"){
          const h=a.value.trim(), compact=h.replace(/[\x00-\x20\x7f]/g,"").toLowerCase();
          if(h.startsWith("//")||!/^(https:\/\/|mailto:|tel:|\/(?!\/)|#|\.\/|\.\.\/)/.test(compact))n.removeAttribute(a.name);
        }else n.removeAttribute(a.name);
      });
      if(n.tagName==="A"&&n.hasAttribute("href"))n.setAttribute("rel","noopener noreferrer");
    });
    return tpl.innerHTML;
  }
  function routes(racine,mode){
    const base=mode.membre?urlMembre(mode.path):urlPublic(mode.path);
    for(const e of racine.querySelectorAll("[data-site-href],a[href]")){
      const brut=e.dataset.siteHref||e.getAttribute("href")||"";
      if(!brut)continue;
      try{
        const cible=e.dataset.siteHref?(e.dataset.space==="membre"?urlMembre(brut):urlPublic(brut)):new URL(brut,base).href;
        const u=new URL(cible);
        if(!["https:","http:","mailto:","tel:"].includes(u.protocol)){e.removeAttribute("href");continue;}
        e.setAttribute("href",u.href);e.target="_blank";e.rel="noopener noreferrer";
      }catch{e.removeAttribute("href");}
    }
    for(const e of racine.querySelectorAll("[data-site-src],img[src]")){
      try{
        const brut=e.dataset.siteSrc||e.getAttribute("src")||"";
        const cible=e.dataset.siteSrc?urlObjet(brut.replace(/^\/?OBJET\/?/,"/")):new URL(brut,base).href;
        const u=new URL(cible);if(!["https:","http:"].includes(u.protocol))throw Error();
        e.setAttribute("src",u.href);
      }catch{e.removeAttribute("src");}
    }
  }
  async function fragment(doc,url,mode){
    const r=await fetch(url,{credentials:"omit",cache:"no-cache"});
    if(!r.ok)throw Error("Fragment indisponible.");
    const t=doc.createElement("template");t.innerHTML=(await r.text()).trim();
    t.content.querySelectorAll("script,iframe,object,embed,form,base,meta,link,style").forEach(n=>n.remove());
    for(const n of t.content.querySelectorAll("*"))for(const a of [...n.attributes])if(/^on/i.test(a.name)||a.name==="srcdoc")n.removeAttribute(a.name);
    routes(t.content,mode);return t.content;
  }
  function moduleLegal(win){
    return new Promise((resolve,reject)=>{
      const s=win.document.createElement("script");s.src=urlObjet("/JSBASE/documents-legaux.js");
      s.onload=()=>typeof win.LCDP_DOCUMENTS_LEGAUX?.nettoyerHtml==="function"?resolve(win.LCDP_DOCUMENTS_LEGAUX.nettoyerHtml):reject(Error("Normaliseur de consultation indisponible."));
      s.onerror=()=>reject(Error("Normaliseur de consultation indisponible."));
      win.document.head.append(s);
    });
  }
  async function ouvrir(code,documentLocal){
    const mode=types[code];if(!mode||!Array.isArray(documentLocal?.blocs))throw Error("Document invalide.");
    const blocs=documentLocal.blocs.map(b=>({titre:String(b?.titre||""),html:String(b?.html||"")}));
    // Onglet indépendant, réutilisé lors d’une nouvelle prévisualisation.
    let win=ouverts.get(code);
    if(!win||win.closed){win=window.open("","_blank");if(!win)throw Error("Autorisez l’ouverture de l’onglet de prévisualisation.");ouverts.set(code,win);}
    try{win.opener=null;}catch{}
    win.focus();
    const doc=win.document;
    doc.open();doc.write("<!doctype html><html lang=\"fr\" data-lcdp-css=\"c085 c034 c038 c032 c083 c036 c037\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"></head><body class=\"lcdp-page-document-legal lcdp-app-page\"></body></html>");doc.close();
    doc.title=mode.titre+" — Version en projet";
    const css=element(doc,"link");css.rel="stylesheet";css.href=urlObjet("/CSSBASE/lcdp-central-mobile-first.css");doc.head.append(css);
    const wrapper=element(doc,"div",mode.membre?"lcdp-site-page lcdp-app-wrapper":"lcdp-app-wrapper");
    const bandeau=element(doc,"div");bandeau.id="lcdp-bandeau-slot";bandeau.inert=true;
    const main=element(doc,"main","lcdp-site-main");
    const section=element(doc,"section","lcdp-page-section");section.setAttribute("aria-label",mode.titre);
    const container=element(doc,"div","lcdp-page-container");
    const page=element(doc,"div","lcdp-page-content lcdp-stack-large lcdp-document-legal");
    const outils=element(doc,"div","lcdp-document-legal__context");
    const retour=element(doc,"button","lcdp-button lcdp-button-secondary","Retour à la rédaction");retour.type="button";retour.addEventListener("click",()=>{window.focus();win.close();});
    outils.append(element(doc,"p",undefined,"Version en projet — non publiée"),retour);
    const titre=element(doc,mode.membre?"header":"div","lcdp-editorial-page-heading");
    titre.append(element(doc,"h1","lcdp-title-page-center lcdp-document-legal__title",mode.titre));
    const statut=element(doc,"p",undefined,"Chargement du rendu…");statut.setAttribute("role","status");
    const contenu=element(doc,"div","lcdp-stack-large lcdp-document-legal__content");contenu.id=mode.slot;
    const footer=element(doc,"div");footer.id="lcdp-footer-slot";footer.inert=true;
    page.append(outils,titre,statut,contenu);container.append(page);section.append(container);main.append(section);wrapper.append(bandeau,main,footer);doc.body.append(wrapper);
    const erreurs=[];
    const habillage=Promise.all([
      fragment(doc,mode.membre?urlMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html"):urlPublic("/ESPACE-PUBLIC/box-bandeau-nav-public.html"),mode).then(f=>bandeau.replaceChildren(f)).catch(()=>erreurs.push("bandeau")),
      fragment(doc,urlObjet("/HTMLBASE/02-footer.html"),mode).then(f=>footer.replaceChildren(f)).catch(()=>erreurs.push("pied de page"))
    ]);
    try{
      const nettoyer=mode.membre?html=>nettoyerCgv(doc,html):await moduleLegal(win);
      for(const bloc of blocs){
        const enveloppe=element(doc,"div");
        const box=element(doc,"section","lcdp-component lcdp-boxtext");box.setAttribute("data-lcdp-boxtext","");
        const h2=element(doc,"h2","lcdp-boxtext__title",bloc.titre);h2.setAttribute("data-lcdp-boxtext-title","");
        if(!/^\s*(?:(?:article|section|chapitre)\s*)?\d+(?=\s|[.):\-])/i.test(bloc.titre))enveloppe.classList.add("lcdp-legal-section--numerotation-auto");
        const texte=element(doc,"div","lcdp-boxtext__content");texte.setAttribute("data-lcdp-boxtext-content","");
        texte.innerHTML=nettoyer(bloc.html);
        routes(texte,mode);box.append(h2,texte);enveloppe.append(box);contenu.append(enveloppe);
      }
      await habillage;
      statut.textContent=erreurs.length?"Aperçu : "+erreurs.join(" et ")+" indisponible(s).":"";
      statut.hidden=!statut.textContent;
    }catch(e){statut.textContent=String(e?.message||e);throw e;}
    win.scrollTo(0,0);
  }
  window.LCDP_APERCU_DOCUMENT_LEGAL=Object.freeze({ouvrir});
})();
