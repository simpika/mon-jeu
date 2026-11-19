// =====================================================
// ARME : modèle FBX, mains, recul, flash de bouche
// =====================================================
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { definirArmeTiers, armeTiersPrete } from "./armeTiers.js";
import { camera } from "./moteur.js";
import {
  CONFIG_ARME, CONFIG_MAINS, CONFIG_MUNITIONS, CONFIG_RECUL, CONFIG_SPRINT, CONFIG_TIR, CONFIG_VISEE, CONFIG_GRENADE
} from "./config.js";
import { etat } from "./etat.js";
import { textureFlash } from "./effets.js";
import { facteurRechargement } from "./munitions.js";
import { definirModeleBalle } from "./balles.js";

// L'arme est attachée à la caméra, comme dans un FPS
export const arme = new THREE.Group();
arme.position.set(CONFIG_ARME.position.x, CONFIG_ARME.position.y, CONFIG_ARME.position.z);
camera.add(arme);

// Orientation de base de l'arme : le canon (axe -Z) pointe vers le réticule,
// c'est-à-dire vers le centre de l'écran à CONFIG_VISEE.distance mètres
const quaternionVisee = new THREE.Quaternion();
{
  const pointVise = new THREE.Vector3(0, 0, -CONFIG_VISEE.distance);
  const directionCanon = pointVise.sub(arme.position).normalize();
  quaternionVisee.setFromUnitVectors(new THREE.Vector3(0, 0, -1), directionCanon);
}
arme.quaternion.copy(quaternionVisee);

// Boîte grise provisoire, retirée quand le modèle est chargé
const temporaire = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.1, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x555555 })
);
arme.add(temporaire);

// =====================================================
// MAINS : gants et avant-bras en formes simples (attachés à l'arme)
// =====================================================
const mains = new THREE.Group();   // suit l'arme : recul, abaissement du rechargement, orientation vers le réticule
mains.visible = CONFIG_MAINS.actif;
arme.add(mains);

const materiauGant = new THREE.MeshStandardMaterial({
  color: CONFIG_MAINS.couleurGant, roughness: 0.75, metalness: 0.15
});
const materiauManchette = new THREE.MeshStandardMaterial({
  color: CONFIG_MAINS.couleurManchette, roughness: 0.45, metalness: 0.6
});

const axeHaut = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

// Crée une main (poing refermé sur la prise) et son avant-bras.
// type "poignee" : poignée verticale (main qui tire) ; type "garde-main" : tube horizontal (main d'appui)
function creerMain(config) {
  const groupe = new THREE.Group();
  const poignee = config.type === "poignee";
  const R = config.rayonPrise;           // rayon de ce que la main serre
  const rayonDoigt = 0.0105;
  const ecartDoigts = 0.022;
  const rayonAnneau = R + rayonDoigt;    // les doigts épousent la prise

  // Quatre doigts : des arcs qui s'enroulent autour de la prise
  const debut = (poignee ? 0 : -100) * DEG;
  const arc = (poignee ? 170 : 150) * DEG;
  [-1.5, -0.5, 0.5, 1.5].forEach(i => {
    const doigt = new THREE.Group();     // dessiné dans le plan xy, puis orienté selon le type de prise
    const geometrie = new THREE.TorusGeometry(rayonAnneau, rayonDoigt, 8, 24, arc);
    geometrie.rotateZ(debut);
    doigt.add(new THREE.Mesh(geometrie, materiauGant));

    // Bouts arrondis aux deux extrémités de l'arc
    [debut, debut + arc].forEach(angle => {
      const bout = new THREE.Mesh(new THREE.SphereGeometry(rayonDoigt, 10, 8), materiauGant);
      bout.position.set(rayonAnneau * Math.cos(angle), rayonAnneau * Math.sin(angle), 0);
      doigt.add(bout);
    });

    if (poignee) {
      doigt.rotation.x = -Math.PI / 2;               // arcs à plat, empilés le long de la poignée verticale
      doigt.position.set(0, i * ecartDoigts, 0);
    } else {
      doigt.position.set(0, 0, i * ecartDoigts);     // arcs empilés le long du garde-main horizontal
    }
    groupe.add(doigt);
  });

  // Dos de la main (ellipsoïde) : à l'arrière de la poignée, ou sous le garde-main
  const dos = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), materiauGant);
  if (poignee) {
    dos.scale.set(0.038, 0.05, 0.03);
    dos.position.set(R * 0.75, 0, R * 0.9);
  } else {
    dos.scale.set(0.042, 0.024, 0.05);
    dos.position.set(-R * 0.15, -R * 0.95, 0);
  }
  groupe.add(dos);

  // Pouce : couché le long de l'arme, côté gauche, pointé vers l'avant du canon
  const pouce = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.04, 4, 10), materiauGant);
  pouce.rotation.x = Math.PI / 2;
  pouce.position.set(-(R + 0.011), poignee ? 0.017 : 0.004, poignee ? -0.005 : -0.012);
  groupe.add(pouce);

  // Plaque de protection sur le dos de la main
  const plaque = new THREE.Mesh(
    poignee ? new THREE.BoxGeometry(0.06, 0.07, 0.012) : new THREE.BoxGeometry(0.06, 0.012, 0.07),
    materiauManchette
  );
  if (poignee) plaque.position.set(R * 0.75, 0, R * 0.9 + 0.029);
  else plaque.position.set(-R * 0.15, -R * 0.95 - 0.023, 0);
  groupe.add(plaque);

  // Poignet et avant-bras : ils partent du dos de la main vers l'arrière et le bas de l'écran
  const poignet = poignee
    ? new THREE.Vector3(R * 0.75, -0.004, R * 0.9 + 0.033)
    : new THREE.Vector3(-R * 0.15, -R * 0.95, 0.05);
  const direction = new THREE.Vector3(config.avantBras.x, config.avantBras.y, config.avantBras.z).normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(axeHaut, direction);

  // Cylindre le long de l'avant-bras, de la distance "de" à la distance "a" du poignet
  // (rayonLoin : côté coude, rayonPoignet : côté main)
  function ajouterCylindre(rayonLoin, rayonPoignet, de, a, materiau) {
    const cylindre = new THREE.Mesh(new THREE.CylinderGeometry(rayonLoin, rayonPoignet, a - de, 16), materiau);
    cylindre.quaternion.copy(orientation);
    cylindre.position.copy(poignet).addScaledVector(direction, (de + a) / 2);
    groupe.add(cylindre);
  }
  const longueur = CONFIG_MAINS.longueurAvantBras;
  ajouterCylindre(0.040, 0.030, 0, longueur, materiauGant);                       // avant-bras
  ajouterCylindre(0.046, 0.040, 0, Math.min(0.17, longueur), materiauManchette);  // protège-avant-bras

  return groupe;
}

