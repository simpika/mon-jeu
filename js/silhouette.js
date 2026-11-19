// =====================================================
// SILHOUETTE HUMAINE (1,80 m) : sert à la cible d'entraînement et aux avatars des autres joueurs
// Chaque partie porte sa zone de dégâts : userData.zone = 0 (tête), 1 (torse) ou 2 (reste du corps)
// La silhouette regarde vers +Z (son repère local)
// =====================================================
import * as THREE from "three";

// materiaux : un matériau par zone [tête, torse, reste du corps]
export function creerSilhouette(materiaux) {
  const groupe = new THREE.Group();
  const parties = [];

  function ajouterPartie(geometrie, indexZone, x, y) {
    const partie = new THREE.Mesh(geometrie, materiaux[indexZone]);
    partie.position.set(x, y, 0);
    partie.userData.zone = indexZone;
    groupe.add(partie);
    parties.push(partie);
    return partie;
  }

  // Tête (zone 1)
  const geometrieTete = new THREE.SphereGeometry(0.115, 24, 16);
  geometrieTete.scale(1, 1.15, 0.85);
  const tete = ajouterPartie(geometrieTete, 0, 0, 1.66);

  // Torse (zone 2)
  ajouterPartie(new THREE.BoxGeometry(0.46, 0.62, 0.16), 1, 0, 1.16);

  // Cou, bras et jambes (zone 3)
  ajouterPartie(new THREE.BoxGeometry(0.12, 0.10, 0.12), 2, 0, 1.52);                 // cou
  ajouterPartie(new THREE.BoxGeometry(0.12, 0.62, 0.13), 2, -0.31, 1.16);             // bras gauche
  ajouterPartie(new THREE.BoxGeometry(0.12, 0.62, 0.13), 2, 0.31, 1.16);              // bras droit
  ajouterPartie(new THREE.BoxGeometry(0.19, 0.85, 0.15), 2, -0.105, 0.425);           // jambe gauche
  ajouterPartie(new THREE.BoxGeometry(0.19, 0.85, 0.15), 2, 0.105, 0.425);            // jambe droite

  return { groupe, parties, tete };
}
