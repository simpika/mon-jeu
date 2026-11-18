// =====================================================
// COMBAT : tir (balle, flash, recul, son, munition)
// =====================================================
import * as THREE from "three";
import { scene, camera } from "./moteur.js";
import { CONFIG_TIR } from "./config.js";
import { etat } from "./etat.js";
import { surfaces } from "./monde.js";
import { creerBalle } from "./balles.js";
import { arme, bouche, declencherFlash, ajouterRecul, animerTir } from "./arme.js";
import { consommerMunition } from "./munitions.js";
import { jouerSonTir, jouerClicVide } from "./audio.js";

const raycaster = new THREE.Raycaster();
const centreEcran = new THREE.Vector2(0, 0);
let dernierTir = -Infinity;

function tirer() {
  scene.updateMatrixWorld(true);

  // Une munition de moins
  consommerMunition();

  // Départ : bouche du canon
  const origine = arme.localToWorld(bouche.clone());

  // 1) Point visé par le réticule (centre de l'écran)
  raycaster.setFromCamera(centreEcran, camera);
  raycaster.far = CONFIG_TIR.portee;
  const toucheVisee = raycaster.intersectObjects(surfaces, false)[0];
  const pointVise = toucheVisee
    ? toucheVisee.point.clone()
    : raycaster.ray.at(CONFIG_TIR.portee, new THREE.Vector3());

  // 2) Trajectoire réelle de la balle : du canon vers le point visé
  const direction = pointVise.sub(origine).normalize();
  raycaster.set(origine, direction);
  raycaster.far = CONFIG_TIR.portee;
  const impact = raycaster.intersectObjects(surfaces, false)[0];

  creerBalle(origine, direction, impact);

  // Flash, recul, son
  declencherFlash();
  ajouterRecul();
  animerTir();
  jouerSonTir();
}

// Tir automatique tant que l'entrée de tir est maintenue (impossible pendant le rechargement)
export function mettreAJourTir(maintenant) {
  if (etat.tempsLancer > 0) return;   // pas de tir pendant le lancer d'une grenade
  if (etat.tirEnCours && !etat.rechargement && !etat.armeRangee && !etat.sprint && maintenant - dernierTir >= CONFIG_TIR.cadence) {
    if (etat.munitions > 0) {
      tirer();
    } else if (!etat.clicVideJoue) {
      jouerClicVide();       // chargeur vide : un seul clic par appui
      etat.clicVideJoue = true;
    }
    dernierTir = maintenant;
  }
}