const mainDroite = creerMain(CONFIG_MAINS.droite);
const mainGauche = creerMain(CONFIG_MAINS.gauche);
mainDroite.scale.setScalar(CONFIG_MAINS.echelle);
mainGauche.scale.setScalar(CONFIG_MAINS.echelle);
mainDroite.position.set(etat.mains.droite.x, etat.mains.droite.y, etat.mains.droite.z);
mainGauche.position.set(etat.mains.gauche.x, etat.mains.gauche.y, etat.mains.gauche.z);
mains.add(mainDroite, mainGauche);

// Progression douce de 0 à 1 quand x passe de a à b
function lisser(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// =====================================================
// MODÈLE DE GRENADE (formes simples), utilisé pour les grenades lancées
// =====================================================
const materiauCorpsGrenade = new THREE.MeshStandardMaterial({ color: CONFIG_GRENADE.couleurCorps, roughness: 0.7, metalness: 0.1 });
const materiauMetalGrenade = new THREE.MeshStandardMaterial({ color: CONFIG_GRENADE.couleurMetal, roughness: 0.35, metalness: 0.8 });

export function creerModeleGrenade() {
  const grenade = new THREE.Group();
  const materiauCorps = materiauCorpsGrenade;
  const materiauMetal = materiauMetalGrenade;

  // Corps ovoïde
  const corps = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 16), materiauCorps);
  corps.scale.set(1, 1.2, 1);
  grenade.add(corps);

  // Bouchon (allumeur) sur le dessus
  const bouchon = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.022, 14), materiauMetal);
  bouchon.position.y = 0.046;
  grenade.add(bouchon);

  // Cuillère : plaque qui part du bouchon et descend le long du corps (côté droit)
  const cuillere = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.014), materiauMetal);
  cuillere.position.set(0.034, 0.022, 0);
  cuillere.rotation.z = 0.25;
  grenade.add(cuillere);

  // Goupille : anneau sur le côté gauche du bouchon
  const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 8, 20), materiauMetal);
  anneau.position.set(-0.024, 0.05, 0);
  anneau.rotation.y = Math.PI / 2;
  grenade.add(anneau);
  return grenade;
}

// Positionne les mains et anime la main d'appui pendant le rechargement
function mettreAJourMains() {
  if (!CONFIG_MAINS.actif) return;
  mains.visible = etat.reglageMains !== 3;

  const d = etat.mains.droite;
  mainDroite.position.set(d.x, d.y, d.z);

  // La main gauche descend chercher un chargeur, puis remonte l'insérer
  let geste = 0;
  if (etat.rechargement) {
    const p = 1 - etat.tempsRechargement / etat.dureeRechargement;   // 0 → 1
    geste = lisser(p, 0, 0.3) - lisser(p, 0.62, 0.85);                            // descend, reste en bas, remonte
  }
  const g = etat.mains.gauche;
  mainGauche.position.set(g.x - geste * 0.03, g.y - geste * 0.12, g.z + geste * 0.08);
  mainGauche.rotation.x = geste * 0.5;
}

