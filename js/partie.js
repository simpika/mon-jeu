// =====================================================
// PARTIE MULTIJOUEUR : équipes, points de vie et scores
//
// L'hôte est l'arbitre : il répartit les équipes, applique les dégâts, décide des morts et tient les scores.
// Les autres joueurs lui adressent des demandes (touche, réapparition, changement d'équipe) et appliquent
// ce qu'il annonce (« etatPartie », « vie », « mort »).
//
// Événements locaux (surPartie) :
//   "etat"   ()                              équipes, vies ou scores ont changé
//   "equipe" (equipe, ancienne)              mon équipe a changé (ou vient d'être attribuée)
//   "vie"    (id, vie, avant, message)       points de vie d'un joueur (message.tireur, message.reapparu)
//   "mort"   (message)                       { id, tueur, arme: "m4" | "grenade", tete }
// =====================================================
import { CONFIG_MULTI, CONFIG_CIBLE, CONFIG_GRENADE } from "./config.js";
import { reseau, surEvenement, envoyer } from "./reseau.js";
import { etat } from "./etat.js";

export const EQUIPES = ["sud", "nord"];
export const NOMS_EQUIPES = { sud: "Sud", nord: "Nord" };

export const partie = {
  equipes: new Map(),   // id → "sud" | "nord"
  vies: new Map(),      // id → points de vie
  scores: new Map()     // id → { e: éliminations, m: morts }
};

const protections = new Map();   // hôte : id → fin de l'invulnérabilité après réapparition (ms)
const derniersDegats = new Map(); // hôte : id → instant de la dernière blessure (ms), pour la régénération
let equipeConnue = null;         // dernière équipe connue pour moi (détection des changements)

const ecouteurs = {};
export function surPartie(type, fonction) { (ecouteurs[type] ||= []).push(fonction); }
function signaler(type, ...args) {
  (ecouteurs[type] || []).forEach(fonction => {
    try { fonction(...args); } catch (e) { console.error(e); }
  });
}

// --- Lecture ---
export const equipeDe = id => partie.equipes.get(id) || null;
export const monEquipe = () => equipeDe(reseau.monId);
export function estAllie(id) {
  const equipe = equipeDe(id);
  return equipe !== null && equipe === monEquipe();
}
export const estEnVie = id => (partie.vies.get(id) ?? 0) > 0;
export function pseudoDe(id) {
  if (id === reseau.monId) return reseau.pseudo;
  const joueur = reseau.joueurs.get(id);
  return joueur ? joueur.pseudo : "?";
}
function score(id) {
  if (!partie.scores.has(id)) partie.scores.set(id, { e: 0, m: 0 });
  return partie.scores.get(id);
}

export function reinitialiserPartie() {
  partie.equipes.clear();
  partie.vies.clear();
  partie.scores.clear();
  protections.clear();
  derniersDegats.clear();
  equipeConnue = null;
  signaler("etat");
}

// =====================================================
// DEMANDES DU JOUEUR LOCAL (traitées sur place si je suis l'hôte)
// =====================================================
function demander(message) {
  if (reseau.role === "hote") traiterDemande(reseau.monId, message);
  else if (reseau.role === "client") envoyer(message);
}

// zone : 0 tête, 1 torse, 2 reste du corps, -1 explosion ; arme : "m4" ou "grenade"
// origine : d'où vient le coup (départ de la balle ou point d'explosion), vecteur du monde — sert au repère de direction
export function signalerTouche(cible, degats, zone, arme, origine) {
  const message = { t: "touche", cible, degats, zone, arme };
  if (origine) message.o = [Math.round(origine.x * 100) / 100, Math.round(origine.z * 100) / 100];
  demander(message);
}

// Origine valide [x, z] (sinon null)
const origineValide = o => (Array.isArray(o) && o.length === 2 && o.every(Number.isFinite) ? o : null);
export function demanderReapparition() { demander({ t: "reapparition" }); }
export function demanderEquipe(equipe) { demander({ t: "demandeEquipe", equipe }); }

