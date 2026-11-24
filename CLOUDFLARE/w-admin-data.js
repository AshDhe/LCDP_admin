const ORIGINE_ADMIN_FIXE = "https://admin.lacleduparc.fr";
const AUTH_API_FIXE = "https://ad-log-sess-api.lacleduparc.fr";

const MENU_TABLE = "adminbouton";
const RESOURCE_TABLE = "admindataresource";
const COLUMN_TABLE = "admindatacolumn";
const PERMISSION_TABLE = "adminpermission";
const ROLE_PERMISSION_TABLE = "adminrolepermission";

const ROUTE_CARTE_PARC =
  "/ESPACE-ADMIN/B_PARCS/CarteParc.html";
const PERMISSION_CARTE_PARC = "parcs.carte";

const ROUTE_CARD_PARC =
  "/ESPACE-ADMIN/B_PARCS/CardParc.html";
const PERMISSION_CARD_PARC = "parcs.cardparc";

const ROUTE_SUIVI_DA =
  "/ESPACE-ADMIN/C_MEMBRES/SuiviDA.html";
const PERMISSION_SUIVI_DA = "membres.suivida";
const RESOURCE_SUIVI_DA = "membres-suivida";

const ROUTE_PLANNING_PARC_LECTURE =
  "/ESPACE-ADMIN/B_PARCS/PlanningParc.html";
const PERMISSION_PLANNING_PARC_LECTURE =
  "parcs.planninglecture";
const RESOURCE_PLANNING_PARC_LECTURE =
  "parcs-planning-lecture";
const RESSOURCES_PARC_AVEC_IDENTIFIANT = new Set([
  "parcs-statut",
  RESOURCE_PLANNING_PARC_LECTURE
]);

const STATUTS_CARTE_PARC = new Set([
  "recherche",
  "prepa",
  "non",
  "oui",
  "nonconforme",
  "acreuserfautinfo"
]);

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "OPTIONS") {
        return reponseOptions(request, env);
      }

      if (request.method === "GET" && path === "/health") {
        return reponseJson(request, env, {
          success: true,
          message: "Worker admin data actif"
        });
      }

      if (!origineAutorisee(request, env)) {
        return reponseJson(request, env, {
          success: false,
          message: "Origine non autorisée."
        }, 403);
      }

      if ((request.method === "GET" || request.method === "POST") && path === "/admin/fix-codes") {
        return await gererFixCodes(request, env, url);
      }

      if ((request.method === "GET" || request.method === "POST") && path === "/membres/benevolat") {
        return await gererBenevolat(request, env);
      }

      if (request.method === "GET" && path === "/membres/suspensions/v2/capabilities") {
        return gererCapacitesSuspensionsMembres(request, env);
      }

      if (request.method === "POST" && path === "/membres/suspensions/v2") {
        return gererDecisionSuspensionMembreV2(request, env);
      }

      if ((request.method === "GET" || request.method === "POST") && path === "/membres/suspensions") {
        return gererSuspensionsMembres(request, env, url);
      }

      if (request.method === "GET" && path === "/menu") {
        return gererMenu(request, env);
      }

      if (request.method === "GET" && path === "/read") {
        return gererLecture(request, env, url);
      }

      if (request.method === "GET" && path === "/suivi-da/detail") {
        return gererDetailSuiviDa(request, env, url);
      }

      if (request.method === "POST" && path === "/suivi-da/decision") {
        return gererDecisionSuiviDa(request, env);
      }

      if (request.method === "GET" && path === "/carte-parc") {
        return gererCarteParc(request, env, url);
      }

      if (request.method === "GET" && path === "/card-parc") {
        return gererCardParc(request, env, url);
      }

      if (request.method === "GET" && path === "/droits-planning") {
        return PLANNING_PARC_LECTURE_ADMIN.gererDroits(
          request,
          env,
          url
        );
      }

      if (request.method === "GET" && path === "/planning-parc-mois") {
        return PLANNING_PARC_LECTURE_ADMIN.gererMois(
          request,
          env,
          url
        );
      }

      if (request.method === "GET" && path === "/planning-parc-jour") {
        return PLANNING_PARC_LECTURE_ADMIN.gererJour(
          request,
          env,
          url
        );
      }

      return reponseJson(request, env, {
        success: false,
        message: "Route inconnue."
      }, 404);
    } catch (error) {
      console.error("Erreur w-admin-data :", error);

      return reponseJson(request, env, {
        success: false,
        message: "Erreur serveur.",
        detail: String(error?.message || error || "")
      }, 500);
    }
  }
};

async function gererMenu(request, env) {
  const autorisation = await autoriserRoute(
    request,
    env,
    "/ESPACE-ADMIN/accueil-admin.html"
  );

  if (!autorisation.success) {
    return reponseJson(
      request,
      env,
      autorisation.payload,
      autorisation.status,
      autorisation.cookie
    );
  }

  const boutons = await requeteSupabase(
    env,
    `${MENU_TABLE}?select=cat,position,label,href,permission_code,actif&actif=eq.true&order=cat.asc,position.asc`,
    { method: "GET" }
  );

  const permissionsActives = await requeteSupabase(
    env,
    `${PERMISSION_TABLE}?select=code&actif=eq.true`,
    { method: "GET" }
  );

  const codesActifs = new Set(
    (Array.isArray(permissionsActives) ? permissionsActives : [])
      .map((item) => String(item.code || ""))
      .filter(Boolean)
  );

  let codesAutorises = codesActifs;

  if (autorisation.admin.type !== "root") {
    const droitsRole = await requeteSupabase(
      env,
      `${ROLE_PERMISSION_TABLE}?select=permission_code,autorise&type=eq.${encodeURIComponent(autorisation.admin.type)}&autorise=eq.true`,
      { method: "GET" }
    );

    codesAutorises = new Set(
      (Array.isArray(droitsRole) ? droitsRole : [])
        .map((item) => String(item.permission_code || ""))
        .filter((code) => code && codesActifs.has(code))
    );
  }

  const resultat = (Array.isArray(boutons) ? boutons : [])
    .filter((bouton) => codesAutorises.has(String(bouton.permission_code || "")))
    .map((bouton) => ({
      cat: bouton.cat,
      position: bouton.position,
      label: bouton.label,
      href: bouton.href,
      permission_code: bouton.permission_code
    }));

  return reponseJson(request, env, {
    success: true,
    buttons: resultat
  }, 200, autorisation.cookie);
}

async function gererCardParc(request, env, url) {
  const autorisation = await autoriserRoute(
    request,
    env,
    ROUTE_CARD_PARC
  );

  if (!autorisation.success) {
    return reponseJson(
      request,
      env,
      autorisation.payload,
      autorisation.status,
      autorisation.cookie
    );
  }

  if (autorisation.permission !== PERMISSION_CARD_PARC) {
    return reponseJson(
      request,
      env,
      {
        success: false,
        message: "Configuration de permission CardParc incohérente."
      },
      403,
      autorisation.cookie
    );
  }

  const departements = normaliserDepartementsCarteParc(
    url.searchParams.get("dptmt")
  );

  if (departements.length === 0) {
    return reponseJson(
      request,
      env,
      {
        success: true,
        resource: "card-parc",
        departements: [],
        statut: "prepa",
        rows: [],
        total: 0
      },
      200,
      autorisation.cookie
    );
  }

  const lignes = [];
  const taillePage = 1000;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams();

    params.set(
      "select",
      "idparc,nom,dptmt,statut,prez,localite"
    );
    params.set(
      "dptmt",
      "in.(" + departements.join(",") + ")"
    );
    params.set("statut", "eq.prepa");
    params.set("order", "dptmt.asc,nom.asc");
    params.set("limit", String(taillePage));
    params.set("offset", String(offset));

    const lot = await requeteSupabase(
      env,
      "parcs?" + params.toString(),
      { method: "GET" }
    );

    const resultatLot = Array.isArray(lot) ? lot : [];
    lignes.push(...resultatLot);

    if (resultatLot.length < taillePage) {
      break;
    }

    offset += taillePage;

    if (offset > 100000) {
      throw new Error(
        "Lecture CardParc interrompue : volume anormal."
      );
    }
  }

  const departementsDemandes = new Set(departements);

  const rows = lignes
    .map((parc) => {
      const dptmt = normaliserDepartementCarteParc(parc?.dptmt);
      const statut = normaliserStatutCarteParc(parc?.statut);

      if (
        !dptmt ||
        !departementsDemandes.has(dptmt) ||
        statut !== "prepa"
      ) {
        return null;
      }

      return {
        idparc: parc.idparc,
        nom: String(parc.nom || "").trim(),
        dptmt,
        statut,
        prez: String(parc.prez || "").trim(),
        localite: String(parc.localite || "").trim()
      };
    })
    .filter((parc) => {
      return parc && parc.idparc && parc.nom;
    });

  return reponseJson(
    request,
    env,
    {
      success: true,
      resource: "card-parc",
      departements,
      statut: "prepa",
      rows,
      total: rows.length
    },
    200,
    autorisation.cookie
  );
}

async function gererCarteParc(request, env, url) {
  const autorisation = await autoriserRoute(
    request,
    env,
    ROUTE_CARTE_PARC
  );

  if (!autorisation.success) {
    return reponseJson(
      request,
      env,
      autorisation.payload,
      autorisation.status,
      autorisation.cookie
    );
  }

  if (autorisation.permission !== PERMISSION_CARTE_PARC) {
    return reponseJson(
      request,
      env,
      {
        success: false,
        message: "Configuration de permission CarteParc incohérente."
      },
      403,
      autorisation.cookie
    );
  }

  const statutBrut = String(
    url.searchParams.get("statut") || ""
  ).trim();
  const statut = statutBrut
    ? normaliserStatutCarteParc(statutBrut)
    : "";

  if (statutBrut && !statut) {
    return reponseJson(
      request,
      env,
      {
        success: false,
        message: "Statut CarteParc invalide."
      },
      400,
      autorisation.cookie
    );
  }

  const departements = normaliserDepartementsCarteParc(
    url.searchParams.get("dptmt")
  );
  const departementsDemandes = new Set(departements);

  const lignes = [];
  const taillePage = 1000;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams();

    params.set(
      "select",
      "idparc,nom,dptmt,statut,prez,localite,latparc,lngparc,latloc,lngloc,validcarte"
    );
    params.set("order", "dptmt.asc,nom.asc");
    params.set("limit", String(taillePage));
    params.set("offset", String(offset));

    if (statut) {
      params.set("statut", "eq." + statut);
    }

    const lot = await requeteSupabase(
      env,
      "parcs?" + params.toString(),
      { method: "GET" }
    );

    const resultatLot = Array.isArray(lot) ? lot : [];
    lignes.push(...resultatLot);

    if (resultatLot.length < taillePage) {
      break;
    }

    offset += taillePage;

    if (offset > 100000) {
      throw new Error(
        "Lecture CarteParc interrompue : volume anormal."
      );
    }
  }

  let sansCoordonnees = 0;
  let horsFiltreGeographique = 0;
  const rows = [];

  for (const parc of lignes) {
    const dptmt = normaliserDepartementCarteParc(parc?.dptmt);
    const statutParc = normaliserStatutCarteParc(parc?.statut);

    if (!dptmt || !departementMetropoleCorseCarteParc(dptmt)) {
      continue;
    }

    if (
      departementsDemandes.size > 0 &&
      !departementsDemandes.has(dptmt)
    ) {
      horsFiltreGeographique += 1;
      continue;
    }

    if (statut && statutParc !== statut) {
      continue;
    }

    const latparc = nombreCoordonneeCarteParc(parc?.latparc);
    const lngparc = nombreCoordonneeCarteParc(parc?.lngparc);
    const latloc = nombreCoordonneeCarteParc(parc?.latloc);
    const lngloc = nombreCoordonneeCarteParc(parc?.lngloc);
    const coordonneesParcValides =
      latparc !== null && lngparc !== null;
    const coordonneesLocaliteValides =
      latloc !== null && lngloc !== null;

    if (!coordonneesParcValides && !coordonneesLocaliteValides) {
      sansCoordonnees += 1;
      continue;
    }

    rows.push({
      idparc: parc.idparc,
      nom: String(parc.nom || "").trim(),
      dptmt,
      statut: statutParc,
      prez: String(parc.prez || "").trim(),
      localite: String(parc.localite || "").trim(),
      validcarte: parc?.validcarte === true,
      latitude: coordonneesParcValides ? latparc : latloc,
      longitude: coordonneesParcValides ? lngparc : lngloc,
      source_coordonnees: coordonneesParcValides ? "parc" : "localite"
    });
  }

  const localites = await lireLocalitesCarteParc(
    env,
    departements
  );

  return reponseJson(
    request,
    env,
    {
      success: true,
      resource: "carte-parc",
      statut: statut || "tous",
      departements:
        departements.length > 0 ? departements : ["tous"],
      localites,
      rows,
      totalLus: lignes.length,
      totalAffiches: rows.length,
      sansCoordonnees,
      horsFiltreGeographique
    },
    200,
    autorisation.cookie
  );
}

async function lireLocalitesCarteParc(env, departements) {
  if (!Array.isArray(departements) || departements.length === 0) {
    return [];
  }

  const params = new URLSearchParams();

  params.set(
    "select",
    "dptmt,localite,latloc,lngloc"
  );
  params.set(
    "dptmt",
    "in.(" + departements.join(",") + ")"
  );
  params.set("localite", "not.is.null");
  params.set("latloc", "not.is.null");
  params.set("lngloc", "not.is.null");
  params.set("order", "dptmt.asc");
  params.set("limit", "5000");

  const lignes = await requeteSupabase(
    env,
    "parcs?" + params.toString(),
    { method: "GET" }
  );

  const departementsDemandes = new Set(departements);
  const localitesParDepartement = new Map();

  for (const ligne of Array.isArray(lignes) ? lignes : []) {
    const dptmt = normaliserDepartementCarteParc(ligne?.dptmt);
    const nom = String(ligne?.localite || "").trim();
    const latitude = nombreCoordonneeCarteParc(ligne?.latloc);
    const longitude = nombreCoordonneeCarteParc(ligne?.lngloc);

    if (
      !dptmt ||
      !departementsDemandes.has(dptmt) ||
      !nom ||
      latitude === null ||
      longitude === null ||
      localitesParDepartement.has(dptmt)
    ) {
      continue;
    }

    localitesParDepartement.set(dptmt, {
      dptmt,
      nom,
      latitude,
      longitude
    });
  }

  return departements
    .map((dptmt) => localitesParDepartement.get(dptmt))
    .filter(Boolean);
}