// =====================================================
// MODÈLE FBX ET TEXTURES
// =====================================================
export const modeleArme = {
  conteneur: null,       // groupe contenant le modèle (null tant qu'il n'est pas chargé)
  modeTest: true         // true = matériau texturé ci-dessous, false = matériaux d'origine du FBX
};
const materiauxOriginaux = new Map();

const chargeurTextures = new THREE.TextureLoader();

function chargerTexture(chemin, estCouleur = false) {
  const texture = chargeurTextures.load(
    chemin,
    undefined,
    undefined,
    () => console.warn("Texture introuvable : " + chemin)
  );
  if (estCouleur) texture.colorSpace = THREE.SRGBColorSpace; // couleurs correctes
  return texture;
}

// Textures du M4 (assets/M4), une par matériau du FBX.
// La clé est le nom du matériau tel qu'il est enregistré dans M4.fbx.
const DOSSIER_M4 = "assets/M4/";

const materiauxM4 = {
  // Corps de l'arme
  M4_D: new THREE.MeshStandardMaterial({
    name: "M4",
    map: chargerTexture(DOSSIER_M4 + "M4_D.png", true),
    normalMap: chargerTexture(DOSSIER_M4 + "M4_N.png"),
    metalness: 0.6,
    roughness: 0.45,
    side: THREE.DoubleSide
  }),
  // Munition 5.56x45mm
  Bullet5_56x45mm_D: new THREE.MeshStandardMaterial({
    name: "Balle",
    map: chargerTexture(DOSSIER_M4 + "Bullet5.56x45mm_D.png", true),
    normalMap: chargerTexture(DOSSIER_M4 + "Bullet5.56x45mm_N.png"),
    metalness: 0.85,
    roughness: 0.3,
    side: THREE.DoubleSide
  }),
  // Gants : carte spéculaire → matériau Phong
  Glove_D: new THREE.MeshPhongMaterial({
    name: "Gant",
    map: chargerTexture(DOSSIER_M4 + "Glove_D.png", true),
    normalMap: chargerTexture(DOSSIER_M4 + "Glove_N.png"),
    specularMap: chargerTexture(DOSSIER_M4 + "Glove_Specular.png"),
    specular: 0x444444,
    shininess: 20,
    side: THREE.DoubleSide
  }),
  // Peau des mains / bras
  Hand_D: new THREE.MeshPhongMaterial({
    name: "Main",
    map: chargerTexture(DOSSIER_M4 + "Hand_D.jpg", true),
    normalMap: chargerTexture(DOSSIER_M4 + "Hand_N.png"),
    specularMap: chargerTexture(DOSSIER_M4 + "Hand_Specular.png"),
    specular: 0x333333,
    shininess: 15,
    side: THREE.DoubleSide
  })
};

// Retrouve le matériau texturé correspondant à un matériau d'origine du FBX
function materiauPour(original) {
  if (!original) return materiauxM4.M4_D;
  const nom = original.name || "";
  if (materiauxM4[nom]) return materiauxM4[nom];
  // Correspondance souple (préfixes éventuels ajoutés par l'export)
  if (/glove/i.test(nom)) return materiauxM4.Glove_D;
  if (/hand/i.test(nom)) return materiauxM4.Hand_D;
  if (/bullet/i.test(nom)) return materiauxM4.Bullet5_56x45mm_D;
  return materiauxM4.M4_D;
}

export function appliquerMateriaux() {
  if (!modeleArme.conteneur) return;
  modeleArme.conteneur.traverse(enfant => {
    if (!enfant.isMesh) return;
    const original = materiauxOriginaux.get(enfant);
    if (!modeleArme.modeTest) {
      enfant.material = original;
    } else if (Array.isArray(original)) {
      // Un même maillage peut porter plusieurs matériaux (ex. main + gant)
      enfant.material = original.map(materiauPour);
    } else {
      enfant.material = materiauPour(original);
    }
  });
}

export function basculerMateriaux() {
  modeleArme.modeTest = !modeleArme.modeTest;
  appliquerMateriaux();
}

// Fait tourner le modèle de l'arme de 90° (outil de réglage)
export function tournerArme90() {
  if (!modeleArme.conteneur) return;
  modeleArme.conteneur.rotation.y += Math.PI / 2;
  reperesBouche = trouverBoucheCanon();   // le canon a changé de direction
}

