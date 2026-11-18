// =====================================================
// RÉTICULE (couleur, écartement des branches) ET TEXTE DES DÉGÂTS
// =====================================================
import { CONFIG_RETICULE, CONFIG_CIBLE } from "./config.js";

export const reticule = document.getElementById("reticule");
const traitsReticule = reticule.querySelectorAll("i");

function appliquerCouleurReticule(couleur) {
  traitsReticule.forEach(trait => { trait.style.background = couleur; });
}
appliquerCouleurReticule(CONFIG_RETICULE.couleur);

let tempsTouche = 0;       // temps restant pendant lequel le réticule est rouge
let reticuleRouge = false;
let ecartReticule = CONFIG_RETICULE.ecartRepos;   // écart actuel entre le point et les branches (px)

// Le réticule devient rouge pendant "duree" secondes (une touche sur la cible)
export function declencherTouche(duree) {
  tempsTouche = Math.max(tempsTouche, duree);
}

// tirActif : true quand l'arme est en train de tirer (les branches s'écartent)
export function mettreAJourReticule(dt, tirActif) {
  // Couleur : rouge pendant un court instant après une touche
  if (tempsTouche > 0) tempsTouche -= dt;
  const rouge = tempsTouche > 0;
  if (rouge !== reticuleRouge) {
    reticuleRouge = rouge;
    appliquerCouleurReticule(rouge ? CONFIG_RETICULE.couleurTouche : CONFIG_RETICULE.couleur);
  }

  // Écartement des branches
  const ecartCible = tirActif ? CONFIG_RETICULE.ecartTir : CONFIG_RETICULE.ecartRepos;
  ecartReticule += (ecartCible - ecartReticule) * Math.min(1, dt * CONFIG_RETICULE.vitesseTransition);
  reticule.style.setProperty("--ecart", ecartReticule.toFixed(2) + "px");
}

// --- Petit texte « dégâts / zone » affiché au-dessus du réticule à chaque touche ---
const affichageDegats = document.createElement("div");
affichageDegats.style.cssText =
  "position:fixed;left:50%;top:calc(50% - 78px);transform:translateX(-50%);z-index:16;" +
  "pointer-events:none;text-align:center;font-family:sans-serif;opacity:0;" +
  "text-shadow:0 0 4px #000, 0 0 8px #000;";
document.body.appendChild(affichageDegats);
let animationDegats = null;

// degats : dégâts réellement infligés (après la baisse due à la distance)
export function afficherDegats(zone, degats = zone.degats) {
  if (!CONFIG_CIBLE.afficherDegats) return;

  affichageDegats.innerHTML =
    '<div style="font-size:28px;font-weight:700;color:' + zone.texte + '">' + degats + "</div>" +
    '<div style="font-size:11px;letter-spacing:1px;color:#fff">' + zone.nom.toUpperCase() + "</div>";

  if (animationDegats) animationDegats.cancel();
  animationDegats = affichageDegats.animate(
    [
      { opacity: 1, transform: "translateX(-50%) translateY(0px)" },
      { opacity: 1, transform: "translateX(-50%) translateY(-10px)", offset: 0.5 },
      { opacity: 0, transform: "translateX(-50%) translateY(-24px)" }
    ],
    { duration: 700, easing: "ease-out" }
  );
}