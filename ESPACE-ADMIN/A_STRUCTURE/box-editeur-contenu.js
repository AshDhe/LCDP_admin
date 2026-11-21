(() => {
  "use strict";

  const ETATS = new WeakMap();
  const BALISES_AUTORISEES = new Set([
    "P",
    "BR",
    "STRONG",
    "EM",
    "UL",
    "OL",
    "LI",
    "A"
  ]);

  const BALISES_BLOC_RACINE = new Set([
    "P",
    "UL",
    "OL"
  ]);

  const ATTR_SAUT_LIGNE =
    "data-lcdp-soft-break";

  function creerProtectionBrouillon(configuration, blocsInitiaux, environnement) {
    if (!configuration?.code) return null;
    let version = String(configuration.version ?? "");
    const cle = "lcdp-editeur-brouillon:v1:" + encodeURIComponent(String(environnement.identite || "navigateur")) + ":" + encodeURIComponent(configuration.code);
    let stockage, dernier = null, restauration = false, disponible = true;
    let blocs = blocsInitiaux;
    function lire(valeur) {
      try {
        const d = JSON.parse(valeur);
        if (!d || d.schema !== 1 || typeof d.version !== "string" || !Array.isArray(d.blocs) ||
            !d.blocs.every(b => b && typeof b.id === "string" && typeof b.titre === "string" && typeof b.html === "string")) return null;
        return d;
      } catch (_) { return null; }
    }
    try {
      stockage = environnement.stockage();
      const brut = stockage.getItem(cle);
      const d = lire(brut);
      if (d && (d.version === version || environnement.confirmer(
        configuration.sauvegardeAuto
          ? "Un brouillon local existe, mais la version en base a changé. Restaurer cette copie REMPLACE le brouillon actuel lors de la sauvegarde automatique, sans modifier la publication. Annuler conserve la copie locale. Restaurer ?"
          : "Un brouillon local existe, mais le document a changé sur le serveur. Restaurer ce brouillon local ? Vérifie les différences avant tout enregistrement ou publication. Si tu refuses, le brouillon reste conservé dans le navigateur."
      ))) {
        dernier = brut;
        blocs = d.blocs;
        restauration = true;
      }
    } catch (_) {
      disponible = false;
    }
    function sauver(instantane) {
      try {
        stockage = environnement.stockage();
        const actuel = stockage.getItem(cle);
        // Conserver la saisie concurrente d'un autre onglet ou le brouillon dont la restauration a été refusée.
        if (actuel !== null && actuel !== dernier) {
          stockage.setItem(cle + ":recuperation:" + environnement.identifiant(), actuel);
        }
        const brut = JSON.stringify({schema:1, version, date:environnement.maintenant(), blocs:instantane});
        stockage.setItem(cle, brut);
        dernier = brut;
        disponible = true;
        return true;
      } catch (_) {
        disponible = false;
        return false;
      }
    }
    function confirmerSauvegarde(nouvelleVersion, instantane = null) {
      version = String(nouvelleVersion ?? version);
      if (Array.isArray(instantane)) return sauver(instantane);
      try {
        stockage = environnement.stockage();
        // Ne supprimer que la copie qui correspond à l'éditeur ayant obtenu la confirmation serveur.
        if (dernier !== null && stockage.getItem(cle) === dernier) stockage.removeItem(cle);
        dernier = null;
        disponible = true;
        return true;
      } catch (_) {
        disponible = false;
        return false;
      }
    }
    return { blocs, restauration, disponible: () => disponible, sauver, confirmerSauvegarde };
  }

  function initialiser(options = {}) {
    const root = options.root;

    if (!(root instanceof Element)) {
      throw new Error("Racine de l’éditeur de contenu invalide.");
    }

    const conteneur = root.querySelector(
      "[data-lcdp-editeur-blocs]"
    );
    const template = root.querySelector(
      "[data-lcdp-editeur-template]"
    );
    const boutonAjouter = root.querySelector(
      "[data-lcdp-editeur-ajouter]"
    );

    if (!conteneur || !template || !boutonAjouter) {
      throw new Error("Structure de l’éditeur de contenu incomplète.");
    }

    const admin = window.LCDP_ADMIN_AUTORISATION?.admin;
    const protection = creerProtectionBrouillon(options.brouillon, options.blocs, {
      stockage: () => window.localStorage,
      identite: admin?.idadmin || admin?.id || admin?.idAdmin || admin?.id_admin || admin?.adminemail || admin?.emailadmin || admin?.email || "",
      confirmer: message => window.confirm(message),
      identifiant: () => crypto.randomUUID(),
      maintenant: () => new Date().toISOString()
    });
    const etat = {
      root,
      conteneur,
      template,
      onChange: () => {
        const sauvegardeLocale = protection ? protection.sauver(lireInstantane(root)) : false;
        if (typeof options.onChange === "function") options.onChange(sauvegardeLocale);
      },
      compteur: 0
    };

    ETATS.set(root, etat);

    boutonAjouter.addEventListener("click", () => {
      ajouterBloc(root, {
        titre: "Nouvelle section",
        html: "<p>Nouveau paragraphe.</p>"
      }, true);
    });

    definirBlocs(root, protection ? protection.blocs : options.blocs);

    return Object.freeze({
      lire: () => lire(root),
      lireBrouillon: () => lireInstantane(root).map(bloc => ({ ...bloc, titre: bloc.titre.trim(), html: nettoyerHtmlClient(bloc.html) })),
      definirBlocs: (blocs) => definirBlocs(root, blocs),
      ajouterBloc: (bloc) => ajouterBloc(root, bloc, true),
      valider: () => valider(root),
      brouillonRestaure: protection?.restauration === true,
      protectionDisponible: () => protection?.disponible() === true,
      sauvegarderBrouillon: () => protection?.sauver(lireInstantane(root)) === true,
      confirmerBrouillon: (version, conserver = false) => protection?.confirmerSauvegarde(version, conserver ? lireInstantane(root) : null) === true
    });
  }

  function definirBlocs(root, blocs) {
    const etat = obtenirEtat(root);
    const liste = Array.isArray(blocs) ? blocs : [];

    etat.conteneur.innerHTML = "";

    if (liste.length === 0) {
      ajouterBloc(root, {
        titre: "Nouvelle section",
        html: "<p>Nouveau paragraphe.</p>"
      }, false);
    } else {
      liste.forEach((bloc) => {
        ajouterBloc(root, bloc, false);
      });
    }

    actualiserBoutons(root);
  }

  function ajouterBloc(root, bloc = {}, signaler = true) {
    const etat = obtenirEtat(root);
    const fragment = etat.template.content.cloneNode(true);
    const element = fragment.querySelector(
      "[data-lcdp-editeur-bloc]"
    );

    if (!element) {
      throw new Error("Modèle de section de l’éditeur invalide.");
    }

    etat.compteur += 1;

    // Un ancien brouillon peut contenir des identifiants en doublon.
    // Les corriger dans le DOM, sans toucher aux titres, textes ou à l'ordre.
    const baseIdentifiant = normaliserIdentifiant(
      bloc.id,
      "bloc-" + etat.compteur
    );
    const identifiantsExistants = new Set(
      obtenirBlocs(root).map(section => section.dataset.lcdpEditeurBlocId)
    );
    let identifiant = baseIdentifiant;
    let tentative = 0;
    while (identifiantsExistants.has(identifiant)) {
      tentative += 1;
      const suffixe = "-" + etat.compteur +
        (tentative > 1 ? "-" + tentative : "");
      identifiant = baseIdentifiant.slice(0, 64 - suffixe.length) + suffixe;
    }
    const titre = element.querySelector(
      "[data-lcdp-editeur-titre]"
    );
    const zone = element.querySelector(
      "[data-lcdp-editeur-zone]"
    );

    element.dataset.lcdpEditeurBlocId = identifiant;
    titre.value = String(bloc.titre || "");
    zone.innerHTML = nettoyerHtmlClient(
      String(bloc.html || "<p><br></p>")
    );

    brancherBloc(root, element);
    etat.conteneur.appendChild(element);
    actualiserBoutons(root);

    if (signaler) {
      etat.onChange();
      titre.focus();
    }

    return element;
  }

  function brancherBloc(root, bloc) {
    const etat = obtenirEtat(root);
    const titre = bloc.querySelector(
      "[data-lcdp-editeur-titre]"
    );
    const zone = bloc.querySelector(
      "[data-lcdp-editeur-zone]"
    );
    const monter = bloc.querySelector(
      "[data-lcdp-editeur-monter]"
    );
    const descendre = bloc.querySelector(
      "[data-lcdp-editeur-descendre]"
    );
    const supprimer = bloc.querySelector(
      "[data-lcdp-editeur-supprimer]"
    );
    const lienBouton = bloc.querySelector(
      "[data-lcdp-editeur-lien]"
    );
    const lienZone = bloc.querySelector(
      "[data-lcdp-editeur-lien-zone]"
    );
    const lienUrl = bloc.querySelector(
      "[data-lcdp-editeur-lien-url]"
    );
    const lienAppliquer = bloc.querySelector(
      "[data-lcdp-editeur-lien-appliquer]"
    );
    const lienAnnuler = bloc.querySelector(
      "[data-lcdp-editeur-lien-annuler]"
    );

    let selectionLien = null;
    let selectionListe = null;
    function memoriserSelectionListe() {
      const range = memoriserSelectionDans(zone);
      if (range && zone.contains(range.startContainer) && zone.contains(range.endContainer)) selectionListe = range;
    }
    for (const evenement of ["mouseup", "keyup", "input", "focusout"]) {
      zone.addEventListener(evenement, memoriserSelectionListe);
    }

    titre.addEventListener("input", () => {
      masquerErreur(bloc);
      etat.onChange();
    });

    zone.addEventListener("input", () => {
      masquerErreur(bloc);
      etat.onChange();
    });

    zone.addEventListener("focus", () => {
      definirSeparateurParagraphe();
    });

    zone.addEventListener("keydown", (event) => {
      gererToucheEntreeEdition(
        event,
        zone,
        etat
      );
    });

    zone.addEventListener("paste", (event) => {
      gererCollageEdition(
        event,
        zone,
        etat
      );
    });

    bloc
      .querySelectorAll("[data-lcdp-editeur-commande]")
      .forEach((bouton) => {
        const commande = String(bouton.dataset.lcdpEditeurCommande || "");
        const estCommandeListe = commande === "insertUnorderedList" || commande === "insertOrderedList";
        if (estCommandeListe) {
          // Le clic sur la barre ne doit pas déplacer la sélection hors du contenu.
          bouton.addEventListener("mousedown", event => {
            if (event.button !== 0) return;
            memoriserSelectionListe();
            event.preventDefault();
          });
        }
        bouton.addEventListener("click", () => {
          if (!estCommandeListe) {
            zone.focus();
            executerCommande(commande);
            etat.onChange();
            return;
          }
          const range = memoriserSelectionDans(zone) || selectionListe;
          if (!range || !zone.contains(range.startContainer) || !zone.contains(range.endContainer)) return;
          zone.focus({ preventScroll: true });
          restaurerSelection(range);
          const balise = commande === "insertUnorderedList" ? "UL" : "OL";
          if (!basculerListe(zone, range, balise)) {
            // N'appeler la commande native que pour créer une liste depuis du texte.
            // Ne jamais lui confier une sélection qui touche une liste existante.
            if (Array.from(zone.querySelectorAll("ul,ol")).some(liste => range.intersectsNode(liste))) return;
            executerCommande(commande);
          }
          memoriserSelectionListe();
          etat.onChange();
        });
      });

    lienBouton.addEventListener("click", () => {
      selectionLien = memoriserSelectionDans(zone);
      lienZone.hidden = false;
      lienUrl.value = "";
      lienUrl.focus();
    });

    lienAnnuler.addEventListener("click", () => {
      lienZone.hidden = true;
      lienUrl.value = "";
      zone.focus();
    });

    lienAppliquer.addEventListener("click", () => {
      const url = normaliserUrlLien(lienUrl.value);

      if (!url) {
        lienUrl.setCustomValidity(
          "Saisir une adresse http(s), mailto, tel, interne ou une ancre."
        );
        lienUrl.reportValidity();
        return;
      }

      lienUrl.setCustomValidity("");
      restaurerSelection(selectionLien);
      zone.focus();
      document.execCommand("createLink", false, url);
      lienZone.hidden = true;
      lienUrl.value = "";
      etat.onChange();
    });

    monter.addEventListener("click", () => {
      const precedent = bloc.previousElementSibling;

      if (!precedent) return;

      etat.conteneur.insertBefore(bloc, precedent);
      actualiserBoutons(root);
      etat.onChange();
    });

    descendre.addEventListener("click", () => {
      const suivant = bloc.nextElementSibling;

      if (!suivant) return;

      etat.conteneur.insertBefore(suivant, bloc);
      actualiserBoutons(root);
      etat.onChange();
    });

    supprimer.addEventListener("click", () => {
      const blocs = obtenirBlocs(root);

      if (blocs.length <= 1) {
        afficherErreur(
          bloc,
          "La page doit conserver au moins une section."
        );
        return;
      }

      bloc.remove();
      actualiserBoutons(root);
      etat.onChange();
    });
  }

  function basculerListe(zone, range, balise) {
    const selection = window.getSelection();
    if (!range || !zone.contains(range.startContainer) || !zone.contains(range.endContainer)) return false;
    const estListe = node => node && (node.tagName === "UL" || node.tagName === "OL");
    // Si la sélection est entièrement dans une liste imbriquée, travailler à ce niveau.
    let racine = zone;
    let parent = range.commonAncestorContainer;
    if (parent.nodeType !== Node.ELEMENT_NODE) parent = parent.parentElement;
    const proche = parent?.closest("ul,ol");
    if (proche && zone.contains(proche) && proche.parentElement !== zone) racine = proche.parentElement;
    const blocs = Array.from(racine.children);
    const unites = blocs.flatMap(bloc => estListe(bloc)
      ? Array.from(bloc.children).filter(item => item.tagName === "LI").map(item => ({ item, liste: bloc }))
      : [{ item: bloc, liste: null }]);
    function touche(item) {
      if (range.collapsed) return item.contains(range.startContainer);
      if (!range.intersectsNode(item)) return false;
      // La fin au début exact d'une puce ne sélectionne pas cette puce.
      if (item.contains(range.endContainer)) {
        const avant = document.createRange();
        avant.selectNodeContents(item);
        avant.setEnd(range.endContainer, range.endOffset);
        if (!avant.toString() && !avant.cloneContents().querySelector("br")) return false;
      }
      if (item.contains(range.startContainer)) {
        const apres = document.createRange();
        apres.selectNodeContents(item);
        apres.setStart(range.startContainer, range.startOffset);
        if (!apres.toString() && !apres.cloneContents().querySelector("br")) return false;
      }
      return true;
    }
    const choisis = unites.filter(u => touche(u.item));
    // Une création depuis du texte ordinaire garde le comportement natif existant.
    if (!choisis.some(u => u.liste)) return false;
    const retirer = choisis.every(u => u.liste?.tagName === balise);
    const selectionnes = new Set(choisis.map(u => u.item));
    const transformes = [];
    const debut = range.startContainer, fin = range.endContainer;
    const offsetDebut = range.startOffset, offsetFin = range.endOffset;
    const replie = range.collapsed;
    for (const bloc of blocs) {
      if (!estListe(bloc) || !Array.from(bloc.children).some(item => selectionnes.has(item))) continue;
      const fragment = document.createDocumentFragment();
      let groupe = null;
      for (const item of Array.from(bloc.children)) {
        if (item.tagName !== "LI") { fragment.appendChild(item); groupe = null; continue; }
        const choisi = selectionnes.has(item);
        if (choisi && retirer) {
          groupe = null;
          let p = document.createElement("p");
          const debutItem = transformes.length;
          function ajouterParagraphe() {
            if (!p.hasChildNodes()) p.appendChild(document.createElement("br"));
            fragment.appendChild(p); transformes.push(p); p = document.createElement("p");
          }
          for (const enfant of Array.from(item.childNodes)) {
            if (estListe(enfant)) {
              if (p.hasChildNodes()) ajouterParagraphe();
              fragment.appendChild(enfant); transformes.push(enfant);
            } else if (enfant.tagName === "P" || enfant.tagName === "DIV") {
              if (p.hasChildNodes()) ajouterParagraphe();
              p.append(...enfant.childNodes); ajouterParagraphe();
            } else p.appendChild(enfant);
          }
          if (p.hasChildNodes() || transformes.length === debutItem) ajouterParagraphe();
        } else {
          const type = choisi ? balise : bloc.tagName;
          if (!groupe || groupe.tagName !== type) {
            groupe = document.createElement(type.toLowerCase()); fragment.appendChild(groupe);
          }
          groupe.appendChild(item);
          if (choisi) transformes.push(item);
        }
      }
      bloc.replaceWith(fragment);
    }
    if (!retirer) {
      let groupe = null;
      for (const bloc of Array.from(racine.children)) {
        if (!selectionnes.has(bloc) || estListe(bloc)) { groupe = null; continue; }
        if (!groupe) { groupe = document.createElement(balise.toLowerCase()); bloc.before(groupe); }
        const item = document.createElement("li"); item.append(...bloc.childNodes); groupe.appendChild(item);
        bloc.remove(); transformes.push(item);
      }
    }
    // Les nœuds de texte sont déplacés, pas réécrits ; garder la sélection quand possible.
    const restauree = document.createRange();
    try {
      if (!zone.contains(debut) || !zone.contains(fin)) throw new Error("Sélection déplacée");
      restauree.setStart(debut, offsetDebut); restauree.setEnd(fin, offsetFin);
      if (!replie && restauree.collapsed) throw new Error("Sélection déplacée");
    } catch (_) {
      transformes.sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      const premier = transformes[0], dernier = transformes[transformes.length - 1];
      if (!premier) return true;
      restauree.selectNodeContents(premier);
      if (replie) restauree.collapse(true);
      else restauree.setEnd(dernier, dernier.childNodes.length);
    }
    selection.removeAllRanges(); selection.addRange(restauree);
    return true;
  }

  function executerCommande(commande) {
    const autorisees = new Set([
      "bold",
      "italic",
      "insertUnorderedList",
      "insertOrderedList",
      "unlink",
      "removeFormat"
    ]);

    if (!autorisees.has(commande)) {
      return;
    }

    document.execCommand(commande, false, null);
  }

  function memoriserSelectionDans(zone) {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount < 1 ||
      !zone.contains(selection.anchorNode)
    ) {
      return null;
    }

    return selection.getRangeAt(0).cloneRange();
  }

  function restaurerSelection(range) {
    if (!range) return;

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function definirSeparateurParagraphe() {
    try {
      document.execCommand(
        "defaultParagraphSeparator",
        false,
        "p"
      );
    } catch (_) {
      // Certains navigateurs ignorent cette commande.
    }
  }

  function gererToucheEntreeEdition(
    event,
    zone,
    etat
  ) {
    if (
      event.key !== "Enter" ||
      event.isComposing
    ) {
      return;
    }

    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount < 1 ||
      !zone.contains(selection.anchorNode)
    ) {
      return;
    }

    const itemListe = trouverParentDansZone(
      selection.anchorNode,
      "LI",
      zone
    );

    if (itemListe && !event.shiftKey) {
      // Le comportement natif crée une nouvelle puce
      // ou quitte proprement la liste si la puce est vide.
      definirSeparateurParagraphe();
      return;
    }

    event.preventDefault();

    if (event.shiftKey) {
      insererSautLigneSouple(zone);
    } else {
      insererNouveauParagraphe(zone);
    }

    masquerErreur(
      zone.closest("[data-lcdp-editeur-bloc]")
    );
    etat.onChange();
  }

  function insererSautLigneSouple(zone) {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount < 1 ||
      !zone.contains(selection.anchorNode)
    ) {
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const saut = creerSautLigneSouple();
    range.insertNode(saut);
    range.setStartAfter(saut);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insererNouveauParagraphe(zone) {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount < 1 ||
      !zone.contains(selection.anchorNode)
    ) {
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    let paragraphe = trouverParentDansZone(
      range.startContainer,
      "P",
      zone
    );

    if (!paragraphe) {
      definirSeparateurParagraphe();
      document.execCommand("formatBlock", false, "p");
      paragraphe = trouverParentDansZone(
        selection.anchorNode,
        "P",
        zone
      );
    }

    if (!paragraphe) {
      const nouveau = document.createElement("p");
      nouveau.appendChild(creerSautLigneSouple());
      range.insertNode(nouveau);
      placerCurseurDebut(nouveau);
      return;
    }

    retirerSautsPlaceholders(paragraphe);

    const finParagraphe = document.createRange();
    finParagraphe.setStart(
      range.startContainer,
      range.startOffset
    );
    finParagraphe.setEnd(
      paragraphe,
      paragraphe.childNodes.length
    );

    const suite = finParagraphe.extractContents();
    const nouveau = document.createElement("p");
    nouveau.appendChild(suite);

    assurerParagrapheEditable(paragraphe);
    assurerParagrapheEditable(nouveau);

    paragraphe.after(nouveau);
    placerCurseurDebut(nouveau);
  }

  function gererCollageEdition(
    event,
    zone,
    etat
  ) {
    const pressePapier = event.clipboardData;

    if (!pressePapier) {
      return;
    }

    const html = pressePapier.getData("text/html");
    const texte = pressePapier.getData("text/plain");

    if (!html && !texte) {
      return;
    }

    event.preventDefault();

    const contenu = html
      ? nettoyerHtmlClient(html)
      : convertirTexteColleEnHtml(texte);

    if (!contenu) {
      return;
    }

    insererHtmlNormalise(zone, contenu);
    masquerErreur(
      zone.closest("[data-lcdp-editeur-bloc]")
    );
    etat.onChange();
  }

  function insererHtmlNormalise(zone, html) {
    const marqueur =
      "LCDP_CURSOR_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2);

    zone.focus();
    document.execCommand(
      "insertHTML",
      false,
      html + echapperHtmlTexte(marqueur)
    );

    const nettoye = nettoyerHtmlClient(
      String(zone.innerHTML || "")
    );

    zone.innerHTML = nettoye;
    placerCurseurSurMarqueur(zone, marqueur);
  }

  function placerCurseurSurMarqueur(
    zone,
    marqueur
  ) {
    const parcours = document.createTreeWalker(
      zone,
      NodeFilter.SHOW_TEXT
    );
    let noeud;

    while ((noeud = parcours.nextNode())) {
      const position = String(
        noeud.textContent || ""
      ).indexOf(marqueur);

      if (position < 0) {
        continue;
      }

      const avant = noeud.textContent.slice(
        0,
        position
      );
      const apres = noeud.textContent.slice(
        position + marqueur.length
      );
      noeud.textContent = avant + apres;

      const range = document.createRange();
      range.setStart(noeud, avant.length);
      range.collapse(true);

      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    placerCurseurFin(zone);
  }

  function convertirTexteColleEnHtml(value) {
    const lignes = String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((ligne) => ligne.trim())
      .filter(Boolean);

    return lignes.map((ligne) => {
      return "<p>" +
        echapperHtmlTexte(ligne) +
        "</p>";
    }).join("");
  }

  function echapperHtmlTexte(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function trouverParentDansZone(
    noeud,
    nomBalise,
    zone
  ) {
    let courant = noeud?.nodeType === Node.ELEMENT_NODE
      ? noeud
      : noeud?.parentElement;

    while (courant && courant !== zone) {
      if (courant.tagName === nomBalise) {
        return courant;
      }

      courant = courant.parentElement;
    }

    return null;
  }

  function creerSautLigneSouple() {
    const saut = document.createElement("br");
    saut.setAttribute(ATTR_SAUT_LIGNE, "true");
    return saut;
  }

  function estSautLigneSouple(element) {
    return Boolean(
      element?.nodeType === Node.ELEMENT_NODE &&
      element.tagName === "BR" &&
      element.getAttribute(ATTR_SAUT_LIGNE) === "true"
    );
  }

  function retirerSautsPlaceholders(element) {
    if (!element || !elementVide(element)) {
      return;
    }

    element.querySelectorAll("br").forEach((br) => {
      br.remove();
    });
  }

  function assurerParagrapheEditable(paragraphe) {
    if (!paragraphe || !elementVide(paragraphe)) {
      return;
    }

    paragraphe.replaceChildren(
      creerSautLigneSouple()
    );
  }

  function placerCurseurDebut(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function placerCurseurFin(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Instantané non destructif : aucun contrôle de validité ni changement du DOM ou du curseur.
  function lireInstantane(root) {
    return obtenirBlocs(root).map((bloc, index) => ({
      id: normaliserIdentifiant(bloc.dataset.lcdpEditeurBlocId, "bloc-" + (index + 1)),
      titre: String(bloc.querySelector("[data-lcdp-editeur-titre]")?.value ?? ""),
      html: String(bloc.querySelector("[data-lcdp-editeur-zone]")?.innerHTML ?? "")
    }));
  }

  function lire(root) {
    return obtenirBlocs(root).map((bloc, index) => {
      const titre = bloc.querySelector(
        "[data-lcdp-editeur-titre]"
      );
      const zone = bloc.querySelector(
        "[data-lcdp-editeur-zone]"
      );
      const html = nettoyerHtmlClient(
        String(zone?.innerHTML || "")
      );

      if (zone && zone.innerHTML !== html) {
        zone.innerHTML = html;
      }

      return {
        id: normaliserIdentifiant(
          bloc.dataset.lcdpEditeurBlocId,
          "bloc-" + (index + 1)
        ),
        titre: String(titre?.value || "").trim(),
        html
      };
    });
  }

  function valider(root) {
    let valide = true;

    obtenirBlocs(root).forEach((bloc) => {
      masquerErreur(bloc);

      const titre = String(
        bloc.querySelector("[data-lcdp-editeur-titre]")?.value || ""
      ).trim();
      const zone = bloc.querySelector(
        "[data-lcdp-editeur-zone]"
      );
      const html = nettoyerHtmlClient(
        String(zone?.innerHTML || "")
      );
      const texte = extraireTexte(html);

      if (zone && zone.innerHTML !== html) {
        zone.innerHTML = html;
      }

      if (!titre) {
        afficherErreur(bloc, "Le titre de la section est obligatoire.");
        valide = false;
        return;
      }

      if (!texte) {
        afficherErreur(bloc, "Le contenu de la section est obligatoire.");
        valide = false;
      }
    });

    return valide;
  }

  function actualiserBoutons(root) {
    const blocs = obtenirBlocs(root);

    blocs.forEach((bloc, index) => {
      const monter = bloc.querySelector(
        "[data-lcdp-editeur-monter]"
      );
      const descendre = bloc.querySelector(
        "[data-lcdp-editeur-descendre]"
      );
      const supprimer = bloc.querySelector(
        "[data-lcdp-editeur-supprimer]"
      );

      monter.disabled = index === 0;
      descendre.disabled = index === blocs.length - 1;
      supprimer.disabled = blocs.length <= 1;
    });
  }

  function nettoyerHtmlClient(htmlBrut) {
    const template = document.createElement("template");
    template.innerHTML = String(htmlBrut || "");

    // Convertir les balises du navigateur avant le filtrage.
    template.content.querySelectorAll("b,i").forEach((element) => {
      const remplacement = document.createElement(
        element.tagName === "B" ? "strong" : "em"
      );
      remplacement.append(...element.childNodes);
      element.replaceWith(remplacement);
    });

    template.content.querySelectorAll(
      "script,style,iframe,object,embed,svg,math,form,input,button,textarea,select,template"
    ).forEach((element) => element.remove());

    Array.from(
      template.content.querySelectorAll(
        "div,section,article,blockquote,h1,h2,h3,h4,h5,h6"
      )
    ).reverse().forEach((element) => {
      const contientBloc = Array.from(
        element.children
      ).some((enfant) => {
        return BALISES_BLOC_RACINE.has(
          enfant.tagName
        );
      });

      if (contientBloc) {
        element.replaceWith(...element.childNodes);
        return;
      }

      const p = document.createElement("p");

      while (element.firstChild) {
        p.appendChild(element.firstChild);
      }

      element.replaceWith(p);
    });

    Array.from(
      template.content.querySelectorAll("*")
    ).forEach((element) => {
      if (!BALISES_AUTORISEES.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }

      Array.from(element.attributes).forEach(
        (attribut) => {
          const nom = attribut.name.toLowerCase();

          if (
            element.tagName === "BR" &&
            nom === ATTR_SAUT_LIGNE &&
            attribut.value === "true"
          ) {
            return;
          }

          if (
            element.tagName === "A" &&
            nom === "href"
          ) {
            const url = normaliserUrlLien(
              attribut.value
            );

            if (url) {
              element.setAttribute("href", url);
            } else {
              element.removeAttribute(attribut.name);
            }

            return;
          }

          if (
            element.tagName === "A" &&
            nom === "class" &&
            attribut.value === "lcdp-link-secondary"
          ) {
            return;
          }

          if (
            element.tagName === "A" &&
            nom === "data-site-href" &&
            normaliserUrlLien(attribut.value)
          ) {
            return;
          }

          element.removeAttribute(attribut.name);
        }
      );
    });

    normaliserBlocsRacine(template.content);

    return template.innerHTML.trim();
  }

  function normaliserBlocsRacine(fragment) {
    const resultat = document.createDocumentFragment();
    let paragraphe = null;

    function ouvrirParagraphe() {
      if (!paragraphe) {
        paragraphe = document.createElement("p");
      }

      return paragraphe;
    }

    function fermerParagraphe() {
      if (!paragraphe) return;

      retirerBrFin(paragraphe);

      if (!elementVide(paragraphe)) {
        resultat.appendChild(paragraphe);
      }

      paragraphe = null;
    }

    Array.from(fragment.childNodes).forEach((noeud) => {
      if (
        noeud.nodeType === Node.ELEMENT_NODE &&
        BALISES_BLOC_RACINE.has(noeud.tagName)
      ) {
        fermerParagraphe();

        if (noeud.tagName === "P") {
          ajouterParagraphesNormalises(
            noeud,
            resultat
          );
          return;
        }

        nettoyerListe(noeud);

        if (!elementVide(noeud)) {
          resultat.appendChild(noeud);
        }

        return;
      }

      if (
        noeud.nodeType === Node.ELEMENT_NODE &&
        noeud.tagName === "BR"
      ) {
        if (estSautLigneSouple(noeud)) {
          ouvrirParagraphe().appendChild(noeud);
        } else {
          fermerParagraphe();
        }

        return;
      }

      if (
        noeud.nodeType === Node.TEXT_NODE &&
        !String(noeud.textContent || "").trim() &&
        !paragraphe
      ) {
        return;
      }

      ouvrirParagraphe().appendChild(noeud);
    });

    fermerParagraphe();
    fragment.replaceChildren(resultat);
  }

  function ajouterParagraphesNormalises(
    source,
    destination
  ) {
    let paragraphe = document.createElement("p");

    function fermer() {
      retirerBrFin(paragraphe);

      if (!elementVide(paragraphe)) {
        destination.appendChild(paragraphe);
      }

      paragraphe = document.createElement("p");
    }

    Array.from(source.childNodes).forEach((noeud) => {
      if (
        noeud.nodeType === Node.ELEMENT_NODE &&
        noeud.tagName === "BR" &&
        !estSautLigneSouple(noeud)
      ) {
        fermer();
        return;
      }

      paragraphe.appendChild(noeud);
    });

    fermer();
  }

  function nettoyerListe(liste) {
    Array.from(liste.children).forEach((enfant) => {
      if (enfant.tagName !== "LI") {
        enfant.replaceWith(...enfant.childNodes);
      }
    });

    liste.querySelectorAll("li").forEach((item) => {
      item.querySelectorAll("br").forEach((br) => {
        br.setAttribute(ATTR_SAUT_LIGNE, "true");
      });

      retirerBrFin(item);

      if (elementVide(item)) {
        item.remove();
      }
    });
  }

  function retirerBrFin(element) {
    while (
      element.lastChild?.nodeType === Node.ELEMENT_NODE &&
      element.lastChild.tagName === "BR" &&
      !estSautLigneSouple(element.lastChild)
    ) {
      element.lastChild.remove();
    }
  }

  function elementVide(element) {
    const copie = element.cloneNode(true);
    copie.querySelectorAll("br").forEach((br) => {
      br.remove();
    });

    return !String(copie.textContent || "")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function normaliserUrlLien(value) {
    const url = String(value || "").trim();

    if (!url || url.startsWith("//")) {
      return "";
    }

    const compact = url
      .replace(/[\u0000-\u0020\u007f]+/g, "")
      .toLowerCase();

    if (
      compact.startsWith("http://") ||
      compact.startsWith("https://") ||
      compact.startsWith("mailto:") ||
      compact.startsWith("tel:") ||
      compact.startsWith("/") ||
      compact.startsWith("#") ||
      compact.startsWith("../") ||
      compact.startsWith("./")
    ) {
      return url;
    }

    return "";
  }

  function extraireTexte(htmlBrut) {
    const template = document.createElement("template");
    template.innerHTML = String(htmlBrut || "");
    return String(template.content.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normaliserIdentifiant(value, fallback) {
    const identifiant = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

    return identifiant || fallback;
  }

  function obtenirEtat(root) {
    const etat = ETATS.get(root);

    if (!etat) {
      throw new Error("Éditeur de contenu non initialisé.");
    }

    return etat;
  }

  function obtenirBlocs(root) {
    return Array.from(
      obtenirEtat(root).conteneur.querySelectorAll(
        ":scope > [data-lcdp-editeur-bloc]"
      )
    );
  }

  function afficherErreur(bloc, message) {
    const erreur = bloc.querySelector(
      "[data-lcdp-editeur-erreur]"
    );

    if (!erreur) return;

    erreur.textContent = message;
    erreur.hidden = false;
  }

  function masquerErreur(bloc) {
    const erreur = bloc.querySelector(
      "[data-lcdp-editeur-erreur]"
    );

    if (!erreur) return;

    erreur.textContent = "";
    erreur.hidden = true;
  }

  window.LCDP_EDITEUR_CONTENU = Object.freeze({
    initialiser,
    nettoyerHtml: nettoyerHtmlClient
  });
})();
