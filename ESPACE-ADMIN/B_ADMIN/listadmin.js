(() => {
  "use strict";

  const TYPES = [
    { key: "admin", label: "Admin", codes: ["root", "asso"] },
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
    const filtres = { admin: "", resparc: "", coach: "" };
    const recherches = { admin: "", resparc: "", coach: "" };
    let occupe = false;

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
        throw new Error(data?.message || "Le service administrateur n'est pas disponible.");
      }
      return data;
    }

    async function charger() {
      if (occupe) return;
      occupe = true;
      informer("Chargement des comptes administrateurs…");
      try {
        const result = await appelerApi("/admin/accounts", "GET");
        comptes = Array.isArray(result.accounts) ? result.accounts : [];
        rendreTous();
        informer("");
      } catch (error) {
        informer(error?.message || "Impossible de lire les comptes.", true);
      } finally {
        occupe = false;
      }
    }

    async function envoyerInvitation(data, form) {
      if (occupe) return;
      occupe = true;
      informer("Enregistrement et envoi de l'invitation…");
      try {
        await appelerApi("/admin/accounts", "POST", data);
        if (form) form.reset();
        informer("L'invitation a été envoyée. Le compte sera actif après la création du mot de passe.");
        const result = await appelerApi("/admin/accounts", "GET");
        comptes = Array.isArray(result.accounts) ? result.accounts : [];
        rendreTous();
      } catch (error) {
        informer(error?.message || "Échec de l'invitation.", true);
      } finally {
        occupe = false;
      }
    }

    async function supprimerCompte(c) {
      if (!estRoot || occupe || texte(c.id) === texte(auth.id)) return;
      const identite = [texte(c.prenomadmin), texte(c.nomadmin)].filter(Boolean).join(" ");
      const accord = window.confirm("Confirmer la suppression définitive du compte de " + identite +
        " (" + texte(c.adminemail) + ") ? Toutes ses sessions seront invalidées.");
      if (!accord) return;
      occupe = true;
      try {
        await appelerApi("/admin/accounts/delete", "POST", { id: c.id });
        informer("Compte administrateur supprimé.");
        const result = await appelerApi("/admin/accounts", "GET");
        comptes = Array.isArray(result.accounts) ? result.accounts : [];
        rendreTous();
      } catch (error) {
        informer(error?.message || "Suppression impossible.", true);
      } finally {
        occupe = false;
      }
    }

    function creerFormulaireInvitation(zone) {
      if (!estRoot) return;
      const afficher = bouton("Ajouter un administrateur", "lcdp-button lcdp-button-orange", () => {
        formulaire.hidden = !formulaire.hidden;
        afficher.setAttribute("aria-expanded", String(!formulaire.hidden));
        if (!formulaire.hidden) nom.input.focus();
      });
      afficher.setAttribute("aria-expanded", "false");
      afficher.setAttribute("aria-controls", "lcdp-formulaire-nouvel-admin");
      zone.appendChild(afficher);
      const formulaire = document.createElement("form");
      formulaire.id = "lcdp-formulaire-nouvel-admin";
      formulaire.className = "lcdp-box-formulaire lcdp-stack-large";
      formulaire.hidden = true;
      const titre = document.createElement("h2");
      titre.textContent = "Nouvel administrateur";
      const info = document.createElement("p");
      info.textContent = "Un email sera envoyé à cette adresse. Le destinataire définira personnellement son mot de passe.";
      const nom = champ("Nom", "text", "nomadmin");
      const prenom = champ("Prénom", "text", "prenomadmin");
      const email = champ("Email", "email", "adminemail");
      const type = champ("Type", "select", "type", [
        ["", "Choisir un type"], ["root", "Root"], ["asso", "Asso"],
        ["resparc", "Resparc"], ["coach", "Coach"]
      ]);
      type.input.value = "";
      const valider = document.createElement("button");
      valider.type = "submit";
      valider.className = "lcdp-button lcdp-button-orange";
      valider.textContent = "Envoyer l'invitation";
      const annuler = bouton("Annuler", "lcdp-button lcdp-button-secondary", () => {
        formulaire.hidden = true;
        afficher.setAttribute("aria-expanded", "false");
      });
      formulaire.append(titre, info, nom.wrapper, prenom.wrapper, email.wrapper, type.wrapper, valider, annuler);
      formulaire.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!formulaire.reportValidity() || !TYPES_VALIDES.has(type.input.value)) return;
        envoyerInvitation({
          nomadmin: nom.input.value.trim(),
          prenomadmin: prenom.input.value.trim(),
          adminemail: email.input.value.trim().toLowerCase(),
          type: type.input.value
        }, formulaire);
      });
      zone.appendChild(formulaire);
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
        const vals = [c.nomadmin, c.prenomadmin, c.adminemail, c.type, c.actif ? "Actif" : "Invitation en attente"];
        for (const val of vals) {
          const td = document.createElement("td");
          td.textContent = texte(val) || "—";
          tr.appendChild(td);
        }
        if (estRoot) {
          const td = document.createElement("td");
          if (c.actif === false) {
            td.appendChild(bouton("Renvoyer l'invitation", "lcdp-button lcdp-button-secondary", () => {
              envoyerInvitation({
                nomadmin: c.nomadmin, prenomadmin: c.prenomadmin,
                adminemail: c.adminemail, type: c.type
              });
            }));
          }
          const estSoiMeme = texte(c.id) === texte(auth.id);
          td.appendChild(bouton("Supprimer", "lcdp-button lcdp-button-secondary",
            () => supprimerCompte(c), estSoiMeme));
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
      if (def.key === "admin") {
        creerFormulaireInvitation(zone);
      }
      const filtre = document.createElement("div");
      filtre.className = "lcdp-stack-small";
      const recherche = champ("Rechercher par nom, prénom ou email", "search", "recherche");
      recherche.input.required = false;
      recherche.input.value = recherches[def.key];
      recherche.input.addEventListener("input", () => {
        recherches[def.key] = recherche.input.value;
        rendreOnglet(def);
        const champActif = onglets.zones[def.key].querySelector('input[name="recherche"]');
        if (champActif) { champActif.focus(); champActif.setSelectionRange(champActif.value.length, champActif.value.length); }
      });
      filtre.appendChild(recherche.wrapper);
      if (def.key === "admin") {
        const selection = champ("Type", "select", "filtre-type", [
          ["", "Tous les types"], ["root", "Root"], ["asso", "Asso"]
        ]);
        selection.input.required = false;
        selection.input.value = filtres.admin;
        selection.input.addEventListener("change", () => {
          filtres.admin = selection.input.value;
          rendreOnglet(def);
        });
        filtre.appendChild(selection.wrapper);
      }
      zone.appendChild(filtre);
      const rechercheTexte = recherches[def.key].trim().toLocaleLowerCase("fr");
      const visibles = comptes.filter((c) => def.codes.includes(c.type))
        .filter((c) => def.key !== "admin" || !filtres.admin || c.type === filtres.admin)
        .filter((c) => [c.nomadmin, c.prenomadmin, c.adminemail]
          .some((x) => texte(x).toLocaleLowerCase("fr").includes(rechercheTexte)));
      rendreTable(zone, def.key, visibles);
    }

    function rendreTous() {
      TYPES.forEach(rendreOnglet);
    }

    await charger();
    return { recharger: charger };
  }

  window.LCDP_LISTADMIN = Object.freeze({ initialiser });
})();