// =====================================================
// ENTRÉES : clavier et souris → actions (selon les raccourcis configurés)
// =====================================================
import { renderer, camera, sourisCapturee } from "./moteur.js";
import { CONFIG_VUE, NIVEAU_REFERENCE, ACTIONS_TOUCHES } from "./config.js";
import { etat } from "./etat.js";
import { prefs } from "./preferences.js";
import { touchesDeplacement, declencherSaut } from "./joueur.js";
import { initialiserAudio } from "./audio.js";
import { lancerRechargement } from "./munitions.js";
import { lancerGrenade } from "./grenades.js";

// Action associée à une entrée : touche du clavier (type "key", code physique)
// ou bouton de la souris (type "mouse", numéro du bouton)
function actionPourEntree(type, code) {
  for (const action of ACTIONS_TOUCHES) {
    const entree = prefs.touches[action.id];
    if (entree.type === type && entree.code === code) return action.id;
  }
  return null;
}

// Les actions de jeu ne fonctionnent que souris capturée et menu fermé
function entreesActives() {
  return sourisCapturee() && !etat.menuOuvert;
}

function debutAction(action) {
  switch (action) {
    case "avant":
    case "arriere":
    case "gauche":
    case "droite":
      touchesDeplacement[action] = true;
      break;
    case "sprint":
      // Maintenir : sprint tant que la touche est enfoncée. Appuyer une fois : chaque appui démarre / arrête
      if (prefs.modeSprint === "basculer") touchesDeplacement.sprint = !touchesDeplacement.sprint;
      else touchesDeplacement.sprint = true;
      break;
    case "saut":
      if (entreesActives()) declencherSaut();
      break;
    case "tir":
      if (entreesActives()) {
        initialiserAudio();   // le navigateur exige une action de l'utilisateur avant de jouer du son
        etat.clicVideJoue = false;
        etat.tirEnCours = true;
      }
      break;
    case "recharge":
      if (entreesActives()) lancerRechargement();
      break;
    case "grenade":
      if (entreesActives()) lancerGrenade();   // une grenade par appui
      break;
  }
}

function finAction(action) {
  switch (action) {
    case "avant":
    case "arriere":
    case "gauche":
    case "droite":
      touchesDeplacement[action] = false;
      break;
    case "sprint":
      if (prefs.modeSprint !== "basculer") touchesDeplacement.sprint = false;   // en mode « appuyer une fois », le relâchement ne compte pas
      break;
    case "tir":
      etat.tirEnCours = false;
      break;
  }
}

// --- Clavier ---
window.addEventListener("keydown", e => {
  const action = actionPourEntree("key", e.code);
  if (!action) return;
  // Laisse passer les raccourcis du navigateur (Ctrl+R, etc.),
  // sauf si Ctrl / Alt est lui-même assigné à une action (ex. sprint) : on doit pouvoir avancer en le maintenant
  const modificateurAssigne = ACTIONS_TOUCHES.some(a => /^(Control|Alt|Meta)/.test(String(prefs.touches[a.id].code)));
  if ((e.ctrlKey || e.metaKey || e.altKey) && !modificateurAssigne) return;

  if (entreesActives()) e.preventDefault();         // évite que la page défile (Espace, flèches…)
  if (e.repeat) return;
  debutAction(action);
});

window.addEventListener("keyup", e => {
  const action = actionPourEntree("key", e.code);
  if (action) finAction(action);
});

// --- Souris : le premier clic gauche capture la souris, les clics suivants déclenchent les actions ---
renderer.domElement.addEventListener("mousedown", e => {
  if (e.button === 0) initialiserAudio();   // le navigateur exige un clic avant de jouer du son

  if (!sourisCapturee()) {
    if (e.button === 0) renderer.domElement.requestPointerLock();
    return;
  }

  const action = actionPourEntree("mouse", e.button);
  if (action) {
    e.preventDefault();   // évite le défilement automatique du clic milieu
    debutAction(action);
  }
});

window.addEventListener("mouseup", e => {
  const action = actionPourEntree("mouse", e.button);
  if (action) finAction(action);
});

// Pas de menu contextuel du navigateur dans le jeu (le clic droit reste utilisable comme raccourci)
renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());

window.addEventListener("blur", () => { etat.tirEnCours = false; });

// --- Rotation de la vue à la souris (pointer lock) ---
const limitePitch = Math.PI / 2 - 0.05;

window.addEventListener("mousemove", e => {
  if (!sourisCapturee()) return;

  // Vitesse = sensibilité du niveau 6 × (niveau / 6), réglée séparément pour chaque axe
  const sensibiliteH = CONFIG_VUE.sensibiliteNiveau6 * (prefs.niveauHorizontal / NIVEAU_REFERENCE);
  const sensibiliteV = CONFIG_VUE.sensibiliteNiveau6 * (prefs.niveauVertical / NIVEAU_REFERENCE);

  etat.yaw -= e.movementX * sensibiliteH;
  etat.pitch -= e.movementY * sensibiliteV;
  etat.pitch = Math.max(-limitePitch, Math.min(limitePitch, etat.pitch));

  camera.rotation.y = etat.yaw;
  camera.rotation.x = etat.pitch;
});