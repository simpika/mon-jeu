// =====================================================
// CIBLE : silhouette humaine avec points de vie et zones de dégâts
// =====================================================
import * as THREE from "three";
import { scene, camera } from "./moteur.js";
import { CONFIG_CIBLE, CONFIG_DEPLACEMENT, CONFIG_MUNITIONS, CONFIG_RETICULE, CONFIG_GRENADE, HAUTEUR_SOL } from "./config.js";
import { mettreAJourHud } from "./munitions.js";
import { etat } from "./etat.js";
import { surfaces, solides, distanceEmpreinte } from "./monde.js";
import { creerImpact, creerEtincelles } from "./effets.js";
import { declencherTouche, afficherDegats } from "./reticule.js";
import { jouerSonHitmarker } from "./audio.js";
import { creerSilhouette } from "./silhouette.js";

export const cible = {
  groupe: null,                  // silhouette complète (posée sur le sol, tournée vers le joueur)
  parties: [],                   // éléments touchables : tête, cou, torse, bras, jambes
  materiaux: [],                 // un matériau par zone
  barreRemplissage: null,        // partie colorée de la barre de vie
  vie: 0,
  vivante: false,
  generation: 0,                 // augmente à chaque réapparition
  delai: 0,                      // temps restant avant la réapparition
  flash: 0                       // éclaircissement bref quand elle est touchée
};

let dernierePosition = null;

function creerCible() {
  const zones = CONFIG_CIBLE.zones;

  // Un matériau par zone (tête, torse, reste du corps)
  cible.materiaux = zones.map(zone => new THREE.MeshStandardMaterial({
    color: zone.couleur,
    roughness: 0.55,
    metalness: 0.1,
    emissive: new THREE.Color(zone.couleur),
    emissiveIntensity: 0.15
  }));

  // Silhouette commune (tête, torse, cou, bras, jambes), partagée avec les avatars des joueurs
  const { groupe, parties } = creerSilhouette(cible.materiaux);
  parties.forEach(partie => { partie.userData.estCible = true; });
  cible.parties = parties;

  // Barre de vie au-dessus de la tête
  if (CONFIG_CIBLE.barreVie) {
    const barre = new THREE.Group();
    barre.position.set(0, 1.95, 0);

    const fond = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );

    const geometrieRemplissage = new THREE.PlaneGeometry(0.66, 0.05);
    geometrieRemplissage.translate(0.33, 0, 0);   // l'extrémité gauche sert d'ancre à la mise à l'échelle
    const remplissage = new THREE.Mesh(
      geometrieRemplissage,
      new THREE.MeshBasicMaterial({ color: 0x44dd66 })
    );
    remplissage.position.set(-0.33, 0, 0.002);

    barre.add(fond, remplissage);
    groupe.add(barre);
    cible.barreRemplissage = remplissage;
  }

  groupe.scale.setScalar(CONFIG_CIBLE.echelle);
  groupe.visible = false;
  scene.add(groupe);
  cible.groupe = groupe;
}

function mettreAJourBarre() {
  if (!cible.barreRemplissage) return;
  const ratio = Math.max(0, cible.vie / CONFIG_CIBLE.vie);
  cible.barreRemplissage.scale.x = Math.max(ratio, 0.0001);
  cible.barreRemplissage.material.color.setHSL(0.33 * ratio, 0.75, 0.5);   // vert → rouge
}

// Choisit une position au sol devant le joueur, à l'écart du décor et entièrement visible
const raycasterApparition = new THREE.Raycaster();

function choisirPositionCible() {
  const echelle = CONFIG_CIBLE.echelle;
  const limite = CONFIG_DEPLACEMENT.limite - 2;
  const demiOuverture = THREE.MathUtils.degToRad(CONFIG_CIBLE.ouvertureAngle) / 2;
  const hauteursVisibles = [0.2, 1.1, 1.7].map(h => h * echelle);   // pieds, torse, tête
  const joueur = camera.position;
  const marge = 0.5 * echelle + 0.4;

  for (let essai = 0; essai < 60; essai++) {
    const angle = etat.yaw + (Math.random() * 2 - 1) * demiOuverture;
    const distance = CONFIG_CIBLE.distanceMin +
      Math.random() * (CONFIG_CIBLE.distanceMax - CONFIG_CIBLE.distanceMin);
    const x = joueur.x - Math.sin(angle) * distance;
    const z = joueur.z - Math.cos(angle) * distance;

    // Dans la zone de jeu
    if (Math.abs(x) > limite || Math.abs(z) > limite) continue;

    const position = new THREE.Vector3(x, HAUTEUR_SOL, z);

    // Pas dans un mur, une caisse, une rampe, un escalier, un pilier...
    if (solides.some(s => s.bloqueSol && distanceEmpreinte(s, x, z) < marge)) continue;

    // Pas au même endroit que la fois précédente
    if (dernierePosition && position.distanceTo(dernierePosition) < 2) continue;

    // Ligne de vue dégagée depuis les yeux du joueur vers les pieds, le torse et la tête
    const toutVisible = hauteursVisibles.every(h => {
      const direction = new THREE.Vector3(x, HAUTEUR_SOL + h, z).sub(joueur);
      const longueur = direction.length();
      raycasterApparition.set(joueur, direction.normalize());
      raycasterApparition.far = longueur - 0.3;
      return raycasterApparition.intersectObjects(surfaces, false).length === 0;
    });
    if (!toutVisible) continue;

    return position;
  }

  // Secours : droit devant le joueur
  return new THREE.Vector3(
    THREE.MathUtils.clamp(joueur.x - Math.sin(etat.yaw) * 12, -limite, limite),
    HAUTEUR_SOL,
    THREE.MathUtils.clamp(joueur.z - Math.cos(etat.yaw) * 12, -limite, limite)
  );
}

