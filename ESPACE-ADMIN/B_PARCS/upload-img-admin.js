(() => {
  "use strict";

  const SLOT_UPLOAD_IMG_PARC = 21;
  const MAX_IMAGES = 6;
  const MAX_OCTETS_PAR_IMAGE = 15 * 1024 * 1024;
  const MAX_OCTETS_TOTAL = 60 * 1024 * 1024;

  let uploadEnCours = false;
  let observateurMenu = null;

  function urlAdmin(path) {
    return typeof window.LCDP_urlAdmin === "function"
      ? window.LCDP_urlAdmin(path)
      : path;
  }

  function urlObjet(path) {
    return typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet(path)
      : path;
  }

  function endpointParcAdmin() {
    const config = window.SITE_CONFIG || {};

    return String(
      config.workerParcAdminUrl ||
      config.WORKER_PARC_ADMIN_URL ||
      window.ADMIN_CONFIG?.API_PARC_ADMIN ||
      window.ADMIN_CONFIG?.API_PARC_ADMIN_URL ||
      ""
    ).replace(/\/+$/, "");
  }

  async function chargerFragmentObjet(path) {
    const response = await fetch(urlObjet(path), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error("Fragment OBJET introuvable : " + path);
    }

    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();

    return template.content.cloneNode(true);
  }

  function chargerCssUploadIMG() {
    const path = "/ESPACE-ADMIN/B_PARCS/upload-img-admin.css";

    if (
      document.querySelector(
        `link[data-lcdp-upload-img-css="${path}"]`
      )
    ) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = urlAdmin(path);
    link.dataset.lcdpUploadImgCss = path;
    document.head.appendChild(link);
  }

  function categorieParcsActive() {
    const boutonActif = document.querySelector(
      '[data-lcdp-menu-gauche-admin-category="parcs"]' +
      '[aria-pressed="true"]'
    );

    if (boutonActif) {
      return true;
    }

    const url = new URL(window.location.href);
    return url.searchParams.get("categorie") === "parcs";
  }

  function configurerSlot21() {
    if (!categorieParcsActive()) {
      return;
    }

    const grille = document.querySelector(
      "[data-lcdp-mini-galerie-menu-centre-admin-grid]"
    );

    if (!grille) {
      return;
    }

    const bouton = grille.children[SLOT_UPLOAD_IMG_PARC - 1];

    if (!bouton || bouton.dataset.lcdpUploadImgConfigured === "true") {
      return;
    }

    bouton.dataset.lcdpUploadImgConfigured = "true";
    bouton.textContent = "UploadIMG";
    bouton.href = "#uploadimg";
    bouton.removeAttribute("aria-disabled");
    bouton.setAttribute("aria-disabled", "false");
    bouton.dataset.permissionCode = "parcs.uploadimg";
    bouton.setAttribute(
      "aria-label",
      "Uploader de une à six images dans le répertoire GitHub d’un parc"
    );

    bouton.addEventListener("click", (event) => {
      event.preventDefault();

      if (!uploadEnCours) {
        ouvrirWorkflowUploadIMG().catch((error) => {
          console.error("Erreur workflow UploadIMG :", error);
          ouvrirAlerteUploadIMG(
            "UploadIMG impossible : " +
            String(error?.message || error || "")
          );
        });
      }
    });
  }

  function observerMenuAdmin() {
    if (observateurMenu) {
      return;
    }

    observateurMenu = new MutationObserver(() => {
      window.requestAnimationFrame(configurerSlot21);
    });

    observateurMenu.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed"]
    });

    configurerSlot21();
  }

  function creerChampSelect(label, name) {
    const champ = document.createElement("div");
    champ.className = "lcdp-box-dialogue-champ__field";

    const libelle = document.createElement("label");
    libelle.className = "lcdp-box-dialogue-champ__label";
    libelle.textContent = label;

    const select = document.createElement("select");
    select.name = name;
    select.required = true;

    libelle.appendChild(select);
    champ.appendChild(libelle);

    return {
      champ,
      select
    };
  }

  function ajouterOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function creerChampImages() {
    const champ = document.createElement("div");
    champ.className =
      "lcdp-box-dialogue-champ__field lcdp-upload-img__field";

    const libelle = document.createElement("label");
    libelle.className = "lcdp-box-dialogue-champ__label";
    libelle.textContent = "Images à uploader";

    const input = document.createElement("input");
    input.className =
      "lcdp-box-dialogue-champ__input lcdp-upload-img__input";
    input.name = "images";
    input.type = "file";
    input.multiple = true;
    input.required = true;
    input.accept =
      "image/jpeg,image/png,image/webp,image/avif,image/gif," +
      ".jpg,.jpeg,.png,.webp,.avif,.gif";

    const aide = document.createElement("p");
    aide.className = "lcdp-upload-img__aide";
    aide.textContent =
      "Sélectionner de 1 à 6 images. Maximum : 15 Mo par image.";

    const liste = document.createElement("ul");
    liste.className = "lcdp-upload-img__liste";
    liste.hidden = true;

    libelle.appendChild(input);
    champ.appendChild(libelle);
    champ.appendChild(aide);
    champ.appendChild(liste);

    return {
      champ,
      input,
      liste
    };
  }

  function afficherErreurDialogue(element, message) {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.hidden = !message;
  }

  function actualiserListeFichiers(input, liste) {
    const fichiers = Array.from(input.files || []);
    liste.innerHTML = "";

    for (const fichier of fichiers) {
      const item = document.createElement("li");
      item.textContent = fichier.name;
      liste.appendChild(item);
    }

    liste.hidden = fichiers.length === 0;
  }

  function validerImagesFront(input) {
    const fichiers = Array.from(input.files || []);

    if (fichiers.length < 1 || fichiers.length > MAX_IMAGES) {
      return {
        success: false,
        message: "Sélectionner entre 1 et 6 images."
      };
    }

    let total = 0;

    for (const fichier of fichiers) {
      const taille = Number(fichier.size || 0);

      if (!taille) {
        return {
          success: false,
          message: "Image vide : " + fichier.name + "."
        };
      }

      if (taille > MAX_OCTETS_PAR_IMAGE) {
        return {
          success: false,
          message:
            "Image trop lourde : " + fichier.name +
            ". Maximum : 15 Mo."
        };
      }

      total += taille;
    }

    if (total > MAX_OCTETS_TOTAL) {
      return {
        success: false,
        message: "Le poids total des images dépasse 60 Mo."
      };
    }

    return {
      success: true,
      fichiers
    };
  }

  async function chargerDepartements(select) {
    const endpoint = endpointParcAdmin();

    if (!endpoint) {
      throw new Error("Endpoint du worker admin parc non configuré.");
    }

    select.disabled = true;
    select.innerHTML = "";
    ajouterOption(select, "", "Chargement…");

    const response = await fetch(
      endpoint + "/uploadimg/departements",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "Impossible de charger les départements."
      );
    }

    select.innerHTML = "";
    ajouterOption(select, "", "Choisir un département");

    for (const dptmt of data.departements || []) {
      ajouterOption(select, String(dptmt), String(dptmt));
    }

    select.disabled = false;
  }

  async function chargerParcs(dptmt, select) {
    const endpoint = endpointParcAdmin();

    select.disabled = true;
    select.innerHTML = "";
    ajouterOption(select, "", "Chargement…");

    if (!dptmt) {
      select.innerHTML = "";
      ajouterOption(select, "", "Choisir d’abord un département");
      return;
    }

    const response = await fetch(
      endpoint +
      "/uploadimg/parcs?dptmt=" +
      encodeURIComponent(dptmt),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success !== true) {
      throw new Error(
        data?.message ||
        data?.detail ||
        "Impossible de charger les parcs."
      );
    }

    select.innerHTML = "";
    ajouterOption(select, "", "Choisir un parc");

    for (const parc of data.parcs || []) {
      ajouterOption(
        select,
        String(parc.idparc),
        String(parc.nom || "")
      );
    }

    select.disabled = false;
  }

  async function ouvrirWorkflowUploadIMG() {
    const endpoint = endpointParcAdmin();

    if (!endpoint) {
      await ouvrirAlerteUploadIMG(
        "Endpoint du worker admin parc non configuré."
      );
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot lightbox admin introuvable.");
    }

    slot.innerHTML = "";
    const fragment = await chargerFragmentObjet(
      "/BOX/04-box-dialogue-champ.html"
    );
    slot.appendChild(fragment);

    const boite = slot.querySelector(
      "[data-lcdp-box-dialogue-champ]"
    );
    const titre = slot.querySelector(
      "[data-lcdp-dialogue-champ-title]"
    );
    const form = slot.querySelector(
      "[data-lcdp-dialogue-champ-form]"
    );
    const contenu = slot.querySelector(
      "[data-lcdp-dialogue-champ-content]"
    );
    const erreur = slot.querySelector(
      "[data-lcdp-dialogue-champ-error]"
    );
    const boutonFermer = slot.querySelector(
      "[data-lcdp-dialogue-champ-close]"
    );
    const boutonAnnuler = slot.querySelector(
      "[data-lcdp-dialogue-champ-cancel]"
    );
    const boutonSubmit = slot.querySelector(
      "[data-lcdp-dialogue-champ-submit]"
    );

    if (
      !boite ||
      !titre ||
      !form ||
      !contenu ||
      !boutonAnnuler ||
      !boutonSubmit
    ) {
      slot.innerHTML = "";
      throw new Error("Structure de dialogue UploadIMG incomplète.");
    }

    titre.textContent = "UploadIMG";
    boutonSubmit.textContent = "OK";

    const introduction = document.createElement("p");
    introduction.className = "lcdp-upload-img__introduction";
    introduction.textContent =
      "Choisir un département, un parc en statut prepa ou oui, " +
      "puis ajouter de une à six images.";

    const champDepartement = creerChampSelect(
      "Département",
      "dptmt"
    );
    const champParc = creerChampSelect("Parc", "idparc");
    const champImages = creerChampImages();

    ajouterOption(
      champDepartement.select,
      "",
      "Chargement…"
    );
    ajouterOption(
      champParc.select,
      "",
      "Choisir d’abord un département"
    );
    champDepartement.select.disabled = true;
    champParc.select.disabled = true;

    contenu.appendChild(introduction);
    contenu.appendChild(champDepartement.champ);
    contenu.appendChild(champParc.champ);
    contenu.appendChild(champImages.champ);

    champImages.input.addEventListener("change", () => {
      afficherErreurDialogue(erreur, "");
      actualiserListeFichiers(
        champImages.input,
        champImages.liste
      );
    });

    champDepartement.select.addEventListener("change", async () => {
      afficherErreurDialogue(erreur, "");

      try {
        await chargerParcs(
          champDepartement.select.value,
          champParc.select
        );
      } catch (error) {
        afficherErreurDialogue(
          erreur,
          String(error?.message || error || "")
        );
      }
    });

    try {
      await chargerDepartements(champDepartement.select);
    } catch (error) {
      afficherErreurDialogue(
        erreur,
        String(error?.message || error || "")
      );
    }

    return new Promise((resolve) => {
      let resolu = false;

      function terminer() {
        if (resolu) {
          return;
        }

        resolu = true;
        document.removeEventListener("keydown", gererEchappement);
        slot.innerHTML = "";
        resolve();
      }

      function gererEchappement(event) {
        if (event.key === "Escape" && !uploadEnCours) {
          event.preventDefault();
          terminer();
        }
      }

      document.addEventListener("keydown", gererEchappement);

      if (boutonFermer) {
        boutonFermer.addEventListener("click", terminer);
      }

      boutonAnnuler.addEventListener("click", terminer);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (uploadEnCours) {
          return;
        }

        afficherErreurDialogue(erreur, "");

        const dptmt = champDepartement.select.value;
        const idparc = champParc.select.value;
        const validationImages = validerImagesFront(
          champImages.input
        );

        if (!dptmt) {
          afficherErreurDialogue(
            erreur,
            "Choisir un département."
          );
          champDepartement.select.focus();
          return;
        }

        if (!idparc) {
          afficherErreurDialogue(erreur, "Choisir un parc.");
          champParc.select.focus();
          return;
        }

        if (!validationImages.success) {
          afficherErreurDialogue(
            erreur,
            validationImages.message
          );
          champImages.input.focus();
          return;
        }

        const nomParc =
          champParc.select.options[
            champParc.select.selectedIndex
          ]?.textContent || "Parc";

        terminer();
        await envoyerUploadIMG({
          dptmt,
          idparc,
          nomParc,
          fichiers: validationImages.fichiers
        });
      });
    });
  }

  async function ouvrirAlerteUploadIMG(message, options = {}) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      window.alert(message || "");
      return null;
    }

    slot.innerHTML = "";
    const fragment = await chargerFragmentObjet(
      "/BOX/02-box-alerte.html"
    );
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector(
      "[data-lcdp-alerte-close]"
    );
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");
    const verrouillee = options.verrouillee === true;

    if (!alerte || !texte || !boutonOk) {
      slot.innerHTML = "";
      window.alert(message || "");
      return null;
    }

    texte.textContent = message || "";

    if (boutonFermer) {
      boutonFermer.hidden = verrouillee;
    }

    boutonOk.hidden = verrouillee;

    function fermer() {
      if (verrouillee) {
        return;
      }

      slot.innerHTML = "";
    }

    if (boutonFermer) {
      boutonFermer.addEventListener("click", fermer);
    }

    boutonOk.addEventListener("click", fermer);

    if (!verrouillee) {
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) {
          fermer();
        }
      });
    }

    return {
      setMessage(nouveauMessage) {
        texte.textContent = nouveauMessage || "";
      },
      deverrouiller() {
        if (boutonFermer) {
          boutonFermer.hidden = false;
          boutonFermer.onclick = () => {
            slot.innerHTML = "";
          };
        }

        boutonOk.hidden = false;
        boutonOk.onclick = () => {
          slot.innerHTML = "";
        };
      }
    };
  }

  async function envoyerUploadIMG(options) {
    if (uploadEnCours) {
      return;
    }

    const endpoint = endpointParcAdmin();
    uploadEnCours = true;

    const alerte = await ouvrirAlerteUploadIMG(
      "UploadIMG en cours pour " + options.nomParc +
      ". Ne fermez pas cette page.",
      {
        verrouillee: true
      }
    );

    try {
      const formData = new FormData();
      formData.append("dptmt", options.dptmt);
      formData.append("idparc", options.idparc);

      for (const fichier of options.fichiers) {
        formData.append("images", fichier, fichier.name);
      }

      const response = await fetch(endpoint + "/uploadimg", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        },
        body: formData
      });

      const data = await response.json().catch(() => null);

      if (!data) {
        throw new Error("Réponse UploadIMG inexploitable.");
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
          data?.detail ||
          "UploadIMG impossible."
        );
      }

      const parc = data.parc || {};
      const message =
        (data.message || "UploadIMG terminé.") +
        "\nParc : " + (parc.nom || options.nomParc) +
        "\nDépartement : " +
        (parc.dptmt || options.dptmt) +
        "\nImages uploadées : " +
        String(data.uploades || 0) +
        "\nImages précédentes versionnées : " +
        String(data.versionnes || 0) +
        "\nErreurs : " +
        String(data.erreurs || 0);

      if (alerte) {
        alerte.setMessage(message);
        alerte.deverrouiller();
      }
    } catch (error) {
      if (alerte) {
        alerte.setMessage(
          "UploadIMG interrompu : " +
          String(error?.message || error || "")
        );
        alerte.deverrouiller();
      }
    } finally {
      uploadEnCours = false;
    }
  }

  function initialiserUploadIMG() {
    chargerCssUploadIMG();
    observerMenuAdmin();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialiserUploadIMG,
      { once: true }
    );
  } else {
    initialiserUploadIMG();
  }
})();