// =====================================================
// PROJECTILE : la munition 5.56x45 mm du FBX sert de modèle aux balles tirées
// =====================================================
function preparerModeleBalle(modele) {
  let source = null;
  modele.traverse(enfant => {
    if (source || !enfant.isMesh) return;
    const original = materiauxOriginaux.get(enfant);
    if (!Array.isArray(original) && original && /bullet/i.test(original.name || "")) source = enfant;
  });
  if (!source) {
    console.warn("Munition introuvable dans le FBX : les balles restent de simples traits lumineux");
    return;
  }

  // Copie de la forme seule (sans os) : sommets de la pose de référence
  const geometrie = new THREE.BufferGeometry();
  ["position", "normal", "uv"].forEach(nom => {
    const attribut = source.geometry.attributes[nom];
    if (attribut) geometrie.setAttribute(nom, attribut.clone());
  });
  if (source.geometry.index) geometrie.setIndex(source.geometry.index.clone());

  // Centrage et axe le plus long → axe Y
  geometrie.computeBoundingBox();
  const centre = geometrie.boundingBox.getCenter(new THREE.Vector3());
  geometrie.translate(-centre.x, -centre.y, -centre.z);
  const taille = geometrie.boundingBox.getSize(new THREE.Vector3());
  if (taille.x >= taille.y && taille.x >= taille.z) geometrie.rotateZ(Math.PI / 2);   // X → Y
  else if (taille.z >= taille.y) geometrie.rotateX(-Math.PI / 2);                     // Z → Y

  // La pointe est l'extrémité la plus fine : elle doit être du côté +Y (sens du tir)
  geometrie.computeBoundingBox();
  const { min, max } = geometrie.boundingBox;
  const longueur = max.y - min.y;
  const p = geometrie.attributes.position;
  let rayonHaut = 0, nbHaut = 0, rayonBas = 0, nbBas = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
    if (y > max.y - 0.15 * longueur) { rayonHaut += r; nbHaut++; }
    if (y < min.y + 0.15 * longueur) { rayonBas += r; nbBas++; }
  }
  if (nbHaut && nbBas && rayonHaut / nbHaut > rayonBas / nbBas) geometrie.rotateX(Math.PI);

  // Taille réelle
  geometrie.scale(CONFIG_TIR.longueurBalle / longueur, CONFIG_TIR.longueurBalle / longueur, CONFIG_TIR.longueurBalle / longueur);
  geometrie.computeBoundingSphere();

  definirModeleBalle(geometrie, materiauxM4.Bullet5_56x45mm_D);
}

// =====================================================
// BOUCHE DU CANON : repérée sur le modèle, elle suit ses animations
// =====================================================
// Sommets de l'extrémité du canon : [{ maillage, index }] (null = position fixe CONFIG_TIR.bouche)
let reperesBouche = null;
const sommet = new THREE.Vector3();
const PROFONDEUR_BOUCHE = 0.01;   // épaisseur de la tranche de sommets retenue au bout du canon (mètres)
const MAX_REPERES = 64;

function estMateriauArme(materiau) {
  return !!materiau && /M4/i.test(materiau.name || "");
}

// Position d'un sommet dans le monde, déformation des os comprise
function positionSommet(maillage, index, cible) {
  cible.fromBufferAttribute(maillage.geometry.attributes.position, index);
  if (maillage.isSkinnedMesh) maillage.applyBoneTransform(index, cible);
  return cible.applyMatrix4(maillage.matrixWorld);
}

// Cherche les sommets du corps de l'arme les plus en avant (z le plus négatif dans le repère de l'arme)
function trouverBoucheCanon() {
  if (!modeleArme.conteneur) return null;
  arme.updateWorldMatrix(true, true);

  const candidats = [];
  modeleArme.conteneur.traverse(enfant => {
    if (!enfant.isMesh) return;
    const original = materiauxOriginaux.get(enfant);
    const geometrie = enfant.geometry;
    const total = geometrie.index ? geometrie.index.count : geometrie.attributes.position.count;

    // Plages de la géométrie qui utilisent le matériau de l'arme (pas les mains ni la balle)
    let plages;
    if (Array.isArray(original)) {
      plages = geometrie.groups
        .filter(g => estMateriauArme(original[g.materialIndex]))
        .map(g => [g.start, Math.min(total, g.start + g.count)]);
    } else if (estMateriauArme(original)) {
      plages = [[0, total]];
    } else {
      return;
    }

    const vus = new Set();
    plages.forEach(([debut, fin]) => {
      for (let i = debut; i < fin; i++) {
        const index = geometrie.index ? geometrie.index.getX(i) : i;
        if (vus.has(index)) continue;
        vus.add(index);
        positionSommet(enfant, index, sommet);
        arme.worldToLocal(sommet);
        candidats.push({ maillage: enfant, index, z: sommet.z });
      }
    });
  });

  if (candidats.length === 0) {
    console.warn("Bouche du canon introuvable : position fixe CONFIG_TIR.bouche utilisée");
    return null;
  }

  const zMin = candidats.reduce((min, c) => Math.min(min, c.z), Infinity);
  const bout = candidats.filter(c => c.z <= zMin + PROFONDEUR_BOUCHE);
  const pas = Math.max(1, Math.floor(bout.length / MAX_REPERES));
  return bout.filter((_, i) => i % pas === 0).map(c => ({ maillage: c.maillage, index: c.index }));
}

