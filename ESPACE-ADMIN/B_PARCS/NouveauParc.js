    (() => {
      "use strict";

      const config = window.SITE_CONFIG || {};

      let compteurLignes = 0;
      let formulaireInitialise = false;

      function urlAdmin(path) {
        return typeof window.LCDP_urlAdmin === "function"
          ? window.LCDP_urlAdmin(path)
          : path;
      }

      function urlPublic(path) {
        return typeof window.LCDP_urlPublic === "function"
          ? window.LCDP_urlPublic(path)
          : path;
      }

      function urlObjet(path) {
        return typeof window.LCDP_urlObjet === "function"
          ? window.LCDP_urlObjet(path)
          : path;
      }

      function appliquerRoutes(racine = document) {
        racine.querySelectorAll("[data-site-href]").forEach((element) => {
          const path = element.dataset.siteHref || "";
          const space = element.dataset.space || "public";

          element.setAttribute(
            "href",
            space === "admin" ? urlAdmin(path) : urlPublic(path)
          );
        });

        racine.querySelectorAll("[data-site-src]").forEach((element) => {
          const path = String(element.dataset.siteSrc || "")
            .replace(/^\/?OBJET\/?/, "/");

          element.setAttribute("src", urlObjet(path));
        });
      }

      async function chargerFragment(url, libelle) {
        const response = await fetch(url, {
          method: "GET",
          credentials: "omit",
          cache: "no-cache"
        });

        if (!response.ok) {
          throw new Error(libelle + " introuvable.");
        }

        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();

        return template.content.cloneNode(true);
      }

      function chargerFragmentAdmin(path) {
        return chargerFragment(
          urlAdmin(path),
          "Fragment ADMIN " + path
        );
      }

      function chargerFragmentObjet(path) {
        return chargerFragment(
          urlObjet(path),
          "Fragment OBJET " + path
        );
      }

      function chargerScriptObjetUneFois(path) {
        const src = urlObjet(path);

        if (
          document.querySelector(
            `script[data-lcdp-script-objet="${path}"]`
          )
        ) {
          return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
          const script = document.createElement("script");

          script.src = src;
          script.defer = true;
          script.dataset.lcdpScriptObjet = path;
          script.onload = resolve;
          script.onerror = () => reject(
            new Error("Script OBJET introuvable : " + path)
          );

          document.body.appendChild(script);
        });
      }

      function endpointParcAdmin() {
        return String(
          config.workerParcAdminUrl ||
          config.WORKER_PARC_ADMIN_URL ||
          window.ADMIN_CONFIG?.API_PARC_ADMIN ||
          ""
        ).replace(/\/+$/, "");
      }

      async function initialiserBandeau() {
        const slot = document.getElementById("lcdp-bandeau-slot");

        if (!slot) {
          return;
        }

        slot.innerHTML = "";

        const fragment = await chargerFragmentAdmin(
          "/ESPACE-ADMIN/A_STRUCTURE/box-bandeau-nav-admin.html"
        );

        slot.appendChild(fragment);
        appliquerRoutes(slot);
      }

      async function initialiserMenuGauche() {
        const moduleMenu = window.LCDP_MENU_GAUCHE_ADMIN;

        if (
          !moduleMenu ||
          typeof moduleMenu.initialiser !== "function"
        ) {
          throw new Error(
            "Menu gauche admin centralisé indisponible."
          );
        }

        await moduleMenu.initialiser({
          slotId: "lcdp-menu-gauche-admin-slot",
          categorieActive: "parcs"
        });
      }

      async function initialiserMenuWorkflow() {
        const slot = document.getElementById(
          "lcdp-nouveauparc-menu-slot"
        );

        if (!slot) {
          return;
        }

        slot.innerHTML = "";

        const fragment = await chargerFragmentObjet(
          "/BOX/02-box-menu-bouton.html"
        );

        slot.appendChild(fragment);

        const nav = slot.querySelector(
          "[data-lcdp-box-menu-bouton]"
        );

        const liste = slot.querySelector(
          "[data-lcdp-menu-bouton-list]"
        );

        if (!nav || !liste) {
          throw new Error(
            "Objet 02-box-menu-bouton incomplet."
          );
        }

        nav.setAttribute(
          "aria-label",
          "Actions d’insertion des parcs"
        );

        const bouton = document.createElement("button");

        bouton.type = "button";
        bouton.className = "lcdp-button lcdp-button-primary";
        bouton.textContent = "Nouveau parc";

        bouton.addEventListener("click", ouvrirFormulaire);

        liste.appendChild(bouton);
      }

      async function ouvrirFormulaire() {
        const menuSlot = document.getElementById(
          "lcdp-nouveauparc-menu-slot"
        );

        const formSlot = document.getElementById(
          "lcdp-nouveauparc-form-slot"
        );

        if (!formSlot) {
          return;
        }

        if (!formulaireInitialise) {
          await initialiserFormulaire();
          formulaireInitialise = true;
        }

        if (menuSlot) {
          menuSlot.hidden = true;
        }

        formSlot.hidden = false;

        const premierChamp = formSlot.querySelector(
          '[data-lcdp-nouveauparc-field="nom"]'
        );

        premierChamp?.focus();
      }

      async function initialiserFormulaire() {
        const slot = document.getElementById(
          "lcdp-nouveauparc-form-slot"
        );

        if (!slot) {
          return;
        }

        await chargerScriptObjetUneFois(
          "/BOX/03-box-formulaire.js"
        );

        if (
          typeof window.LCDP_creerFormulaire !== "function"
        ) {
          throw new Error(
            "Créateur de formulaire V3 indisponible."
          );
        }

        compteurLignes = 1;

        const form = await window.LCDP_creerFormulaire(
          "lcdp-nouveauparc-form-slot",
          {
            id: "formulaire-nouveauparc",
            ariaLabel: "Insertion de nouveaux parcs",
            titre: "Nouveau parc",
            champs: [
              {
                label: "Nom du parc",
                type: "text",
                id: "parc-nom-1",
                name: "parc-nom-1",
                autocomplete: "off",
                required: true
              },
              {
                label: "Département",
                type: "text",
                id: "parc-dptmt-1",
                name: "parc-dptmt-1",
                autocomplete: "off",
                inputmode: "text",
                required: true
              }
            ],
            bouton: {
              id: "bouton-enregistrer-parcs",
              type: "submit",
              label: "Enregistrer",
              style: "lcdp-button-primary"
            }
          }
        );

        if (!form) {
          throw new Error(
            "Formulaire NouveauParc indisponible."
          );
        }

        const fields = form.querySelector(
          "[data-lcdp-formulaire-fields]"
        );

        const actions = form.querySelector(
          "[data-lcdp-formulaire-actions]"
        );

        const boutonEnregistrer = form.querySelector(
          "#bouton-enregistrer-parcs"
        );

        const nomInput = form.querySelector("#parc-nom-1");
        const dptmtInput = form.querySelector("#parc-dptmt-1");

        if (
          !fields ||
          !actions ||
          !boutonEnregistrer ||
          !nomInput ||
          !dptmtInput
        ) {
          throw new Error(
            "Structure du formulaire NouveauParc incomplète."
          );
        }

        nomInput.dataset.lcdpInsertparcsField = "nom";
        dptmtInput.dataset.lcdpInsertparcsField = "dptmt";

        const ligneInitiale = document.createElement("div");

        ligneInitiale.className = "lcdp-nouveauparc-ligne";
        ligneInitiale.dataset.lcdpInsertparcsLigne = "1";

        Array.from(fields.children).forEach((champ) => {
          ligneInitiale.appendChild(champ);
        });

        fields.appendChild(ligneInitiale);

        const boutonAjouter = document.createElement("button");

        boutonAjouter.type = "button";
        boutonAjouter.id = "bouton-ajouter-parc";
        boutonAjouter.className =
          "lcdp-button lcdp-button-secondary";
        boutonAjouter.textContent = "Ajouter un parc";

        boutonAjouter.addEventListener("click", async () => {
          const nouvelleLigne = await ajouterLigneParc(fields);
          nouvelleLigne
            .querySelector(
              '[data-lcdp-nouveauparc-field="nom"]'
            )
            ?.focus();
        });

        actions.insertBefore(
          boutonAjouter,
          boutonEnregistrer
        );

        form.addEventListener(
          "submit",
          enregistrerParcs
        );
      }

      async function ajouterLigneParc(fields) {
        compteurLignes += 1;

        const ligne = document.createElement("div");

        ligne.className = "lcdp-nouveauparc-ligne";
        ligne.dataset.lcdpInsertparcsLigne =
          String(compteurLignes);

        const [champNom, champDptmt] = await Promise.all([
          creerChampParc({
            index: compteurLignes,
            type: "nom",
            label: "Nom du parc"
          }),
          creerChampParc({
            index: compteurLignes,
            type: "dptmt",
            label: "Département"
          })
        ]);

        ligne.appendChild(champNom);
        ligne.appendChild(champDptmt);
        fields.appendChild(ligne);

        return ligne;
      }

      async function creerChampParc({
        index,
        type,
        label
      }) {
        const fragment = await window.LCDP_chargerFragmentObjet(
          "/BOX/03-box-champ-formulaire.html"
        );

        const racine = fragment.querySelector(
          "[data-lcdp-box-champ-formulaire]"
        );

        const labelZone = fragment.querySelector(
          "[data-lcdp-champ-label-zone]"
        );

        const control = fragment.querySelector(
          "[data-lcdp-champ-control]"
        );

        if (!racine || !labelZone || !control) {
          throw new Error(
            "Structure du champ formulaire V3 incomplète."
          );
        }

        const id = `parc-${type}-${index}`;

        const elementLabel = document.createElement("label");

        elementLabel.className =
          "lcdp-box-champ-formulaire__label";
        elementLabel.setAttribute("for", id);
        elementLabel.textContent = label;

        const required = document.createElement("span");

        required.className =
          "lcdp-box-champ-formulaire__required";
        required.textContent = "*";

        elementLabel.appendChild(required);

        const input = document.createElement("input");

        input.type = "text";
        input.id = id;
        input.name = id;
        input.autocomplete = "off";
        input.dataset.lcdpInsertparcsField = type;

        labelZone.appendChild(elementLabel);
        control.appendChild(input);

        return racine;
      }

      function lireParcsDuFormulaire(form) {
        const lignes = Array.from(
          form.querySelectorAll(
            "[data-lcdp-nouveauparc-ligne]"
          )
        );

        const resultat = [];

        for (let index = 0; index < lignes.length; index += 1) {
          const ligne = lignes[index];

          const nomInput = ligne.querySelector(
            '[data-lcdp-nouveauparc-field="nom"]'
          );

          const dptmtInput = ligne.querySelector(
            '[data-lcdp-nouveauparc-field="dptmt"]'
          );

          const nom = String(nomInput?.value || "").trim();
          const dptmt = String(dptmtInput?.value || "").trim();

          if (!nom) {
            afficherStatut(
              `Le nom du parc est manquant à la ligne ${index + 1}.`,
              true
            );
            nomInput?.focus();
            return null;
          }

          if (!dptmt) {
            afficherStatut(
              `Le département est manquant à la ligne ${index + 1}.`,
              true
            );
            dptmtInput?.focus();
            return null;
          }

          resultat.push({
            nom,
            dptmt
          });
        }

        return resultat;
      }

      async function enregistrerParcs(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const parcs = lireParcsDuFormulaire(form);

        if (!parcs) {
          return;
        }

        const endpoint = endpointParcAdmin();

        if (!endpoint) {
          afficherStatut(
            "Endpoint du worker parc admin non configuré.",
            true
          );
          return;
        }

        const boutons = Array.from(
          form.querySelectorAll("button")
        );

        boutons.forEach((bouton) => {
          bouton.disabled = true;
        });

        afficherStatut("Enregistrement en cours…", false);

        try {
          const response = await fetch(
            endpoint + "/insert",
            {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ parcs })
            }
          );

          const data = await response.json().catch(() => null);

          if (response.status === 401 || response.status === 403) {
            redirigerConnexion();
            return;
          }

          if (!response.ok || !data || data.success !== true) {
            throw new Error(
              data?.message ||
              data?.detail ||
              "Impossible d’enregistrer les parcs."
            );
          }

          afficherStatut(
            `${data.inserted} parc(s) enregistré(s).`,
            false
          );

          reinitialiserFormulaire(form);
        } catch (error) {
          console.error("Erreur NouveauParc :", error);

          afficherStatut(
            String(
              error?.message ||
              error ||
              "Erreur d’enregistrement."
            ),
            true
          );
        } finally {
          boutons.forEach((bouton) => {
            bouton.disabled = false;
          });
        }
      }

      function reinitialiserFormulaire(form) {
        const lignes = Array.from(
          form.querySelectorAll(
            "[data-lcdp-nouveauparc-ligne]"
          )
        );

        lignes.slice(1).forEach((ligne) => ligne.remove());

        const premiereLigne = lignes[0];

        premiereLigne
          ?.querySelectorAll("input")
          .forEach((input) => {
            input.value = "";
          });

        compteurLignes = 1;

        premiereLigne
          ?.querySelector(
            '[data-lcdp-nouveauparc-field="nom"]'
          )
          ?.focus();
      }

      function afficherStatut(message, erreur) {
        const status = document.getElementById(
          "lcdp-nouveauparc-status"
        );

        if (!status) {
          return;
        }

        status.textContent = String(message || "");
        status.hidden = !message;
        status.classList.toggle(
          "lcdp-nouveauparc-status--error",
          erreur === true
        );
      }

      function redirigerConnexion() {
        const path = "/ESPACE-ADMIN/connexion-admin.html";

        if (typeof config.adminUrl === "function") {
          window.location.replace(config.adminUrl(path));
          return;
        }

        window.location.replace(path);
      }

      async function verifierAcces() {
        const guard = window.LCDP_GUARD_ADMIN;

        if (
          !guard ||
          typeof guard.verifierAccesPageAdmin !== "function"
        ) {
          throw new Error(
            "Garde admin centralisé indisponible."
          );
        }

        return guard.verifierAccesPageAdmin();
      }

      async function initialiserPage() {
        const autorise = await verifierAcces();

        if (!autorise) {
          return;
        }

        await Promise.all([
          initialiserBandeau(),
          initialiserMenuGauche(),
          initialiserMenuWorkflow()
        ]);

        const main = document.getElementById(
          "lcdp-main-admin"
        );

        if (main) {
          main.hidden = false;
        }
      }

      initialiserPage().catch((error) => {
        console.error(error);
      });
    })();
