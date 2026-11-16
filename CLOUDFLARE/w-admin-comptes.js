// La Clé du Parc — gestion des comptes administrateurs.
// Worker indépendant : authentification déléguée au Worker de session existant.
// Domaine à associer : w-admin-comptes-api.lacleduparc.fr

const ORIGINE_ADMIN = "https://admin.lacleduparc.fr";
const API_AUTH = "https://ad-log-sess-api.lacleduparc.fr";
const TYPES = new Set(["root", "asso", "resparc", "coach"]);
const PENDING_PASSWORD = "!invitation_pending!";
const ITERATIONS = 100000;

export default {
  async fetch(request, env) {
    try {
      return await router(request, env);
    } catch (error) {
      console.error("Comptes admin :", error?.message || error);
      return json(request, { success: false, message: "Service momentanément indisponible." }, 503);
    }
  }
};

function cors(request) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  if (request.headers.get("Origin") === ORIGINE_ADMIN) {
    headers.set("Access-Control-Allow-Origin", ORIGINE_ADMIN);
  }
  return headers;
}

function json(request, data, status = 200, cookie = null) {
  const headers = cors(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

function adminOrigin(request) {
  return request.headers.get("Origin") === ORIGINE_ADMIN;
}

async function router(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(request) });
  }
  if (request.method === "GET" && path === "/health") {
    return json(request, { success: true, service: "admin-comptes" });
  }
  // Origine stricte : également appliquée à l'activation.
  if (!adminOrigin(request)) {
    return json(request, { success: false, message: "Origine non autorisée." }, 403);
  }
  if (request.method === "POST" && path === "/admin/activate") {
    return activer(request, env);
  }
  if (
    (request.method === "GET" || request.method === "POST") &&
    path === "/admin/accounts"
  ) {
    const session = await verifierAdmin(request, env);
    if (!session.ok) return session.response;
    if (request.method === "GET") return lister(request, env, session);
    if (session.admin.type !== "root") return interdit(request, session.cookie);
    return inviter(request, env, session);
  }
  if (request.method === "GET" && path === "/admin/connexion") {
    const session = await verifierAdmin(request, env);
    if (!session.ok) return session.response;
    if (session.admin.type !== "root") return interdit(request, session.cookie);
    return statistiquesConnexion(request, env, session);
  }
  if (request.method === "GET" && path === "/admin/affichage-legal") {
    const session = await verifierAdmin(request, env);
    if (!session.ok) return session.response;
    if (session.admin.type !== "root") return interdit(request, session.cookie);
    return statistiquesAffichageLegal(request, env, session);
  }
  if (request.method === "POST" && path === "/admin/accounts/delete") {
    const session = await verifierAdmin(request, env);
    if (!session.ok) return session.response;
    if (session.admin.type !== "root") return interdit(request, session.cookie);
    return supprimer(request, env, session);
  }
  return json(request, { success: false, message: "Route inconnue." }, 404);
}

function interdit(request, cookie) {
  return json(request, { success: false, message: "Action réservée à l'administrateur root." }, 403, cookie);
}

async function verifierAdmin(request, env) {
  const url = API_AUTH + "/authorize?path=" +
    encodeURIComponent("/ESPACE-ADMIN/B_ADMIN/listadmin.html");
  const authRequest = new Request(url, {
    method: "GET",
    headers: {
      Origin: ORIGINE_ADMIN,
      Cookie: request.headers.get("Cookie") || "",
      "User-Agent": request.headers.get("User-Agent") || "LCDP-admin-comptes"
    },
    redirect: "manual"
  });
  // Service Binding si le Worker d'auth tourne sur une Route Cloudflare.
  // Sinon, fetch direct fonctionne sur un Custom Domain Cloudflare.
  const response = env.ADMIN_AUTH_WORKER
    ? await env.ADMIN_AUTH_WORKER.fetch(authRequest)
    : await fetch(authRequest);
  const payload = await response.json().catch(() => null);
  const cookie = response.headers.get("Set-Cookie");
  if (!response.ok || payload?.success !== true || !payload?.admin?.id) {
    const status = response.status === 403 ? 403 : 401;
    return {
      ok: false,
      response: json(request, {
        success: false,
        message: status === 403 ? "Permission administrateur insuffisante." : "Session administrateur expirée."
      }, status, cookie)
    };
  }
  return { ok: true, admin: payload.admin, cookie };
}