// M4 des avatars (vue des autres joueurs) : copie des triangles du fusil seul (sans bras, gants ni balle),
// dans la pose actuelle du modèle (repos), exprimés dans le repère de l'arme
function extraireArmeTiers() {
  if (!modeleArme.conteneur || armeTiersPrete()) return;
  arme.updateWorldMatrix(true, true);
  const positions = [];
  const uvs = [];
  const p = new THREE.Vector3();

  modeleArme.conteneur.traverse(enfant => {
    if (!enfant.isMesh) return;
    const original = materiauxOriginaux.get(enfant);
    const geometrie = enfant.geometry;
    const total = geometrie.index ? geometrie.index.count : geometrie.attributes.position.count;
    let plages;
    if (Array.isArray(original)) {
      plages = geometrie.groups
        .filter(g => estMateriauArme(original[g.materialIndex]))
        .map(g => [g.start, Math.min(total, g.start + g.count)]);
    } else if (estMateriauArme(original)) {
      plages = [[0, total]];
    } else {
      return;
    }
    const uv = geometrie.attributes.uv;
    plages.forEach(([debut, fin]) => {
      fin = debut + Math.floor((fin - debut) / 3) * 3;   // triangles complets seulement
      for (let i = debut; i < fin; i++) {
        const index = geometrie.index ? geometrie.index.getX(i) : i;
        positionSommet(enfant, index, p);
        arme.worldToLocal(p);
        positions.push(p.x, p.y, p.z);
        if (uv) uvs.push(uv.getX(index), uv.getY(index));
        else uvs.push(0, 0);
      }
    });
  });

  if (positions.length < 9) {
    console.warn("Fusil introuvable dans le FBX : les avatars gardent un fusil simplifié");
    return;
  }
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometrie.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  definirArmeTiers(geometrie, materiauxM4.M4_D);
  console.info("M4 des avatars : " + positions.length / 9 + " triangles");
}

// Place la bouche (départ des balles), le flash, la lumière et le marqueur au bout du canon
function mettreAJourBouche() {
  if (!reperesBouche) return;
  arme.updateWorldMatrix(true, true);
  const centre = new THREE.Vector3();
  reperesBouche.forEach(r => centre.add(positionSommet(r.maillage, r.index, sommet)));
  centre.divideScalar(reperesBouche.length);
  arme.worldToLocal(centre);

  bouche.copy(centre);
  flash.position.set(bouche.x, bouche.y, bouche.z - CONFIG_TIR.flashDecalage);
  lumiereTir.position.copy(bouche);
  marqueur.position.copy(bouche);
}

function preparerModele(modele) {
  const infos = [];
  let nbMeshes = 0;
  let nbSkinned = 0;

  modele.visible = true;
  modele.traverse(enfant => {
    enfant.visible = true;
    if (enfant.isMesh) {
      nbMeshes++;
      if (enfant.isSkinnedMesh) nbSkinned++;
      enfant.frustumCulled = false;

      const liste = Array.isArray(enfant.material) ? enfant.material : [enfant.material];
      liste.forEach(m => {
        if (!m) return;
        infos.push(
          (m.name || "sans nom") + " | opacité " + m.opacity +
          " | transparent " + m.transparent + " | texture " + (m.map ? "oui" : "non")
        );
        m.transparent = false;
        m.opacity = 1;
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      });
      materiauxOriginaux.set(enfant, enfant.material);
    }
  });

  let boite = new THREE.Box3().setFromObject(modele);
  const taille = boite.getSize(new THREE.Vector3());
  const plusGrande = Math.max(taille.x, taille.y, taille.z);
  const tailleOrigine = taille.toArray().map(v => v.toFixed(2)).join(" x ");

  if (Number.isFinite(plusGrande) && plusGrande > 0) {
    modele.scale.multiplyScalar(CONFIG_ARME.longueur / plusGrande);
  } else {
    modele.scale.setScalar(0.01);
  }

  boite = new THREE.Box3().setFromObject(modele);
  const centre = boite.getCenter(new THREE.Vector3());
  if (Number.isFinite(centre.x) && Number.isFinite(centre.y) && Number.isFinite(centre.z)) {
    modele.position.sub(centre);
  }

  const conteneur = new THREE.Group();
  conteneur.add(modele);
  conteneur.rotation.set(CONFIG_ARME.rotationX, CONFIG_ARME.rotationY, CONFIG_ARME.rotationZ);

  return {
    conteneur,
    rapport:
      "Maillages : " + nbMeshes + " (animés : " + nbSkinned + ")\n" +
      "Taille d'origine : " + tailleOrigine + "\n" +
      "Matériaux :\n  " + (infos.slice(0, 6).join("\n  ") || "aucun")
  };
}

// Charge le fichier FBX de l'arme
// rappels : { onSucces(resultat), onProgression(progression), onErreur(erreur) }
export function chargerArme(rappels) {
  new FBXLoader().load(
    CONFIG_ARME.fichier,
    modele => {
      arme.remove(temporaire);
      const resultat = preparerModele(modele);
      modeleArme.conteneur = resultat.conteneur;
      arme.add(resultat.conteneur);

      modeleArme.modeTest = true;
      appliquerMateriaux();
      initialiserAnimations(modele);
      extraireArmeTiers();   // modèle sans animations : M4 des avatars dans sa pose d'origine
      preparerModeleBalle(modele);
      resultat.rapport += "\nAnimations : " + (Object.keys(animations.actions).join(", ") || "aucune");
      Object.entries(etat.momentsChargeur).forEach(([nom, m]) => {
        resultat.rapport += "\n  " + nom + " : son retrait " + m.retrait.toFixed(2) + " s, insertion " + m.insertion.toFixed(2) + " s";
      });
      rappels.onSucces(resultat);
    },
    rappels.onProgression,
    rappels.onErreur
  );
}

