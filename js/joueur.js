// =====================================================
// JOUEUR : déplacement, saut, gravité et collisions avec le décor
// =====================================================
import * as THREE from "three";
import { camera, sourisCapturee } from "./moteur.js";
import { CONFIG_DEPLACEMENT, CONFIG_SPRINT, HAUTEUR_SOL, HAUTEUR_YEUX } from "./config.js";
import { etat } from "./etat.js";
import { solides, distanceEmpreinte } from "./monde.js";

// Touches de déplacement actuellement enfoncées (modifiées par le module entrees.js)
export const touchesDeplacement = { avant: false, arriere: false, gauche: false, droite: false, sprint: false };

const vitesseJoueur = new THREE.Vector2(0, 0);   // vitesse horizontale actuelle (x, z) en mètres par seconde

// État vertical : saut et gravité
let vitesseVerticale = 0;    // vitesse verticale (mètres par seconde, positive = vers le haut)
let auSol = true;            // true quand le joueur touche le sol, une plateforme, une rampe ou une marche
let tamponSaut = 0;          // temps restant pendant lequel un appui sur la touche de saut est mémorisé

export function arreterDeplacement() {
  touchesDeplacement.avant = false;
  touchesDeplacement.arriere = false;
  touchesDeplacement.gauche = false;
  touchesDeplacement.droite = false;
  touchesDeplacement.sprint = false;
  etat.sprint = false;
  vitesseJoueur.set(0, 0);
  tamponSaut = 0;
}

// Place le joueur au sol (téléportation : départ, réapparition), regard horizontal, immobile
export function placerJoueur(x, z, yaw) {
  camera.position.set(x, HAUTEUR_SOL + HAUTEUR_YEUX, z);
  etat.yaw = yaw;
  etat.pitch = 0;
  camera.rotation.x = 0;
  camera.rotation.y = yaw;
  vitesseJoueur.set(0, 0);
  vitesseVerticale = 0;
  auSol = true;
}

export function declencherSaut() {
  tamponSaut = CONFIG_DEPLACEMENT.tamponSaut;
}

window.addEventListener("blur", arreterDeplacement);

// Hauteur du sol sous le joueur : le sol, ou le dessus de l'élément le plus haut que les pieds peuvent atteindre
// (un élément n'est un appui que si son dessus n'est pas plus haut que les pieds + hauteurMarche)
function hauteurSolSous(x, z, pieds) {
  const marge = 0.1;   // le centre du joueur peut dépasser un peu du bord sans tomber
  let sol = HAUTEUR_SOL;

  for (const s of solides) {
    if (x < s.minX - marge || x > s.maxX + marge || z < s.minZ - marge || z > s.maxZ + marge) continue;

    const px = Math.min(Math.max(x, s.minX), s.maxX);
    const pz = Math.min(Math.max(z, s.minZ), s.maxZ);
    const hauteur = s.hauteurEn(px, pz);

    if (hauteur <= pieds + CONFIG_DEPLACEMENT.hauteurMarche && hauteur > sol) sol = hauteur;
  }
  return sol;
}

// Repousse le joueur hors des éléments trop hauts pour être franchis (murs, côtés des rampes, plateformes) :
// il glisse le long des côtés au lieu de se coincer
function repousserHorsDesSolides(position, pieds) {
  const rayon = CONFIG_DEPLACEMENT.rayonJoueur;
  const marche = CONFIG_DEPLACEMENT.hauteurMarche;
  const tete = pieds + CONFIG_DEPLACEMENT.hauteurJoueur;

  for (let passe = 0; passe < 2; passe++) {
    for (const s of solides) {
      // Élément entièrement au-dessus de la tête (dessous d'une passerelle, d'un pont...) : on passe dessous
      if (s.bas >= tete) continue;

      if (position.x < s.minX - rayon || position.x > s.maxX + rayon ||
          position.z < s.minZ - rayon || position.z > s.maxZ + rayon) continue;

      // Point de l'empreinte le plus proche du joueur
      const procheX = Math.min(Math.max(position.x, s.minX), s.maxX);
      const procheZ = Math.min(Math.max(position.z, s.minZ), s.maxZ);

      // Dessus assez bas pour être franchi (marche, bas de rampe, plateforme sous les pieds) : il ne bloque pas
      if (s.hauteurEn(procheX, procheZ) <= pieds + marche) continue;

      const dx = position.x - procheX;
      const dz = position.z - procheZ;
      const distance2 = dx * dx + dz * dz;

      if (distance2 >= rayon * rayon) continue;

      if (distance2 > 1e-10) {
        const distance = Math.sqrt(distance2);
        const poussee = rayon - distance;
        position.x += (dx / distance) * poussee;
        position.z += (dz / distance) * poussee;
      } else {
        // Le centre du joueur est dans l'élément : on sort par le côté le plus proche
        const gauche = position.x - s.minX;
        const droite = s.maxX - position.x;
        const devant = position.z - s.minZ;
        const derriere = s.maxZ - position.z;
        const minimum = Math.min(gauche, droite, devant, derriere);
        if (minimum === gauche) position.x = s.minX - rayon;
        else if (minimum === droite) position.x = s.maxX + rayon;
        else if (minimum === devant) position.z = s.minZ - rayon;
        else position.z = s.maxZ + rayon;
      }
    }
  }
}