function nombreCoordonneeCarteParc(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const nombre = Number(value);

  return Number.isFinite(nombre) ? nombre : null;
}

function normaliserStatutCarteParc(value) {
  const statut = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");

  return STATUTS_CARTE_PARC.has(statut)
    ? statut
    : "";
}

function normaliserDepartementsCarteParc(value) {
  const brut = String(value || "").trim();

  if (!brut || brut.toLowerCase() === "tous") {
    return [];
  }

  const departements = brut
    .split(/[|,;]/)
    .map((item) => normaliserDepartementCarteParc(item))
    .filter((item) => {
      return item && departementMetropoleCorseCarteParc(item);
    });

  return Array.from(new Set(departements))
    .sort(comparerDepartementsCarteParc)
    .slice(0, 96);
}

function normaliserDepartementCarteParc(value) {
  const brut = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (brut === "2A" || brut === "2B") {
    return brut;
  }

  if (/^\d{1,2}$/.test(brut)) {
    return brut.padStart(2, "0");
  }

  if (/^\d{3}$/.test(brut)) {
    return brut;
  }

  return "";
}

function departementMetropoleCorseCarteParc(value) {
  if (value === "2A" || value === "2B") {
    return true;
  }

  if (!/^\d{2}$/.test(value) || value === "20") {
    return false;
  }

  const numero = Number(value);

  return Number.isInteger(numero) && numero >= 1 && numero <= 95;
}

function comparerDepartementsCarteParc(a, b) {
  const ordre = (value) => {
    if (value === "2A") {
      return 20.1;
    }

    if (value === "2B") {
      return 20.2;
    }

    const numero = Number(value);
    return Number.isFinite(numero) ? numero : 999;
  };

  return ordre(a) - ordre(b) || a.localeCompare(b, "fr");
}

async function gererLecture(request, env, url) {
  const resourceCode = String(
    url.searchParams.get("resource") || ""
  ).trim();

  if (!resourceCode) {
    return reponseJson(request, env, {
      success: false,
      message: "Ressource manquante."
    }, 400);
  }

  if (resourceCode === RESOURCE_PLANNING_PARC_LECTURE) {
    return PLANNING_PARC_LECTURE_ADMIN.gererSynthese(request, env, url);
  }

  if (resourceCode === "carte-parc") {
    return gererCarteParc(request, env, url);
  }

  const resource = await chercherRessource(env, resourceCode);

  if (!resource || resource.actif !== true) {
    return reponseJson(request, env, {
      success: false,
      message: "Ressource inconnue ou inactive."
    }, 404);
  }

  const autorisation = await autoriserRoute(
    request,
    env,
    resource.route_path
  );

  if (!autorisation.success) {
    return reponseJson(
      request,
      env,
      autorisation.payload,
      autorisation.status,
      autorisation.cookie
    );
  }

  if (autorisation.permission !== resource.permission_code) {
    return reponseJson(request, env, {
      success: false,
      message: "Configuration de permission incohérente."
    }, 403, autorisation.cookie);
  }

  let colonnes = await chercherColonnes(env, resourceCode);

  if (resourceCode === "parcs-statut") {
    colonnes = preparerColonnesParcsStatut(colonnes);
  }

  if (colonnes.length === 0) {
    return reponseJson(request, env, {
      success: false,
      message: "Aucune colonne active configurée."
    }, 500, autorisation.cookie);
  }

  validerIdentifiantSql(resource.table_name, "table");

  colonnes.forEach((colonne) => {
    validerIdentifiantSql(colonne.column_name, "colonne");
  });

  if (resource.code === RESOURCE_SUIVI_DA) {
    return gererLectureSuiviDa(
      request,
      env,
      url,
      resource,
      colonnes,
      autorisation.cookie
    );
  }

  if (resource.code === "parcs-photos") {
    return gererLecturePhotosParc(
      request,
      env,
      url,
      resource,
      colonnes,
      autorisation.cookie
    );
  }

  if (resource.code === "parcs-france") {
    return gererLectureParcsFrance(
      request,
      env,
      url,
      resource,
      colonnes,
      autorisation.cookie
    );
  }

  const colonnesParNom = new Map(
    colonnes.map((colonne) => [colonne.column_name, colonne])
  );

  const triDemande = String(
    url.searchParams.get("sort") ||
    resource.default_sort_column ||
    ""
  ).trim();

  const directionDemandee = String(
    url.searchParams.get("direction") ||
    resource.default_sort_direction ||
    "asc"
  ).toLowerCase();

  let colonneTri = null;

  if (triDemande) {
    const colonneCandidate = colonnesParNom.get(triDemande);

    if (
      colonneCandidate &&
      (
        colonneCandidate.sortable === true ||
        triDemande === resource.default_sort_column
      )
    ) {
      colonneTri = triDemande;
    }
  }

  const directionTri = directionDemandee === "desc" ? "desc" : "asc";

  const limit = bornerEntier(
    url.searchParams.get("limit"),
    100,
    1,
    200
  );

  const offset = bornerEntier(
    url.searchParams.get("offset"),
    0,
    0,
    1000000
  );

  const colonnesSelectionnees = colonnes
    .map((colonne) => colonne.column_name);

  if (
    RESSOURCES_PARC_AVEC_IDENTIFIANT.has(resource.code) &&
    !colonnesSelectionnees.includes("idparc")
  ) {
    colonnesSelectionnees.unshift("idparc");
  }

  const select = colonnesSelectionnees.join(",");

  const paramsSupabase = new URLSearchParams();

  paramsSupabase.set("select", select);
  paramsSupabase.set("limit", String(limit));
  paramsSupabase.set("offset", String(offset));

  if (colonneTri) {
    paramsSupabase.set(
      "order",
      colonneTri + "." + directionTri
    );
  }

  ajouterFiltresSupabase(
    paramsSupabase,
    url,
    colonnes
  );

  const chemin =
    `${resource.table_name}?${paramsSupabase.toString()}`;

  const resultat = await requeteSupabaseDetail(
    env,
    chemin,
    {
      method: "GET",
      prefer: "count=exact"
    }
  );

  const total = lireTotalDepuisContentRange(
    resultat.headers.get("Content-Range"),
    Array.isArray(resultat.data) ? resultat.data.length : 0
  );

  return reponseJson(request, env, {
    success: true,
    resource: resource.code,
    columns: colonnes
      .filter((colonne) => {
        return !(
          RESSOURCES_PARC_AVEC_IDENTIFIANT.has(resource.code) &&
          colonne.column_name === "idparc"
        );
      })
      .map((colonne) => ({
        key: colonne.column_name,
        label: colonne.label,
        sortable: colonne.sortable === true,
        filterable: colonne.filterable === true
      })),
    rows: Array.isArray(resultat.data) ? resultat.data : [],
    total,
    limit,
    offset
  }, 200, autorisation.cookie);
}


async function gererLectureSuiviDa(
  request,
  env,
  url,
  resource,
  colonnes,
  setCookie
) {
  if (
    resource.route_path !== ROUTE_SUIVI_DA ||
    resource.permission_code !== PERMISSION_SUIVI_DA
  ) {
    return reponseJson(request, env, {
      success: false,
      message: "Configuration SuiviDA incohérente."
    }, 403, setCookie);
  }

  const lignesBrutes = [];
  const taillePageSupabase = 1000;
  let offsetSupabase = 0;

  while (true) {
    const params = new URLSearchParams();

    params.set(
      "select",
      "idda,idmembre,active,daterefu,datenext,dataccept," +
      "membres!inner(" +
      "dptmtmembre,nommembre,emailmembre,dateda,statuda" +
      ")"
    );
    params.set("order", "dateda.desc");
    params.set("limit", String(taillePageSupabase));
    params.set("offset", String(offsetSupabase));

    const lot = await requeteSupabase(
      env,
      "damembre?" + params.toString(),
      { method: "GET" }
    );

    const lignesLot = Array.isArray(lot) ? lot : [];
    lignesBrutes.push(...lignesLot);

    if (lignesLot.length < taillePageSupabase) {
      break;
    }

    offsetSupabase += taillePageSupabase;

    if (offsetSupabase > 100000) {
      throw new Error(
        "Lecture SuiviDA interrompue : volume anormal."
      );
    }
  }

  let lignes = lignesBrutes.map((ligne) => {
    const membre = ligne?.membres || {};

    return {
      idda: ligne?.idda || null,
      idmembre: ligne?.idmembre || null,
      active: ligne?.active === true,
      dptmt: membre?.dptmtmembre ?? "",
      nom: membre?.nommembre ?? "",
      email: membre?.emailmembre ?? "",
      dateda: membre?.dateda ?? null,
      statuda: membre?.statuda ?? null,
      daterefu: ligne?.daterefu ?? null,
      datenext: ligne?.datenext ?? null,
      dataccept: ligne?.dataccept ?? null
    };
  });

  lignes = filtrerLignesCalculees(
    lignes,
    url,
    colonnes
  );

  const colonnesParNom = new Map(
    colonnes.map((colonne) => [
      colonne.column_name,
      colonne
    ])
  );

  const triDemande = String(
    url.searchParams.get("sort") ||
    resource.default_sort_column ||
    "datenext"
  ).trim();

  const colonneCandidate = colonnesParNom.get(triDemande);
  const colonneTri =
    colonneCandidate &&
    (
      colonneCandidate.sortable === true ||
      triDemande === resource.default_sort_column
    )
      ? triDemande
      : "datenext";

  const directionTri = String(
    url.searchParams.get("direction") ||
    resource.default_sort_direction ||
    "asc"
  ).toLowerCase() === "desc"
? "desc"
    : "asc";

  lignes.sort((ligneA, ligneB) => {
    const valeurA = ligneA?.[colonneTri];
    const valeurB = ligneB?.[colonneTri];
    const videA =
      valeurA === null ||
      valeurA === undefined ||
      valeurA === "";
    const videB =
      valeurB === null ||
      valeurB === undefined ||
      valeurB === "";

    if (videA || videB) {
      if (videA && videB) {
        return comparerValeursAdmin(
          ligneA?.nom,
          ligneB?.nom
        );
      }

      return videA ? 1 : -1;
    }

    const comparaison = comparerValeursSuiviDa(
      valeurA,
      valeurB,
      colonneTri
    );

    if (comparaison !== 0) {
      return directionTri === "desc"
        ? -comparaison
        : comparaison;
    }

    return comparerValeursAdmin(
      ligneA?.nom,
      ligneB?.nom
    );
  });

  const limit = bornerEntier(
    url.searchParams.get("limit"),
    100,
    1,
    200
  );

  const offset = bornerEntier(
    url.searchParams.get("offset"),
    0,
    0,
    1000000
  );

  const total = lignes.length;
  const rows = lignes.slice(offset, offset + limit);

  return reponseJson(request, env, {
    success: true,
    resource: resource.code,
    columns: colonnes.map((colonne) => ({
      key: colonne.column_name,
      label: colonne.label,
      sortable: colonne.sortable === true,
      filterable: colonne.filterable === true
    })),
    rows,
    total,
    limit,
    offset
  }, 200, setCookie);
}

function comparerValeursSuiviDa(valeurA, valeurB, colonne) {
  if (estNomColonneDate(colonne)) {
    const dateA = new Date(valeurA).getTime();
    const dateB = new Date(valeurB).getTime();

    if (Number.isFinite(dateA) && Number.isFinite(dateB)) {
      return dateA - dateB;
    }
  }

  return comparerValeursAdmin(valeurA, valeurB);
}

async function gererDetailSuiviDa(request, env, url) {
  const autorisation = await autoriserRoute(
    request,
    env,
    ROUTE_SUIVI_DA
  );

  if (!autorisation.success) {
    return reponseJson(
      request,
      env,
      autorisation.payload,
      autorisation.status,
      autorisation.cookie
    );
  }

  if (autorisation.permission !== PERMISSION_SUIVI_DA) {
    return reponseJson(request, env, {
      success: false,
      message: "Configuration de permission SuiviDA incohérente."
    }, 403, autorisation.cookie);
  }

  const idda = String(
    url.searchParams.get("idda") || ""
  ).trim();

  if (!uuidValideSuiviDa(idda)) {
    return reponseJson(request, env, {
      success: false,
      message: "Identifiant DA invalide."
    }, 400, autorisation.cookie);
  }

  const params = new URLSearchParams();

  params.set(
    "select",
    "idda,idmembre,active,daterefu,datenext,dataccept," +
    "membres!inner(" +
    "idmembre,nommembre,prenommembre,dptmtmembre," +
    "emailmembre,dateda,statuda,alias,tel,autoquali," +
    "autoloisir,autonouschoisir,checkboxvaleurs," +
    "targetfamill,iban,swift,rib,adresse1,adresse2,adresse3" +
    ")"
  );
  params.set("idda", "eq." + idda);
  params.set("limit", "1");

  const lignes = await requeteSupabase(
    env,
    "damembre?" + params.toString(),
    { method: "GET" }
  );

  const ligne = Array.isArray(lignes) && lignes.length > 0
    ? lignes[0]
    : null;

  if (!ligne) {
    return reponseJson(request, env, {
      success: false,
      message: "DA introuvable."
    }, 404, autorisation.cookie);
  }

  const membre = ligne.membres || {};
  const parrain = await lireParrainSuiviDa(
    env,
    ligne.idmembre
  );

  return reponseJson(request, env, {
    success: true,
    da: {
      idda: ligne.idda,
      idmembre: ligne.idmembre,
      active: ligne.active === true,
      daterefu: ligne.daterefu || null,
      datenext: ligne.datenext || null,
      dataccept: ligne.dataccept || null,
      membre: {
        ...membre,
        emailparrain: parrain?.emailparrain || ""
      }
    }
  }, 200, autorisation.cookie);
}

async function lireParrainSuiviDa(env, idmembre) {
  const params = new URLSearchParams();

  params.set(
    "select",
    "idmembre,emailparrain,idparrain,datemaj"
  );
  params.set("idmembre", "eq." + idmembre);
  params.set("limit", "1");

  const lignes = await requeteSupabase(
    env,
    "parrain?" + params.toString(),
    { method: "GET" }
  );

  return Array.isArray(lignes) && lignes.length > 0
    ? lignes[0]
    : null;
}

