#!/usr/bin/env node
// ADMIN 13 — audit statique multi-dépôts. Ne fait aucun appel Stripe, Supabase ou Resend.
import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { resolve, join, dirname, sep } from "node:path";
import { spawnSync } from "node:child_process";

const depot = process.argv[2];
const racine = resolve(process.argv[3] || "./verification");
const attendus = Object.freeze({
  LCDP_public: "ESPACE-PUBLIC/hello.html",
  LCDP_membre: "ESPACE-MEMBRE/accueil-membre.html",
  LCDP_parc: "ESPACE-PARC",
  LCDP_coach: "ESPACE-COACH",
  LCDP_admin: "ESPACE-ADMIN/accueil-admin.html"
});
if (!Object.hasOwn(attendus, depot)) {
  console.error("Dépôt non reconnu.");
  process.exit(2);
}
const erreurs = [];
const compteurs = { javascript: 0, html: 0, liensScripts: 0, structure: 0 };
function controle(condition, description) {
  if (!condition) erreurs.push(description);
}
function explorer(dossier, resultats = []) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", ".next"].includes(entree.name)) continue;
    const nom = join(dossier, entree.name);
    if (entree.isDirectory()) explorer(nom, resultats);
    else if (entree.isFile()) resultats.push(nom);
  }
  return resultats;
}
for (const chemin of ["config.js", "index.html", attendus[depot]]) {
  compteurs.structure++;
  controle(existsSync(join(racine, chemin)), "Fichier ou répertoire attendu absent : " + chemin);
}
if (!existsSync(racine) || !statSync(racine).isDirectory()) {
  console.error("Dossier de vérification absent.");
  process.exit(2);
}
for (const fichier of explorer(racine)) {
  if (fichier.endsWith(".js") || fichier.endsWith(".mjs") || fichier.endsWith(".cjs")) {
    compteurs.javascript++;
    const resultat = spawnSync(process.execPath, ["--check", fichier], {
      encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 256
    });
    if (resultat.status !== 0) {
      erreurs.push("Syntaxe JS : " + fichier.slice(racine.length + 1) +
        " — " + String(resultat.stderr || resultat.error?.message || "erreur").slice(0, 220));
    }
  }
  if (!fichier.endsWith(".html")) continue;
  compteurs.html++;
  const contenu = readFileSync(fichier, "utf8");
  const pattern = /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1/gi;
  for (const correspondance of contenu.matchAll(pattern)) {
    const src = correspondance[2].split(/[?#]/)[0];
    if (!src.startsWith("./") && !src.startsWith("../")) continue;
    if (src.includes("{{") || src.includes("\${")) continue;
    const local = resolve(dirname(fichier), src);
    compteurs.liensScripts++;
    controle(local.startsWith(racine + sep) && existsSync(local),
      "Script local absent : " + fichier.slice(racine.length + 1) + " → " + src);
  }
}
controle(compteurs.javascript > 0, "Aucun fichier JavaScript vérifié.");
controle(compteurs.html > 0, "Aucun fichier HTML vérifié.");
const date = new Date().toISOString();
const resultat = {
  depot, date, statut: erreurs.length ? "echec" : "reussi",
  compteurs, anomalies: erreurs
};
console.log(JSON.stringify(resultat, null, 2));
const resume = [
  "### " + depot + " — " + (erreurs.length ? "Échec" : "Succès"),
  "Audit statique uniquement : ce contrôle ne valide ni les workers Cloudflare, ni les paiements, ni l'envoi d'e-mails.",
  "",
  "| Contrôle | Nombre |", "| --- | ---: |",
  "| Fichiers JS analysés | " + compteurs.javascript + " |",
  "| Pages HTML inspectées | " + compteurs.html + " |",
  "| Références de scripts vérifiées | " + compteurs.liensScripts + " |",
  "| Éléments structurels vérifiés | " + compteurs.structure + " |",
  "| Anomalies | " + erreurs.length + " |",
  "",
  ...erreurs.slice(0, 30).map(e => "- " + e),
  ""
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, resume + "\n");
}
if (erreurs.length) process.exitCode = 1;