// Hauteur du plus bas plafond situé au-dessus de la tête du joueur (dessous d'une passerelle, d'un pont...)
function plafondAuDessus(x, z, pieds) {
  const rayon = CONFIG_DEPLACEMENT.rayonJoueur;
  const tete = pieds + CONFIG_DEPLACEMENT.hauteurJoueur;
  let plafond = Infinity;

  for (const s of solides) {
    if (s.bas < tete - 0.02) continue;
    if (x < s.minX - rayon || x > s.maxX + rayon || z < s.minZ - rayon || z > s.maxZ + rayon) continue;
    if (distanceEmpreinte(s, x, z) >= rayon) continue;
    if (s.bas < plafond) plafond = s.bas;
  }
  return plafond;
}

export function mettreAJourDeplacement(dt) {
  // Le joueur ne bouge que quand la souris est capturée et que le menu est fermé
  const actif = sourisCapturee() && !etat.menuOuvert && !etat.mort && !etat.partieTerminee;

  let avance = 0;
  let lateral = 0;
  if (actif) {
    avance = (touchesDeplacement.avant ? 1 : 0) - (touchesDeplacement.arriere ? 1 : 0);
    lateral = (touchesDeplacement.droite ? 1 : 0) - (touchesDeplacement.gauche ? 1 : 0);
  }

  // Les diagonales ne vont pas plus vite
  const norme = Math.hypot(avance, lateral);
  if (norme > 0) {
    avance /= norme;
    lateral /= norme;
  }

  // Sprint : touche maintenue en avançant, impossible pendant un rechargement ou arme rangée
  etat.sprint = actif && touchesDeplacement.sprint && avance > 0 && !etat.rechargement && !etat.armeRangee;
  const vitesse = CONFIG_DEPLACEMENT.vitesse * (etat.sprint ? CONFIG_SPRINT.multiplicateur : 1);

  // Direction dans le monde : "avant" suit le regard, "droite" est à sa droite
  const cibleX = (-Math.sin(etat.yaw) * avance + Math.cos(etat.yaw) * lateral) * vitesse;
  const cibleZ = (-Math.cos(etat.yaw) * avance - Math.sin(etat.yaw) * lateral) * vitesse;

  // Démarrage et arrêt progressifs
  const lissage = Math.min(1, dt * CONFIG_DEPLACEMENT.acceleration);
  vitesseJoueur.x += (cibleX - vitesseJoueur.x) * lissage;
  vitesseJoueur.y += (cibleZ - vitesseJoueur.y) * lissage;

  camera.position.x += vitesseJoueur.x * dt;
  camera.position.z += vitesseJoueur.y * dt;

  // Pieds du joueur avant le mouvement vertical
  let pieds = camera.position.y - HAUTEUR_YEUX;

  // Collisions avec le décor et limites de la zone de jeu
  repousserHorsDesSolides(camera.position, pieds);
  const limite = CONFIG_DEPLACEMENT.limite;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -limite, limite);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -limite, limite);

  // --- Saut, gravité, rampes et escaliers ---
  const sol = hauteurSolSous(camera.position.x, camera.position.z, pieds);

  if (tamponSaut > 0) tamponSaut -= dt;

  // Le joueur marche vers le vide (bord d'une plateforme, côté d'une rampe) : il tombe.
  // Une différence inférieure à hauteurMarche (descente d'une marche, d'une rampe) est suivie sans chute.
  if (auSol && pieds > sol + CONFIG_DEPLACEMENT.hauteurMarche) auSol = false;

  // Saut : possible seulement au sol
  if (actif && auSol && tamponSaut > 0) {
    vitesseVerticale = Math.sqrt(2 * CONFIG_DEPLACEMENT.gravite * CONFIG_DEPLACEMENT.hauteurSaut);
    auSol = false;
    tamponSaut = 0;
  }

  if (auSol) {
    pieds = sol;   // suit le sol : monte une marche ou une rampe, descend une pente
    vitesseVerticale = 0;
  } else {
    vitesseVerticale -= CONFIG_DEPLACEMENT.gravite * dt;
    let nouveauxPieds = pieds + vitesseVerticale * dt;

    // Plafond : la tête cogne le dessous d'une passerelle ou d'un pont
    if (vitesseVerticale > 0) {
      const plafond = plafondAuDessus(camera.position.x, camera.position.z, pieds);
      if (nouveauxPieds + CONFIG_DEPLACEMENT.hauteurJoueur > plafond) {
        nouveauxPieds = plafond - CONFIG_DEPLACEMENT.hauteurJoueur;
        vitesseVerticale = 0;
      }
    }
    pieds = nouveauxPieds;

    // Atterrissage : en descendant, dès que les pieds touchent le sol ou le dessus d'un élément
    if (vitesseVerticale <= 0 && pieds <= sol) {
      pieds = sol;
      vitesseVerticale = 0;
      auSol = true;
    }
  }

  camera.position.y = pieds + HAUTEUR_YEUX;
}