function serviceUrl(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Secrets Supabase manquants.");
  }
  return String(env.SUPABASE_URL).replace(/\/+$/, "") + "/rest/v1/";
}

async function db(env, route, opts = {}) {
  const response = await fetch(serviceUrl(env) + route, {
    method: opts.method || "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(opts.prefer ? { Prefer: opts.prefer } : {})
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("Erreur Supabase comptes admin", response.status);
    const err = new Error("Opération impossible en base de données.");
    err.status = response.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function bodyJson(request) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    throw new Error("Le formulaire doit être transmis en JSON.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Formulaire vide.");
  const parts = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 8192) {
      await reader.cancel();
      throw new Error("Formulaire trop volumineux.");
    }
    parts.push(value);
  }
  const all = new Uint8Array(bytes);
  let pos = 0;
  for (const part of parts) {
    all.set(part, pos);
    pos += part.length;
  }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(all)); }
  catch { throw new Error("Formulaire JSON invalide."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Formulaire JSON invalide.");
  }
  return data;
}

function valideEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function valideNom(nom) {
  return nom.length > 0 && nom.length <= 120;
}
function uuid(x) {
  return typeof x === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}
function htmlEchapper(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// Comptabilisation des sessions créées, sans journaliser les ouvertures de pages.
// Vue administrateur des cinq pages : données nominatives réservées à root.
async function statistiquesAffichageLegal(request, env, session) {
  const recherche = new URL(request.url).searchParams;
  const debut = recherche.get("debut");
  const fin = recherche.get("fin");
  const detail = recherche.get("detail") || "";
  const pages = new Set([
    "mentions-legales", "reglement-app", "reglement-club",
    "cgv", "demande-abonnement"
  ]);
  const valide = (valeur) => {
    if (!valeur || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
    const date = new Date(valeur + "T00:00:00.000Z");
    return Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== valeur ? null : date;
  };
  const d1 = valide(debut);
  const d2 = valide(fin);
  if (!d1 || !d2 || d2 < d1 || d2 - d1 > 366 * 86400000 ||
      (detail && !pages.has(detail))) {
    return json(request, { success: false,
      message: "Période ou page non valide (367 jours maximum)."
    }, 400, session.cookie);
  }
  const statistiques = await db(env, "rpc/affichagelegal_statistiques", {
    method: "POST",
    body: { p_debut: debut, p_fin: fin }
  });
  const membres = detail ? await db(env, "rpc/affichagelegal_membres", {
    method: "POST",
    body: { p_debut: debut, p_fin: fin, p_code: detail }
  }) : null;
  return json(request, {
    success: true, debut, fin,
    statistiques: Array.isArray(statistiques) ? statistiques : [],
    membres: detail ? (Array.isArray(membres) ? membres : []) : undefined
  }, 200, session.cookie);
}

async function statistiquesConnexion(request, env, session) {
  const recherche = new URL(request.url).searchParams;
  const debut = recherche.get("debut");
  const fin = recherche.get("fin");
  const date = (valeur) => {
    if (!valeur || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
    const objet = new Date(valeur + "T00:00:00.000Z");
    return Number.isNaN(objet.getTime()) ||
      objet.toISOString().slice(0, 10) !== valeur ? null : objet;
  };
  const d1 = date(debut);
  const d2 = date(fin);
  if (!d1 || !d2 || d2 < d1 || d2 - d1 > 366 * 86400000) {
    return json(request, {
      success: false,
      message: "Sélectionne une période valide de 367 jours maximum."
    }, 400, session.cookie);
  }

  // La fonction SQL est accessible uniquement à la clé de service du Worker.
  // Elle exclut le compte principal marqué dans adminaccount.
  const lignes = await db(env, "rpc/admin_connexion_statistiques", {
    method: "POST",
    body: { p_debut: debut, p_fin: fin }
  });
  return json(request, {
    success: true, debut, fin,
    comptes: Array.isArray(lignes) ? lignes : []
  }, 200, session.cookie);
}

async function lister(request, env, session) {
  const comptes = [];
  for (let offset = 0; offset <= 10000; offset += 500) {
    const params = new URLSearchParams({
      select: "id,nomadmin,prenomadmin,adminemail,type,actif",
      order: "nomadmin.asc,prenomadmin.asc",
      limit: "500",
      offset: String(offset)
    });
    const lot = await db(env, "adminaccount?" + params.toString());
    comptes.push(...(Array.isArray(lot) ? lot : []));
    if (!Array.isArray(lot) || lot.length < 500) break;
    if (offset === 10000) throw new Error("Trop de comptes à lire.");
  }
  return json(request, { success: true, accounts: comptes }, 200, session.cookie);
}

async function inviter(request, env, session) {
  if (!env.RESEND_API_KEY || !env.ADMIN_INVITE_FROM) {
    return json(request, { success: false,
      message: "Envoi d'invitation non configuré : vérifier les secrets du Worker." }, 503, session.cookie);
  }
  let body;
  try { body = await bodyJson(request); }
  catch (e) { return json(request, { success: false, message: e.message }, 400, session.cookie); }

  const nomadmin = String(body.nomadmin || "").trim();
  const prenomadmin = String(body.prenomadmin || "").trim();
  const adminemail = String(body.adminemail || "").trim().toLowerCase();
  const type = String(body.type || "").trim().toLowerCase();
  if (!valideNom(nomadmin) || !valideNom(prenomadmin) ||
      !valideEmail(adminemail) || !TYPES.has(type)) {
    return json(request, { success: false, message: "Nom, prénom, email ou type invalide." }, 400, session.cookie);
  }

  const filtreEmail = adminemail.replace(/([%_\\])/g, "\\$1");
  const params = new URLSearchParams({
    select: "id,actif,adminpwd",
    adminemail: "ilike." + filtreEmail,
    limit: "1"
  });
  const existants = await db(env, "adminaccount?" + params.toString());
  let compte = existants?.[0];

  if (compte && (compte.actif !== false || compte.adminpwd !== PENDING_PASSWORD)) {
    return json(request, { success: false,
      message: "Un compte existe déjà avec cette adresse email." }, 409, session.cookie);
  }
  if (!compte) {
    const result = await db(env, "adminaccount", {
      method: "POST",
      prefer: "return=representation",
      body: {
        nomadmin, prenomadmin, adminemail, type, actif: false,
        adminpwd: PENDING_PASSWORD
      }
    });
    compte = result?.[0];
    if (!compte?.id) throw new Error("Création du compte impossible.");
  } else {
    await db(env, "adminaccount?id=eq." + encodeURIComponent(compte.id), {
      method: "PATCH",
      prefer: "return=minimal",
      body: { nomadmin, prenomadmin, type, updated_at: new Date().toISOString() }
    });
  }

  // Une relance invalide immédiatement tous les liens précédents.
  await db(env, "admininvitation?adminaccount_id=eq." + encodeURIComponent(compte.id) + "&used_at=is.null", {
    method: "PATCH", body: { used_at: new Date().toISOString() }, prefer: "return=minimal"
  });

  const token = jeton();
  const digest = await sha256(token);
  await db(env, "admininvitation", {
    method: "POST", prefer: "return=minimal",
    body: {
      adminaccount_id: compte.id,
      token_hash: digest,
      created_by: session.admin.id,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    }
  });
  const url = ORIGINE_ADMIN + "/ESPACE-ADMIN/activation-admin.html#token=" + token;
  const prenomHtml = htmlEchapper(prenomadmin);
  const urlHtml = htmlEchapper(url);
  const html = '<!doctype html><html lang="fr"><body><main>' +
    '<h1>La Clé du Parc</h1>' +
    '<p>Bonjour ' + prenomHtml + ',</p>' +
    '<p>Un compte a été créé pour accéder à l’espace administrateur.</p>' +
    '<p><a href="' + urlHtml + '">Définir mon mot de passe</a></p>' +
    '<p>Ce lien expire dans 48 heures et ne peut être utilisé qu’une fois.</p>' +
    '<p>Si tu n’attendais pas cette invitation, ignore cet email.</p>' +
    '</main></body></html>';
  const email = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.ADMIN_INVITE_FROM,
      to: [adminemail],
      subject: "La Clé du Parc — active ton accès administrateur",
      html,
      text: "Bonjour " + prenomadmin + ",\n\n" +
        "Active ton accès administrateur et définis ton mot de passe :\n" +
        url + "\n\nCe lien expire dans 48 heures."
    })
  });
  if (!email.ok) {
    console.error("Envoi invitation admin : status", email.status);
    return json(request, { success: false,
      message: "Compte préparé, mais l'email n'a pas pu être envoyé. Tu peux renvoyer l'invitation." },
      502, session.cookie);
  }
  await db(env, "admininvitation?token_hash=eq." + digest, {
    method: "PATCH", body: { sent_at: new Date().toISOString() }, prefer: "return=minimal"
  });
  return json(request, { success: true, message: "Invitation envoyée." }, 200, session.cookie);
}

