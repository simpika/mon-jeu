// =====================================================
// PRÉFÉRENCES DU JOUEUR (sauvegardées dans le navigateur, une série par pseudo)
// Sensibilités, raccourcis, mode de sprint, rechargement automatique et carte sont propres à chaque joueur.
// Sans pseudo : profil par défaut.
// =====================================================
import {
  ACTIONS_TOUCHES, TOUCHES_PAR_DEFAUT, NIVEAU_MIN, NIVEAU_MAX, NIVEAU_DEFAUT
} from "./config.js";

export const CLE_HORIZONTALE = "sensibiliteHorizontale";
export const CLE_VERTICALE = "sensibiliteVerticale";
const CLE_TOUCHES = "raccourcisTouches";
const CLE_RECHARGEMENT_AUTO = "rechargementAutomatique";
const CLE_MODE_SPRINT = "modeSprint";
const CLE_CARTE = "carte";
const REGLAGES = [CLE_HORIZONTALE, CLE_VERTICALE, CLE_TOUCHES, CLE_RECHARGEMENT_AUTO, CLE_MODE_SPRINT, CLE_CARTE];

export const RECHARGEMENT_AUTO_DEFAUT = false;
export const MODE_SPRINT_DEFAUT = "maintenir";   // "maintenir" (touche maintenue) ou "basculer" (un appui démarre / arrête)
export const CARTES = ["industrielle", "entrainement"];

// =====================================================
// PSEUDO : retenu pour l'onglet (sessionStorage) et pour les visites suivantes (localStorage)
// Deux onglets ouverts sur le même PC peuvent ainsi avoir chacun leur joueur
// =====================================================
const CLE_PSEUDO = "pseudoMulti";

export function lirePseudo() {
  try { return sessionStorage.getItem(CLE_PSEUDO) || localStorage.getItem(CLE_PSEUDO) || ""; } catch (e) { return ""; }
}

export function sauvegarderPseudo(pseudo) {
  try {
    sessionStorage.setItem(CLE_PSEUDO, pseudo);
    localStorage.setItem(CLE_PSEUDO, pseudo);
  } catch (e) { /* ignoré */ }
}

// =====================================================
// STOCKAGE PAR PROFIL : clé « réglage:pseudo » (sans pseudo : clé « réglage » seule)
// =====================================================
const nomProfil = profil => String(profil || "").trim().toLowerCase();

function cleReglage(base, profil) {
  const nom = nomProfil(profil);
  return nom ? base + ":" + nom : base;
}

function lireValeur(base, profil) {
  try { return localStorage.getItem(cleReglage(base, profil)); } catch (e) { return null; }
}

function ecrireValeur(base, valeur) {
  try { localStorage.setItem(cleReglage(base, prefs.profil), valeur); } catch (e) { /* ignoré */ }
}

// Les réglages enregistrés avant les profils sont repris (une seule fois) par le premier joueur,
// pour ne pas perdre les réglages existants
function reprendreAnciensReglages(profil) {
  if (!nomProfil(profil)) return;
  try {
    if (localStorage.getItem("reglagesRepris")) return;
    const touchesDejaReprises = !!localStorage.getItem(CLE_TOUCHES + ":repris");   // version précédente
    REGLAGES.forEach(base => {
      if (base === CLE_TOUCHES && touchesDejaReprises) return;
      const ancienne = localStorage.getItem(base);
      if (ancienne !== null && localStorage.getItem(cleReglage(base, profil)) === null) {
        localStorage.setItem(cleReglage(base, profil), ancienne);
      }
    });
    localStorage.setItem("reglagesRepris", "1");
  } catch (e) { /* stockage indisponible */ }
}

// =====================================================
// LECTURE DES RÉGLAGES D'UN PROFIL
// =====================================================
export function limiterNiveau(valeur) {
  return Math.min(NIVEAU_MAX, Math.max(NIVEAU_MIN, Math.round(valeur)));
}

function lireNiveau(base, profil) {
  const valeur = parseInt(lireValeur(base, profil), 10);
  return Number.isFinite(valeur) ? limiterNiveau(valeur) : NIVEAU_DEFAUT;
}

function lireRechargementAuto(profil) {
  const valeur = lireValeur(CLE_RECHARGEMENT_AUTO, profil);
  if (valeur === "1") return true;
  if (valeur === "0") return false;
  return RECHARGEMENT_AUTO_DEFAUT;
}

function lireModeSprint(profil) {
  const valeur = lireValeur(CLE_MODE_SPRINT, profil);
  return valeur === "maintenir" || valeur === "basculer" ? valeur : MODE_SPRINT_DEFAUT;
}

function lireCarte(profil) {
  const valeur = lireValeur(CLE_CARTE, profil);
  return CARTES.includes(valeur) ? valeur : CARTES[0];
}

export function cleEntree(entree) {
  return entree.type + ":" + entree.code;
}

export function copierTouches(source) {
  const copie = {};
  ACTIONS_TOUCHES.forEach(action => { copie[action.id] = { ...source[action.id] }; });
  return copie;
}