// =====================================================
// ANIMATIONS DU FBX : Idle, Draw, Fire, Reload, Reload_Empty, Holster
// =====================================================
const FONDU = 0.12;    // durée des fondus entre deux animations (secondes)

const animations = {
  melangeur: null,     // THREE.AnimationMixer du modèle
  actions: {},         // nom du clip → action
  courante: null       // action en cours
};

function initialiserAnimations(modele) {
  if (!modele.animations || modele.animations.length === 0) return;
  animations.melangeur = new THREE.AnimationMixer(modele);
  modele.animations.forEach(clip => {
    // Dans le FBX, toutes les animations sont à la suite sur une même timeline
    // (Reload 0 → 3,67 s, Reload_Empty 3,7 → 7,5 s, Fire 7,53 → 8,33 s…) :
    // chaque clip est ramené à 0 pour démarrer sans temps mort
    const debut = Math.min(...clip.tracks.map(p => (p.times.length ? p.times[0] : Infinity)));
    if (Number.isFinite(debut) && debut > 1e-3) {
      clip.tracks.forEach(p => p.shift(-debut));
      clip.resetDuration();
      console.info("Animation " + clip.name + " : décalée de " + debut.toFixed(2) + " s, durée " + clip.duration.toFixed(2) + " s");
    }

    animations.actions[clip.name] = animations.melangeur.clipAction(clip);
    etat.dureesAnimations[clip.name] = clip.duration;
    if (/reload/i.test(clip.name)) {
      const detectes = detecterMomentsChargeur(clip);
      if (detectes) etat.momentsChargeur[clip.name] = detectes;
      const moments = momentsChargeur(clip.name, clip.duration);

      // Le rechargement se termine quand l'animation cesse de bouger (pas après les images immobiles de la fin).
      // Après l'insertion du chargeur, l'animation est accélérée (CONFIG_MUNITIONS.vitesseFinRechargement)
      const finMouvement = finDuMouvement(clip);
      const vitesse = Math.max(1, CONFIG_MUNITIONS.vitesseFinRechargement || 1);
      const finAcceleree = finMouvement > moments.insertion
        ? moments.insertion + (finMouvement - moments.insertion) / vitesse
        : finMouvement;
      const manuel = CONFIG_MUNITIONS.finRechargement[clip.name];
      const fin = manuel ?? Math.max(moments.insertion, finAcceleree - CONFIG_MUNITIONS.avanceFinRechargement);
      etat.dureesAnimations[clip.name] = fin;
      console.info(
        "Rechargement (" + clip.name + ") : insertion à " + moments.insertion.toFixed(2) +
        " s, fin du mouvement à " + finMouvement.toFixed(2) + " s (" + finAcceleree.toFixed(2) +
        " s en accéléré), tir disponible à " + fin.toFixed(2) + " s"
      );
    }
  });

  // Repère la bouche du canon dans la pose de repos (Idle)
  if (animations.actions.Idle) {
    animations.actions.Idle.play();
    animations.melangeur.update(0);
  }
  reperesBouche = trouverBoucheCanon();
  extraireArmeTiers();   // M4 des avatars, dans la même pose de repos
  if (animations.actions.Idle) animations.actions.Idle.stop();

  // Fin d'une animation jouée une seule fois : retour au repos (sauf arme rangée)
  animations.melangeur.addEventListener("finished", e => {
    if (e.action !== animations.courante) return;
    const nom = e.action.getClip().name;
    if (nom === "Holster") return;                 // reste rangée
    if (nom === "Draw") etat.armeRangee = false;   // arme prête à tirer
    jouerAnimation("Idle", { boucle: true });
  });

  // Dès le lancement : l'arme est déjà sortie, au repos et prête à tirer
  etat.armeRangee = false;
  jouerAnimation("Idle", { boucle: true });
}

// Dernier instant où l'animation bouge encore : au-delà, toutes les pistes restent sur leur valeur finale
function finDuMouvement(clip) {
  let fin = 0;
  clip.tracks.forEach(piste => {
    const t = piste.times, v = piste.values, n = t.length;
    if (n < 2) return;
    const taille = v.length / n;

    // Écart maximal d'une image par rapport à la dernière image de la piste
    const ecart = i => {
      let e = 0;
      for (let k = 0; k < taille; k++) e = Math.max(e, Math.abs(v[i * taille + k] - v[(n - 1) * taille + k]));
      return e;
    };
    let maxEcart = 0;
    for (let i = 0; i < n; i++) maxEcart = Math.max(maxEcart, ecart(i));
    if (maxEcart < 1e-5) return;   // piste immobile

    const seuil = 0.01 * maxEcart;  // en dessous : mouvement imperceptible
    for (let i = n - 1; i >= 0; i--) {
      if (ecart(i) > seuil) { fin = Math.max(fin, t[Math.min(n - 1, i + 1)]); break; }
    }
  });
  return fin > 0 ? Math.min(fin, clip.duration) : clip.duration;
}

