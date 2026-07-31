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

    const etat = {
      root,
      conteneur,
      template,
      onChange:
        typeof options.onChange === "function"
          ? options.onChange
          : () => {},
      compteur: 0
    };

    ETATS.set(root, etat);

    boutonAjouter.addEventListener("click", () => {
      ajouterBloc(root, {
        titre: "Nouvelle section",
        html: "<p>Nouveau paragraphe.</p>"
      }, true);
    });

    definirBlocs(root, options.blocs);

    return Object.freeze({
      lire: () => lire(root),
      definirBlocs: (blocs) => definirBlocs(root, blocs),
      ajouterBloc: (bloc) => ajouterBloc(root, bloc, true),
      valider: () => valider(root)
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

    const identifiant = normaliserIdentifiant(
      bloc.id,
      "bloc-" + etat.compteur
    );
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

    titre.addEventListener("input", () => {
      masquerErreur(bloc);
      etat.onChange();
    });

    zone.addEventListener("input", () => {
      masquerErreur(bloc);
      etat.onChange();
    });

    zone.addEventListener("focus", () => {
      try {
        document.execCommand("defaultParagraphSeparator", false, "p");
      } catch (_) {
        // Le navigateur peut ignorer cette commande sans bloquer l’éditeur.
      }
    });

    zone.addEventListener("blur", () => {
      normaliserZoneEdition(zone);
    });

    bloc
      .querySelectorAll("[data-lcdp-editeur-commande]")
      .forEach((bouton) => {
        bouton.addEventListener("click", () => {
          const commande = String(
            bouton.dataset.lcdpEditeurCommande || ""
          );

          zone.focus();
          executerCommande(commande);
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

  function normaliserZoneEdition(zone) {
    if (!(zone instanceof Element)) return;

    const htmlNettoye = nettoyerHtmlClient(
      String(zone.innerHTML || "")
    );

    if (zone.innerHTML !== htmlNettoye) {
      zone.innerHTML = htmlNettoye;
    }
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

    template.content.querySelectorAll("script,style,iframe,object,embed,svg,math,form,input,button,textarea,select,template")
      .forEach((element) => element.remove());

    Array.from(template.content.querySelectorAll("div"))
      .reverse()
      .forEach((element) => {
        const contientBloc = Array.from(element.children)
          .some((enfant) => {
            return BALISES_BLOC_RACINE.has(enfant.tagName);
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

    Array.from(template.content.querySelectorAll("*")).forEach((element) => {
      if (!BALISES_AUTORISEES.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }

      Array.from(element.attributes).forEach((attribut) => {
        const nom = attribut.name.toLowerCase();

        if (element.tagName === "A" && nom === "href") {
          const url = normaliserUrlLien(attribut.value);

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
      });
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
          retirerBrFin(noeud);

          if (!elementVide(noeud)) {
            resultat.appendChild(noeud);
          }

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
        if (!paragraphe) return;

        const dernier = paragraphe.lastChild;

        if (
          dernier?.nodeType === Node.ELEMENT_NODE &&
          dernier.tagName === "BR"
        ) {
          dernier.remove();
          fermerParagraphe();
        } else {
          paragraphe.appendChild(noeud);
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

  function nettoyerListe(liste) {
    Array.from(liste.children).forEach((enfant) => {
      if (enfant.tagName !== "LI") {
        enfant.replaceWith(...enfant.childNodes);
      }
    });

    liste.querySelectorAll("li").forEach((item) => {
      retirerBrFin(item);

      if (elementVide(item)) {
        item.remove();
      }
    });
  }

  function retirerBrFin(element) {
    while (
      element.lastChild?.nodeType === Node.ELEMENT_NODE &&
      element.lastChild.tagName === "BR"
    ) {
      element.lastChild.remove();
    }
  }

  function elementVide(element) {
    const copie = element.cloneNode(true);
    copie.querySelectorAll("br").forEach((br) => br.remove());

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
