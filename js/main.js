// =====================================================
// POINT D'ENTRÉE : assemblage des modules et boucle de jeu
// =====================================================
import * as THREE from "three";
import { scene, camera, renderer } from "./moteur.js";
import { CONFIG_MONDE } from "./config.js";
import { etat } from "./etat.js";
import { creerMonde } from "./monde.js";
import { creerCarteIndustrielle } from "./carteIndustrielle.js";
import { carteChargee } from "./preferences.js";
import { initialiserCible, mettreAJourCible } from "./cible.js";
import { mettreAJourBalles } from "./balles.js";
import { mettreAJourEtincelles, mettreAJourFlashImpact } from "./effets.js";
import { mettreAJourReticule } from "./reticule.js";
import { mettreAJourRechargement } from "./munitions.js";
import { mettreAJourArme } from "./arme.js";
import { mettreAJourTir } from "./combat.js";
import { mettreAJourDeplacement } from "./joueur.js";
import { mettreAJourDebug } from "./debug.js";
import { mettreAJourCarte } from "./carte.js";
import { mettreAJourGrenades } from "./grenades.js";
import { mettreAJourJoueursDistants } from "./joueursDistants.js";
import "./multijoueur.js"; // envoi de mon état, avatars des autres joueurs
import { mettreAJourCombatJoueur } from "./combatJoueur.js";
import "./filEliminations.js"; // fil des éliminations, tableau des scores (Tab)
import "./domination.js";      // mode Domination : capture de A, B, C, score, chrono, fin de partie
import "./entrees.js";   // écoute du clavier et de la souris
import "./menu.js";      // menu de jeu, paramètres et raccourcis

// Le monde doit exister avant la cible (elle évite les éléments du décor)
// Carte choisie dans Échap > Paramètres > Jeu ; chaque carte renvoie ses points de départ { sud, nord }
// (en solo, on commence au départ sud)
if (CONFIG_MONDE.actif) {
  etat.departs = carteChargee === "industrielle" ? creerCarteIndustrielle() : creerMonde();
  const depart = etat.departs.sud;
  camera.position.x = depart.x;
  camera.position.z = depart.z;
  etat.yaw = depart.yaw;
  camera.rotation.y = depart.yaw;
}
initialiserCible();

const horloge = new THREE.Clock();

function boucle() {
  const dtBrut = horloge.getDelta();
  const dt = etat.menuOuvert ? 0 : Math.min(dtBrut, 0.05);   // jeu en pause pendant le menu
  const maintenant = horloge.elapsedTime;

  mettreAJourDeplacement(dt);
  mettreAJourRechargement(dt);
  mettreAJourTir(maintenant);
  mettreAJourArme(dt);

  // Réticule : les branches s'écartent tant que l'arme est en train de tirer
  const tirActif = etat.tirEnCours && etat.tempsLancer <= 0 && !etat.rechargement && !etat.sprint && etat.munitions > 0;
  mettreAJourReticule(dt, tirActif);

  mettreAJourBalles(dt);
  mettreAJourGrenades(dt);
  mettreAJourCible(dt);
  mettreAJourJoueursDistants();   // continue même menu ouvert : les autres joueurs ne sont pas en pause
  mettreAJourCombatJoueur(Math.min(dtBrut, 0.1));   // vie, mort, réapparition (temps réel)
  mettreAJourEtincelles(dt);
  mettreAJourFlashImpact(dt);

  scene.updateMatrixWorld(true);
  mettreAJourDebug();
  mettreAJourCarte();
  renderer.render(scene, camera);
  requestAnimationFrame(boucle);
}
boucle();