// Repère dans un clip de rechargement le moment où le chargeur sort de l'arme (retrait)
// et celui où il y est remis en place (insertion), d'après les pistes des os "Mag".
// Retourne { retrait, insertion } en secondes, ou null si rien n'est trouvé.
function detecterMomentsChargeur(clip) {
  const SEUIL = 0.05;   // fraction du déplacement maximal considérée comme "en mouvement"
  let retrait = Infinity;
  let insertion = -Infinity;

  clip.tracks.forEach(piste => {
    if (!/mag/i.test(piste.name) || !/\.position$/.test(piste.name)) return;
    const t = piste.times, v = piste.values, n = t.length;
    if (n < 2) return;

    const ecart = (i, j) => Math.hypot(v[i * 3] - v[j * 3], v[i * 3 + 1] - v[j * 3 + 1], v[i * 3 + 2] - v[j * 3 + 2]);
    let maxDepart = 0;
    for (let i = 0; i < n; i++) maxDepart = Math.max(maxDepart, ecart(i, 0));
    if (maxDepart < 1e-4) return;   // ce chargeur ne bouge pas

    // Retrait : le chargeur commence à s'écarter de sa position de départ
    for (let i = 0; i < n; i++) {
      if (ecart(i, 0) > SEUIL * maxDepart) { retrait = Math.min(retrait, t[Math.max(0, i - 1)]); break; }
    }

    // Insertion : seulement pour un chargeur qui revient à sa place dans l'arme à la fin
    if (ecart(n - 1, 0) > SEUIL * maxDepart) return;
    for (let i = n - 1; i >= 0; i--) {
      if (ecart(i, n - 1) > SEUIL * maxDepart) { insertion = Math.max(insertion, t[Math.min(n - 1, i + 1)]); break; }
    }
  });

  if (!Number.isFinite(retrait) && !Number.isFinite(insertion)) return null;
  const moments = {
    retrait: Number.isFinite(retrait) ? retrait : 0,
    insertion: Number.isFinite(insertion) ? insertion : 0.62 * clip.duration
  };
  console.info(
    "Sons du chargeur (" + clip.name + ") : retrait " + moments.retrait.toFixed(2) +
    " s, insertion " + moments.insertion.toFixed(2) + " s / " + clip.duration.toFixed(2) + " s"
  );
  return moments;
}

// Joue un clip par son nom. duree : force la durée de lecture (secondes)
function jouerAnimation(nom, { boucle = false, duree = null } = {}) {
  const action = animations.actions[nom];
  if (!action) return false;

  action.reset();
  action.setLoop(boucle ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = !boucle;
  action.timeScale = duree ? action.getClip().duration / duree : 1;

  const precedente = animations.courante;
  if (precedente && precedente !== action) {
    action.setEffectiveWeight(1).fadeIn(FONDU);
    precedente.fadeOut(FONDU);
  } else {
    action.setEffectiveWeight(1);
  }
  action.play();
  animations.courante = action;
  return true;
}

// Animation de tir (appelée à chaque balle)
export function animerTir() {
  jouerAnimation("Fire");
}

// Ranger / sortir l'arme (impossible pendant le rechargement)
export function basculerRangement() {
  if (!animations.melangeur || etat.rechargement) return;
  const nom = animations.courante && animations.courante.getClip().name;
  if (nom === "Holster") {
    jouerAnimation("Draw");                        // armeRangee repasse à false à la fin
  } else if (nom !== "Draw") {
    etat.armeRangee = true;
    etat.tirEnCours = false;
    jouerAnimation("Holster");
  }
}

// Lance Reload ou Reload_Empty au début d'un rechargement, calé sur sa durée
let etaitEnRechargement = false;
function mettreAJourAnimations(dt) {
  if (!animations.melangeur) return;
  if (etat.rechargement && !etaitEnRechargement) {
    jouerAnimation(etat.animationRechargement);   // vitesse d'origine jusqu'à l'insertion du chargeur
  }
  etaitEnRechargement = etat.rechargement;

  // Une fois le chargeur inséré, la fin de l'animation de rechargement est accélérée
  const action = animations.courante;
  if (action && /reload/i.test(action.getClip().name)) {
    const nom = action.getClip().name;
    const insertion = momentsChargeur(nom, action.getClip().duration).insertion;
    action.timeScale = action.time >= insertion ? Math.max(1, CONFIG_MUNITIONS.vitesseFinRechargement || 1) : 1;
  }
  animations.melangeur.update(dt);
}

// Moments du chargeur dans une animation de rechargement : réglage manuel, sinon détection, sinon par défaut
export function momentsChargeur(nom, duree) {
  const m = CONFIG_MUNITIONS.sonsRechargement[nom] || etat.momentsChargeur[nom] || {};
  return { retrait: m.retrait ?? 0, insertion: m.insertion ?? 0.62 * duree };
}

// =====================================================
// FLASH DE BOUCHE, LUMIÈRE ET MARQUEUR
// =====================================================
export const bouche = new THREE.Vector3(CONFIG_TIR.bouche.x, CONFIG_TIR.bouche.y, CONFIG_TIR.bouche.z);

// Flash : testé en profondeur pour passer DERRIÈRE l'arme (l'arme est au premier plan)
const flash = new THREE.Sprite(new THREE.SpriteMaterial({
  map: textureFlash,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthTest: true,     // l'arme (opaque) masque le flash là où elle est devant
  depthWrite: false
}));
flash.position.set(bouche.x, bouche.y, bouche.z - CONFIG_TIR.flashDecalage); // légèrement derrière la sortie du canon
flash.visible = false;
arme.add(flash);

const lumiereTir = new THREE.PointLight(0xffaa55, 0, 4);
lumiereTir.position.copy(bouche);
arme.add(lumiereTir);

// Marqueur rouge : montre le point de sortie du canon (touche M)
const marqueur = new THREE.Mesh(
  new THREE.SphereGeometry(0.012),
  new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false })
);
marqueur.position.copy(bouche);
marqueur.renderOrder = 6;
marqueur.visible = false;
arme.add(marqueur);

