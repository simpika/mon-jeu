// =====================================================
// CARTE « ZONE INDUSTRIELLE » : 3 lanes, symétrique nord / sud (esprit Domination)
//
//   Nord = -Z. Zone de jeu : x de -24 à 24, z de -55 à 55.
//   Lanes : ouest x -24 à -13 (11 m), centre x -5 à 5 (10 m), est x 13 à 24 (11 m).
//
//                 SPAWN NORD (z -55 à -40)
//   ┌─────────┬────┬────────┬────┬─────────┐
//   │  OUEST  │////│ CENTRE │////│   EST   │   //// : entrepôts entre les lanes (8 m)
//   │conteneur│    │  rue   │    │voie f.  │        (fenêtres de tir à z ±14,
//   │         │    │        │    │         │         passages ouverts à z ±26)
//   │   [A] ═══════  [B]  ═══════  [C]    │   ═══ : passages couverts à z = 0
//   │         │    │        │    │         │
//   └─────────┴────┴────────┴────┴─────────┘
//                 SPAWN SUD (z 40 à 55)
//
//   Lignes à tenir (z ±22 à ±24) : sacs de sable, blocs de béton, séparateurs de voie.
//   Positions hautes : conteneur escaladable (ouest), balcon devant le spawn (centre),
//   poste d'aiguillage (est).
// =====================================================
import * as THREE from "three";
import { scene } from "./moteur.js";
import {
  creerSol, ajouterMarquage, ajouterBoite, ajouterRampe, ajouterEscalier, ajouterGardeCorps, ajouterObjectif
} from "./monde.js";

const C = {
  sol: 0x3b3d40,
  mur: 0x575c63,
  tole: 0x6b7178,
  toleFonce: 0x4c5158,
  beton: 0x8a8d90,
  betonFonce: 0x5d6166,
  jersey: 0xb5b0a4,
  sable: 0x9a8862,
  caisse: 0x8c6b3d,
  rouge: 0x8e3b2f,
  bleu: 0x2f5d8a,
  vert: 0x4f6b3a,
  orange: 0xb8692a,
  metal: 0x3d434b,
  rouille: 0x6e4a32,
  escalier: 0x9097a0,
  rampe: 0x858c96,
  camion: 0xc9cbcc,
  jaune: 0xc9a227,
  blanc: 0xd8d8d8
};

const BORD_X = 24;           // demi-largeur de la zone de jeu
const ENTREPOT_X = 9;        // centre des entrepôts qui séparent les lanes (de 5 à 13 m)
const HAUT_ENTREPOT = 6.5;   // hauteur des entrepôts
const HAUT_PLATEAU = 1.2;    // hauteur des plateaux d'objectifs