async function gererDecisionSuiviDa(request, env) {
  const autorisation = await autoriserRoute(
    request,
    env,
    ROUTE_SUIVI_DA
  );

  if (!autorisation.success) {
    return reponseJson(
      request,
      env,
      autorisation.payload,
      autorisation.status,
      autorisation.cookie
    );
  }

  if (autorisation.permission !== PERMISSION_SUIVI_DA) {
    return reponseJson(request, env, {
      success: false,
      message: "Configuration de permission SuiviDA incohérente."
    }, 403, autorisation.cookie);
  }

  const body = await lireJsonSuiviDa(request);
  const idda = String(body.idda || "").trim();
  const champ = String(body.champ || "").trim();
  const date = String(body.date || "").trim();

  if (!uuidValideSuiviDa(idda)) {
    return reponseJson(request, env, {
      success: false,
      message: "Identifiant DA invalide."
    }, 400, autorisation.cookie);
  }

  if (champ !== "daterefu" && champ !== "dataccept") {
    return reponseJson(request, env, {
      success: false,
      message: "Décision DA invalide."
    }, 400, autorisation.cookie);
  }

  if (!dateValideSuiviDa(date)) {
    return reponseJson(request, env, {
      success: false,
      message: "Date DA invalide."
    }, 400, autorisation.cookie);
  }

  verifierResendSuiviDa(env);

  const destinataire = await lireDestinataireDecisionSuiviDa(
    env,
    idda
  );

  if (!destinataire) {
    return reponseJson(request, env, {
      success: false,
      message: "Membre destinataire introuvable."
    }, 404, autorisation.cookie);
  }

  const resultat = await requeteSupabase(
    env,
    "rpc/admin_decider_da",
    {
      method: "POST",
      body: {
        p_idda: idda,
        p_champ: champ,
        p_date: date
      },
      prefer: "return=representation"
    }
  );

  const decision = Array.isArray(resultat)
    ? resultat[0] || null
    : resultat || null;

  try {
    await envoyerEmailDecisionSuiviDa(
      env,
      destinataire,
      champ
    );
  } catch (error) {
    console.error("Erreur e-mail décision DA :", error);

    return reponseJson(request, env, {
      success: false,
      decisionEnregistree: true,
      message: "La décision a été enregistrée, mais l’e-mail n’a pas pu être envoyé.",
      detail: String(error?.message || error || ""),
      decision
    }, 502, autorisation.cookie);
  }

  return reponseJson(request, env, {
    success: true,
    emailEnvoye: true,
    decision
  }, 200, autorisation.cookie);
}

async function lireDestinataireDecisionSuiviDa(env, idda) {
  const params = new URLSearchParams();

  params.set(
    "select",
    "idda,membres!inner(prenommembre,emailmembre)"
  );
  params.set("idda", "eq." + idda);
  params.set("limit", "1");

  const lignes = await requeteSupabase(
    env,
    "damembre?" + params.toString(),
    { method: "GET" }
  );

  const ligne = Array.isArray(lignes) && lignes.length > 0
    ? lignes[0]
    : null;
  const membre = ligne?.membres || null;
  const emailmembre = String(
    membre?.emailmembre || ""
  ).trim().toLowerCase();

  if (!membre || !emailValideSuiviDa(emailmembre)) {
    return null;
  }

  return {
    prenommembre: String(
      membre.prenommembre || ""
    ).trim(),
    emailmembre
  };
}

