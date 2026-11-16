(() => {
  "use strict";

  const TYPES = [
    { key: "admin", label: "Aso", codes: ["root", "asso"] },
    { key: "resparc", label: "Resparc", codes: ["resparc"] },
    { key: "coach", label: "Coach", codes: ["coach"] }
  ];
  const TYPES_VALIDES = new Set(["root", "asso", "resparc", "coach"]);

  async function initialiser(options = {}) {
    const racine = options.racine;
    const status = options.status;
    const endpoint = String(options.adminSessionUrl || "").replace(/\/+$/, "");
    const auth = options.autorisation?.admin || {};
    const estRoot = auth.type === "root";
    const endpointLecture = String(options.adminDataUrl || "").replace(/\/+$/, "");
    if (!racine || !status || !endpoint || !window.LCDP_WRAPER_ONGLETS) {
      throw new Error("Composants de la liste admin indisponibles.");
    }
    const onglets = window.LCDP_WRAPER_ONGLETS.initialiser({
      racine,
      idPrefix: "lcdp-comptes-admin",
      ariaLabel: "Comptes de l'espace admin",
      onglets: TYPES.map(({ key, label }) => ({ key, label }))
    });
    let comptes = [];
    let occupe = false;
    let gestionDisponible = false;
    let categorieActive = "admin";
    const ajouter = document.getElementById("lcdp-listadmin-ajouter");
    const lightbox = document.getElementById("lcdp-listadmin-lightbox");
    const formInvitation = document.getElementById("lcdp-listadmin-form");
    const typeInput = document.getElementById("lcdp-listadmin-type");
    const typeChamp = document.getElementById("lcdp-listadmin-type-champ");
    const typeFixe = document.getElementById("lcdp-listadmin-type-fixe");
    const titreForm = document.getElementById("lcdp-listadmin-form-title");
    const erreurForm = document.getElementById("lcdp-listadmin-erreur");
    const envoyerForm = document.getElementById("lcdp-listadmin-envoyer");
    let previousOverflow = "";

    const texte = (value) => String(value ?? "").trim();
    const informer = (message, erreur = false) => {
      status.textContent = message;
      status.hidden = !message;
      status.setAttribute("role", erreur ? "alert" : "status");
    };
    const bouton = (label, classe, fn, disabled = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = classe;
      b.textContent = label;
      b.disabled = disabled;
      if (fn) b.addEventListener("click", fn);
      return b;
    };
    const champ = (label, type, name, options = []) => {
      const wrapper = document.createElement("label");
      wrapper.className = "lcdp-box-champ-formulaire";
      wrapper.append(document.createTextNode(label));
      const input = type === "select" ? document.createElement("select") : document.createElement("input");
      input.name = name;
      input.className = "lcdp-table-lecture-admin__filter-input";
      if (type === "select") {
        for (const [value, name] of options) {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = name;
          input.appendChild(opt);
        }
      } else {
        input.type = type;
        input.autocomplete = "off";
        input.maxLength = type === "email" ? 254 : 120;
      }
      input.required = true;
      wrapper.appendChild(input);
      return { wrapper, input };
    };

    function mettreAJourBoutonAjouter() {
      if (!ajouter) return;
      ajouter.hidden = !estRoot;
      ajouter.disabled = !estRoot;
      ajouter.title = "";
      ajouter.setAttribute("aria-expanded", String(!lightbox.hidden));
      ajouter.setAttribute("aria-controls", "lcdp-listadmin-lightbox");
    }

    function fermerLightbox(force = false) {
      if (lightbox.hidden || (occupe && !force)) return;
      lightbox.hidden = true;
      document.body.style.overflow = previousOverflow;
      formInvitation.reset();
      erreurForm.textContent = "";
      erreurForm.hidden = true;
      mettreAJourBoutonAjouter();
      ajouter.focus();
    }

    function ouvrirLightbox() {
      if (!estRoot || occupe || !lightbox.hidden) return;
      const def = TYPES.find((item) => item.key === categorieActive);
      if (!def) return;
      formInvitation.reset();
      erreurForm.textContent = "";
      erreurForm.hidden = true;
      titreForm.textContent = "Nouvel administrateur — " + def.label;
      const admin = def.key === "admin";
      typeChamp.hidden = !admin;
      typeInput.disabled = !admin;
      typeInput.required = admin;
      typeFixe.hidden = admin;
      typeFixe.textContent = admin ? "" : "Type : " + def.label;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      lightbox.hidden = false;
      mettreAJourBoutonAjouter();
      formInvitation.elements.namedItem("nomadmin").focus();
    }

    function synchroniserOngletActif() {
      categorieActive = onglets.boutons.find((b) => b.getAttribute("aria-selected") === "true")
        ?.dataset.lcdpOnglet || "admin";
    }
    onglets.boutons.forEach((tab) => {
      tab.addEventListener("click", synchroniserOngletActif);
      tab.addEventListener("keydown", (event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          synchroniserOngletActif();
        }
      });
    });
    ajouter.addEventListener("click", ouvrirLightbox);
    lightbox.querySelectorAll("[data-lcdp-listadmin-fermer]").forEach((btn) => {
      btn.addEventListener("click", () => fermerLightbox());
    });
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) fermerLightbox();
    });
    lightbox.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        fermerLightbox();
      } else if (event.key === "Tab") {
        const elements = Array.from(lightbox.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)"))
          .filter((el) => !el.closest("[hidden]"));
        const first = elements[0], last = elements[elements.length - 1];
        if (first && event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    });
    formInvitation.addEventListener("submit", (event) => {
      event.preventDefault();
      if (occupe || !estRoot || !formInvitation.reportValidity()) return;
      const def = TYPES.find((item) => item.key === categorieActive);
      const code = def?.key === "admin" ? typeInput.value : def?.codes[0];
      if (!def || !def.codes.includes(code) || !TYPES_VALIDES.has(code)) return;
      envoyerInvitation({
        nomadmin: formInvitation.elements.namedItem("nomadmin").value.trim(),
        prenomadmin: formInvitation.elements.namedItem("prenomadmin").value.trim(),
        adminemail: formInvitation.elements.namedItem("adminemail").value.trim().toLowerCase(),
        type: code
      }, formInvitation);
    });
    mettreAJourBoutonAjouter();

    async function appelerApi(path, method, body) {
      const response = await fetch(endpoint + path, {
        method,
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        const url = window.LCDP_urlAdmin?.("/ESPACE-ADMIN/connexion-admin.html")
          || "/ESPACE-ADMIN/connexion-admin.html";
        window.location.replace(url);
        throw new Error("Session expirée.");
      }
      if (!response.ok || data?.success !== true) {
        const error = new Error(data?.message || "Le service administrateur n'est pas disponible.");
        error.status = response.status;
        throw error;
      }
      return data;
    }

    async function lireAncienneListe() {
      if (!endpointLecture) throw new Error("Endpoint de consultation admin absent.");
      const resultat = [];
      for (let offset = 0; offset <= 10000; offset += 200) {
        const url = new URL(endpointLecture + "/read");
        url.searchParams.set("resource", "admin-list");
        url.searchParams.set("limit", "200");
        url.searchParams.set("offset", String(offset));
        const response = await fetch(url.toString(), {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.success !== true || !Array.isArray(data.rows)) {
          throw new Error(data?.message || "Lecture de secours indisponible.");
        }
        resultat.push(...data.rows);
        if (data.rows.length < 200) return resultat;
      }
      throw new Error("Trop de comptes administrateurs pour la consultation de secours.");
    }

    async function charger() {
      if (occupe) return;
      occupe = true;
      informer("Chargement des comptes administrateurs…");
      try {
        const result = await appelerApi("/admin/accounts", "GET");
        comptes = Array.isArray(result.accounts) ? result.accounts : [];
        gestionDisponible = true;
        mettreAJourBoutonAjouter();
        rendreTous();
        informer("");
      } catch (error) {
        gestionDisponible = false;
        mettreAJourBoutonAjouter();
        if (error?.status === 401 || error?.status === 403) {
          informer(error?.message || "Accès non autorisé.", true);
          return;
        }
        try {
          comptes = await lireAncienneListe();
          rendreTous();
          informer("Le Worker de gestion des comptes n'est pas joignable : consultation uniquement. L'ajout et la suppression seront disponibles après son déploiement.", true);
        } catch (lectureErreur) {
          rendreTous();
          informer("Impossible de charger les comptes : " + (lectureErreur?.message || error?.message || "Erreur technique."), true);
        }
      } finally {
        occupe = false;
      }
    }

    async function envoyerInvitation(data, form) {
      if (occupe) return;
      occupe = true;
      if (form) envoyerForm.disabled = true;
      informer("Enregistrement et envoi de l'invitation…");
      try {
        await appelerApi("/admin/accounts", "POST", data);
        if (form) fermerLightbox(true);
        informer("L'invitation a été envoyée. Le compte sera actif après la création du mot de passe.");
        const result = await appelerApi("/admin/accounts", "GET");
        comptes = Array.isArray(result.accounts) ? result.accounts : [];
        rendreTous();
      } catch (error) {
        const message = error?.message || "Échec de l'invitation.";
        informer(message, true);
        if (form && !lightbox.hidden) {
          erreurForm.textContent = message;
          erreurForm.hidden = false;
        }
      } finally {
        occupe = false;
        envoyerForm.disabled = !estRoot;
      }
    }

    function confirmerSuppression(c) {
      const dialogue = document.getElementById("lcdp-admin-confirmation-suppression");
      if (!dialogue) {
        informer("Le dialogue de suppression est indisponible.", true);
        return Promise.resolve(false);
      }

      const identite = [texte(c.prenomadmin), texte(c.nomadmin)].filter(Boolean).join(" ");
      const message = dialogue.querySelector("[id='lcdp-ref-suppression-message']");
      const conserver = dialogue.querySelector('[data-lcdp-dialogue-action="conserver"]');
      const supprimer = dialogue.querySelector('[data-lcdp-dialogue-action="supprimer"]');
      if (!message || !conserver || !supprimer) {
        informer("Le dialogue de suppression est incomplet.", true);
        return Promise.resolve(false);
      }
      message.textContent = "Supprimer définitivement le compte de " + identite +
        " (" + texte(c.adminemail) + ") ? Tous ses accès et ses sessions seront supprimés.";
      dialogue.hidden = false;
      const elementPrecedent = document.activeElement;
      conserver.focus();

      return new Promise((resolve) => {
        let termine = false;
        function fermer(accord) {
          if (termine) return;
          termine = true;
          dialogue.hidden = true;
          conserver.removeEventListener("click", annuler);
          supprimer.removeEventListener("click", confirmer);
          dialogue.removeEventListener("click", clicFond);
          document.removeEventListener("keydown", touche);
          if (elementPrecedent?.isConnected && typeof elementPrecedent.focus === "function") {
            elementPrecedent.focus();
          }
          resolve(accord);
        }
        function annuler() { fermer(false); }
        function confirmer() { fermer(true); }
        function clicFond(event) {
          if (event.target === dialogue) fermer(false);
        }
        function touche(event) {
          if (event.key === "Escape") {
            event.preventDefault();
            fermer(false);
          } else if (event.key === "Tab") {
            // Empêcher que le focus sorte du dialogue modal.
            event.preventDefault();
            (document.activeElement === conserver ? supprimer : conserver).focus();
          }
        }
        conserver.addEventListener("click", annuler);
        supprimer.addEventListener("click", confirmer);
        dialogue.addEventListener("click", clicFond);
        document.addEventListener("keydown", touche);
      });
    }

    async function supprimerCompte(c) {
      if (!estRoot || !gestionDisponible || occupe || !texte(c.id) || texte(c.id) === texte(auth.id)) return;
      const accord = await confirmerSuppression(c);
      if (!accord || occupe) return;
      occupe = true;
      try {
        await appelerApi("/admin/accounts/delete", "POST", { id: c.id });
        const result = await appelerApi("/admin/accounts", "GET");
        comptes = Array.isArray(result.accounts) ? result.accounts : [];
        rendreTous();
        informer("Compte administrateur supprimé.");
      } catch (error) {
        informer(error?.message || "Suppression impossible.", true);
      } finally {
        occupe = false;
      }
    }

    function rendreTable(zone, type, elements) {
      const conteneur = document.createElement("div");
      conteneur.className = "lcdp-table-lecture-admin";
      const scroll = document.createElement("div");
      scroll.className = "lcdp-table-lecture-admin__scroll";
      const table = document.createElement("table");
      table.className = "lcdp-table-lecture-admin__table";
      const thead = document.createElement("thead");
      const head = document.createElement("tr");
      for (const title of ["Nom", "Prénom", "Email", "Type", "État", ...(estRoot ? ["Action"] : [])]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = title;
        head.appendChild(th);
      }
      thead.appendChild(head);
      const tbody = document.createElement("tbody");
      for (const c of elements) {
        const tr = document.createElement("tr");
        const vals = [c.nomadmin, c.prenomadmin, c.adminemail, c.type, c.actif === true ? "Actif" : c.actif === false ? "Invitation en attente" : "Non renseigné"];
        for (const val of vals) {
          const td = document.createElement("td");
          td.textContent = texte(val) || "—";
          tr.appendChild(td);
        }
        if (estRoot) {
          const td = document.createElement("td");
          td.className = "lcdp-listadmin__actions";
          if (gestionDisponible && c.actif === false) {
            td.appendChild(bouton("Renvoyer l'invitation", "lcdp-button lcdp-button-secondary", () => {
              envoyerInvitation({
                nomadmin: c.nomadmin, prenomadmin: c.prenomadmin,
                adminemail: c.adminemail, type: c.type
              });
            }));
          }
          const estSoiMeme = texte(c.id) === texte(auth.id);
          const supprimer = bouton("", "lcdp-listadmin__corbeille",
            () => supprimerCompte(c), estSoiMeme || !gestionDisponible || !texte(c.id));
          supprimer.setAttribute("aria-label", "Supprimer le compte de " +
            ([texte(c.prenomadmin), texte(c.nomadmin)].filter(Boolean).join(" ") || texte(c.adminemail)));
          supprimer.title = estSoiMeme
            ? "Vous ne pouvez pas supprimer votre propre compte."
            : !gestionDisponible
              ? "Service de gestion des comptes indisponible."
              : "Supprimer cet administrateur";
          supprimer.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';
          td.appendChild(supprimer);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      scroll.appendChild(table);
      conteneur.appendChild(scroll);
      zone.appendChild(conteneur);
      if (!elements.length) {
        const empty = document.createElement("p");
        empty.className = "lcdp-table-lecture-admin__status";
        empty.textContent = "Aucun administrateur pour cet onglet.";
        zone.appendChild(empty);
      }
    }

    function rendreOnglet(def) {
      const zone = onglets.zones[def.key];
      zone.replaceChildren();
      const visibles = comptes.filter((c) => def.codes.includes(c.type));
      rendreTable(zone, def.key, visibles);
    }

    function rendreTous() {
      TYPES.forEach(rendreOnglet);
    }

    rendreTous();
    await charger();
    return { recharger: charger };
  }

  window.LCDP_LISTADMIN = Object.freeze({ initialiser });
})();