// -----------------------------------------------------
// Une moitié de la carte. s = 1 : moitié sud (z > 0) ; s = -1 : moitié nord, symétrique.
// Toutes les positions sont écrites pour la moitié sud ; les fonctions ci-dessous les reflètent.
// -----------------------------------------------------
function construireMoitie(s) {
  const zz = (z0, z1) => (s > 0 ? [z0, z1] : [-z1, -z0]);
  const sens = d => (s > 0 ? d : ({ "+z": "-z", "-z": "+z" }[d] || d));
  const boite = (cx, cz, l, p, yBas, yHaut, c) => ajouterBoite(cx, cz * s, l, p, yBas, yHaut, c);
  const rampe = (x0, x1, z0, z1, d, yBas, yHaut, c) => ajouterRampe(x0, x1, ...zz(z0, z1), sens(d), yBas, yHaut, c);
  const escalier = (x0, x1, z0, z1, d, yBas, n, h, c) => ajouterEscalier(x0, x1, ...zz(z0, z1), sens(d), yBas, n, h, c);
  const gardeCorps = (x0, z0, x1, z1, y) => ajouterGardeCorps(x0, z0 * s, x1, z1 * s, y);

  // ---------------------------------------------------
  // ENTREPÔTS entre les lanes (x de -13 à -5 et de 5 à 13)
  // ---------------------------------------------------
  [-ENTREPOT_X, ENTREPOT_X].forEach(xc => {
    boite(xc, 7.75, 8, 10.5, 0, HAUT_ENTREPOT, C.tole);              // de z 2,5 à 13
    // Fenêtre de tir (z 13 à 15) : ouverture de 1,2 à 2,3 m, on tire au travers sans pouvoir passer
    boite(xc, 14, 8, 2, 0, 1.2, C.toleFonce);
    boite(xc, 14, 8, 2, 2.3, HAUT_ENTREPOT, C.tole);
    boite(xc, 19.5, 8, 9, 0, HAUT_ENTREPOT, C.toleFonce);           // de z 15 à 24
    // Passage ouvert entre les lanes : z 24 à 28
    boite(xc, 34, 8, 12, 0, HAUT_ENTREPOT, C.tole);                 // de z 28 à 40
  });

  // ---------------------------------------------------
  // LANE OUEST (x -24 à -13) : parc à conteneurs (objectif A)
  // ---------------------------------------------------
  escalier(-20, -17, 5, 7.4, "-z", 0, 6, 0.2, C.escalier);           // accès au plateau A
  boite(-21, 3.2, 1.6, 0.5, HAUT_PLATEAU, 2.1, C.betonFonce);        // murets sur le plateau
  boite(-16, 3.2, 1.6, 0.5, HAUT_PLATEAU, 2.1, C.betonFonce);

  // Conteneur escaladable : caisse de 0,9 m → caisse de 1,8 m → toit du conteneur (2,6 m), vue sur A
  boite(-14.5, 8.5, 2.4, 6, 0, 2.6, C.bleu);
  boite(-15.7, 12.2, 1.2, 1.2, 0, 0.9, C.caisse);
  boite(-14.5, 12.2, 1.2, 1.2, 0, 1.8, C.caisse);

  boite(-20, 17, 2.4, 6, 0, 2.6, C.orange);                          // conteneur de couvert
  // Ligne à tenir : sacs de sable
  boite(-21.5, 22, 3, 0.9, 0, 1.1, C.sable);
  boite(-15.5, 23, 3, 0.9, 0, 1.1, C.sable);
  // Près du spawn : conteneur long et pile de deux conteneurs
  boite(-22.6, 33, 2.4, 12, 0, 2.6, C.rouge);
  boite(-15.5, 31, 2.4, 6, 0, 2.6, C.bleu);
  boite(-15.5, 31, 2.4, 6, 2.6, 5.2, C.vert);

  // ---------------------------------------------------
  // LANE CENTRALE (x -5 à 5) : rue de l'usine (objectif B)
  // ---------------------------------------------------
  escalier(-1.5, 1.5, 4, 6.4, "-z", 0, 6, 0.2, C.escalier);          // accès au plateau B
  boite(-2.1, 2.9, 1.6, 0.5, HAUT_PLATEAU, 2.1, C.betonFonce);       // murets sur le plateau
  boite(2.1, 2.9, 1.6, 0.5, HAUT_PLATEAU, 2.1, C.betonFonce);

  // Pile de conteneurs au milieu de la rue : coupe la longue ligne de vue spawn → spawn
  boite(0, 13, 4.5, 2.4, 0, 2.6, C.rouge);
  boite(0, 13, 4.5, 2.4, 2.6, 5.2, C.orange);
  boite(-3.8, 8, 1.2, 1.2, 0, 1.2, C.caisse);
  boite(3.6, 19, 1.4, 1.4, 0, 1.2, C.caisse);
  boite(3.6, 19, 0.9, 0.9, 1.2, 2.0, C.caisse);

  // Ligne à tenir : séparateurs de voie en béton
  boite(-3, 24, 2.4, 0.6, 0, 1.1, C.jersey);
  boite(3, 24.5, 2.4, 0.6, 0, 1.1, C.jersey);

  // Balcon devant le spawn (2,6 m) : vue sur toute la rue, escaliers côté spawn
  boite(0, 38.5, 10, 3, 2.3, 2.6, C.metal);
  [-4.7, 0, 4.7].forEach(x => boite(x, 37.3, 0.4, 0.4, 0, 2.3, C.betonFonce));
  gardeCorps(-5, 37.05, 5, 37.05, 2.6);
  gardeCorps(-4.95, 37, -4.95, 40, 2.6);
  gardeCorps(4.95, 37, 4.95, 40, 2.6);
  escalier(-5, -3.5, 40, 46.5, "-z", 0, 13, 0.2, C.escalier);
  escalier(3.5, 5, 40, 46.5, "-z", 0, 13, 0.2, C.escalier);

  // ---------------------------------------------------
  // LANE EST (x 13 à 24) : voie ferrée (objectif C)
  // ---------------------------------------------------
  rampe(17, 20, 5, 10, "-z", 0, HAUT_PLATEAU, C.rampe);              // accès au plateau C
  boite(16, 3.2, 1.6, 0.5, HAUT_PLATEAU, 2.1, C.betonFonce);         // murets sur le plateau
  boite(21, 3.2, 1.6, 0.5, HAUT_PLATEAU, 2.1, C.betonFonce);
  boite(16, 14, 1.5, 1.5, 0, 1.4, C.caisse);
  boite(14, 8, 1, 1, 0, 1.2, C.metal);                               // armoire électrique

  // Voie ferrée (rails franchissables), du plateau C jusqu'au spawn
  boite(21.3, 22.75, 0.12, 34.5, 0, 0.12, C.metal);
  boite(22.7, 22.75, 0.12, 34.5, 0, 0.12, C.metal);

  // Wagon sur la voie (on tire sous la caisse, entre les bogies)
  boite(22, 20, 3, 12, 0.7, 3.4, C.rouille);
  boite(22, 15.5, 2.4, 2.2, 0, 0.7, C.metal);
  boite(22, 24.5, 2.4, 2.2, 0, 0.7, C.metal);

  // Ligne à tenir : blocs de béton
  boite(15, 22, 2.4, 1.2, 0, 1.1, C.jersey);
  boite(18.5, 23, 2.4, 1.2, 0, 1.1, C.jersey);

  // Poste d'aiguillage (3 m) : vue sur la lane est, escalier contre l'entrepôt
  boite(21, 33.25, 4, 4.5, 2.7, 3.0, C.metal);
  [[19.2, 31.2], [22.8, 31.2], [22.8, 35.3]].forEach(([x, z]) => boite(x, z, 0.4, 0.4, 0, 2.7, C.betonFonce));
  gardeCorps(19, 31.05, 23, 31.05, 3.0);
  gardeCorps(22.95, 31, 22.95, 35.5, 3.0);
  gardeCorps(19, 35.45, 23, 35.45, 3.0);
  gardeCorps(19.05, 31, 19.05, 33.5, 3.0);
  escalier(13, 19, 33.5, 35.5, "+x", 0, 15, 0.2, C.escalier);

  // ---------------------------------------------------
  // SPAWN (z 40 à 55)
  // ---------------------------------------------------
  boite(-18, 48.5, 2.6, 7, 0.6, 3.4, C.camion);                      // camion : remorque, cabine, essieux
  boite(-18, 44, 2.6, 2, 0, 2.6, C.bleu);
  boite(-18, 46.2, 2.2, 1, 0, 0.6, C.metal);
  boite(-18, 51, 2.2, 1, 0, 0.6, C.metal);
  boite(18, 49, 4, 3.5, 0, 2.8, C.toleFonce);                        // local technique
  boite(8, 50, 2, 1.2, 0, 1.0, C.caisse);
  boite(-9, 47, 1.5, 1.5, 0, 1.2, C.caisse);

  // Limite du spawn peinte au sol
  ajouterMarquage(-BORD_X, BORD_X, ...zz(40.3, 40.6), C.blanc);
}