// Tourne la silhouette pour qu'elle fasse face au joueur
function orienterVersJoueur() {
  const dx = camera.position.x - cible.groupe.position.x;
  const dz = camera.position.z - cible.groupe.position.z;
  cible.groupe.rotation.y = Math.atan2(dx, dz);
}

function faireApparaitre() {
  const position = choisirPositionCible();
  dernierePosition = position.clone();

  cible.groupe.position.copy(position);
  orienterVersJoueur();
  cible.groupe.visible = true;
  cible.groupe.updateMatrixWorld(true);

  cible.vie = CONFIG_CIBLE.vie;
  cible.vivante = true;
  cible.generation++;
  mettreAJourBarre();

  cible.parties.forEach(partie => {
    if (!surfaces.includes(partie)) surfaces.push(partie);
  });
}

function eliminerCible() {
  cible.vivante = false;

  // Récompenses : un chargeur de plus en réserve, et les grenades remises au maximum
  etat.chargeurs += CONFIG_MUNITIONS.chargeursParElimination;
  etat.grenades = CONFIG_GRENADE.nombre;
  mettreAJourHud();
  cible.delai = CONFIG_CIBLE.delaiReapparition;
  cible.groupe.visible = false;

  // Elle ne doit plus recevoir de balles tant qu'elle est absente
  cible.parties.forEach(partie => {
    const index = surfaces.indexOf(partie);
    if (index !== -1) surfaces.splice(index, 1);
  });

  // Éclatement : gerbe d'étincelles, éclat lumineux et son au niveau du torse, orientés vers le joueur
  const centre = cible.groupe.localToWorld(new THREE.Vector3(0, 1.1, 0));
  const versJoueur = camera.position.clone().sub(centre).normalize();
  creerImpact(centre, versJoueur, centre.distanceTo(camera.position), true);
  creerEtincelles(centre, versJoueur);
  creerEtincelles(centre, versJoueur);
}

export function infligerDegats(degats, zone) {
  if (!cible.vivante) return;

  cible.vie = Math.max(0, cible.vie - degats);
  mettreAJourBarre();
  cible.flash = 0.08;
  afficherDegats(zone, degats);
  jouerSonHitmarker(zone === CONFIG_CIBLE.zones[0]);   // zones[0] = tête

  // Le réticule devient rouge
  declencherTouche(CONFIG_RETICULE.dureeTouche);

  if (cible.vie <= 0) {
    declencherTouche(CONFIG_RETICULE.dureeToucheElimination);
    eliminerCible();
  }
}

// Active ou retire la cible d'entraînement (retirée pendant une partie multijoueur)
let cibleActive = true;
export function activerCible(actif) {
  if (!cible.groupe || actif === cibleActive) return;
  cibleActive = actif;
  if (actif) {
    faireApparaitre();
  } else {
    cible.vivante = false;
    cible.groupe.visible = false;
    cible.parties.forEach(partie => {
      const index = surfaces.indexOf(partie);
      if (index !== -1) surfaces.splice(index, 1);
    });
  }
}

export function mettreAJourCible(dt) {
  if (!cible.groupe || !cibleActive) return;

  // Réapparition après le délai
  if (!cible.vivante) {
    cible.delai -= dt;
    if (cible.delai <= 0) faireApparaitre();
  } else {
    orienterVersJoueur();   // la silhouette suit le joueur du regard quand il se déplace
  }

  // Éclaircissement bref quand elle est touchée
  if (cible.flash > 0) cible.flash -= dt;
  const intensite = cible.flash > 0 ? 1.0 : 0.15;
  cible.materiaux.forEach(materiau => { materiau.emissiveIntensity = intensite; });
}

// À appeler une fois le monde créé
export function initialiserCible() {
  if (!CONFIG_CIBLE.actif) return;
  creerCible();
  faireApparaitre();
}