async function envoyerEmailDecisionSuiviDa(
  env,
  destinataire,
  champ
) {
  const retenue = champ === "dataccept";
  const subject = retenue
    ? "La Clé du Parc | Votre DA est retenue"
    : "La Clé du Parc | Votre DA n'est pas retenue";
  const text = retenue
    ? construireEmailDaRetenueTexte(
        destinataire.prenommembre
      )
    : construireEmailDaNonRetenueTexte(
        destinataire.prenommembre
      );
  const html = retenue
    ? construireEmailDaRetenueHtml(
        destinataire.prenommembre
      )
    : construireEmailDaNonRetenueHtml(
        destinataire.prenommembre
      );

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "La Clef du Parc <noreply@lacleduparc.fr>",
        to: destinataire.emailmembre,
        subject,
        text,
        html
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Resend : ${response.status} - ${detail}`
    );
  }

  return response.json().catch(() => null);
}

function construireEmailDaRetenueTexte(prenommembre) {
  const civilite = prenommembre
    ? `Bonjour ${prenommembre},`
    : "Bonjour,";

  return [
    civilite,
    "",
    "Le club a le plaisir de vous dire que votre DA est retenue !",
    "",
    "Cela a été l'occasion de vous entendre présenter votre motivation et passion pour les parcs plein air d'exception que le club propose avec La Clé du Parc.",
    "",
    "Toutes nos félicitations ! Nous sommes heureux de pouvoir dorénavant vous compter parmi les membres abonnés du club dès vous le souhaiterez.",
    "",
    "En tant que membre abonné, vous pouvez réserver et organiser votre agenda La Clé du Parc comme vous souhaitez, dans le respect des conditions prévues (cf. le règlement de l'application).",
    "",
    "Vous pouvez aussi inviter les membres invités de votre choix (selon l'abonnement que vous avez pris), dans le respect des conditions prévues (cf. le règlement de l'application).",
    "",
    "L'acquisition du bracelet de présence La Clé du Parc est nécessaire dans les 30 jours qui suivent la validation de votre demande d'abonnement.",
    "Vous pouvez commander votre bracelet dans la boutique La Clé du Parc : " + "https://membre.lacleduparc.fr/ESPACE-MEMBRE/boutique-LCDP.html",
    "",
    "Retrouvez les informations de votre DA dans l'espace MON COMPTE membre de l'application.",
    "",
    "À bientôt dans les parcs !",
    "Le club La Clé du Parc"
  ].join("\n");
}

function construireEmailDaNonRetenueTexte(prenommembre) {
  const civilite = prenommembre
    ? `Bonjour ${prenommembre},`
    : "Bonjour,";

  return [
    civilite,
    "",
    "Votre DA n'est pas retenue.",
    "",
    "Cela a été l'occasion de vous entendre présenter votre motivation et passion pour les activités du club et nous vous en remercions. L'ensemble de ces informations ne nous a toutefois pas amené à retenir votre DA pour aujourd'hui.",
    "",
    "Vous restez bien sûr pleinement membre invité du club et cela est une très bonne nouvelle !",
    "",
    "Vous pouvez en effet :",
    "- continuer à bénéficier pleinement des parcs du réseau en tant que membre invité",
    "- faire une nouvelle DA dans 3 mois en suivant la même démarche dans l'application",
    "",
    "À bientôt dans les parcs !",
    "Le club La Clé du Parc"
  ].join("\n");
}

function construireEmailDaRetenueHtml(prenommembre) {
  const civilite = prenommembre
    ? `Bonjour ${escapeHtmlSuiviDa(prenommembre)},`
    : "Bonjour,";

  return `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,system-ui,sans-serif;color:#1f2a24;">
  <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
    <div style="background:#ffffff;border:1px solid rgba(31,42,36,0.22);border-radius:22px;padding:32px;box-shadow:0 12px 30px rgba(31,42,36,0.08);">
      <h1 style="margin:0 0 18px;font-size:28px;line-height:1.15;color:#1f2a24;">${civilite}</h1>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Le club a le plaisir de vous dire que votre DA est retenue !</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Cela a été l'occasion de vous entendre présenter votre motivation et passion pour les parcs plein air d'exception que le club propose avec La Clé du Parc.</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Toutes nos félicitations ! Nous sommes heureux de pouvoir dorénavant vous compter parmi les membres abonnés du club dès vous le souhaiterez.</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">En tant que membre abonné, vous pouvez réserver et organiser votre agenda La Clé du Parc comme vous souhaitez, dans le respect des conditions prévues (cf. le règlement de l'application).</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Vous pouvez aussi inviter les membres invités de votre choix (selon l'abonnement que vous avez pris), dans le respect des conditions prévues (cf. le règlement de l'application).</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">L'acquisition du <strong>bracelet de présence La Clé du Parc</strong> est nécessaire dans les <strong>30 jours suivant la validation de votre demande d'abonnement</strong>.</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Vous pouvez commander votre bracelet dans la <a href="https://membre.lacleduparc.fr/ESPACE-MEMBRE/boutique-LCDP.html" style="color:#35633c;text-decoration:underline;font-weight:700;">boutique La Clé du Parc</a>.</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Retrouvez les informations de votre DA dans l'espace MON COMPTE membre de l'application.</p>
      <p style="margin:0;font-size:18px;line-height:1.45;color:#5f6861;">À bientôt dans les parcs !<br>Le club La Clé du Parc</p>
    </div>
  </div>
</body>
</html>`;
}

function construireEmailDaNonRetenueHtml(prenommembre) {
  const civilite = prenommembre
    ? `Bonjour ${escapeHtmlSuiviDa(prenommembre)},`
    : "Bonjour,";

  return `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,system-ui,sans-serif;color:#1f2a24;">
  <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
    <div style="background:#ffffff;border:1px solid rgba(31,42,36,0.22);border-radius:22px;padding:32px;box-shadow:0 12px 30px rgba(31,42,36,0.08);">
      <h1 style="margin:0 0 18px;font-size:28px;line-height:1.15;color:#1f2a24;">${civilite}</h1>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Votre DA n'est pas retenue.</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Cela a été l'occasion de vous entendre présenter votre motivation et passion pour les activités du club et nous vous en remercions. L'ensemble de ces informations ne nous a toutefois pas amené à retenir votre DA pour aujourd'hui.</p>
      <p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#5f6861;">Vous restez bien sûr pleinement membre invité du club et cela est une très bonne nouvelle !</p>
      <p style="margin:0 0 8px;font-size:18px;line-height:1.45;color:#5f6861;">Vous pouvez en effet :</p>
      <ul style="margin:0 0 18px;padding-left:24px;font-size:18px;line-height:1.45;color:#5f6861;">
        <li>continuer à bénéficier pleinement des parcs du réseau en tant que membre invité</li>
        <li>faire une nouvelle DA dans 3 mois en suivant la même démarche dans l'application</li>
      </ul>
      <p style="margin:0;font-size:18px;line-height:1.45;color:#5f6861;">À bientôt dans les parcs !<br>Le club La Clé du Parc</p>
    </div>
  </div>
</body>
</html>`;
}

function verifierResendSuiviDa(env) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY manquant.");
  }
}

function emailValideSuiviDa(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );
}

function escapeHtmlSuiviDa(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function lireJsonSuiviDa(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function uuidValideSuiviDa(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function dateValideSuiviDa(value) {
  const texte = String(value || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
    return false;
  }

  const date = new Date(texte + "T12:00:00Z");

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === texte;
}


async function gererLecturePhotosParc(
  request,
  env,
  url,
  resource,
  colonnes,
  setCookie
) {
  const paramsParcs = new URLSearchParams();

  paramsParcs.set(
    "select",
    "dptmt,nom,arrdmt,statut"
  );
  paramsParcs.set(
    "statut",
    "in.(oui,prepa)"
  );
  paramsParcs.set(
    "order",
    "dptmt.asc,nom.asc"
  );
  paramsParcs.set(
    "limit",
    "1000"
  );

  const parcs = await requeteSupabase(
    env,
    `${resource.table_name}?${paramsParcs.toString()}`,
    { method: "GET" }
  );

  const arbreGithub = await lireArborescenceGithub(env);
  const fichiersParDossier = indexerFichiersParc(arbreGithub);

  let lignes = (Array.isArray(parcs) ? parcs : [])
    .map((parc) => construireLignePhotosParc(
      parc,
      fichiersParDossier
    ));

  lignes = filtrerLignesCalculees(
    lignes,
    url,
    colonnes
  );

  const colonnesParNom = new Map(
    colonnes.map((colonne) => [
      colonne.column_name,
      colonne
    ])
  );

  const triDemande = String(
    url.searchParams.get("sort") ||
    resource.default_sort_column ||
    "dptmt"
  ).trim();

  const colonneCandidate = colonnesParNom.get(triDemande);

  const colonneTri =
    colonneCandidate &&
    (
      colonneCandidate.sortable === true ||
      triDemande === resource.default_sort_column
    )
      ? triDemande
      : "dptmt";

  const directionTri = String(
    url.searchParams.get("direction") ||
    resource.default_sort_direction ||
    "asc"
  ).toLowerCase() === "desc"
    ? "desc"
    : "asc";

  lignes.sort((ligneA, ligneB) => {
    const comparaison = comparerValeursAdmin(
      ligneA?.[colonneTri],
      ligneB?.[colonneTri]
    );

    if (comparaison !== 0) {
      return directionTri === "desc"
        ? -comparaison
        : comparaison;
    }

    return comparerValeursAdmin(
      ligneA?.nom,
      ligneB?.nom
    );
  });

  const limit = bornerEntier(
    url.searchParams.get("limit"),
    100,
    1,
    200
  );

  const offset = bornerEntier(
    url.searchParams.get("offset"),
    0,
    0,
    1000000
  );

  const total = lignes.length;
  const lignesRetournees = lignes.slice(
    offset,
    offset + limit
  );

  return reponseJson(request, env, {
    success: true,
    resource: resource.code,
    columns: colonnes.map((colonne) => ({
      key: colonne.column_name,
      label: colonne.label,
      sortable: colonne.sortable === true,
      filterable: colonne.filterable === true
    })),
    rows: lignesRetournees,
    total,
    limit,
    offset
  }, 200, setCookie);
}


async function gererLectureParcsFrance(
  request,
  env,
  url,
  resource,
  colonnes,
  setCookie
) {
  const colonnesParcsFrance = ajouterColonneValideParc(
    colonnes
  );

  const parcs = await lireLignesParcsFrance(
    env,
    resource.table_name
  );

  let lignes = construireLignesParcsFrance(parcs);

  lignes = filtrerLignesCalculees(
    lignes,
    url,
    colonnesParcsFrance
  );

  const colonnesParNom = new Map(
    colonnesParcsFrance.map((colonne) => [
      colonne.column_name,
      colonne
    ])
  );

  const triDemande = String(
    url.searchParams.get("sort") ||
    resource.default_sort_column ||
    "dptmt"
  ).trim();

  const colonneCandidate = colonnesParNom.get(triDemande);

  const colonneTri =
    colonneCandidate &&
    (
      colonneCandidate.sortable === true ||
      triDemande === resource.default_sort_column
    )
      ? triDemande
      : "dptmt";

  const directionTri = String(
    url.searchParams.get("direction") ||
    resource.default_sort_direction ||
    "asc"
  ).toLowerCase() === "desc"
    ? "desc"
    : "asc";

  lignes.sort((ligneA, ligneB) => {
    const comparaison = comparerValeursAdmin(
      ligneA?.[colonneTri],
      ligneB?.[colonneTri]
    );

    if (comparaison !== 0) {
      return directionTri === "desc"
        ? -comparaison
        : comparaison;
    }

    return comparerValeursAdmin(
      ligneA?.dptmt,
      ligneB?.dptmt
    );
  });

  const limit = bornerEntier(
    url.searchParams.get("limit"),
    200,
    1,
    200
  );

  const offset = bornerEntier(
    url.searchParams.get("offset"),
    0,
    0,
    1000000
  );

  const total = lignes.length;
  const lignesRetournees = lignes.slice(
    offset,
    offset + limit
  );

  return reponseJson(request, env, {
    success: true,
    resource: resource.code,
    columns: colonnesParcsFrance.map((colonne) => ({
      key: colonne.column_name,
      label: colonne.label,
      sortable: colonne.sortable === true,
      filterable: colonne.filterable === true
    })),
    rows: lignesRetournees,
    total,
    limit,
    offset
  }, 200, setCookie);
}

function preparerColonnesParcsStatut(colonnes) {
  const liste = Array.isArray(colonnes)
    ? colonnes.map((colonne) => ({ ...colonne }))
    : [];

  const colonnesParNom = new Map(
    liste.map((colonne) => [
      String(colonne.column_name || ""),
      colonne
    ])
  );

  const tiktokExistant = colonnesParNom.get("tiktok");
  const abbayeExistante = colonnesParNom.get("abbaye");

  colonnesParNom.set("tiktok", {
    ...(tiktokExistant || {}),
    position: tiktokExistant?.position ?? 0,
    column_name: "tiktok",
    label: String(tiktokExistant?.label || "TikTok"),
    sortable: true,
    filterable: true,
    visible: true,
    actif: true
  });

  colonnesParNom.set("abbaye", {
    ...(abbayeExistante || {}),
    position: abbayeExistante?.position ?? 0,
    column_name: "abbaye",
    label: String(abbayeExistante?.label || "Abbaye"),
    sortable: true,
    filterable: true,
    visible: true,
    actif: true
  });

  const ordrePrioritaire = [
    "dptmt",
    "nom",
    "arrdmt",
    "statut",
    "datestatut"
  ];

  const resultat = [];
  const dejaAjoutees = new Set();

  ordrePrioritaire.forEach((nomColonne) => {
    const colonne = colonnesParNom.get(nomColonne);

    if (!colonne) {
      return;
    }

    resultat.push(colonne);
    dejaAjoutees.add(nomColonne);
  });

  liste.forEach((colonne) => {
    const nomColonne = String(
      colonne?.column_name || ""
    );

    if (
      !nomColonne ||
      dejaAjoutees.has(nomColonne) ||
      nomColonne === "tiktok" ||
      nomColonne === "abbaye"
    ) {
      return;
    }

    resultat.push(colonne);
    dejaAjoutees.add(nomColonne);
  });

  resultat.push(colonnesParNom.get("tiktok"));
  resultat.push(colonnesParNom.get("abbaye"));

  return resultat;
}

function ajouterColonneValideParc(colonnes) {
  const liste = Array.isArray(colonnes)
    ? colonnes.map((colonne) => ({ ...colonne }))
    : [];

  if (
    liste.some((colonne) => {
      return colonne.column_name === "validcarte";
    })
  ) {
    return liste;
  }

  const indexLatitude = liste.findIndex((colonne) => {
    return colonne.column_name === "latparc_nul";
  });

  const modele = indexLatitude >= 0
    ? liste[indexLatitude]
    : null;

  const colonneValideParc = {
    position: modele?.position ?? 0,
    column_name: "validcarte",
    label: "Valide parc",
    sortable: modele?.sortable === true,
    filterable: modele?.filterable === true,
    visible: true,
    actif: true
  };

  if (indexLatitude >= 0) {
    liste.splice(indexLatitude + 1, 0, colonneValideParc);
  } else {
    liste.push(colonneValideParc);
  }

  return liste;
}

async function lireLignesParcsFrance(env, tableName) {
  validerIdentifiantSql(tableName, "table");

  const toutesLesLignes = [];
  const taillePage = 1000;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams();

    params.set(
      "select",
      "dptmt,statut,latparc,validcarte"
    );
    params.set("dptmt", "not.is.null");
    params.set("order", "dptmt.asc,nom.asc");
    params.set("limit", String(taillePage));
    params.set("offset", String(offset));

    const lot = await requeteSupabase(
      env,
      `${tableName}?${params.toString()}`,
      { method: "GET" }
    );

    const lignes = Array.isArray(lot) ? lot : [];

    toutesLesLignes.push(...lignes);

    if (lignes.length < taillePage) {
      break;
    }

    offset += taillePage;

    if (offset > 100000) {
      throw new Error(
        "Lecture parcs France interrompue : volume anormal."
      );
    }
  }

  return toutesLesLignes;
}

function construireLignesParcsFrance(parcs) {
  const regroupement = new Map();

  (Array.isArray(parcs) ? parcs : []).forEach((parc) => {
    const dptmt = String(parc?.dptmt || "").trim();

    if (!dptmt) {
      return;
    }

    if (!regroupement.has(dptmt)) {
      regroupement.set(dptmt, {
        dptmt,
        total_entrees: 0,
        latparc_nul: 0,
        validcarte: 0,
        statut_recherche: 0,
        statut_prepa: 0,
        statut_oui: 0,
        statut_non: 0,
        statut_nonconforme: 0,
        statut_acreuserfautinfo: 0
      });
    }

    const ligne = regroupement.get(dptmt);
    const statut = normaliserStatutParcFrance(parc?.statut);

    ligne.total_entrees += 1;

    if (valeurLatitudeParcNulle(parc?.latparc)) {
      ligne.latparc_nul += 1;
    }

    if (parc?.validcarte === true) {
      ligne.validcarte += 1;
    }

    if (statut === "recherche") {
      ligne.statut_recherche += 1;
} else if (statut === "prepa") {
      ligne.statut_prepa += 1;
    } else if (statut === "oui") {
      ligne.statut_oui += 1;
    } else if (statut === "non") {
      ligne.statut_non += 1;
    } else if (statut === "nonconforme") {
      ligne.statut_nonconforme += 1;
    } else if (statut === "acreuserfautinfo") {
      ligne.statut_acreuserfautinfo += 1;
    }
  });

  return Array.from(regroupement.values());
}

function normaliserStatutParcFrance(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_-]+/g, "");
}

function valeurLatitudeParcNulle(value) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    Number.isNaN(Number(value))
  );
}

async function lireArborescenceGithub(env) {
  const owner = String(env.GITHUB_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO || "").trim();
  const branche = String(env.GITHUB_BRANCH || "").trim();

  if (!owner || !repo || !branche) {
    throw new Error(
      "Variables GitHub manquantes : " +
      "GITHUB_OWNER, GITHUB_REPO ou GITHUB_BRANCH."
    );
  }

  const endpoint =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/git/trees/" +
    encodeURIComponent(branche) +
    "?recursive=1";

  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "La-Cle-du-Parc-Admin",
    "X-GitHub-Api-Version": "2022-11-28"
  });

  const token = String(env.GITHUB_TOKEN || "").trim();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers,
    cache: "no-store"
  });

  const texte = await response.text();

  if (!response.ok) {
    throw new Error(
      `GitHub ${response.status} : ${texte}`
    );
  }

  const data = texte ? JSON.parse(texte) : null;

  if (!data || !Array.isArray(data.tree)) {
    throw new Error(
      "Réponse d’arborescence GitHub invalide."
    );
  }

  if (data.truncated === true) {
    throw new Error(
      "Arborescence GitHub tronquée : " +
      "le comptage des fichiers ne serait pas fiable."
    );
  }

  return data.tree;
}

function indexerFichiersParc(arbreGithub) {
  const prefixe = "OBJET/IMAG/PARC/";
  const index = new Map();

  arbreGithub.forEach((item) => {
    if (item?.type !== "blob") {
      return;
    }

    const chemin = String(item.path || "");

    if (!chemin.startsWith(prefixe)) {
      return;
    }

    const relatif = chemin.slice(prefixe.length);
    const segments = relatif.split("/");

    /*
     * Seuls les fichiers directement placés dans :
     * OBJET/IMAG/PARC/<DPTMT>/<DOSSIER_PARC>/
     * sont comptés.
     */
    if (segments.length !== 3) {
      return;
    }

    const [dptmt, dossier, nomFichier] = segments;

    if (!dptmt || !dossier || !nomFichier) {
      return;
    }

    const cle = `${dptmt}/${dossier}`;

    if (!index.has(cle)) {
      index.set(cle, {
        total: 0,
        card: 0,
        acc: 0
      });
    }

    const compteurs = index.get(cle);

    compteurs.total += 1;

    if (nomFichier.startsWith("card")) {
      compteurs.card += 1;
    }

    if (nomFichier.startsWith("acc")) {
      compteurs.acc += 1;
    }
  });

  return index;
}

function construireLignePhotosParc(
  parc,
  fichiersParDossier
) {
  const dptmt = String(parc?.dptmt || "").trim();
  const nom = String(parc?.nom || "").trim();

  /*
   * Règle validée :
   * LA NOUE -> LA_NOUE
   * LE PLESSIS-BOURRE -> LE_PLESSIS-BOURRE
   * Aucune autre transformation.
   */
  const dossier = nom.replace(/ /g, "_");
  const cle = `${dptmt}/${dossier}`;

  const compteurs = fichiersParDossier.get(cle) || {
    total: 0,
    card: 0,
    acc: 0
  };

  const gal =
    compteurs.total -
    compteurs.card -
    compteurs.acc;

  const alertes = [];

  if (compteurs.card < 1) {
    alertes.push("card");
  }

  if (compteurs.acc < 2) {
    alertes.push("acc");
  }

  if (gal < 6) {
    alertes.push("gal");
  }

  return {
    dptmt,
    nom,
    arrdmt: parc?.arrdmt ?? "",
    total: compteurs.total,
    card: compteurs.card,
    acc: compteurs.acc,
    gal,
    alerte: alertes.join(" | ")
  };
}

function filtrerLignesCalculees(
  lignes,
  url,
  colonnes
) {
  return lignes.filter((ligne) => {
    return colonnes.every((colonne) => {
      if (colonne.filterable !== true) {
        return true;
      }

      const valeurBrute = String(
        url.searchParams.get(
          "filter_" + colonne.column_name
        ) || ""
      ).trim();

      if (!valeurBrute) {
        return true;
      }

      const valeursRecherchees = decouperValeursFiltre(
        valeurBrute
      )
        .map(nettoyerValeurFiltreTexte)
        .filter(Boolean)
        .map((valeur) => valeur.toLocaleLowerCase("fr"));

      if (valeursRecherchees.length === 0) {
        return true;
      }

      const valeurLigne = String(
        ligne?.[colonne.column_name] ?? ""
      ).toLocaleLowerCase("fr");

      /*
       * OU dans une même colonne :
       * 41 | 49
       * ET entre les colonnes, grâce à every().
       */
      return valeursRecherchees.some((valeur) => {
        return valeurLigne.includes(valeur);
      });
    });
  });
}

function comparerValeursAdmin(valeurA, valeurB) {
  const texteA = String(valeurA ?? "").trim();
  const texteB = String(valeurB ?? "").trim();

  const nombreA = Number(texteA);
  const nombreB = Number(texteB);

  if (
    texteA !== "" &&
    texteB !== "" &&
    Number.isFinite(nombreA) &&
    Number.isFinite(nombreB)
  ) {
    return nombreA - nombreB;
  }

  return texteA.localeCompare(
    texteB,
    "fr",
    {
      numeric: true,
      sensitivity: "base"
    }
  );
}


const PLANNING_PARC_LECTURE_ADMIN = (() => {
  "use strict";

  const CLES_PLAGES = [
    "plage1",
    "plage2",
    "plage3",
    "plage4",
    "plage5"
  ];

  const GROUPES = ["DUO", "COACH", "FAMILLE"];

  const PLAGES_REFERENCE = {
    plage1: { debut: "06:00", fin: "10:00" },
    plage2: { debut: "10:00", fin: "13:00" },
    plage3: { debut: "13:00", fin: "17:00" },
    plage4: { debut: "17:00", fin: "21:00" },
    plage5: { debut: "21:00", fin: "02:00" }
  };

  const COULEURS_PRIVATISATION = {
    DUO: "bleu-fonce",
    COACH: "violet",
    FAMILLE: "orange-fonce"
  };

  const COULEURS_EXCLUSIVITE = Object.freeze({
    DUO: "bleu-fonce",
    COACH: "violet",
    FAMILLE: "orange-fonce"
  });

  // Synthèse réseau par mois : réutilise strictement le calcul « ouverte » du planning détaillé.
  async function gererSynthese(request, env, url) {
    const autorisation = await autoriser(request, env);
    if (!autorisation.success) return reponseJson(request, env, autorisation.payload, autorisation.status, autorisation.cookie);
    const moisDefaut = moisCourantParis();
    const cleMois = String(url.searchParams.get("mois") || moisDefaut);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cleMois)) {
      return reponseJson(request, env, { success:false, message:"Mois invalide (AAAA-MM)." }, 400, autorisation.cookie);
    }
    const categorie = String(url.searchParams.get("categorie") || "total");
    if (!["total","duo","famille","coach","famillecoach"].includes(categorie)) {
      return reponseJson(request,env,{success:false,message:"Catégorie de planning invalide."},400,autorisation.cookie);
    }
    const [annee, mois] = cleMois.split("-").map(Number);
    const departements = [...new Set(String(url.searchParams.get("filter_dptmt") || "").split(",").map(v => v.trim().toUpperCase()).filter(Boolean))];
    if (departements.some(code => !/^(?:0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(code))) {
      return reponseJson(request, env, {success:false,message:"Département invalide."}, 400, autorisation.cookie);
    }
    const statut = String(url.searchParams.get("filter_statut") || "").trim();
    const statuts = ["1-basebrute","2-aqualifier","3-nonqualifié","3-encours","3-refus","prepa","enligne","horsligne"];
    if (statut && !statuts.includes(statut)) {
      return reponseJson(request, env, {success:false,message:"Statut invalide."}, 400, autorisation.cookie);
    }
    // Filtrer dans PostgREST avant sa limite de lignes, puis lire toutes les pages.
    const rpcParams = new URLSearchParams();
    rpcParams.set("order", "idparc.asc");
    if (departements.length === 1) rpcParams.set("dptmt", "eq." + departements[0]);
    else if (departements.length) rpcParams.set("dptmt", "in.(" + departements.join(",") + ")");
    if (statut) rpcParams.set("statut", "eq." + statut);
    if (url.searchParams.get("avec_ouvertures") === "1") rpcParams.set("total_plages", "gt.0");
    const resultat = [];
    let offsetRpc = 0;
    while (true) {
      rpcParams.set("limit", "200");
      rpcParams.set("offset", String(offsetRpc));
      const page = await requeteSupabase(env, "rpc/admin_planning_parcs_synthese_categorie?" + rpcParams.toString(), {
        method: "POST",
        body: { p_mois: cleMois + "-01", p_categorie: categorie }
      });
      if (!Array.isArray(page)) throw new Error("Synthèse mensuelle SQL : réponse invalide.");
      if (!page.length) break;
      resultat.push(...page);
      offsetRpc += page.length;
    }
    const colonnes = [
      {key:"dptmt",label:"Dptmt"},{key:"nom",label:"Parc"},
      {key:"statut",label:"Statut"},
      ...CLES_PLAGES.map((cle,i)=>({key:cle,label:"P"+(i+1)})),
      {key:"total_plages",label:"Total"},{key:"taux_ouverture",label:"10h-17h",format:"pourcentage"},{key:"datemajhoraire",label:"Date MAJ"}
    ].map(c=>({...c,sortable:true,filterable:true}));
    const sourceFiltrage = resultat;
    const selection = sourceFiltrage.filter(parc =>
      (!departements.length || departements.includes(String(parc.dptmt || "").trim().toUpperCase())) &&
      (!statut || String(parc.statut || "").trim() === statut)
    );
    let filtrage = filtrerLignesCalculees(selection,url,colonnes.filter(c=>!["dptmt","statut"].includes(c.key)).map(c=>({column_name:c.key,filterable:true})));
    const tri = String(url.searchParams.get("sort") || "dptmt");
    const sens = url.searchParams.get("direction") === "desc" ? -1 : 1;
    if(colonnes.some(c=>c.key === tri)) filtrage.sort((a,b)=>sens*comparerValeursAdmin(a[tri],b[tri]) || comparerValeursAdmin(a.nom,b.nom));
    const limit = bornerEntier(url.searchParams.get("limit"),100,1,200);
    const offset = bornerEntier(url.searchParams.get("offset"),0,0,1000000);
    return reponseJson(request,env,{
      success:true,resource:RESOURCE_PLANNING_PARC_LECTURE,mois:cleMois,categorie,
      columns:colonnes,rows:filtrage.slice(offset,offset+limit),
      total:filtrage.length,limit,offset
    },200,autorisation.cookie);
  }

  async function gererDroits(request, env, url) {
    const autorisation = await autoriser(request, env);

    if (!autorisation.success) {
      return reponseJson(
        request,
        env,
        autorisation.payload,
        autorisation.status,
        autorisation.cookie
      );
    }

    const idparc = String(
      url.searchParams.get("idparc") || ""
    ).trim();

    if (!uuidValide(idparc)) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Identifiant du parc invalide."
        },
        400,
        autorisation.cookie
      );
    }

    const parc = await lireParc(env, idparc);

    if (!parc) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Parc introuvable."
        },
        404,
        autorisation.cookie
      );
    }

    const droitsPlanning = await lireDroits(env, idparc);

    return reponseJson(
      request,
      env,
      {
        success: true,
        ok: true,
        droitsPlanning
      },
      200,
      autorisation.cookie
    );
  }

  async function gererMois(request, env, url) {
    const autorisation = await autoriser(request, env);

    if (!autorisation.success) {
      return reponseJson(
        request,
        env,
        autorisation.payload,
        autorisation.status,
        autorisation.cookie
      );
    }

    const idparc = String(
      url.searchParams.get("idparc") || ""
    ).trim();
    const annee = Number(url.searchParams.get("annee"));
    const mois = Number(url.searchParams.get("mois"));

    if (
      !uuidValide(idparc) ||
      !Number.isInteger(annee) ||
      annee < 2000 ||
      annee > 2200 ||
      !Number.isInteger(mois) ||
      mois < 1 ||
      mois > 12
    ) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Paramètres idparc, annee et mois invalides."
        },
        400,
        autorisation.cookie
      );
    }

    const parc = await lireParc(env, idparc);

    if (!parc) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Parc introuvable."
        },
        404,
        autorisation.cookie
      );
    }

    const droits = await lireDroits(env, idparc);
    const cleMois = construireCleMois(annee, mois);

    if (
      cleMois < droits.moisMinimum ||
      cleMois > droits.moisMaximum
    ) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Ce mois est hors de la période consultable."
        },
        400,
        autorisation.cookie
      );
    }

    const planning = await recupererPlanningMois(env, {
      idparc,
      annee,
      mois
    });

    return reponseJson(
      request,
      env,
      {
        success: true,
        ok: true,
        planning
      },
      200,
      autorisation.cookie
    );
  }

  async function gererJour(request, env, url) {
    const autorisation = await autoriser(request, env);

    if (!autorisation.success) {
      return reponseJson(
        request,
        env,
        autorisation.payload,
        autorisation.status,
        autorisation.cookie
      );
    }

    const idparc = String(
      url.searchParams.get("idparc") || ""
    ).trim();
    const date = String(
      url.searchParams.get("date") || ""
    ).trim();

    if (!uuidValide(idparc) || !dateIsoValide(date)) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Paramètres idparc et date invalides."
        },
        400,
        autorisation.cookie
      );
    }

    const parc = await lireParc(env, idparc);

    if (!parc) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Parc introuvable."
        },
        404,
        autorisation.cookie
      );
    }

    const droits = await lireDroits(env, idparc);
    const cleMois = date.slice(0, 7);

    if (
      cleMois < droits.moisMinimum ||
      cleMois > droits.moisMaximum
    ) {
      return reponseJson(
        request,
        env,
        {
          success: false,
          ok: false,
          message: "Cette date est hors de la période consultable."
        },
        400,
        autorisation.cookie
      );
    }

    const jour = await recupererPlanningJour(env, {
      idparc,
      date
    });

    return reponseJson(
      request,
      env,
      {
        success: true,
        ok: true,
        jour
      },
      200,
      autorisation.cookie
    );
  }

  async function autoriser(request, env) {
    const autorisation = await autoriserRoute(
      request,
      env,
      ROUTE_PLANNING_PARC_LECTURE
    );

    if (!autorisation.success) {
      return autorisation;
    }

    if (
      autorisation.permission !==
      PERMISSION_PLANNING_PARC_LECTURE
    ) {
      return {
        success: false,
        status: 403,
        cookie: autorisation.cookie,
        payload: {
          success: false,
          ok: false,
          message: "Permission Planning Parc insuffisante."
        }
      };
    }

    return autorisation;
  }

  async function lireParc(env, idparc) {
    const params = new URLSearchParams();

    params.set("select", "idparc,nom,dptmt,statut");
    params.set("idparc", "eq." + idparc);
    params.set("limit", "1");

    const rows = await requeteSupabase(
      env,
      "parcs?" + params.toString(),
      { method: "GET" }
    );

    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function lireDroits(env, idparc) {
    const moisMinimum = moisCourantParis();
    const params = new URLSearchParams();

    params.set("select", "finplanif,ultimfin");
    params.set("idparc", "eq." + idparc);
    params.set("limit", "1");

    const rows = await requeteSupabase(
      env,
      "hparcsultim?" + params.toString(),
      { method: "GET" }
    );
    const ligne = Array.isArray(rows) ? rows[0] || null : null;
    const dates = [ligne?.finplanif, ligne?.ultimfin]
      .map((value) => String(value || "").slice(0, 10))
      .filter(dateIsoValide)
      .sort();
    const moisHorizon = dates.length
      ? dates[dates.length - 1].slice(0, 7)
      : moisMinimum;

    return {
      moisMinimum,
      moisMaximum: moisHorizon < moisMinimum
        ? moisMinimum
        : moisHorizon,
      motifLimite: "horizon_planning"
    };
  }

  function moisCourantParis() {
    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(new Date());
    const annee = morceaux.find(
      (item) => item.type === "year"
    )?.value || "";
    const mois = morceaux.find(
      (item) => item.type === "month"
    )?.value || "";

    return annee && mois
      ? annee + "-" + mois
      : new Date().toISOString().slice(0, 7);
  }

  async function recupererPlanningMois(env, params) {
    const colonnesMois = construireColonnesMois(
      params.annee,
      params.mois
    );

    const [ligneHparcs, ligneRatio, lignesHoraire] =
      await Promise.all([
        recupererLigneParcHoraire(
          env,
          "hparcs",
          params.idparc,
          colonnesMois
        ),
        recupererLigneParcHoraire(
          env,
          "hratio",
          params.idparc,
          colonnesMois
        ),
        recupererSegmentsHoraireMois(
          env,
          params.idparc,
          params.annee,
          params.mois
        )
      ]);

    const segmentsParDate = new Map(
      (Array.isArray(lignesHoraire) ? lignesHoraire : [])
        .map((ligne) => [
          String(ligne?.datejour || "").trim(),
          normaliserSegmentsHoraire(ligne?.segments)
        ])
    );

    const nombreJours = new Date(
      params.annee,
      params.mois,
      0
    ).getDate();
    const resultat = [];

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      const dateIso = construireDateIso(
        params.annee,
        params.mois,
        jour
      );
      const colonneJour = construireNomColonneJour(dateIso);
      const hparcsJour = normaliserJson(
        ligneHparcs ? ligneHparcs[colonneJour] : null
      );
      const ratioJour = normaliserJson(
        ligneRatio ? ligneRatio[colonneJour] : null
      );
      const plages = Object.fromEntries(
        CLES_PLAGES.map((cle) => [
          cle,
          construirePlagePlanning(
            hparcsJour,
            ratioJour,
            cle,
            segmentsParDate.get(dateIso) || null
          )
        ])
      );

      resultat.push({
        date: dateIso,
        jour,
        ouvert: CLES_PLAGES.some((cle) => {
          return plages[cle].ouverte === true;
        }),
        plages
      });
    }

    return resultat;
  }

  async function recupererPlanningJour(env, params) {
    const colonneJour = construireNomColonneJour(params.date);
    const [ligneHoraire, ligneRatio] = await Promise.all([
      recupererSegmentsHoraireJour(
        env,
        params.idparc,
        params.date
      ),
      recupererLigneParcHoraire(
        env,
        "hratio",
        params.idparc,
        [colonneJour]
      )
    ]);
    const segmentsSource = normaliserSegmentsHoraire(
      ligneHoraire?.segments
    );
    const ratioJour = normaliserJson(
      ligneRatio ? ligneRatio[colonneJour] : null
    );
    const segments = construireSegmentsDetailJour(
      segmentsSource,
      ratioJour
    );

    return {
      date: params.date,
      ouvert: segments.length > 0,
      segments
    };
  }

  async function recupererSegmentsHoraireMois(
    env,
    idparc,
    annee,
    mois
  ) {
    const premierJour = construireDateIso(annee, mois, 1);
    const dernierJour = construireDateIso(
      annee,
      mois,
      new Date(annee, mois, 0).getDate()
    );
    const params = new URLSearchParams();

    params.set("select", "datejour,segments");
    params.set("idparc", "eq." + idparc);
    params.set("datejour", "gte." + premierJour);
    params.append("datejour", "lte." + dernierJour);
    params.set("order", "datejour.asc");
    params.set("limit", "5000");

    const rows = await requeteSupabase(
      env,
      "hparcshoraire?" + params.toString(),
      { method: "GET" }
    );

    return Array.isArray(rows) ? rows : [];
  }

  async function recupererSegmentsHoraireJour(
    env,
    idparc,
    date
  ) {
    const params = new URLSearchParams();

    params.set("select", "datejour,segments");
    params.set("idparc", "eq." + idparc);
    params.set("datejour", "eq." + date);
    params.set("limit", "1");

    const rows = await requeteSupabase(
      env,
      "hparcshoraire?" + params.toString(),
      { method: "GET" }
    );

    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function recupererLigneParcHoraire(env,table,idparc,colonnes) {
    const dates=(colonnes||[]).filter(c=>/^d_\d{4}_\d{2}_\d{2}$/.test(c)).map(c=>c.slice(2).replaceAll('_','-')).sort();
    return requeteSupabase(env,'rpc/planning_lecture_compat',{method:'POST',body:{p_table:table,p_idparc:String(idparc),p_debut:dates[0]||null,p_fin:dates.at(-1)||null}});
  }

  function construireSegmentsDetailJour(segments, ratioJour) {
    return (Array.isArray(segments) ? segments : [])
      .map((segment, index) => {
        const numeroPlage = Number(segment?.plage);
        const clePlage = "plage" + String(numeroPlage);
        const reference = PLAGES_REFERENCE[clePlage];
        const debut = normaliserHeure(segment?.debut);
        const fin = normaliserHeure(segment?.fin);

        if (
          !reference ||
          !debut ||
          !fin ||
          segment?.fermeture === true
        ) {
          return null;
        }

        const categoriesActives = GROUPES.filter((groupe) => {
          return normaliserGroupeHoraire(
            segment?.[groupe.toLowerCase()]
          ).etat === true;
        });
        const privatisation = normaliserPrivatisationDetail(
          segment?.privatisation,
          categoriesActives
        );
        const categories = categoriesActives.length > 0
          ? categoriesActives
          : privatisation.categories;

        if (categories.length < 1 && !privatisation.active) {
          return null;
        }

        const capacites = categoriesActives
          .map((groupe) => {
            return normaliserGroupeHoraire(
              segment?.[groupe.toLowerCase()]
            ).capacite;
          })
          .filter((capacite) => capacite !== null);
        const capacite = capacites.length
          ? Math.max(...capacites)
          : null;
        const couleurs = privatisation.active
          ? categories
              .map((categorie) => {
                return COULEURS_PRIVATISATION[categorie];
              })
              .filter(Boolean)
          : determinerCouleursPlage({
              categories,
              exclusivites: categories.length === 1
                ? [COULEURS_EXCLUSIVITE[categories[0]]]
                : []
            });
        const debutMinutes = convertirHeurePlageEnMinutes(
          clePlage,
          debut
        );
        const finMinutes = convertirHeurePlageEnMinutes(
          clePlage,
          fin
        );

        if (debutMinutes >= finMinutes) {
          return null;
        }

        const ratio = normaliserRatio(ratioJour?.[clePlage]);

        return {
          ordre: index,
          plage: clePlage,
          debut,
          fin,
          categories,
          privatisation: privatisation.active
            ? {
                id: privatisation.id,
                code: privatisation.code,
                categories
              }
            : null,
          capacite,
          ratio,
          jauge: calculerLargeurJauge(ratio),
          couleur: couleurs[0] || "blanc",
          couleurs: couleurs.length ? couleurs : ["blanc"],
          debutMinutes,
          finMinutes
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        return (
          a.debutMinutes - b.debutMinutes ||
          a.finMinutes - b.finMinutes ||
          a.ordre - b.ordre
        );
      })
.map((segment) => {
        const copie = { ...segment };
        delete copie.ordre;
        delete copie.debutMinutes;
        delete copie.finMinutes;
        return copie;
      });
  }

  function normaliserPrivatisationDetail(
    value,
    categoriesActives
  ) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return {
        active: false,
        id: "",
        code: "",
        categories: []
      };
    }

    const categoriesRecues = Array.isArray(value.categories)
      ? value.categories
      : [];
    const categories = GROUPES.filter((groupe) => {
      return (
        categoriesActives.includes(groupe) ||
        categoriesRecues.some((categorie) => {
          return String(categorie || "")
            .trim()
            .toUpperCase() === groupe;
        })
      );
    });

    return {
      active: true,
      id: String(value.id || "").trim(),
      code: String(value.code || "").trim(),
      categories
    };
  }

  function construireColonnesMois(annee, mois) {
    const nombreJours = new Date(annee, mois, 0).getDate();
    const colonnes = [];

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      colonnes.push(
        construireNomColonneJour(
          construireDateIso(annee, mois, jour)
        )
      );
    }

    return colonnes;
  }

  function construireNomColonneJour(dateIso) {
    return "d_" + String(dateIso || "").replaceAll("-", "_");
  }

  function construirePlagePlanning(
    hparcsJour,
    ratioJour,
    cle,
    segmentsJour = null
  ) {
    const ratio = normaliserRatio(ratioJour?.[cle]);
    const privatisation = lireMarqueurPrivatisation(
      hparcsJour,
      cle
    );
    const analyseHoraire = analyserPlageDepuisSegmentsHoraire(
      segmentsJour,
      cle
    );
    const intervalles = analyseHoraire.disponible
      ? analyseHoraire.intervalles
      : GROUPES
          .map((groupe) => {
            return lireIntervalleCategorie(
              hparcsJour,
              groupe,
              cle
            );
          })
          .filter(Boolean);
    const capacites = intervalles
      .map((intervalle) => Number(intervalle.capacite))
      .filter((capacite) => {
        return Number.isFinite(capacite) && capacite > 0;
      });
    const capacite = capacites.length
      ? Math.max(...capacites)
      : null;
    const bornes = calculerBornesPlage(intervalles, cle);

    if (privatisation) {
      const categories = privatisation.categories;
      const couleurs = categories
        .map((categorie) => COULEURS_PRIVATISATION[categorie])
        .filter(Boolean);
      const ouverte = categories.length > 0;

      return {
        ouverte,
        couleur: couleurs[0] || "blanc",
        couleurs: couleurs.length ? couleurs : ["blanc"],
        categories,
        privatisation,
        debut: bornes.debut,
        fin: bornes.fin,
        capacite: ouverte ? capacite : null,
        ratio: ouverte ? ratio : null,
        jauge: ouverte ? calculerLargeurJauge(ratio) : 0
      };
    }

    if (!intervalles.length) {
      return construirePlageFermee();
    }

    const analyse = analyseHoraire.disponible
      ? analyseHoraire
      : analyserCategoriesParSegments(intervalles);
    const couleurs = determinerCouleursPlage(analyse);

    if (couleurs.length < 1) {
      return construirePlageFermee();
    }

    return {
      ouverte: true,
      couleur: couleurs[0],
      couleurs,
      categories: analyse.categories,
      privatisation: null,
      debut: bornes.debut,
      fin: bornes.fin,
      capacite,
      ratio,
      jauge: calculerLargeurJauge(ratio)
    };
  }

  function construirePlageFermee() {
    return {
      ouverte: false,
      couleur: "blanc",
      couleurs: ["blanc"],
      categories: [],
      privatisation: null,
      debut: null,
      fin: null,
      capacite: null,
      ratio: null,
      jauge: 0
    };
  }

  function lireIntervalleCategorie(
    hparcsJour,
    groupe,
    cle
  ) {
    const groupeJour = normaliserJson(hparcsJour?.[groupe]);
    const plage = groupeJour?.[cle];

    if (
      !plage ||
      typeof plage !== "object" ||
      Array.isArray(plage) ||
      plage.etat !== true
    ) {
      return null;
    }

    const debut = normaliserHeure(plage.debut);
    const fin = normaliserHeure(plage.fin);
    const capacite = normaliserCapacite(plage.capacite);

    if (!debut || !fin || capacite === null) {
      return null;
    }

    const reference = PLAGES_REFERENCE[cle];

    if (!reference) {
      return null;
    }

    const debutMinutes = convertirHeurePlageEnMinutes(cle, debut);
    const finMinutes = convertirHeurePlageEnMinutes(cle, fin);
    const debutReference = convertirHeurePlageEnMinutes(
      cle,
      reference.debut
    );
    const finReference = convertirHeurePlageEnMinutes(
      cle,
      reference.fin
    );

    if (
      debutMinutes < debutReference ||
      finMinutes > finReference ||
      debutMinutes >= finMinutes
    ) {
      return null;
    }

    return {
      groupe,
      debut,
      fin,
      capacite,
      debutMinutes,
      finMinutes
    };
  }

  function lireMarqueurPrivatisation(hparcsJour, cle) {
    const marqueurs = normaliserJson(
      hparcsJour?.PRIVATISATION
    );
    const marqueur = marqueurs?.[cle];

    if (
      !marqueur ||
      typeof marqueur !== "object" ||
      Array.isArray(marqueur)
    ) {
      return null;
    }

    const categoriesRecues = Array.isArray(marqueur.categories)
      ? marqueur.categories
      : [];
    const categories = GROUPES.filter((groupe) => {
      return categoriesRecues.some((categorie) => {
        return String(categorie || "")
          .trim()
          .toUpperCase() === groupe;
      });
    });

    return {
      id: String(marqueur.id || "").trim(),
      code: String(marqueur.code || "").trim(),
      categories
    };
  }

  function calculerBornesPlage(intervalles, cle) {
    if (!intervalles.length) {
      return { debut: null, fin: null };
    }

    const debutMinutes = Math.min(
      ...intervalles.map((intervalle) => intervalle.debutMinutes)
    );
    const finMinutes = Math.max(
      ...intervalles.map((intervalle) => intervalle.finMinutes)
    );

    return {
      debut: convertirMinutesPlageEnHeure(cle, debutMinutes),
      fin: convertirMinutesPlageEnHeure(cle, finMinutes)
    };
  }

  function analyserPlageDepuisSegmentsHoraire(
    segmentsJour,
    cle
  ) {
    if (!Array.isArray(segmentsJour)) {
      return {
        disponible: false,
        intervalles: [],
        categories: [],
        exclusivites: []
      };
    }

    const reference = PLAGES_REFERENCE[cle];

    if (!reference) {
      return {
        disponible: true,
        intervalles: [],
        categories: [],
        exclusivites: []
      };
    }

    const numeroPlage = Number(cle.replace("plage", ""));
    const intervalles = [];
    const exclusivites = [];
    const categoriesRencontrees = new Set();
    const segments = segmentsJour
      .filter((segment) => {
        return (
          Number(segment?.plage) === numeroPlage &&
          segment?.fermeture !== true
        );
      })
      .sort((a, b) => {
        return (
          convertirHeurePlageEnMinutes(cle, a.debut) -
          convertirHeurePlageEnMinutes(cle, b.debut)
        );
      });

    for (const segment of segments) {
      const debut = normaliserHeure(segment?.debut);
      const fin = normaliserHeure(segment?.fin);

      if (!debut || !fin) continue;

      const debutMinutes = convertirHeurePlageEnMinutes(
        cle,
        debut
      );
      const finMinutes = convertirHeurePlageEnMinutes(
        cle,
        fin
      );
      const actifs = [];

      for (const groupe of GROUPES) {
        const valeur = normaliserGroupeHoraire(
          segment?.[groupe.toLowerCase()]
        );

        if (valeur.etat !== true || valeur.capacite === null) {
          continue;
        }

        actifs.push(groupe);
        categoriesRencontrees.add(groupe);
        intervalles.push({
          groupe,
          debut,
          fin,
          capacite: valeur.capacite,
          debutMinutes,
          finMinutes
        });
      }

      if (actifs.length === 1) {
        ajouterExclusiviteCouleur(
          exclusivites,
          actifs[0]
        );
      }
    }

    return {
      disponible: true,
      intervalles,
      categories: GROUPES.filter((groupe) => {
        return categoriesRencontrees.has(groupe);
      }),
      exclusivites
    };
  }

  function analyserCategoriesParSegments(intervalles) {
    const bornes = Array.from(new Set(
      intervalles.flatMap((intervalle) => [
        intervalle.debutMinutes,
        intervalle.finMinutes
      ])
    )).sort((a, b) => a - b);
    const categoriesRencontrees = new Set();
    const exclusivites = [];

    for (let index = 0; index < bornes.length - 1; index += 1) {
      const debut = bornes[index];
      const fin = bornes[index + 1];

      if (debut >= fin) continue;

      const categoriesSegment = GROUPES.filter((groupe) => {
        return intervalles.some((intervalle) => {
          return (
            intervalle.groupe === groupe &&
            intervalle.debutMinutes <= debut &&
            intervalle.finMinutes >= fin
          );
        });
      });

      for (const categorie of categoriesSegment) {
        categoriesRencontrees.add(categorie);
      }

      if (categoriesSegment.length === 1) {
        ajouterExclusiviteCouleur(
          exclusivites,
          categoriesSegment[0]
        );
      }
    }

    return {
      disponible: true,
      intervalles,
      categories: GROUPES.filter((groupe) => {
        return categoriesRencontrees.has(groupe);
      }),
      exclusivites
    };
  }

  function determinerCouleursPlage(analyse) {
    const exclusivites = Array.isArray(analyse?.exclusivites)
      ? analyse.exclusivites.filter(Boolean)
      : [];

    if (exclusivites.length > 0) {
      return exclusivites;
    }

    const categories = Array.isArray(analyse?.categories)
      ? analyse.categories
      : [];
    const famillePresente = categories.includes("FAMILLE");
    const coachPresent = categories.includes("COACH");
    const duoPresent = categories.includes("DUO");

    if (!famillePresente && !coachPresent && !duoPresent) {
      return [];
    }

    if (famillePresente && (duoPresent || coachPresent)) {
      return ["orange-clair"];
    }

    if (duoPresent && coachPresent) {
      return ["bleu-clair"];
    }

    if (famillePresente) {
      return ["orange-fonce"];
    }

    if (coachPresent) {
      return ["violet"];
    }

    return ["bleu-fonce"];
  }

  function ajouterExclusiviteCouleur(liste, groupe) {
    const couleur = COULEURS_EXCLUSIVITE[groupe];

    if (!couleur || liste.includes(couleur)) {
      return;
    }

    liste.push(couleur);
  }

  function normaliserSegmentsHoraire(value) {
    let source = value;

    if (typeof source === "string") {
      try {
        source = JSON.parse(source);
      } catch {
        source = [];
      }
    }

    return Array.isArray(source) ? source : [];
  }

  function normaliserGroupeHoraire(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return {
        etat: null,
        capacite: null
      };
    }

    return {
      etat: [true, false, null].includes(value.etat)
        ? value.etat
        : null,
      capacite: normaliserCapacite(value.capacite)
    };
  }

  function normaliserCapacite(value) {
    const nombre = Number(value);

    if (!Number.isFinite(nombre) || nombre <= 0) {
      return null;
    }

    return Math.floor(nombre);
  }

  function normaliserRatio(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return normaliserRatio(
        value.ratio ??
        value.hratio ??
        value.valeur ??
        value.value
      );
    }

    const nombre = Number(value);

    return Number.isFinite(nombre) && nombre >= 0
      ? nombre
      : null;
  }

  function calculerLargeurJauge(ratio) {
    const valeur = normaliserRatio(ratio);

    if (valeur === null || valeur < 0.4) {
      return 0;
    }

    if (valeur < 0.6) {
      return 60;
    }

    if (valeur < 0.85) {
      return 80;
    }

    return 100;
  }

  function normaliserHeure(value) {
    const texte = String(value || "").trim();
    const match = texte.match(/^(\d{2}):(\d{2})$/);

    if (!match) {
      return null;
    }

    const heures = Number(match[1]);
    const minutes = Number(match[2]);

    if (
      !Number.isInteger(heures) ||
      !Number.isInteger(minutes) ||
      heures < 0 ||
      heures > 24 ||
      minutes < 0 ||
      minutes > 59 ||
      (heures === 24 && minutes !== 0)
    ) {
      return null;
    }

    return String(heures).padStart(2, "0") + ":" +
      String(minutes).padStart(2, "0");
  }

  function convertirHeureEnMinutes(heure) {
    const [heures, minutes] = String(heure || "")
      .split(":")
      .map(Number);

    return heures * 60 + minutes;
  }

  function convertirHeurePlageEnMinutes(cle, heure) {
    const minutes = convertirHeureEnMinutes(heure);

    if (cle !== "plage5") {
      return minutes;
    }

    const heures = Number(String(heure || "").split(":")[0]);
    return heures <= 2 ? minutes + 24 * 60 : minutes;
  }

  function convertirMinutesPlageEnHeure(cle, totalMinutes) {
    const minutesJour = cle === "plage5"
      ? totalMinutes % (24 * 60)
      : totalMinutes;
    const heures = Math.floor(minutesJour / 60);
    const minutes = minutesJour % 60;

    return String(heures).padStart(2, "0") + ":" +
      String(minutes).padStart(2, "0");
  }

  function construireDateIso(annee, mois, jour) {
    return (
      String(annee) +
      "-" +
      String(mois).padStart(2, "0") +
      "-" +
      String(jour).padStart(2, "0")
    );
  }

  function construireCleMois(annee, mois) {
    return String(annee) + "-" + String(mois).padStart(2, "0");
  }

  function normaliserJson(value) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return {};
    }

    return value;
  }

  function dateIsoValide(value) {
    const texte = String(value || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
      return false;
    }

    const date = new Date(texte + "T00:00:00.000Z");

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === texte
    );
  }

  function uuidValide(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || "")
    );
  }

  return {
    gererSynthese,
    gererDroits,
    gererMois,
    gererJour
  };
})();

async function autoriserRoute(request, env, routePath) {
  const authBase = String(
    env.AUTH_API_URL || AUTH_API_FIXE
  ).replace(/\/+$/, "");

  const headers = new Headers({
    Accept: "application/json"
  });

  const cookie = request.headers.get("Cookie");

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  const response = await fetch(
    authBase + "/authorize?path=" + encodeURIComponent(routePath),
    {
      method: "GET",
      headers,
      cache: "no-store"
    }
  );

  const data = await response.json().catch(() => null);
  const setCookie = response.headers.get("Set-Cookie");

  if (!response.ok || !data || data.success !== true) {
    return {
      success: false,
      status: response.status || 401,
      cookie: setCookie,
      payload: {
        success: false,
        message: data?.message || "Accès refusé."
      }
    };
  }

  return {
    success: true,
    status: 200,
    cookie: setCookie,
    admin: data.admin,
    permission: data.permission,
    route: data.route
  };
}

async function chercherRessource(env, code) {
  const rows = await requeteSupabase(
    env,
    `${RESOURCE_TABLE}?select=code,table_name,route_path,permission_code,default_sort_column,default_sort_direction,actif&code=eq.${encodeURIComponent(code)}&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0
    ? rows[0]
    : null;
}