// Crée la carte et renvoie le point de départ du joueur (spawn sud, regard vers le nord)
export function creerCarteIndustrielle() {
  scene.background = new THREE.Color(0x8f98a2);   // ciel couvert
  scene.fog = new THREE.Fog(0x8f98a2, 45, 150);
  creerSol(C.sol, 0.3);

  // Murs d'enceinte (7 m)
  ajouterBoite(0, -55.5, 2 * BORD_X + 2, 1, 0, 7, C.mur);
  ajouterBoite(0, 55.5, 2 * BORD_X + 2, 1, 0, 7, C.mur);
  ajouterBoite(-BORD_X - 0.5, 0, 1, 112, 0, 7, C.mur);
  ajouterBoite(BORD_X + 0.5, 0, 1, 112, 0, 7, C.mur);

  // Passages couverts à z = 0 entre les lanes (on passe sous le toit)
  ajouterBoite(-ENTREPOT_X, 0, 8, 5, 3.2, HAUT_ENTREPOT, C.toleFonce);
  ajouterBoite(ENTREPOT_X, 0, 8, 5, 3.2, HAUT_ENTREPOT, C.toleFonce);

  // Plateaux d'objectifs (1,2 m) et rampes depuis les passages couverts
  ajouterBoite(-18.5, 0, 7, 10, 0, HAUT_PLATEAU, C.beton);          // A : x -22 à -15
  ajouterBoite(0, 0, 6, 8, 0, HAUT_PLATEAU, C.beton);               // B : x -3 à 3
  ajouterBoite(18.5, 0, 7, 10, 0, HAUT_PLATEAU, C.beton);           // C : x 15 à 22
  ajouterRampe(-15, -13, -1.5, 1.5, "-x", 0, HAUT_PLATEAU, C.rampe);
  ajouterRampe(-5, -3, -1.5, 1.5, "+x", 0, HAUT_PLATEAU, C.rampe);
  ajouterRampe(3, 5, -1.5, 1.5, "-x", 0, HAUT_PLATEAU, C.rampe);
  ajouterRampe(13, 15, -1.5, 1.5, "+x", 0, HAUT_PLATEAU, C.rampe);
  ajouterObjectif("A", -18.5, 0, HAUT_PLATEAU);
  ajouterObjectif("B", 0, 0, HAUT_PLATEAU);
  ajouterObjectif("C", 18.5, 0, HAUT_PLATEAU);

  // Bords de la rue centrale peints en jaune
  ajouterMarquage(-4.75, -4.6, -40, 40, C.jaune);
  ajouterMarquage(4.6, 4.75, -40, 40, C.jaune);

  construireMoitie(1);
  construireMoitie(-1);

  return { x: 0, z: 52, yaw: 0 };
}
