// =====================================================
// ÉTAT PARTAGÉ ENTRE LES MODULES
// (un objet unique : tous les modules lisent et modifient les mêmes valeurs)
// =====================================================
import { CONFIG_MAINS, CONFIG_MUNITIONS, CONFIG_GRENADE } from "./config.js";

export const etat = {
  // Vue
  yaw: 0,                                  // rotation gauche / droite
  pitch: 0,                                // rotation haut / bas

  // Menu et souris
  menuOuvert: false,
  aDejaJoue: false,                        // le menu ne s'ouvre qu'après une première capture de la souris

  // Déplacement
  sprint: false,                           // true pendant le sprint (pas de tir ni de rechargement)

  // Tir et munitions
  tirEnCours: false,
  munitions: CONFIG_MUNITIONS.chargeur,    // balles restantes dans le chargeur
  chargeurs: CONFIG_MUNITIONS.chargeurs,   // chargeurs pleins en réserve
  rechargement: false,                     // true pendant le rechargement
  tempsRechargement: 0,                    // temps restant du rechargement (secondes)
  dureeRechargement: CONFIG_MUNITIONS.dureeRechargement, // durée du rechargement en cours (secondes)
  dureesAnimations: {},                    // durée des clips du modèle (ex. Reload, Reload_Empty), remplie au chargement
  momentsChargeur: {},                     // par clip : { retrait, insertion } en secondes (sons du chargeur)
  animationRechargement: "Reload",         // clip du rechargement en cours (Reload ou Reload_Empty)
  rechargementAutomatique: false,          // true si le rechargement en cours a été lancé par le chargeur vide
  clicVideJoue: false,                     // un seul clic à vide par appui sur la gâchette
  armeRangee: false,                       // true pendant Draw / Holster : pas de tir ni de rechargement

  // Grenades
  grenades: CONFIG_GRENADE.nombre,         // grenades disponibles
  tempsLancer: 0,                          // temps restant du geste de lancer (le M4 est abaissé, pas de tir)

  // Outil de réglage des mains (touche H)
  reglageMains: 0,                         // 0 : éteint, 1 : main droite, 2 : main gauche, 3 : mains masquées
  mains: {
    droite: { ...CONFIG_MAINS.droite.position },
    gauche: { ...CONFIG_MAINS.gauche.position }
  }
};