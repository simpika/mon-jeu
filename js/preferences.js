// =====================================================
// PRÉFÉRENCES DU JOUEUR : sensibilités et raccourcis (sauvegardés dans le navigateur)
// =====================================================
import {
  ACTIONS_TOUCHES, TOUCHES_PAR_DEFAUT, NIVEAU_MIN, NIVEAU_MAX, NIVEAU_DEFAUT
} from "./config.js";

export function limiterNiveau(valeur) {
  return Math.min(NIVEAU_MAX, Math.max(NIVEAU_MIN, Math.round(valeur)));
}

function lireNiveau(cle) {
  try {
    const valeur = parseInt(localStorage.getItem(cle), 10);
    if (Number.isFinite(valeur)) return limiterNiveau(valeur);
  } catch (e) { /* stockage indisponible : on garde la valeur par défaut */ }
  return NIVEAU_DEFAUT;
}

export function sauvegarderNiveau(cle, valeur) {
  try { localStorage.setItem(cle, String(valeur)); } catch (e) { /* ignoré */ }
}

export const CLE_HORIZONTALE = "sensibiliteHorizontale";
export const CLE_VERTICALE = "sensibiliteVerticale";
const CLE_TOUCHES = "raccourcisTouches";
const CLE_RECHARGEMENT_AUTO = "rechargementAutomatique";
export const RECHARGEMENT_AUTO_DEFAUT = false;

function lireRechargementAuto() {
  try {
    const valeur = localStorage.getItem(CLE_RECHARGEMENT_AUTO);
    if (valeur === "1") return true;
    if (valeur === "0") return false;
  } catch (e) { /* stockage indisponible : valeur par défaut */ }
  return RECHARGEMENT_AUTO_DEFAUT;
}

// Mode du sprint : "maintenir" (touche maintenue) ou "basculer" (un appui pour démarrer, un autre pour arrêter)
const CLE_MODE_SPRINT = "modeSprint";
export const MODE_SPRINT_DEFAUT = "maintenir";

function lireModeSprint() {
  try {
    const valeur = localStorage.getItem(CLE_MODE_SPRINT);
    if (valeur === "maintenir" || valeur === "basculer") return valeur;
  } catch (e) { /* stockage indisponible : valeur par défaut */ }
  return MODE_SPRINT_DEFAUT;
}

export function sauvegarderModeSprint() {
  try { localStorage.setItem(CLE_MODE_SPRINT, prefs.modeSprint); } catch (e) { /* ignoré */ }
}

// Carte jouée : "industrielle" ou "entrainement" (changer de carte recharge la page)
const CLE_CARTE = "carte";
export const CARTES = ["industrielle", "entrainement"];

function lireCarte() {
  try {
    const valeur = localStorage.getItem(CLE_CARTE);
    if (CARTES.includes(valeur)) return valeur;
  } catch (e) { /* stockage indisponible : valeur par défaut */ }
  return CARTES[0];
}

export function sauvegarderCarte() {
  try { localStorage.setItem(CLE_CARTE, prefs.carte); } catch (e) { /* ignoré */ }
}

export function sauvegarderRechargementAuto() {
  try { localStorage.setItem(CLE_RECHARGEMENT_AUTO, prefs.rechargementAuto ? "1" : "0"); } catch (e) { /* ignoré */ }
}

export function cleEntree(entree) {
  return entree.type + ":" + entree.code;
}

export function copierTouches(source) {
  const copie = {};
  ACTIONS_TOUCHES.forEach(action => { copie[action.id] = { ...source[action.id] }; });
  return copie;
}

// --- Pseudo du joueur : retenu pour l'onglet (sessionStorage) et pour les visites suivantes (localStorage) ---
// Deux onglets ouverts sur le même PC peuvent ainsi avoir chacun leur joueur
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

// --- Raccourcis propres à chaque joueur : un profil par pseudo (sans pseudo : profil par défaut) ---
function cleProfil(pseudo) {
  const nom = String(pseudo || "").trim().toLowerCase();
  return nom ? CLE_TOUCHES + ":" + nom : CLE_TOUCHES;
}

// Raccourcis d'un joueur. Les raccourcis enregistrés avant les profils (une seule fois)
// sont repris par le premier joueur qui en a besoin, pour ne pas perdre les réglages existants.
function lireTouchesProfil(pseudo) {
  const cle = cleProfil(pseudo);
  try {
    const ancienne = localStorage.getItem(CLE_TOUCHES);
    if (cle !== CLE_TOUCHES && localStorage.getItem(cle) === null && ancienne !== null &&
        !localStorage.getItem(CLE_TOUCHES + ":repris")) {
      localStorage.setItem(cle, ancienne);
      localStorage.setItem(CLE_TOUCHES + ":repris", "1");
    }
  } catch (e) { /* stockage indisponible */ }
  return lireTouches(cle);
}

function lireTouches(cle) {
  try {
    const brut = JSON.parse(localStorage.getItem(cle));
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

// Préférences actuelles (objet partagé : le menu les modifie, les autres modules les lisent)
export const prefs = {
  niveauHorizontal: lireNiveau(CLE_HORIZONTALE),   // rotation gauche / droite
  niveauVertical: lireNiveau(CLE_VERTICALE),       // rotation haut / bas
  profil: lirePseudo(),                            // joueur dont les raccourcis sont chargés
  touches: lireTouchesProfil(lirePseudo()),
  rechargementAuto: lireRechargementAuto(),        // recharge seule quand le chargeur est vide
  modeSprint: lireModeSprint(),                    // "maintenir" ou "basculer"
  carte: lireCarte()                               // "industrielle" ou "entrainement"
};

export function sauvegarderTouches() {
  try { localStorage.setItem(cleProfil(prefs.profil), JSON.stringify(prefs.touches)); } catch (e) { /* ignoré */ }
}

// Change de joueur : charge ses raccourcis (raccourcis par défaut pour un nouveau pseudo)
const ecouteursProfil = [];
export function surChangementProfil(fonction) { ecouteursProfil.push(fonction); }

export function chargerProfil(pseudo) {
  if (String(pseudo || "").trim().toLowerCase() === String(prefs.profil || "").trim().toLowerCase()) return;
  prefs.profil = pseudo;
  prefs.touches = lireTouchesProfil(pseudo);
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