// La Clé du Parc — journal minimal des affichages légaux.
// À déployer sur https://affichage-legal-api.lacleduparc.fr
// Secrets requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// L'identité n'est jamais envoyée par le navigateur : elle est validée
// auprès du Worker de compte membre à partir du cookie de session.

const ORIGINES = new Set([
  "https://lacleduparc.fr",
  "https://membre.lacleduparc.fr"
]);
const PAGES = new Set([
  "mentions-legales", "reglement-app", "reglement-club",
  "cgv", "demande-abonnement"
]);
const API_MEMBRE = "https://mon-compte-membre-api.lacleduparc.fr/compte";
const MAX_BODY = 1024;

export default {
  async fetch(request, env) {
    const origine = request.headers.get("Origin") || "";
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    });
    if (ORIGINES.has(origine)) headers.set("Access-Control-Allow-Origin", origine);
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: ORIGINES.has(origine) ? 204 : 403, headers });
    }
    if (!ORIGINES.has(origine)) return json({ ok: false, message: "Origine interdite." }, 403);
    if (request.method !== "POST" || new URL(request.url).pathname !== "/affichage") {
      return json({ ok: false, message: "Route inconnue." }, 404);
    }
    if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) {
      return json({ ok: false, message: "Format invalide." }, 415);
    }

    try {
      const longueur = Number(request.headers.get("Content-Length") || 0);
      if (longueur > MAX_BODY) return json({ ok: false, message: "Requête trop volumineuse." }, 413);
      const bodyText = await request.text();
      if (new TextEncoder().encode(bodyText).length > MAX_BODY) {
        return json({ ok: false, message: "Requête trop volumineuse." }, 413);
      }
      const body = JSON.parse(bodyText);
      const page = String(body?.page || "");
      const id = String(body?.evenement || "");
      if (!PAGES.has(page) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
        return json({ ok: false, message: "Événement invalide." }, 400);
      }
      if ((page === "cgv" || page === "demande-abonnement") &&
          origine !== "https://membre.lacleduparc.fr") {
        return json({ ok: false, message: "Page non autorisée pour cette origine." }, 403);
      }

      // 401 signifie : le Worker membre confirme l'absence de session valable.
      // Toute autre erreur empêche l'enregistrement : une panne ne doit jamais
      // transformer artificiellement des vues identifiées en vues anonymes.
      const identite = await membreAuthentifie(request);
      if (!identite.ok) {
        return json({ ok: false, message: "Identification momentanément indisponible." }, 503);
      }
      if ((page === "cgv" || page === "demande-abonnement") && !identite.idmembre) {
        return json({ ok: false, message: "Connexion membre requise." }, 401);
      }

      const endpoint = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
      const cle = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
      if (!endpoint || !cle) throw new Error("Stockage non configuré.");
      const inserted = await fetch(endpoint + "/rest/v1/affichagelegal?on_conflict=id", {
        method: "POST",
        headers: {
          apikey: cle,
          Authorization: "Bearer " + cle,
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal"
        },
        body: JSON.stringify({
          id, page_code: page,
          idmembre: identite.idmembre,
          identifie: Boolean(identite.idmembre)
        })
      });
      if (!inserted.ok) {
        console.error("Affichage légal : erreur stockage", inserted.status);
        throw new Error("Écriture indisponible.");
      }
      return json({ ok: true });
    } catch (error) {
      console.error("Affichage légal :", error?.message || error);
      return json({ ok: false, message: "Comptage indisponible." }, 503);
    }
  }
};

async function membreAuthentifie(request) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie) return { ok: true, idmembre: null };

  const response = await fetch(API_MEMBRE, {
    method: "GET",
    headers: {
      Cookie: cookie,
      Origin: "https://membre.lacleduparc.fr",
      Accept: "application/json",
      "User-Agent": request.headers.get("User-Agent") || "LCDP-affichage-legal"
    },
    redirect: "manual",
    cache: "no-store"
  });
  if (response.status === 401) return { ok: true, idmembre: null };
  if (!response.ok) return { ok: false };
  const result = await response.json().catch(() => null);
  const idmembre = result?.compte?.idmembre;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ((result?.ok !== true && result?.success !== true) || !uuid.test(String(idmembre || ""))) {
    return { ok: false };
  }
  return { ok: true, idmembre };
}