// =====================================================
// HÔTE : ARBITRAGE
// =====================================================
export function initialiserPartieHote() {
  reinitialiserPartie();
  partie.equipes.set(reseau.monId, "sud");
  partie.vies.set(reseau.monId, CONFIG_MULTI.vie);
  score(reseau.monId);
  diffuserEtat();
}

// Nouvelle partie : scores à zéro, tout le monde en vie (chacun repart de son spawn)
export function reinitialiserScoresHote() {
  if (reseau.role !== "hote") return;
  const finProtection = performance.now() + CONFIG_MULTI.protectionReapparition * 1000;
  partie.equipes.forEach((equipe, id) => {
    partie.scores.set(id, { e: 0, m: 0 });
    partie.vies.set(id, CONFIG_MULTI.vie);
    protections.set(id, finProtection);
  });
  diffuserEtat();
}

// Équipe la moins nombreuse (à égalité : sud)
function equipeLaMoinsRemplie() {
  let sud = 0, nord = 0;
  partie.equipes.forEach(e => { if (e === "sud") sud++; else nord++; });
  return sud <= nord ? "sud" : "nord";
}

function etatSerialise() {
  const scores = {};
  partie.scores.forEach((s, id) => { scores[id] = [s.e, s.m]; });
  return {
    t: "etatPartie",
    equipes: Object.fromEntries(partie.equipes),
    vies: Object.fromEntries(partie.vies),
    scores
  };
}

// Envoie l'état complet à tous et l'applique chez soi
function diffuserEtat() {
  const message = etatSerialise();
  envoyer(message);
  appliquerEtat(message);
}

// Envoie un message à tous et l'applique chez soi
function annoncer(message) {
  envoyer(message);
  appliquer({ ...message, de: reseau.monId });
}

function traiterDemande(de, message) {
  if (message.t === "touche") traiterTouche(de, message);
  else if (message.t === "reapparition") traiterReapparition(de);
  else if (message.t === "demandeEquipe") traiterDemandeEquipe(de, message.equipe);
}

function traiterTouche(de, m) {
  const victime = m.cible;
  if (etat.partieTerminee) return;                                    // écran de fin : plus de dégâts
  if (!partie.vies.has(victime) || !partie.vies.has(de)) return;
  const vie = partie.vies.get(victime);
  if (vie <= 0) return;                                               // déjà morte
  const grenade = m.arme === "grenade";
  if (!grenade && partie.vies.get(de) <= 0) return;                    // un mort ne tire plus (sa grenade peut encore exploser)
  if (de === victime && !grenade) return;
  if (de !== victime && equipeDe(de) === equipeDe(victime)) return;  // pas de tir allié
  if ((protections.get(victime) || 0) > performance.now()) return;   // invulnérable juste après la réapparition

  // Contrôle de vraisemblance : jamais plus que le maximum possible d'un coup
  const maximum = grenade
    ? Math.max(...CONFIG_GRENADE.paliersDegats.map(p => p.degats))
    : Math.max(...CONFIG_CIBLE.zones.map(z => z.degats));
  const degats = Math.min(maximum, Math.max(1, Math.round(+m.degats || 0)));
  const reste = Math.max(0, vie - degats);
  derniersDegats.set(victime, performance.now());

  const origine = origineValide(m.o);
  annoncer({ t: "vie", id: victime, vie: reste, tireur: de, origine });
  if (reste === 0) {
    score(victime).m++;
    if (de !== victime) score(de).e++;
    annoncer({ t: "mort", id: victime, tueur: de, arme: grenade ? "grenade" : "m4", tete: !grenade && m.zone === 0, origine });
    diffuserEtat();
  }
}