function lireTouches(profil) {
  try {
    const brut = JSON.parse(lireValeur(CLE_TOUCHES, profil));
    if (brut) {
      const lues = {};
      for (const action of ACTIONS_TOUCHES) {
        const t = brut[action.id];
        let entree = TOUCHES_PAR_DEFAUT[action.id];
        if (t && typeof t.label === "string") {
          if (t.type === "mouse" && [0, 1, 2].includes(t.code)) {
            entree = { type: "mouse", code: t.code, label: t.label };
          } else if ((t.type === "key" || t.type === undefined) && typeof t.code === "string") {
            // t.type indéfini : réglage enregistré par une version précédente (touches du clavier uniquement)
            entree = { type: "key", code: t.code, label: t.label };
          }
        }
        lues[action.id] = { ...entree };
      }

      // Une même entrée ne peut pas servir à deux actions : sinon on revient aux valeurs par défaut
      const cles = ACTIONS_TOUCHES.map(action => cleEntree(lues[action.id]));
      if (new Set(cles).size === cles.length) return lues;
    }
  } catch (e) { /* stockage indisponible ou contenu invalide : valeurs par défaut */ }
  return copierTouches(TOUCHES_PAR_DEFAUT);
}

// Tous les réglages d'un profil
function lireProfil(profil) {
  reprendreAnciensReglages(profil);
  return {
    profil,                                           // joueur dont les réglages sont chargés
    niveauHorizontal: lireNiveau(CLE_HORIZONTALE, profil),   // rotation gauche / droite
    niveauVertical: lireNiveau(CLE_VERTICALE, profil),       // rotation haut / bas
    touches: lireTouches(profil),
    rechargementAuto: lireRechargementAuto(profil),   // recharge seule quand le chargeur est vide
    modeSprint: lireModeSprint(profil),               // "maintenir" ou "basculer"
    carte: lireCarte(profil)                          // "industrielle" ou "entrainement"
  };
}

// Préférences actuelles (objet partagé : le menu les modifie, les autres modules les lisent)
export const prefs = lireProfil(lirePseudo());

// Carte construite au chargement de la page (un changement de carte demande un rechargement).
// Pour rejoindre une partie, la carte de l'hôte est imposée le temps d'un chargement,
// sans modifier la carte préférée du joueur.
const CLE_CARTE_IMPOSEE = "carteImposee";
function lireCarteImposee() {
  try {
    const carte = sessionStorage.getItem(CLE_CARTE_IMPOSEE);
    sessionStorage.removeItem(CLE_CARTE_IMPOSEE);
    return CARTES.includes(carte) ? carte : null;
  } catch (e) { return null; }
}
export const carteChargee = lireCarteImposee() || prefs.carte;

export function imposerCarteAuProchainChargement(carte) {
  try { sessionStorage.setItem(CLE_CARTE_IMPOSEE, carte); } catch (e) { /* ignoré */ }
}

// =====================================================
// SAUVEGARDE (dans le profil du joueur actuel)
// =====================================================
export function sauvegarderNiveau(cle, valeur) { ecrireValeur(cle, String(valeur)); }
export function sauvegarderTouches() { ecrireValeur(CLE_TOUCHES, JSON.stringify(prefs.touches)); }
export function sauvegarderRechargementAuto() { ecrireValeur(CLE_RECHARGEMENT_AUTO, prefs.rechargementAuto ? "1" : "0"); }
export function sauvegarderModeSprint() { ecrireValeur(CLE_MODE_SPRINT, prefs.modeSprint); }
export function sauvegarderCarte() { ecrireValeur(CLE_CARTE, prefs.carte); }

// =====================================================
// CHANGEMENT DE JOUEUR : charge tous ses réglages (valeurs par défaut pour un nouveau pseudo)
// =====================================================
const ecouteursProfil = [];
export function surChangementProfil(fonction) { ecouteursProfil.push(fonction); }

export function chargerProfil(pseudo) {
  if (nomProfil(pseudo) === nomProfil(prefs.profil)) return;
  Object.assign(prefs, lireProfil(pseudo));
  ecouteursProfil.forEach(fonction => fonction());
}

// Texte affiché pour la touche pressée
export function libelleTouche(e) {
  const modificateurs = {
    ShiftLeft: "Maj gauche", ShiftRight: "Maj droite",
    ControlLeft: "Ctrl gauche", ControlRight: "Ctrl droite",
    AltLeft: "Alt gauche", AltRight: "Alt droite"
  };
  if (modificateurs[e.code]) return modificateurs[e.code];
  const k = e.key;
  if (k === " ") return "Espace";
  if (k.length === 1) return k.toUpperCase();
  const noms = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Enter: "Entrée", Backspace: "Retour arr.", Tab: "Tab", Delete: "Suppr"
  };
  return noms[k] || k;
}

// Texte affiché pour un bouton de souris
export function libelleSouris(bouton) {
  return ["Clic gauche", "Clic milieu", "Clic droit"][bouton] || ("Bouton " + (bouton + 1));
}
