// =====================================================
// M4 VU PAR LES AUTRES JOUEURS : forme du fusil seule (sans les bras), extraite du modèle de la vue subjective
// arme.js la fournit une fois le modèle chargé ; les avatars la reçoivent dès qu'elle est prête.
// La géométrie est centrée, canon vers +Z, longueur CONFIG_PERSONNAGES.longueurArme.
// =====================================================
import * as THREE from "three";
import { CONFIG_PERSONNAGES } from "./config.js";

const armeTiers = { geometrie: null, materiau: null };
const ecouteurs = [];

export function armeTiersPrete() { return armeTiers.geometrie ? armeTiers : null; }
export function surArmeTiers(fonction) {
  if (armeTiers.geometrie) fonction(armeTiers);
  else ecouteurs.push(fonction);
}

// geometrie : triangles du fusil dans le repère de l'arme de la vue subjective (canon vers -Z)
export function definirArmeTiers(geometrie, materiau) {
  geometrie.computeBoundingBox();
  const centre = geometrie.boundingBox.getCenter(new THREE.Vector3());
  geometrie.translate(-centre.x, -centre.y, -centre.z);
  const taille = geometrie.boundingBox.getSize(new THREE.Vector3());
  const longueur = Math.max(taille.x, taille.y, taille.z) || 1;
  geometrie.scale(CONFIG_PERSONNAGES.longueurArme / longueur, CONFIG_PERSONNAGES.longueurArme / longueur, CONFIG_PERSONNAGES.longueurArme / longueur);
  geometrie.rotateY(Math.PI);   // canon vers +Z (devant de l'avatar)
  geometrie.computeVertexNormals();
  geometrie.computeBoundingSphere();
  armeTiers.geometrie = geometrie;
  armeTiers.materiau = materiau;
  ecouteurs.splice(0).forEach(fonction => fonction(armeTiers));
}