export function basculerMarqueur() {
  marqueur.visible = !marqueur.visible;
}

let dureeFlash = 0;

// Déclenche le flash de bouche (à chaque tir)
export function declencherFlash() {
  const taille = 0.18 + Math.random() * 0.12;
  flash.scale.set(taille, taille, 1);
  flash.material.rotation = Math.random() * Math.PI * 2;
  flash.visible = true;
  dureeFlash = 0.06;
}

// =====================================================
// RECUL ET MISE À JOUR DE L'ARME
// =====================================================
const axeX = new THREE.Vector3(1, 0, 0);
const quaternionRecul = new THREE.Quaternion();
const quaternionRecharge = new THREE.Quaternion();
const eulerRecharge = new THREE.Euler();
let recul = 0;                 // 0 = repos, augmente à chaque tir
let facteurSprint = 0;         // 0 = marche, 1 = sprint (lissé)

export function ajouterRecul() {
  recul = Math.min(CONFIG_RECUL.max, recul + 1);
}

export function mettreAJourArme(dt) {
  // Recul : l'arme recule et se cabre, puis revient en place
  recul *= Math.exp(-dt * CONFIG_RECUL.retour);

  // Animations du modèle (tir, rechargement, sortie / rangement)
  mettreAJourAnimations(dt);

  // Rechargement : l'arme s'abaisse et s'incline, puis revient
  // (seulement si le modèle n'a pas sa propre animation de rechargement)
  const f = animations.actions.Reload ? 0 : facteurRechargement();

  // Sprint : l'arme s'abaisse et pique vers le bas, avec une transition douce (0 = marche, 1 = sprint)
  facteurSprint += ((etat.sprint ? 1 : 0) - facteurSprint) * Math.min(1, dt * CONFIG_SPRINT.transition);
  const s = facteurSprint;

  // Lancer de grenade : le M4 s'abaisse puis remonte en douceur pendant le geste
  const pLancer = etat.tempsLancer > 0 ? 1 - etat.tempsLancer / CONFIG_GRENADE.dureeLancer : 1;   // 0 → 1
  const abaissementLancer = 0.25 * Math.sin(Math.PI * pLancer);

  arme.position.y = CONFIG_ARME.position.y - f * 0.22 - s * CONFIG_SPRINT.abaissement - abaissementLancer;
  arme.position.z = CONFIG_ARME.position.z + recul * CONFIG_RECUL.distance + f * 0.05;

  // Orientation : canon pointé vers le réticule, plus le cabrage dû au recul,
  // l'inclinaison du rechargement et celle du sprint
  quaternionRecul.setFromAxisAngle(axeX, recul * CONFIG_RECUL.cabrage);
  quaternionRecharge.setFromEuler(eulerRecharge.set(
    -f * 0.5 - s * CONFIG_SPRINT.inclinaison,
    s * CONFIG_SPRINT.rotationLaterale,
    f * 0.25
  ));
  arme.quaternion.copy(quaternionVisee).multiply(quaternionRecul).multiply(quaternionRecharge);

  // Mains : elles suivent l'arme ; la main d'appui descend pendant le rechargement
  mettreAJourMains();

  // Bouche du canon : suit le modèle animé (balles, flash, lumière, marqueur)
  mettreAJourBouche();

  // Flash de bouche et lumière
  if (dureeFlash > 0) {
    dureeFlash -= dt;
    lumiereTir.intensity = 6;
    if (dureeFlash <= 0) flash.visible = false;
  } else {
    lumiereTir.intensity = 0;
  }
}