// Régénération : sans blessure depuis delaiRegeneration secondes, la vie remonte jusqu'au maximum
const PAS_REGENERATION = 0.25;   // secondes entre deux annonces (4 par seconde)
setInterval(() => {
  if (reseau.role !== "hote" || etat.partieTerminee) return;
  const maintenant = performance.now();
  const gain = Math.max(1, Math.round(CONFIG_MULTI.regenerationParSeconde * PAS_REGENERATION));
  partie.vies.forEach((vie, id) => {
    if (vie <= 0 || vie >= CONFIG_MULTI.vie) return;   // mort, ou déjà au maximum
    if (maintenant - (derniersDegats.get(id) || 0) < CONFIG_MULTI.delaiRegeneration * 1000) return;
    annoncer({ t: "vie", id, vie: Math.min(CONFIG_MULTI.vie, vie + gain) });
  });
}, PAS_REGENERATION * 1000);

function traiterReapparition(de) {
  if (!partie.vies.has(de) || partie.vies.get(de) > 0) return;
  protections.set(de, performance.now() + CONFIG_MULTI.protectionReapparition * 1000);
  annoncer({ t: "vie", id: de, vie: CONFIG_MULTI.vie, reapparu: true });
}

function traiterDemandeEquipe(de, equipe) {
  if (!EQUIPES.includes(equipe) || !partie.equipes.has(de) || equipeDe(de) === equipe) return;
  partie.equipes.set(de, equipe);
  partie.vies.set(de, CONFIG_MULTI.vie);   // le joueur repart de son nouveau spawn, vie pleine
  protections.set(de, performance.now() + CONFIG_MULTI.protectionReapparition * 1000);
  diffuserEtat();
}

// =====================================================
// APPLICATION DE CE QUE L'HÔTE ANNONCE
// =====================================================
function appliquer(m) {
  if (m.t === "etatPartie") {
    appliquerEtat(m);
  } else if (m.t === "vie") {
    if (!Number.isFinite(m.vie)) return;
    const avant = partie.vies.get(m.id) ?? 0;
    partie.vies.set(m.id, m.vie);
    signaler("vie", m.id, m.vie, avant, m);
  } else if (m.t === "mort") {
    partie.vies.set(m.id, 0);
    signaler("mort", m);
  }
}

function appliquerEtat(m) {
  partie.equipes.clear();
  Object.entries(m.equipes || {}).forEach(([id, e]) => { if (EQUIPES.includes(e)) partie.equipes.set(id, e); });
  partie.vies.clear();
  Object.entries(m.vies || {}).forEach(([id, v]) => partie.vies.set(id, +v || 0));
  partie.scores.clear();
  Object.entries(m.scores || {}).forEach(([id, s]) => partie.scores.set(id, { e: +s[0] || 0, m: +s[1] || 0 }));

  signaler("etat");
  const equipe = monEquipe();
  if (equipe && equipe !== equipeConnue) {
    const ancienne = equipeConnue;
    equipeConnue = equipe;
    signaler("equipe", equipe, ancienne);
  }
}

// =====================================================
// RÉSEAU
// =====================================================
surEvenement("message", m => {
  if (reseau.role === "hote") {
    if (m.t === "touche" || m.t === "reapparition" || m.t === "demandeEquipe") traiterDemande(m.de, m);
  } else if (m.de === reseau.idHote) {
    appliquer(m);   // seul l'hôte fait foi
  }
});

// Hôte : un nouveau joueur rejoint l'équipe la moins nombreuse
surEvenement("arrivee", joueur => {
  if (reseau.role !== "hote") return;
  partie.equipes.set(joueur.id, equipeLaMoinsRemplie());
  partie.vies.set(joueur.id, CONFIG_MULTI.vie);
  score(joueur.id);
  diffuserEtat();
});

surEvenement("depart", joueur => {
  partie.equipes.delete(joueur.id);
  partie.vies.delete(joueur.id);
  partie.scores.delete(joueur.id);
  protections.delete(joueur.id);
  derniersDegats.delete(joueur.id);
  if (reseau.role === "hote") diffuserEtat();
  else signaler("etat");
});

surEvenement("fin", reinitialiserPartie);
