(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const mode = document.body.dataset.recapParcMode || "texte";
  const STATUS_PAR_MODE = {
    texte: ["2-ademarcher", "3-encours", "prepa", "enligne", "horsligne"],
    images: ["3-encours", "prepa", "enligne", "horsligne"],
    acces: ["prepa", "enligne", "horsligne"]
  };
  const IMAGES_PRESENTATION = ["card1.webp", "01.jpg", "02.jpg", "03.jpg"];
  const IMAGES_ACCES = ["entree1.webp", "entree2.webp"];
  const COLONNES = {
    texte: [
      "Statut", "Département", "Parc", "Présentation",
      "Immersion", "Espace réservé",
      "Texte image 1", "Texte image 2", "Texte image 3", "Texte image 4"
    ],
    images: ["Statut", "Département", "Parc", "Image 1", "Image 2", "Image 3", "Image 4"],
    acces: ["Statut", "Département", "Parc", "Détail accès : entrée", "Image entrée 1", "Image entrée 2"]
  };
  const TAILLE_PAGE = 20;
  const detailsCache = new Map();
  const choixDepartements = new Set();
  const choixParcs = new Set();
  let listeParcs = [];
  let pageActive = 0;
  let generationAffichage = 0;

  const urlAdmin = (path) => typeof window.LCDP_urlAdmin === "function"
    ? window.LCDP_urlAdmin(path) : path;
  const urlObjet = (path) => typeof window.LCDP_urlObjet === "function"
    ? window.LCDP_urlObjet(path) : path;
  const endpoint = (noms) => {
    for (const cle of noms) {
      const valeur = config[cle] || window.ADMIN_CONFIG?.[cle];
      if (valeur) return String(valeur).replace(/\/+$/, "");
    }
    return "";
  };
  const endpointDonnees = () => endpoint([
    "workerAdminDataUrl", "WORKER_ADMIN_DATA_URL", "API_ADMIN_DATA"
  ]);
  const endpointParcs = () => endpoint([
    "workerParcAdminUrl", "WORKER_PARC_ADMIN_URL", "API_PARC_ADMIN", "API_PARC_ADMIN_URL"
  ]);
  const message = (texte, erreur = false) => {
    const element = document.getElementById("lcdp-recap-parc-message");
    if (!element) return;
    element.textContent = texte;
    element.classList.toggle("lcdp-recap-parc__message--erreur", erreur);
  };

  async function chargerFragment(path) {
    const reponse = await fetch(urlAdmin(path), {
      method: "GET", credentials: "same-origin", cache: "no-cache"
    });
    if (!reponse.ok) throw new Error("Fragment administrateur indisponible : " + path);
    const modele = document.createElement("template");
    modele.innerHTML = (await reponse.text()).trim();
    return modele.content.cloneNode(true);
  }

  async function initialiserStructure() {
    const bandeau = document.getElementById("lcdp-bandeau-slot");
    const menu = document.getElementById("lcdp-menu-gauche-admin-slot");
    if (!bandeau || !menu) throw new Error("Structure admin incomplète.");
    bandeau.appendChild(await chargerFragment(
      "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
    ));
    bandeau.querySelectorAll("[data-site-href]").forEach((lien) => {
      lien.href = (lien.dataset.space === "admin" ? urlAdmin :
        (path) => typeof window.LCDP_urlPublic === "function" ? window.LCDP_urlPublic(path) : path)(
          lien.dataset.siteHref || ""
        );
    });
    bandeau.querySelectorAll("[data-site-src]").forEach((image) => {
      image.src = urlObjet(String(image.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/"));
    });
    const composant = window.LCDP_MENU_GAUCHE_ADMIN;
    if (!composant || typeof composant.initialiser !== "function") {
      throw new Error("Menu gauche admin indisponible.");
    }
    await composant.initialiser({
      slotId: "lcdp-menu-gauche-admin-slot",
      categorieActive: "parcs"
    });
  }

  function verifierReponse(response, data, contexte) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Accès administrateur refusé : " + contexte);
    }
    if (!response.ok || !data || data.success !== true) {
      throw new Error(data?.message || data?.detail || ("Lecture impossible : " + contexte));
    }
    return data;
  }

  async function listerStatut(statut) {
    const base = endpointDonnees();
    if (!base) throw new Error("Service de lecture admin non configuré.");
    const resultat = [];
    const limite = 100;
    let offset = 0;
    // La lecture par statut évite de charger les milliers de fiches en base brute.
    for (let numero = 0; numero < 200; numero += 1) {
      const url = new URL(base + "/read");
      url.searchParams.set("resource", "parcs-statut");
      url.searchParams.set("limit", String(limite));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("filter_statut", statut);
      const response = await fetch(url, {
        credentials: "include", cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const data = verifierReponse(
        response, await response.json().catch(() => null), statut
      );
      const lignes = Array.isArray(data.rows) ? data.rows : [];
      // Contrôle supplémentaire du statut : aucune ligne non autorisée n'est affichée.
      resultat.push(...lignes.filter((parc) => parc.statut === statut));
      offset += lignes.length;
      if (!lignes.length || offset >= Number(data.total || 0) || lignes.length < limite) break;
    }
    return resultat;
  }

  async function chargerListe() {
    const ensembles = await Promise.all(STATUS_PAR_MODE[mode].map(listerStatut));
    const parcs = new Map();
    for (const ensemble of ensembles) {
      for (const parc of ensemble) {
        if (parc.idparc) parcs.set(String(parc.idparc), parc);
      }
    }
    listeParcs = Array.from(parcs.values()).sort((a, b) =>
      String(a.dptmt || "").localeCompare(String(b.dptmt || ""), "fr", { numeric: true }) ||
      String(a.nom || "").localeCompare(String(b.nom || ""), "fr")
    );
  }

  function construireFiltre(id, titre, options, selection) {
    const racine = document.getElementById(id);
    racine.replaceChildren();
    const details = document.createElement("details");
    const resume = document.createElement("summary");
    const titreElement = document.createElement("strong");
    titreElement.textContent = titre;
    const compteur = document.createElement("span");
    compteur.className = "lcdp-recap-parc__compteur";
    const actualiserCompteur = () => {
      compteur.textContent = selection.size ? " (" + selection.size + " sélectionné(s))" : " (tous)";
    };
    resume.append(titreElement, compteur);
    const panneau = document.createElement("div");
    panneau.className = "lcdp-recap-parc__panneau";
    const recherche = document.createElement("input");
    recherche.type = "search";
    recherche.className = "lcdp-recap-parc__recherche";
    recherche.placeholder = "Rechercher";
    recherche.setAttribute("aria-label", "Rechercher : " + titre);
    const liste = document.createElement("div");
    liste.className = "lcdp-recap-parc__choix";
    const elements = [];
    for (const option of options) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selection.has(option.value);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selection.add(option.value);
        else selection.delete(option.value);
        actualiserCompteur();
        pageActive = 0;
        afficherTable();
      });
      label.append(checkbox, document.createTextNode(" " + option.label));
      liste.appendChild(label);
      elements.push({ label, texte: option.label.toLocaleLowerCase("fr") });
    }
    recherche.addEventListener("input", () => {
      const terme = recherche.value.trim().toLocaleLowerCase("fr");
      for (const item of elements) {
        item.label.hidden = Boolean(terme) && !item.texte.includes(terme);
      }
    });
    const effacer = document.createElement("button");
    effacer.type = "button";
    effacer.className = "lcdp-button lcdp-button-secondary";
    effacer.textContent = "Tout désélectionner";
    effacer.addEventListener("click", () => {
      selection.clear();
      for (const element of liste.querySelectorAll('input[type="checkbox"]')) {
        element.checked = false;
      }
      actualiserCompteur();
      pageActive = 0;
      afficherTable();
    });
    panneau.append(recherche, liste, effacer);
    details.append(resume, panneau);
    racine.appendChild(details);
    actualiserCompteur();
  }

  function initialiserFiltres() {
    const departements = Array.from(
      new Set(listeParcs.map((parc) => String(parc.dptmt || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    construireFiltre(
      "lcdp-recap-parc-departements", "Départements",
      departements.map((value) => ({ value, label: value })), choixDepartements
    );
    construireFiltre(
      "lcdp-recap-parc-noms", "Parcs",
      listeParcs.map((parc) => ({
        value: String(parc.idparc),
        label: String(parc.nom || "Sans nom") + " (" + String(parc.dptmt || "—") + ")"
      })), choixParcs
    );
  }

  async function ficheComplete(parc) {
    const id = String(parc.idparc || "");
    if (detailsCache.has(id)) return detailsCache.get(id);
    const promesse = (async () => {
      const base = endpointParcs();
      if (!base) throw new Error("Service des fiches parcs non configuré.");
      const url = new URL(base + (mode === "acces" ? "/accesdetail" : "/edition-parc"));
      url.searchParams.set("idparc", id);
      const response = await fetch(url, {
        credentials: "include", cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const data = verifierReponse(
        response, await response.json().catch(() => null), "fiche " + parc.nom
      );
      if (!data.parc || String(data.parc.idparc) !== id) {
        throw new Error("Fiche parc incohérente.");
      }
      return data.parc;
    })();
    detailsCache.set(id, promesse);
    promesse.catch(() => detailsCache.delete(id));
    return promesse;
  }

  function ajouterTexte(cellule, texte) {
    cellule.textContent = String(texte ?? "").trim() || "—";
  }

  function cheminImage(parc, fichier, acces = false) {
    const dossier = String(parc.nom || "").trim().replace(/\s+/g, "_");
    return urlObjet(
      (acces ? "/IMAG/ACCESPARC/" : "/IMAG/PARC/") +
      encodeURIComponent(String(parc.dptmt || "")) + "/" +
      encodeURIComponent(dossier) + "/" + encodeURIComponent(fichier)
    );
  }

  function miniature(cellule, parc, fichier, acces = false) {
    cellule.replaceChildren();
    const image = document.createElement("img");
    image.className = "lcdp-recap-parc__miniature";
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 130;
    image.height = 82;
    image.alt = fichier + " - " + parc.nom;
    image.onerror = () => {
      if (image.isConnected) {
        const absent = document.createElement("span");
        absent.textContent = "—";
        absent.title = "Image non disponible";
        image.replaceWith(absent);
      }
    };
    image.src = cheminImage(parc, fichier, acces);
    cellule.appendChild(image);
  }

  function texteEditorial(photo) {
    if (!photo || typeof photo !== "object") return "—";
    return [
      photo.titre, photo.legende, photo.texte, photo.alt
    ].filter((texte) => typeof texte === "string" && texte.trim()).join("\n\n") || "—";
  }

  function remplirFiche(cellules, fiche) {
    if (mode === "texte") {
      [fiche.prez, fiche.exterieur, fiche.espacereserve].forEach((contenu, index) => {
        ajouterTexte(cellules[index], contenu);
      });
      for (let index = 0; index < 4; index += 1) {
        ajouterTexte(
          cellules[index + 3],
          texteEditorial(fiche.photoseditorial?.[IMAGES_PRESENTATION[index]])
        );
      }
    } else if (mode === "images") {
      IMAGES_PRESENTATION.forEach((fichier, index) => {
        miniature(cellules[index], fiche, fichier);
      });
    } else {
      ajouterTexte(cellules[0], fiche.accesdetail?.entree?.texte);
      IMAGES_ACCES.forEach((fichier, index) => {
        miniature(cellules[index + 1], fiche, fichier, true);
      });
    }
  }

  function boutonPagination(label, disabled, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lcdp-button lcdp-button-secondary";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", callback);
    return button;
  }

  async function chargerFichesVisibles(enAttente, generation) {
    let index = 0;
    const execute = async () => {
      while (index < enAttente.length) {
        const cible = enAttente[index++];
        try {
          const fiche = await ficheComplete(cible.parc);
          if (generation !== generationAffichage) return;
          remplirFiche(cible.cellules, fiche);
        } catch (erreur) {
          if (generation !== generationAffichage) return;
          for (const cellule of cible.cellules) {
            cellule.textContent = "Fiche indisponible";
            cellule.title = String(erreur?.message || erreur);
          }
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(5, enAttente.length) }, execute)
    );
  }

  function afficherTable() {
    const generation = ++generationAffichage;
    const table = document.getElementById("lcdp-recap-parc-table");
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    thead.replaceChildren();
    tbody.replaceChildren();
    const entete = document.createElement("tr");
    for (const titre of COLONNES[mode]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = titre;
      entete.appendChild(th);
    }
    thead.appendChild(entete);

    const filtres = listeParcs.filter((parc) =>
      (!choixDepartements.size || choixDepartements.has(String(parc.dptmt || ""))) &&
      (!choixParcs.size || choixParcs.has(String(parc.idparc || "")))
    );
    const pages = Math.max(1, Math.ceil(filtres.length / TAILLE_PAGE));
    pageActive = Math.max(0, Math.min(pageActive, pages - 1));
    const visibles = filtres.slice(pageActive * TAILLE_PAGE, (pageActive + 1) * TAILLE_PAGE);
    const enAttente = [];
    for (const parc of visibles) {
      const tr = document.createElement("tr");
      for (const valeur of [parc.statut, parc.dptmt, parc.nom]) {
        const td = document.createElement("td");
        ajouterTexte(td, valeur);
        tr.appendChild(td);
      }
      const cellules = [];
      for (let i = 3; i < COLONNES[mode].length; i += 1) {
        const td = document.createElement("td");
        td.textContent = "…";
        tr.appendChild(td);
        cellules.push(td);
      }
      tbody.appendChild(tr);
      enAttente.push({ parc, cellules });
    }
    if (!visibles.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = COLONNES[mode].length;
      td.textContent = "Aucun parc ne correspond à la sélection.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    message(filtres.length + " parc(s) correspondant aux filtres.");
    const navigation = document.getElementById("lcdp-recap-parc-pagination");
    navigation.replaceChildren();
    const prev = boutonPagination("Précédent", pageActive <= 0, () => {
      pageActive -= 1; afficherTable();
    });
    const compteur = document.createElement("span");
    compteur.textContent = "Page " + (pageActive + 1) + " / " + pages;
    const next = boutonPagination("Suivant", pageActive >= pages - 1, () => {
      pageActive += 1; afficherTable();
    });
    navigation.append(prev, compteur, next);
    chargerFichesVisibles(enAttente, generation).catch((erreur) => {
      if (generation === generationAffichage) message(String(erreur?.message || erreur), true);
    });
  }

  async function initialiser() {
    const garde = window.LCDP_GUARD_ADMIN;
    if (!garde || typeof garde.verifierAccesPageAdmin !== "function") {
      throw new Error("Garde administrateur indisponible.");
    }
    if (!await garde.verifierAccesPageAdmin()) return;
    await initialiserStructure();
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
    message("Chargement des parcs…");
    await chargerListe();
    initialiserFiltres();
    afficherTable();
  }

  initialiser().catch((erreur) => {
    const main = document.getElementById("lcdp-main-admin");
    if (main) main.hidden = false;
    message(String(erreur?.message || erreur || "Chargement impossible."), true);
    console.error("Erreur récapitulatif parcs :", erreur);
  });
})();