async function supprimer(request, env, session) {
  let body;
  try { body = await bodyJson(request); }
  catch (e) { return json(request, { success: false, message: e.message }, 400, session.cookie); }
  if (!uuid(body.id)) {
    return json(request, { success: false, message: "Identifiant invalide." }, 400, session.cookie);
  }
  if (body.id === session.admin.id) {
    return json(request, { success: false, message: "Impossible de supprimer ton propre compte." }, 403, session.cookie);
  }
  const effectue = await db(env, "rpc/admin_supprimer_compte", {
    method: "POST",
    body: { p_actor_id: session.admin.id, p_target_id: body.id }
  });
  if (effectue !== true) {
    return json(request, { success: false, message: "Compte introuvable ou suppression interdite." }, 409, session.cookie);
  }
  return json(request, { success: true }, 200, session.cookie);
}

async function activer(request, env) {
  let body;
  try { body = await bodyJson(request); }
  catch (e) { return json(request, { success: false, message: e.message }, 400); }
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return json(request, { success: false, message: "Lien d'activation invalide." }, 400);
  }
  if (password.length < 12 || password.length > 128) {
    return json(request, { success: false, message: "Le mot de passe doit contenir entre 12 et 128 caractères." }, 400);
  }
  const hash = await deriveHash(password);
  const ok = await db(env, "rpc/admin_activer_invitation", {
    method: "POST",
    body: { p_token_hash: await sha256(token), p_password_hash: hash }
  });
  if (ok !== true) {
    return json(request, { success: false, message: "Lien expiré, déjà utilisé ou invalide." }, 410);
  }
  return json(request, { success: true }, 200);
}

function jeton() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function deriveHash(password) {
  // Salt of exactly 16 bytes, compatible with w-ad-log-sess.
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  let raw = "";
  for (const b of saltBytes) raw += String.fromCharCode(b);
  const encodedSalt = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bytes = await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: saltBytes
  }, key, 256);
  let hashRaw = "";
  for (const b of new Uint8Array(bytes)) hashRaw += String.fromCharCode(b);
  const encodedHash = btoa(hashRaw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return "pbkdf2_sha256$" + ITERATIONS + "$" + encodedSalt + "$" + encodedHash;
}
