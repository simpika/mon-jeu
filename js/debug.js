// =====================================================
// OUTILS DE RÉGLAGE : encart d'état et touches H, G, T, B, M
// =====================================================
import * as THREE from "three";
import { scene } from "./moteur.js";
import { CONFIG_ARME, CONFIG_MAINS } from "./config.js";
import { etat } from "./etat.js";
import {
  modeleArme, chargerArme, basculerMateriaux, tournerArme90, basculerMarqueur, basculerRangement
} from "./arme.js";

// --- Encart d'état (en haut à gauche) ---
const statut = document.createElement("div");
statut.style.cssText =
  "position:fixed;top:10px;left:10px;color:#fff;font:13px monospace;white-space:pre-wrap;" +
  "background:rgba(0,0,0,0.7);padding:8px 12px;z-index:20;max-width:90vw;";
document.body.appendChild(statut);

let messageBase = "";
let couleurStatut = "#fff";
let cadreDebug = null;

function enDegres(radians) {
  const deg = Math.round(THREE.MathUtils.radToDeg(radians));
  return ((deg % 360) + 360) % 360;
}

function rafraichirStatut() {
  let texte = messageBase;
  const conteneur = modeleArme.conteneur;
  if (conteneur) {
    texte +=
      "\n\nAngle de l'arme : " +
      "X " + enDegres(conteneur.rotation.x) + "°  |  " +
      "Y " + enDegres(conteneur.rotation.y) + "°  |  " +
      "Z " + enDegres(conteneur.rotation.z) + "°";
  }

  // Outil de réglage des mains (touche H)
  if (etat.reglageMains === 1 || etat.reglageMains === 2) {
    const nom = etat.reglageMains === 1 ? "droite" : "gauche";
    const p = etat.mains[nom];
    texte +=
      "\n\nRéglage de la main " + nom + " :  x " + p.x.toFixed(3) + "  y " + p.y.toFixed(3) + "  z " + p.z.toFixed(3) +
      "\nFlèches : x / y   PageHaut : vers l'avant   PageBas : vers vous   (Maj : pas fin)" +
      "\nH : main suivante   (recopiez les valeurs dans CONFIG_MAINS)";
  } else if (etat.reglageMains === 3) {
    texte += "\n\nMains masquées (H : terminer le réglage)";
  }

  statut.textContent = texte;
  statut.style.color = couleurStatut;
}

function afficherStatut(texte, couleur = "#fff") {
  messageBase = texte;
  couleurStatut = couleur;
  rafraichirStatut();
}

afficherStatut("Chargement de " + CONFIG_ARME.fichier + "...");

// --- Chargement du modèle de l'arme (le message d'état suit l'avancement) ---
chargerArme({
  onSucces: resultat => {
    cadreDebug = new THREE.BoxHelper(modeleArme.conteneur, 0xffff00);
    cadreDebug.visible = false;   // masqué par défaut (touche B pour l'afficher)
    scene.add(cadreDebug);

    afficherStatut(
      "Arme chargée.\n" + resultat.rapport +
      "\n\nSouris : viser (cliquez pour capturer, Échap pour le menu)" +
      "\nDéplacements, saut, tir et rechargement : modifiables dans" +
      "\nÉchap > Paramètres > Raccourcis" +
      "\n(par défaut : Z Q S D, Espace, clic gauche, R)" +
      "\nDécor : tours + passerelle (nord), pont (est)," +
      "\npyramide (ouest), caisses, bunker et colline (sud)" +
      "\nH : régler / masquer les mains (flèches, PageHaut, PageBas)" +
      "\nT : textures M4 / matériaux d'origine\nG : tourner l'arme de 90°" +
      "\nX : ranger / sortir l'arme (Holster / Draw)" +
      "\nB : cadre jaune on/off\nM : point de sortie du canon (rouge)",
      "#7CFC00"
    );
  },
  onProgression: progression => {
    if (progression.total) {
      afficherStatut("Chargement : " + Math.round((progression.loaded / progression.total) * 100) + " %");
    }
  },
  onErreur: erreur => {
    console.error(erreur);
    afficherStatut(
      "Erreur : impossible de charger " + CONFIG_ARME.fichier +
      "\nVérifiez le nom, le dossier assets et que Live Server est lancé.\nDétail dans la console (F12).",
      "#ff6b6b"
    );
  }
});

// Mise à jour du cadre jaune (à appeler à chaque image)
export function mettreAJourDebug() {
  if (cadreDebug) cadreDebug.update();
}

// --- Touches de réglage ---
// Outil de réglage des mains : déplacement de la main sélectionnée
const REGLAGE_MAINS = {
  ArrowLeft:  { axe: "x", signe: -1 },   // vers la gauche
  ArrowRight: { axe: "x", signe: 1 },    // vers la droite
  ArrowUp:    { axe: "y", signe: 1 },    // vers le haut
  ArrowDown:  { axe: "y", signe: -1 },   // vers le bas
  PageUp:     { axe: "z", signe: -1 },   // vers l'avant du canon
  PageDown:   { axe: "z", signe: 1 }     // vers vous
};

window.addEventListener("keydown", e => {
  if (etat.menuOuvert) return;   // pas de raccourcis pendant le menu

  const touche = e.key.toLowerCase();

  // M : montre le point de sortie du canon
  if (touche === "m") {
    basculerMarqueur();
  }

  // H : outil de réglage des mains (main droite → main gauche → mains masquées → éteint)
  if (touche === "h" && CONFIG_MAINS.actif) {
    if (!e.repeat) {
      etat.reglageMains = (etat.reglageMains + 1) % 4;
      rafraichirStatut();
    }
    return;
  }

  // Flèches et PageHaut / PageBas : déplacent la main sélectionnée (Maj : pas fin)
  const reglage = REGLAGE_MAINS[e.code];
  if (reglage && (etat.reglageMains === 1 || etat.reglageMains === 2)) {
    e.preventDefault();
    const pas = e.shiftKey ? 0.001 : 0.005;
    const position = etat.mains[etat.reglageMains === 1 ? "droite" : "gauche"];
    position[reglage.axe] += reglage.signe * pas;
    rafraichirStatut();
    return;
  }

  if (!modeleArme.conteneur) return;

  // G : fait tourner le modèle de l'arme de 90°
  if (touche === "g") {
    tournerArme90();
    rafraichirStatut();
  }
  // X : ranger / sortir l'arme
  if (touche === "x" && !e.repeat) {
    basculerRangement();
  }
  // T : textures M4 / matériaux d'origine
  if (touche === "t") {
    basculerMateriaux();
  }
  // B : cadre jaune autour de l'arme
  if (touche === "b" && cadreDebug) {
    cadreDebug.visible = !cadreDebug.visible;
  }
});