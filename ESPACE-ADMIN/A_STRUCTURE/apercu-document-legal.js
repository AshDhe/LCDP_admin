(() => {
  "use strict";
  // Lecture privée en mémoire : aucun appel d’écriture ni de publication.
  const cfg=window.SITE_CONFIG||{};
  const urlPublic=p=>window.LCDP_urlPublic(p);
  const urlObjet=p=>window.LCDP_urlObjet(p);
  const urlMembre=p=>typeof cfg.membreUrl==="function"?cfg.membreUrl(p):String(cfg.membreBaseUrl||cfg.MEMBRE_BASE||"https://membre.lacleduparc.fr").replace(/\/+$/,"")+p;
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
  let apercuActif=null;
  function ouvrir(code,documentLocal){
    const mode=types[code];
    if(!mode||!Array.isArray(documentLocal?.blocs))throw Error("Document invalide.");
    if(apercuActif)apercuActif.fermer();
    const editeur=document.body.querySelector(":scope > .lcdp-site-page");
    if(!editeur)throw Error("Structure de rédaction introuvable.");
    const doc=document.implementation.createHTMLDocument(mode.titre+" — Version en projet");
    doc.documentElement.lang="fr";
    doc.documentElement.setAttribute("data-lcdp-css","c085 c034 c038 c032 c083 c036 c037");
    doc.body.className="lcdp-page-document-legal lcdp-app-page";
    const viewport=element(doc,"meta");viewport.name="viewport";viewport.content="width=device-width, initial-scale=1";doc.head.append(viewport);
    const css=element(doc,"link");css.rel="stylesheet";css.href=urlObjet("/CSSBASE/lcdp-central-mobile-first.css");doc.head.append(css);
    const wrapper=element(doc,"div",mode.membre?"lcdp-site-page lcdp-app-wrapper":"lcdp-app-wrapper");
    const bandeau=element(doc,"div");bandeau.id="lcdp-bandeau-slot";bandeau.inert=true;
    const main=element(doc,"main","lcdp-site-main");
    const section=element(doc,"section","lcdp-page-section");section.setAttribute("aria-label",mode.titre);
    const container=element(doc,"div","lcdp-page-container");
    const page=element(doc,"div","lcdp-page-content lcdp-stack-large lcdp-document-legal");
    const titre=element(doc,mode.membre?"header":"div","lcdp-editorial-page-heading");
    titre.append(element(doc,"h1","lcdp-title-page-center lcdp-document-legal__title",mode.titre));
    const contenu=element(doc,"div","lcdp-stack-large lcdp-document-legal__content");contenu.id=mode.slot;
    const footer=element(doc,"div");footer.id="lcdp-footer-slot";footer.inert=true;
    const nettoyer=mode.membre?html=>nettoyerCgv(doc,html):window.LCDP_DOCUMENTS_LEGAUX?.nettoyerHtml||window.LCDP_EDITEUR_CONTENU?.nettoyerHtml;
    if(typeof nettoyer!=="function")throw Error("Normaliseur de contenu indisponible.");
    for(const bloc of documentLocal.blocs){
      const libelle=String(bloc?.titre||"");
      const enveloppe=element(doc,"div");
      const box=element(doc,"section","lcdp-component lcdp-boxtext");box.setAttribute("data-lcdp-boxtext","");
      const h2=element(doc,"h2","lcdp-boxtext__title",libelle);h2.setAttribute("data-lcdp-boxtext-title","");
      if(!/^\s*(?:(?:article|section|chapitre)\s*)?\d+(?=\s|[.):\-])/i.test(libelle))enveloppe.classList.add("lcdp-legal-section--numerotation-auto");
      const texte=element(doc,"div","lcdp-boxtext__content");texte.setAttribute("data-lcdp-boxtext-content","");
      // Le brouillon est déjà normalisé par lireBrouillon ; second filtrage avant insertion.
      texte.innerHTML=nettoyer(String(bloc?.html||""));
      routes(texte,mode);box.append(h2,texte);enveloppe.append(box);contenu.append(enveloppe);
    }
    page.append(titre,contenu);container.append(page);section.append(container);main.append(section);wrapper.append(bandeau,main,footer);doc.body.append(wrapper);

    const precedent={x:window.scrollX,y:window.scrollY,focus:document.activeElement};
    const coffre=element(document,"div");coffre.hidden=true;coffre.inert=true;
    const surface=element(document,"div");surface.id="lcdp-apercu-legal";
    const outils=element(document,"div","lcdp-editeur-contenu__entete");
    const mention=element(document,"p",undefined,"Version en projet — non publiée");
    const retour=element(document,"button","lcdp-button lcdp-button-secondary","Retour à la rédaction");retour.type="button";
    outils.append(mention,retour);
    const cadre=element(document,"iframe");cadre.title="Prévisualisation — "+mode.titre;
    cadre.setAttribute("sandbox","allow-same-origin");
    cadre.setAttribute("width","100%");cadre.setAttribute("frameborder","0");
    cadre.srcdoc="<!doctype html>"+doc.documentElement.outerHTML;
    surface.append(outils,cadre);
    function dimensionner(){cadre.height=String(Math.max(240,window.innerHeight-outils.getBoundingClientRect().height-12));}
    function clavier(e){if(e.key==="Escape"){e.preventDefault();fermer();}}
    function fermer(){
      if(apercuActif?.cadre!==cadre)return;
      apercuActif=null;
      window.removeEventListener("resize",dimensionner);
      document.removeEventListener("keydown",clavier);
      surface.remove();coffre.replaceWith(editeur);
      precedent.focus?.focus({preventScroll:true});
      window.scrollTo(precedent.x,precedent.y);
      requestAnimationFrame(()=>{if(!apercuActif)window.scrollTo(precedent.x,precedent.y);});
    }
    retour.addEventListener("click",fermer);
    cadre.addEventListener("load",()=>{
      if(apercuActif?.cadre!==cadre)return;
      const interieur=cadre.contentDocument;
      if(!interieur?.getElementById(mode.slot))return;
      interieur.addEventListener("keydown",clavier);
      // Les fragments d’habillage ne bloquent jamais l’affichage du document.
      for(const [id,url] of [
        ["lcdp-bandeau-slot",mode.membre?urlMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html"):urlPublic("/ESPACE-PUBLIC/box-bandeau-nav-public.html")],
        ["lcdp-footer-slot",urlObjet("/HTMLBASE/02-footer.html")]
      ]){
        fragment(interieur,url,mode).then(f=>{
          if(apercuActif?.cadre===cadre)interieur.getElementById(id)?.replaceChildren(f);
        }).catch(()=>{});
      }
    },{once:true});
    apercuActif={cadre,fermer};
    editeur.before(coffre,surface);coffre.append(editeur);
    dimensionner();window.addEventListener("resize",dimensionner);
    document.addEventListener("keydown",clavier);
    window.scrollTo(0,0);retour.focus({preventScroll:true});
  }
  window.LCDP_APERCU_DOCUMENT_LEGAL=Object.freeze({ouvrir});
})();
