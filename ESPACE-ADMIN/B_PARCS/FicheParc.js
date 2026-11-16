(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const LISTE_ID = "lcdp-ficheparc-liste";
  const TABLE_ID = "lcdp-table-lecture-admin-slot";
  const APERCU_ID = "lcdp-ficheparc-apercu";
  const $ = id => document.getElementById(id);

  const urlAdmin = path => typeof window.LCDP_urlAdmin === "function" ? window.LCDP_urlAdmin(path) : path;
  const urlPublic = path => typeof window.LCDP_urlPublic === "function" ? window.LCDP_urlPublic(path) : path;
  const urlObjet = path => typeof window.LCDP_urlObjet === "function" ? window.LCDP_urlObjet(path) : path;

  async function chargerFragment(url, titre) {
    const response = await fetch(url, {method:"GET",credentials:"same-origin",cache:"no-cache"});
    if (!response.ok) throw new Error(titre + " indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }

  function chargerScript(url, cle) {
    if (document.querySelector('script[data-ficheparc-module="' + cle + '"]')) return Promise.resolve();
    return new Promise((resolve,reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.defer = true;
      script.dataset.ficheparcModule = cle;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Module indisponible : " + cle));
      document.body.appendChild(script);
    });
  }

  async function chargerBandeau() {
    const slot = $("lcdp-bandeau-slot");
    slot.replaceChildren(await chargerFragment(urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"),"Bandeau"));
    slot.querySelectorAll("[data-site-href]").forEach(el => {
      const chemin = el.dataset.siteHref || "";
      el.href = el.dataset.space === "admin" ? urlAdmin(chemin) : urlPublic(chemin);
    });
    slot.querySelectorAll("[data-site-src]").forEach(el => {
      el.src = urlObjet(String(el.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
  }

  function retourListe() {
    const contenu = $("lcdp-ficheparc-contenu");
    contenu.replaceChildren();
    $("lcdp-ficheparc-apercu").hidden = true;
    $("lcdp-ficheparc-liste").hidden = false;
    $("lcdp-ficheparc-liste").scrollIntoView({block:"start"});
  }

  function afficherFiche(row) {
    const idparc = String(row?.idparc || "").trim();
    if (!idparc) throw new Error("Identifiant du parc absent de la ligne.");

    const nom = String(row.nom || "Parc sans nom");
    const departement = String(row.dptmt || "—");
    const localite = String(row.localite || "—");
    const statut = String(row.statut || "");
    const apercu = $(APERCU_ID);
    const contenu = $("lcdp-ficheparc-contenu");
    const lien = $("lcdp-ficheparc-ouvrir");

    $("lcdp-ficheparc-apercu-nom").textContent = nom;
    $("lcdp-ficheparc-apercu-meta").textContent =
      "Département : " + departement + " · Localité : " + localite +
      " · Statut : " + (statut || "non renseigné");
    contenu.replaceChildren();
    lien.hidden = true;
    lien.removeAttribute("href");

    // Le même aperçu public que dans Mise à jour Parc : prepa et enligne uniquement.
    if (["prepa","enligne"].includes(statut)) {
      const url = urlPublic("/ESPACE-PUBLIC/fiche-parc.html?idparc=" + encodeURIComponent(idparc));
      const frame = document.createElement("iframe");
      frame.src = url;
      frame.title = "Aperçu de la fiche du parc " + nom;
      frame.loading = "lazy";
      frame.className = "lcdp-ficheparc-frame";
      contenu.appendChild(frame);
      lien.href = url;
      lien.hidden = false;
    } else {
      const message = document.createElement("p");
      message.textContent = "La fiche publique n’est pas accessible pour le statut " +
        (statut || "non renseigné") + ".";
      contenu.appendChild(message);
    }

    $(LISTE_ID).hidden = true;
    apercu.hidden = false;
    apercu.scrollIntoView({block:"start"});
  }

  function installerPictogrammes(tableSlot) {
    const tbody = tableSlot.querySelector("[data-lcdp-table-lecture-admin-body]");
    if (!tbody) return;
    const namespace = "http://www.w3.org/2000/svg";
    const dessiner = () => {
      tbody.querySelectorAll(".lcdp-table-lecture-admin__cell-action").forEach(bouton => {
        if (bouton.dataset.ficheparcIcone === "oui") return;
        const nom = bouton.closest("tr")?.cells?.[1]?.textContent?.trim() || "sélectionné";
        const svg = document.createElementNS(namespace, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        const corps = document.createElementNS(namespace, "path");
        corps.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8");
        svg.appendChild(corps);
        bouton.replaceChildren(svg);
        bouton.dataset.ficheparcIcone = "oui";
        bouton.title = "Afficher la fiche du parc " + nom;
        bouton.setAttribute("aria-label", bouton.title);
      });
    };
    new MutationObserver(dessiner).observe(tbody, {childList:true,subtree:true});
    dessiner();
  }

  async function initialiserTable() {
    const slot = $(TABLE_ID);
    slot.replaceChildren(await chargerFragment(
      urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.html"),"Tableau des parcs"));

    await chargerScript(urlAdmin("/ESPACE-ADMIN/A_STRUCTURE/table-lecture-admin.js"),"table-lecture");
    await chargerScript(urlObjet("/JSBASE/07-diginum.js"),"diginum");

    const tableau = window.LCDP_TABLE_LECTURE_ADMIN;
    if (!tableau || typeof tableau.initialiser !== "function")
      throw new Error("Table de lecture administrative indisponible.");

    const endpoint = String(config.workerAdminDataUrl || config.WORKER_ADMIN_DATA_URL ||
      window.ADMIN_CONFIG?.API_ADMIN_DATA || "").replace(/\/+$/, "");
    if (!endpoint) throw new Error("Service de données administrateur non configuré.");

    await tableau.initialiser({
      slotId: TABLE_ID,
      endpoint,
      resource: "parcs-fiches",
      sessionStateKey: "lcdp-ficheparc-filtres",
      pageSize: 100,
      interactiveColumns: ["fiche"],
      interactiveLabel: "Afficher la fiche du parc",
      hiddenFilterColumns: ["fiche"],
      hiddenSortColumns: ["fiche"],
      initialSortKey: "nom",
      initialSortDirection: "asc",
      multipleFilterColumns: ["dptmt"],
      filterOpeners: {
        dptmt: () => window.LCDP_diginum.ouvrir({
          titre: "Ajouter un département",
          placeholder: "exemple 08",
          longueurMax: 3,
          autoValider: code => (code.length === 2 && !code.startsWith("97")) ||
            (code.length === 3 && code.startsWith("97")),
          verifier: code => /^(?:0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|97[1-6])$/.test(code)
            ? null : "Code de département invalide. Exemple : 08."
        })
      },
      filterOptions: {
        statut: [
          {value:"",label:"Tous"},
          {value:"1-basebrute",label:"1-basebrute"},
          {value:"2-aqualifier",label:"2-aqualifier"},
          {value:"2-ademarcher",label:"2-ademarcher"},
          {value:"3-nonqualifié",label:"3-nonqualifié"},
          {value:"3-encours",label:"3-encours"},
          {value:"3-refus",label:"3-refus"},
          {value:"prepa",label:"prepa"},
          {value:"enligne",label:"enligne"},
          {value:"horsligne",label:"horsligne"}
        ]
      },
      onCellActivate: ({row}) => afficherFiche(row)
    });
    installerPictogrammes(slot);
  }

  async function demarrer() {
    const garde = window.LCDP_GUARD_ADMIN;
    if (!garde || typeof garde.verifierAccesPageAdmin !== "function")
      throw new Error("Contrôle d’accès administrateur indisponible.");
    if (!await garde.verifierAccesPageAdmin()) return;
    const menu = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!menu || typeof menu.initialiser !== "function")
      throw new Error("Menu administrateur indisponible.");

    await Promise.all([
      chargerBandeau(),
      menu.initialiser({slotId:"lcdp-menu-gauche-admin-slot",categorieActive:"parcs"})
    ]);
    $("lcdp-main-admin").hidden = false;
    $("lcdp-ficheparc-retour").addEventListener("click",retourListe);
    await initialiserTable();
  }

  demarrer().catch(error => {
    console.error("Fiche parc admin",error);
    const main = $("lcdp-main-admin");
    if (main) main.hidden = false;
    const slot = $(TABLE_ID);
    if (slot) {
      slot.replaceChildren();
      const message = document.createElement("p");
      message.setAttribute("role","alert");
      message.textContent = String(error?.message || "Impossible de charger la liste des parcs.");
      slot.appendChild(message);
    }
  });
})();
