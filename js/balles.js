// =====================================================
// BALLES : traits lumineux et déclenchement des impacts
// =====================================================
import * as THREE from "three";
import { scene } from "./moteur.js";
import { CONFIG_TIR, CONFIG_CIBLE, CONFIG_RETICULE } from "./config.js";
import { creerImpact } from "./effets.js";
import { cible, infligerDegats } from "./cible.js";
import { joueurTouchable } from "./joueursDistants.js";
import { signalerTouche } from "./partie.js";
import { afficherDegats, declencherTouche } from "./reticule.js";
import { jouerSonHitmarker } from "./audio.js";

const geometrieTrait = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
const materiauTrait = new THREE.MeshBasicMaterial({
  color: CONFIG_TIR.couleurTrait,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const axeY = new THREE.Vector3(0, 1, 0);
const balles = [];

// Modèle de la balle (munition 5.56x45 mm du FBX), fourni par arme.js une fois le modèle chargé.
// La géométrie est centrée, pointe vers +Y et mesure CONFIG_TIR.longueurBalle.
let modeleBalle = null;   // { geometrie, materiau }

export function definirModeleBalle(geometrie, materiau) {
  modeleBalle = { geometrie, materiau };
}

// impact : résultat du raycast (ou undefined si la balle ne touche rien)
// distante : tir d'un autre joueur (affiché seulement : il calcule lui-même ses touches)
export function creerBalle(origine, direction, impact, distante = false) {
  const mesh = new THREE.Mesh(geometrieTrait, materiauTrait);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  // Balle texturée en tête du trait
  let projectile = null;
  if (modeleBalle) {
    projectile = new THREE.Mesh(modeleBalle.geometrie, modeleBalle.materiau);
    projectile.quaternion.setFromUnitVectors(axeY, direction);
    projectile.visible = false;
    scene.add(projectile);
  }

  const balle = {
    mesh, projectile, origine, direction, distante,
    distance: 0,
    portee: CONFIG_TIR.portee,
    impact: null,
    impactFait: false
  };

  if (impact) {
    balle.portee = impact.distance;
    // Normale de la surface touchée, exprimée dans le monde
    const normale = impact.face
      ? impact.face.normal.clone().transformDirection(impact.object.matrixWorld)
      : direction.clone().negate();
    if (normale.dot(direction) > 0) normale.negate(); // toujours face au tireur
    balle.impact = {
      point: impact.point.clone(),
      normale,
      objet: impact.object,
      generation: cible.generation   // permet d'ignorer la balle si la cible a changé de place entre-temps
    };
  }

  balles.push(balle);
}

// Fraction des dégâts conservée à une distance donnée (1 = dégâts complets)
function facteurDistance(distance) {
  const c = CONFIG_CIBLE.chuteDegats;
  if (!c || !c.actif) return 1;
  if (distance <= c.distancePleine) return 1;
  if (distance >= c.distanceReduite) return c.degatsMinimum;
  const t = (distance - c.distancePleine) / (c.distanceReduite - c.distancePleine);
  return 1 - t * (1 - c.degatsMinimum);
}

// Appelée quand la tête du trait atteint la surface touchée
function traiterImpact(b) {
  const i = b.impact;

  // Avatar d'un autre joueur (multijoueur)
  const idJoueur = i.objet && i.objet.userData.joueurId;
  if (idJoueur) {
    if (b.distante) { creerImpact(i.point, i.normale, b.portee, true); return; }
    if (!joueurTouchable(idJoueur)) return;   // mort ou devenu allié depuis le tir
    creerImpact(i.point, i.normale, b.portee, true);
    const indexZone = i.objet.userData.zone;
    const zone = CONFIG_CIBLE.zones[indexZone];
    const degats = Math.max(1, Math.round(zone.degats * facteurDistance(b.portee)));
    signalerTouche(idJoueur, degats, indexZone, "m4", b.origine);   // l'hôte applique les dégâts
    afficherDegats(zone, degats);
    jouerSonHitmarker(indexZone === 0);
    declencherTouche(CONFIG_RETICULE.dureeTouche);
    return;
  }

  if (i.objet && i.objet.userData.estCible) {
    if (b.distante) { creerImpact(i.point, i.normale, b.portee, true); return; }
    // La cible a disparu ou changé de place depuis le tir : la balle ne touche rien
    if (!cible.vivante || i.generation !== cible.generation) return;
    creerImpact(i.point, i.normale, b.portee, true);

    // Les dégâts dépendent de la partie du corps touchée (tête, torse, reste du corps)
    // et baissent avec la distance parcourue par la balle
    const zone = CONFIG_CIBLE.zones[i.objet.userData.zone];
    const degats = Math.max(1, Math.round(zone.degats * facteurDistance(b.portee)));
    infligerDegats(degats, zone);
    return;
  }

  creerImpact(i.point, i.normale, b.portee);
}

export function mettreAJourBalles(dt) {
  for (let i = balles.length - 1; i >= 0; i--) {
    const b = balles[i];
    b.distance += CONFIG_TIR.vitesseBalle * dt;

    // La tête du trait atteint la surface : on déclenche l'impact
    if (b.impact && !b.impactFait && b.distance >= b.portee) {
      b.impactFait = true;
      traiterImpact(b);
    }

    if (b.distance > b.portee + CONFIG_TIR.longueurTrait) {
      scene.remove(b.mesh);
      if (b.projectile) scene.remove(b.projectile);
      balles.splice(i, 1);
      continue;
    }

    // La balle avance jusqu'à la surface touchée, puis disparaît
    if (b.projectile) {
      b.projectile.visible = b.distance < b.portee;
      b.projectile.position.copy(b.origine).addScaledVector(b.direction, Math.min(b.distance, b.portee));
    }

    if (!CONFIG_TIR.afficherTrait) continue;

    const distTete = Math.min(b.distance, b.portee);
    const distQueue = Math.max(0, b.distance - CONFIG_TIR.longueurTrait);
    const longueur = distTete - distQueue;

    if (longueur > 0.001) {
      const milieu = (distTete + distQueue) / 2;
      b.mesh.position.copy(b.origine).addScaledVector(b.direction, milieu);
      b.mesh.quaternion.setFromUnitVectors(axeY, b.direction);
      b.mesh.scale.set(1, longueur, 1);
      b.mesh.visible = true;
    } else {
      b.mesh.visible = false;
    }
  }
}