async function chercherColonnes(env, resourceCode) {
  const rows = await requeteSupabase(
    env,
    `${COLUMN_TABLE}?select=position,column_name,label,sortable,filterable,visible,actif&resource_code=eq.${encodeURIComponent(resourceCode)}&actif=eq.true&visible=eq.true&order=position.asc`,
    { method: "GET" }
  );

  return Array.isArray(rows) ? rows : [];
}

function ajouterFiltresSupabase(params, url, colonnes) {
  const groupesOu = [];

  colonnes.forEach((colonne) => {
    if (colonne.filterable !== true) {
      return;
    }

    const valeurBrute = String(
      url.searchParams.get(
        "filter_" + colonne.column_name
      ) || ""
    ).trim();

    if (!valeurBrute) {
      return;
    }

    if (url.searchParams.get("resource") === "parcs-statut" &&
        ["dptmt", "statut"].includes(colonne.column_name)) {
      if (colonne.column_name === "dptmt") {
        const codes = [...new Set(valeurBrute.split(",").map(x => x.trim()).filter(Boolean))];
        if (!codes.length || codes.some(code => !/^(?:0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(code))) {
          throw new Error("Filtre département invalide.");
        }
        params.append("dptmt", codes.length === 1 ? "eq." + codes[0] : "in.(" + codes.join(",") + ")");
      } else {
        params.append(colonne.column_name, "eq." + valeurBrute);
      }
      return;
    }

    const valeurs = decouperValeursFiltre(valeurBrute);

    if (valeurs.length === 0) {
      return;
    }

    if (estColonneBooleenneFiltrable(colonne.column_name)) {
      const valeursBooleennes = Array.from(
        new Set(
          valeurs
            .map(normaliserValeurBooleenneFiltre)
            .filter((valeur) => valeur !== null)
        )
      );

      if (valeursBooleennes.length === 1) {
        params.append(
          colonne.column_name,
          "eq." + String(valeursBooleennes[0])
        );
      } else if (valeursBooleennes.length > 1) {
        groupesOu.push(
          valeursBooleennes.map((valeur) => {
            return (
              colonne.column_name +
              ".eq." +
              String(valeur)
            );
          })
        );
      }

      return;
    }

    if (estColonneEntiereFiltrable(colonne.column_name)) {
      const valeursEntieres = Array.from(
        new Set(
          valeurs
            .map((valeur) => {
              const texte = String(valeur || "").trim();

              if (!/^-?\d+$/.test(texte)) {
                return null;
              }

              const nombre = Number(texte);

              return Number.isSafeInteger(nombre)
                ? nombre
                : null;
            })
            .filter((valeur) => valeur !== null)
        )
      );

      if (valeursEntieres.length === 1) {
        params.append(
          colonne.column_name,
          "eq." + String(valeursEntieres[0])
        );
      } else if (valeursEntieres.length > 1) {
        groupesOu.push(
          valeursEntieres.map((valeur) => {
            return (
              colonne.column_name +
              ".eq." +
              String(valeur)
            );
          })
        );
      }

      return;
    }

    if (estNomColonneDate(colonne.column_name)) {
      const intervalles = valeurs
        .map(construireIntervalleJourParis)
        .filter(Boolean);

      if (intervalles.length === 0) {
        return;
      }

      if (intervalles.length === 1) {
        params.append(
          colonne.column_name,
          "gte." + intervalles[0].debut
        );

        params.append(
          colonne.column_name,
          "lt." + intervalles[0].fin
        );

        return;
      }

      groupesOu.push(
        intervalles
          .map((intervalle) => {
            return (
              "and(" +
              colonne.column_name +
              ".gte." +
              intervalle.debut +
              "," +
              colonne.column_name +
              ".lt." +
              intervalle.fin +
              ")"
            );
          })
      );

      return;
    }

    const valeursTexte = valeurs
      .map(nettoyerValeurFiltreTexte)
      .filter(Boolean);

    if (valeursTexte.length === 0) {
      return;
    }

    if (valeursTexte.length === 1) {
      params.append(
        colonne.column_name,
        "ilike.*" + valeursTexte[0] + "*"
      );

      return;
    }

    groupesOu.push(
      valeursTexte.map((valeurTexte) => {
        return (
          colonne.column_name +
          ".ilike.*" +
          valeurTexte +
          "*"
        );
      })
    );
  });

  if (groupesOu.length === 1) {
    params.append(
      "or",
      "(" + groupesOu[0].join(",") + ")"
    );

    return;
  }

  if (groupesOu.length > 1) {
    const groupesEt = groupesOu.map((conditions) => {
      return "or(" + conditions.join(",") + ")";
    });

    params.append(
      "and",
      "(" + groupesEt.join(",") + ")"
    );
  }
}

function decouperValeursFiltre(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nettoyerValeurFiltreTexte(value) {
  return String(value || "")
    .replace(/[%*(),]/g, "")
    .trim();
}

function estColonneBooleenneFiltrable(columnName) {
  const nom = String(columnName || "").toLowerCase();

  return (
    nom === "tiktok" ||
    nom === "abbaye" ||
    nom === "active" ||
    nom === "actif"
  );
}

function estColonneEntiereFiltrable(columnName) {
  const nom = String(columnName || "").toLowerCase();

  return nom === "valpoint";
}

function normaliserValeurBooleenneFiltre(value) {
  const texte = String(value || "")
    .trim()
    .toLowerCase();

  if (texte === "true") {
    return true;
  }

  if (texte === "false") {
    return false;
  }

  return null;
}

function estNomColonneDate(columnName) {
const nom = String(columnName || "").toLowerCase();

  return (
    nom === "date" ||
    nom.startsWith("date") ||
    nom.endsWith("_date") ||
    nom.endsWith("date") ||
    nom === "created_at" ||
    nom === "updated_at" ||
    nom.endsWith("_at")
  );
}

function construireIntervalleJourParis(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [annee, mois, jour] = value
    .split("-")
    .map(Number);

  const debut = convertirMinuitParisVersUtc(
    annee,
    mois,
    jour
  );

  const dateSuivante = new Date(
    Date.UTC(annee, mois - 1, jour + 1)
  );

  const fin = convertirMinuitParisVersUtc(
    dateSuivante.getUTCFullYear(),
    dateSuivante.getUTCMonth() + 1,
    dateSuivante.getUTCDate()
  );

  return {
    debut: debut.toISOString(),
    fin: fin.toISOString()
  };
}

function convertirMinuitParisVersUtc(annee, mois, jour) {
  const cibleUtc = Date.UTC(
    annee,
    mois - 1,
    jour,
    0,
    0,
    0
  );

  let estimation = cibleUtc;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const offset = lireOffsetFuseauMinutes(
      new Date(estimation),
      "Europe/Paris"
    );

    estimation = cibleUtc - offset * 60 * 1000;
  }

  return new Date(estimation);
}

function lireOffsetFuseauMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const valeurs = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      valeurs[part.type] = Number(part.value);
    }
  });

  const commeUtc = Date.UTC(
    valeurs.year,
    valeurs.month - 1,
    valeurs.day,
    valeurs.hour,
    valeurs.minute,
    valeurs.second
  );

  return Math.round(
    (commeUtc - date.getTime()) / 60000
  );
}

function validerIdentifiantSql(value, type) {
  const texte = String(value || "");

  if (!/^[a-z_][a-z0-9_]*$/.test(texte)) {
    throw new Error(`Nom de ${type} invalide : ${texte}`);
  }
}

function bornerEntier(value, valeurParDefaut, minimum, maximum) {
  if (value === null || value === undefined || value === "") {
    return valeurParDefaut;
  }

  const nombre = Number(value);

  if (!Number.isInteger(nombre)) {
    return valeurParDefaut;
  }

  return Math.min(maximum, Math.max(minimum, nombre));
}

function lireTotalDepuisContentRange(contentRange, fallback) {
  const texte = String(contentRange || "");
  const morceaux = texte.split("/");

  if (morceaux.length !== 2) {
    return fallback;
  }

  const total = Number(morceaux[1]);

  return Number.isFinite(total) ? total : fallback;
}

async function requeteSupabase(env, chemin, options = {}) {
  const resultat = await requeteSupabaseDetail(env, chemin, options);
  return resultat.data;
}

async function requeteSupabaseDetail(env, chemin, options = {}) {
  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");

  if (!baseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Variables Supabase manquantes.");
  }

  const url = `${baseUrl}/rest/v1/${chemin}`;

  const headers = new Headers({
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.prefer) {
    headers.set("Prefer", options.prefer);
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined
      ? JSON.stringify(options.body)
      : undefined
  });

  const texte = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase ${response.status} : ${texte}`);
  }

  return {
    data: texte ? JSON.parse(texte) : null,
    headers: response.headers
  };
}

function listeOriginesAutorisees(env) {
  return Array.from(new Set([
    ORIGINE_ADMIN_FIXE,
    "http://admin.lacleduparc.fr",
    String(env.ADMIN_URL || "").replace(/\/+$/, "")
  ].filter(Boolean)));
}

function origineAutorisee(request, env) {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return true;
  }

  return listeOriginesAutorisees(env).includes(origin);
}

function entetesCors(request, env) {
  const headers = new Headers();
  const origin = request.headers.get("Origin");

  if (origin && listeOriginesAutorisees(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");

  return headers;
}

function reponseOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: entetesCors(request, env)
  });
}

function reponseJson(
  request,
  env,
  payload,
  status = 200,
  setCookie = null
) {
  const headers = entetesCors(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  if (setCookie) {
    headers.append("Set-Cookie", setCookie);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers
  });
}


const MOTIFS_SUSPENSION_ADMIN = new Set([
  'sanction','enquete','signalement_police','non_respect_engagements',
  'utilisation_non_conforme','pret_compte','faux_email',
  'risque_pour_club','preparation_fermeture','autre'
]);

async function autoriserSuspensionsMembresV2(request, env) {
  const auth = await autoriserRoute(request, env, ROUTE_SUSPENSION_MEMBRES);
  if (!auth.success) return auth;
  if (auth.permission !== PERMISSION_SUSPENSION_MEMBRES) {
    return {success:false,status:403,cookie:auth.cookie,
      payload:{success:false,message:'Permission de suspension incohérente.'}};
  }
  return auth;
}

async function gererCapacitesSuspensionsMembres(request, env) {
  const auth = await autoriserSuspensionsMembresV2(request, env);
  if (!auth.success) return reponseJson(request,env,auth.payload,auth.status,auth.cookie);
  return reponseJson(request,env,{
    success:true,suspensionMotivee:true,version:2,lecture:'membres-suspensions'
  },200,auth.cookie);
}

async function gererDecisionSuspensionMembreV2(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !listeOriginesAutorisees(env).includes(origin)) {
    return reponseJson(request,env,{success:false,message:'Origine administrateur requise.'},403);
  }
  const auth = await autoriserSuspensionsMembresV2(request, env);
  const rep = (payload,status=200) => reponseJson(request,env,payload,status,auth.cookie);
  if (!auth.success) return rep(auth.payload,auth.status);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type')||'')) {
    return rep({success:false,message:'Format JSON requis.'},415);
  }
  let b;
  try {b=await request.json();} catch {return rep({success:false,message:'Requête JSON invalide.'},400);}
  if (!b || typeof b!=='object' || Array.isArray(b)) {
    return rep({success:false,message:'Requête invalide.'},400);
  }
  const uuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));
  const idmembre = String(b.idmembre||'').trim();
  const action = String(b.action||'').trim();
  const suspendre = action==='suspendre';
  const lever = action==='lever';
  if (!uuid(idmembre) || (!suspendre && !lever) || typeof b.attendue!=='boolean') {
    return rep({success:false,message:'Membre, action ou état attendu invalide.'},400);
  }
  if ((suspendre && b.attendue!==false) || (lever && b.attendue!==true)) {
    return rep({success:false,message:'État attendu incohérent.'},400);
  }
  const dateAttendue=b.dateAttendue===null?null:b.dateAttendue;
  if (!(dateAttendue===null||(typeof dateAttendue==='string'&&Number.isFinite(Date.parse(dateAttendue))))) {
    return rep({success:false,message:'Date de suspension invalide.'},400);
  }
  if (suspendre && dateAttendue!==null) {
    return rep({success:false,message:'Une suspension sans date attendue est requise.'},400);
  }
  const motif=suspendre?String(b.motif||'').trim().toLowerCase():null;
  if (suspendre&&!MOTIFS_SUSPENSION_ADMIN.has(motif)) {
    return rep({success:false,message:'Sélectionnez un motif de suspension valide.'},400);
  }
  const precision=suspendre?String(b.precision||'').trim():'';
  if (precision.length>1000) {
    return rep({success:false,message:'Précision limitée à 1 000 caractères.'},400);
  }
  // La session serveur authentifiée est seule habilitée à identifier l'admin.
  const adminId=auth.admin&&uuid(auth.admin.id)?auth.admin.id:null;
  const resultat=await requeteSupabase(env,'rpc/admin_suspension_membre_motivee',{
    method:'POST',
    body:{
      p_idmembre:idmembre,p_suspendre:suspendre,p_motif:motif,
      p_attendue:b.attendue,p_date_attendue:dateAttendue,
      p_admin_id:adminId,p_precision:suspendre?precision||null:null
    }
  });
  const membre=Array.isArray(resultat)?resultat[0]||null:resultat;
  if (!membre||membre.success!==true) {
    const erreurs={
      conflit_etat:[409,'Le compte a été modifié depuis son affichage. Actualisez la liste.'],
      aucun_changement:[409,'Le compte possède déjà cet état. Actualisez la liste.'],
      compte_indisponible:[409,'Le compte est fermé ou supprimé.'],
      membre_non_inscrit:[404,'Membre inscrit introuvable.'],
      motif_invalide:[400,'Le motif administratif est invalide.'],
      precision_trop_longue:[400,'La précision du motif est trop longue.'],
      parametres_invalides:[400,'Paramètres de suspension invalides.']
    };
    const [code,message]=erreurs[String(membre?.motif||'')]||
      [500,'La décision administrative n’est pas confirmée.'];
    return rep({success:false,message,motif:membre?.motif||'erreur_inconnue'},code);
  }
  return rep({success:true,membre},200);
}

const ROUTE_SUSPENSION_MEMBRES = '/ESPACE-ADMIN/C_MEMBRES/suspension-membres.html';
const PERMISSION_SUSPENSION_MEMBRES = 'membres.suspension';
async function gererSuspensionsMembres(request, env, url) {
  const auth = await autoriserRoute(request, env, ROUTE_SUSPENSION_MEMBRES);
  const rep = (payload, status=200) => reponseJson(request, env, payload, status, auth.cookie);
  if (!auth.success) return rep(auth.payload, auth.status);
  if (auth.permission !== PERMISSION_SUSPENSION_MEMBRES) return rep({success:false,message:'Permission de suspension incohérente.'},403);
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
  const champs = 'idmembre,nommembre,prenommembre,suspension,datesuspension';
  // Ancien endpoint : lecture seule. Le formulaire v2 impose un motif.
  if (request.method === 'POST') {
    return rep({success:false,message:'Utilisez la page Suspension (slot 34) : une décision administrative exige un motif.'},409);
  }
  const liste = url.searchParams.get('liste') === 'suspendus';
  const pageBrute = url.searchParams.get('page') || '0';
  if (!/^\d{1,6}$/.test(pageBrute)) return rep({success:false,message:'Page invalide.'},400);
  const page=Number(pageBrute), taille=50;
  const params=new URLSearchParams({select:champs,order:liste?'datesuspension.desc.nullslast,idmembre.asc':'nommembre.asc.nullslast,prenommembre.asc.nullslast,idmembre.asc',limit:String(taille+1),offset:String(page*taille)});
  if (liste) params.set('suspension','eq.true');
  else {
    const q=String(url.searchParams.get('q')||'').trim();
    if (uuid(q)) params.set('idmembre','eq.'+q);
    else {
      if (q.length<2 || q.length>100 || !/^[\p{L}\p{M}\s'’\-]+$/u.test(q)) return rep({success:false,message:'Saisissez un UUID membre complet ou un nom/prénom (2 à 100 caractères).'},400);
      const tokens=q.split(/\s+/).filter(Boolean);
      if(tokens.length>8) return rep({success:false,message:'Recherche trop longue.'},400);
      params.set('and','('+tokens.map(t=>'or(nommembre.ilike.*'+t+'*,prenommembre.ilike.*'+t+'*)').join(',')+')');
    }
  }
  const rows=await requeteSupabase(env,'membres?'+params.toString());
  return rep({success:true,membres:rows.slice(0,taille),suivante:rows.length>taille,page,maintenant:new Date().toISOString()});
}

// Bénévolat : accès réservé à la permission du module, via la session admin existante.
async function gererBenevolat(request, env) {
  const auth = await autoriserRoute(request, env, "/ESPACE-ADMIN/C_MEMBRES/Benevolat.html");
  const rep = (payload, status=200) => reponseJson(request, env, payload, status, auth.cookie);
  if (!auth.success) return rep(auth.payload, auth.status);
  if (auth.permission !== "membres.benevolat") return rep({success:false,message:"Permission Bénévolat insuffisante."},403);
  if (request.method === "POST") {
    if (request.headers.get("Origin") !== ORIGINE_ADMIN_FIXE && (!env.ADMIN_URL || request.headers.get("Origin") !== String(env.ADMIN_URL).replace(/\/+$/, ""))) return rep({success:false,message:"Origine non autorisée."},403);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||"")) return rep({success:false,message:"Format JSON obligatoire."},415);
    let b;
    try { b = await request.json(); } catch { return rep({success:false,message:"Requête JSON invalide."},400); }
    if (!b || typeof b !== "object" || Array.isArray(b)) return rep({success:false,message:"Requête invalide."},400);
    const uuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const action=b.action;
    if (!["creer","modifier","supprimer"].includes(action)) return rep({success:false,message:"Action invalide."},400);
    if (action!=="creer" && (!uuid(b.idbenevolat)||typeof b.version!=="string"||!Number.isFinite(Date.parse(b.version)))) return rep({success:false,message:"Identifiant ou version invalide."},400);
    let ids=null, date=null, plage=null;
    if(action!=="supprimer") {
      if(!Array.isArray(b.idparcs)||!b.idparcs.length||b.idparcs.length>200||!b.idparcs.every(uuid)||!dateValideSuiviDa(b.datejour)||!Number.isInteger(b.plage)||b.plage<1||b.plage>5) return rep({success:false,message:"Date, parc ou plage horaire invalide."},400);
      ids=[...new Set(b.idparcs.map(id=>id.toLowerCase()))]; date=b.datejour; plage=b.plage;
      if(action==="modifier"&&ids.length!==1) return rep({success:false,message:"Un seul parc est autorisé en modification."},400);
    }
    const data=await requeteSupabase(env,"rpc/admin_benevolat_mutation",{method:"POST",body:{p_action:action,p_ids:ids,p_date:date,p_plage:plage,p_id:action==="creer"?null:b.idbenevolat,p_version:action==="creer"?null:b.version}});
    const erreurs={invalide:[400,"Données invalides."],introuvable:[404,"Rendez-vous introuvable."],passe:[409,"Ce rendez-vous est passé et ne peut pas être modifié."],conflit:[409,"Ce rendez-vous a été modifié entre-temps. Actualise la liste."],parc:[409,"Un parc sélectionné n’est plus en ligne."],doublon:[409,"Un rendez-vous existe déjà pour ce parc, cette date et cette plage. Aucun enregistrement effectué."]};
    if(data?.erreur) {const [code,message]=erreurs[data.erreur]||[500,"Enregistrement non confirmé."];return rep({success:false,message},code);}
    if(data?.nombre !== (action==="creer"?ids.length:1)) return rep({success:false,message:"Enregistrement non confirmé."},500);
    return rep({success:true,nombre:data.nombre});
  }
  async function tout(table, parametres) {
    const rows=[]; let offset=0;
    while(true) {
      const p=new URLSearchParams(parametres);p.set("limit","500");p.set("offset",String(offset));
      const page=await requeteSupabase(env,table+"?"+p.toString());
      if(!Array.isArray(page))throw Error("Lecture bénévolat invalide.");
      if(!page.length)break;
      rows.push(...page);offset+=page.length;
      if(offset>100000)throw Error("Volume bénévolat anormal.");
    }
    return rows;
  }
  const [parcs,rows]=await Promise.all([
    tout("parcs",{select:"idparc,nom,dptmt,localite",statut:"eq.enligne",order:"dptmt.asc,nom.asc,idparc.asc"}),
    tout("benevolat",{select:"idbenevolat,idparc,datejour,plage,debut,fin,updated_at,parcs!inner(nom,dptmt)",order:"datejour.asc,plage.asc,idbenevolat.asc"})
  ]);
  return rep({success:true,parcs,rows:rows.map(({parcs:p,...r})=>({...r,nom:p.nom,dptmt:p.dptmt})),maintenant:new Date().toISOString()});
}
/* Slot 20 Admin : FIX CODA CODR. Ne retourne jamais les secrets ni leurs empreintes. */
async function gererFixCodes(request,env,url) {
  const auth=await autoriserRoute(request,env,"/ESPACE-ADMIN/B_ADMIN/FixCodaCodr.html");
  const rep=(payload,status=200)=>reponseJson(request,env,payload,status,auth.cookie);
  if(!auth.success)return rep(auth.payload,auth.status);
  const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  if(auth.permission!=="admin.fixcodes"||auth.admin?.type!=="root"||!uuid(auth.admin?.id))return rep({success:false,message:"Accès réservé à l’administrateur principal."},403);
  const emailConfig=()=> {
    try {
      const u=new URL(String(env.W_EMAILTOKENZ_URL||""));
      if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!env.W_EMAILTOKENZ)return null;
      return u.href.replace(/\/+$/,"");
    }catch{return null;}
  };
  try {
    if(request.method==="GET"){
      const type=url.searchParams.get("type")||"coda",q=url.searchParams.get("q")||"",page=Number(url.searchParams.get("page")||0);
      if(!["coda","codr"].includes(type)||q.length>100||!Number.isInteger(page)||page<0||page>10000)return rep({success:false,message:"Recherche invalide."},400);
      const vue=url.searchParams.get("vue");
      if(vue!==null){
        const membre=url.searchParams.get("membre");
        if(!["selfie","historique"].includes(vue)||!uuid(membre))return rep({success:false,message:"Requête invalide."},400);
        const dossier=await requeteSupabase(env,"rpc/admin_fix_codes_liste",{method:"POST",body:{p_admin:auth.admin.id,p_type:type,p_recherche:membre,p_page:0}});
        if(dossier?.success!==true||!Array.isArray(dossier.rows)||!dossier.rows.some(m=>m.idmembre===membre))return rep({success:false,message:"Dossier indisponible."},404);
        if(vue==="historique"){
          const rows=await requeteSupabase(env,"admin_fix_codes_journal?membre=eq."+membre+"&select=action,methode,creation&order=creation.desc,id.desc&limit=100");
          return rep({success:true,vue:"historique",rows:Array.isArray(rows)?rows:[]});
        }
        const rows=await requeteSupabase(env,"selfie?idmembre=eq."+membre+"&select=photo_base64,date_modification&order=date_modification.desc&limit=1");
        const brut=String(rows?.[0]?.photo_base64||"").trim();
        const photo=brut.replace(/^data:image\/(?:jpeg|png|webp);base64,/i,"").replace(/\s/g,"");
        const mime=photo.startsWith("/9j/")?"image/jpeg":photo.startsWith("iVBOR")?"image/png":photo.startsWith("UklGR")?"image/webp":null;
        if(!mime||!photo||photo.length>10000000||!(/^[A-Za-z0-9+/]+={0,2}$/).test(photo))return rep({success:true,photo:null});
        return rep({success:true,photo:"data:"+mime+";base64,"+photo});
      }
      const d=await requeteSupabase(env,"rpc/admin_fix_codes_liste",{method:"POST",body:{p_admin:auth.admin.id,p_type:type,p_recherche:q,p_page:page}});
      if(d?.success!==true||!Array.isArray(d.rows))return rep({success:false,message:"Liste indisponible."},d?.status||503);
      return rep({success:true,rows:d.rows.slice(0,50),suivante:d.rows.length>50,page,emailConfigure:!!emailConfig()});
    }
    const origin=request.headers.get("Origin");
    if(origin!==ORIGINE_ADMIN_FIXE&&(!env.ADMIN_URL||origin!==String(env.ADMIN_URL).replace(/\/+$/,"")))return rep({success:false,message:"Origine non autorisée."},403);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return rep({success:false,message:"Format JSON requis."},415);
    let b;try{b=await request.json();}catch{return rep({success:false,message:"Requête invalide."},400);}
    if(!b||!uuid(b.membre)||!["coda","codr"].includes(b.type)||!["visio","presentiel"].includes(b.methode)||b.identiteVerifiee!==true)return rep({success:false,message:"Vérification d’identité obligatoire."},400);
    if(b.action==="debloquer"){
      if(typeof b.date!=="string"||!Number.isFinite(Date.parse(b.date)))return rep({success:false,message:"Date de blocage invalide."},400);
      const d=await requeteSupabase(env,"rpc/admin_fix_codes_debloquer",{method:"POST",body:{p_admin:auth.admin.id,p_membre:b.membre,p_type:b.type,p_methode:b.methode,p_date:b.date}});
      return d?.success===true?rep({success:true,message:"Blocage levé."}):rep({success:false,message:d?.message||"Déblocage refusé."},d?.status||409);
    }
    if(b.action==="redefinir"&&b.type==="codr"){
      const base=emailConfig();
      if(!base)return rep({success:false,message:"Le Worker de notification n’est pas configuré."},503);
      if(typeof b.email!=="string"||!b.email||b.email.length>254||typeof b.dateEmail!=="string"||!Number.isFinite(Date.parse(b.dateEmail)))return rep({success:false,message:"Adresse e-mail validée requise."},400);
      const r=await fetch(base+"/codr-admin-authorize",{method:"POST",headers:{Authorization:"Bearer "+env.W_EMAILTOKENZ,"Content-Type":"application/json"},body:JSON.stringify({admin:auth.admin.id,membre:b.membre,methode:b.methode,email:b.email,dateEmail:b.dateEmail})});
      const d=await r.json().catch(()=>null);
      return r.ok&&d?.success===true?rep({success:true,message:"Lien de redéfinition envoyé au membre."}):rep({success:false,message:d?.message||"Envoi non confirmé. Vérifiez le raccordement du Worker EMAILTOKENZ."},r.status===404?503:r.status||503);
    }
    return rep({success:false,message:"Action inconnue."},400);
  }catch{return rep({success:false,message:"Le service FIX CODA CODR est indisponible."},503);}
}
