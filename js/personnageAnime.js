// =====================================================
// PERSONNAGE ANIMÉ : squelette construit automatiquement pour un modèle sans os (« base mesh »)
//
// 1. Les maillages du modèle sont fusionnés (repère de l'avatar : pieds en 0, regard vers +Z,
//    droite du personnage vers -X).
// 2. Points clés estimés d'après les proportions humaines et la forme du modèle :
//    mains = sommets les plus à gauche / à droite, épaules, coudes, bassin, genoux, cou.
// 3. Chaque sommet est rattaché aux os voisins (poids progressifs aux articulations).
// 4. Pose « fusil en main » calculée une fois (bras pliés par cinématique inverse à 2 segments),
//    puis à chaque image : buste incliné selon le regard, jambes qui suivent la vitesse (marche).
// =====================================================
import * as THREE from "three";
import { CONFIG_PERSONNAGES } from "./config.js";

const H = () => CONFIG_PERSONNAGES.hauteur;

// Os : index et parent
const OS = { racine: 0, bassin: 1, buste: 2, tete: 3, epauleD: 4, coudeD: 5, epauleG: 6, coudeG: 7, jambeD: 8, genouD: 9, jambeG: 10, genouG: 11 };
const PARENTS = [-1, 0, 1, 2, 2, 4, 2, 6, 1, 8, 1, 10];

const lisse = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Fusionne tous les maillages du modèle (déjà normalisé) en une géométrie dans le repère de l'avatar
function fusionner(modele) {
  modele.updateMatrixWorld(true);
  const positions = [];
  const normales = [];
  let toutesNormales = true;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const matriceNormale = new THREE.Matrix3();
  modele.traverse(objet => {
    if (!objet.isMesh) return;
    const g = objet.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    if (!nor) toutesNormales = false;
    matriceNormale.getNormalMatrix(objet.matrixWorld);
    const compte = g.index ? g.index.count : pos.count;
    for (let i = 0; i < compte; i++) {
      const k = g.index ? g.index.getX(i) : i;
      v.fromBufferAttribute(pos, k).applyMatrix4(objet.matrixWorld);
      positions.push(v.x, v.y, v.z);
      if (nor) {
        n.fromBufferAttribute(nor, k).applyMatrix3(matriceNormale).normalize();
        normales.push(n.x, n.y, n.z);
      }
    }
  });
  if (positions.length < 9) return null;
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (toutesNormales && normales.length === positions.length) geometrie.setAttribute("normal", new THREE.Float32BufferAttribute(normales, 3));
  else geometrie.computeVertexNormals();
  return geometrie;
}

// Bras tendu au repos : épaule S, direction d (vers la main), longueur L
function analyserBras(positions, cote) {
  // cote : -1 = bras droit du personnage (x négatifs), +1 = bras gauche
  const h = H();
  let main = null;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    if (v.y < 0.4 * h) continue;                          // pas les pieds
    if (!main || v.x * cote > main.x * cote) main = v.clone();
  }
  if (!main || main.x * cote < 0.16 * h) return null;    // bras collés au corps : non détectés
  const epaule = new THREE.Vector3(cote * 0.1 * h, 0.81 * h, main.z);
  const versMain = main.clone().sub(epaule);
  const longueur = versMain.length();
  if (longueur < 0.2 * h) return null;
  return { epaule, direction: versMain.normalize(), longueur, main };
}

// Cinématique inverse à 2 segments : rotations de l'épaule et du coude pour amener la main sur la cible
// (dans le repère du buste au repos). pole : direction vers laquelle pointe le coude
function poserBras(bras, cible, pole) {
  const a = bras.longueur * 0.5, b = bras.longueur * 0.5;
  const versCible = cible.clone().sub(bras.epaule);
  const distance = THREE.MathUtils.clamp(versCible.length(), 0.05, a + b - 1e-3);
  const axe = versCible.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + distance * distance - b * b) / (2 * a * distance), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perpendiculaire = pole.clone().sub(axe.clone().multiplyScalar(pole.dot(axe))).normalize();
  const coude = bras.epaule.clone().addScaledVector(axe, a * cosA).addScaledVector(perpendiculaire, a * sinA);
  const main = bras.epaule.clone().addScaledVector(axe, distance);

  const qEpaule = new THREE.Quaternion().setFromUnitVectors(bras.direction, coude.clone().sub(bras.epaule).normalize());
  const qAvantBras = new THREE.Quaternion().setFromUnitVectors(bras.direction, main.clone().sub(coude).normalize());
  const qCoude = qEpaule.clone().invert().multiply(qAvantBras);   // rotation du coude relative à l'épaule
  return { qEpaule, qCoude };
}

// Prépare un personnage à partir du modèle normalisé. Renvoie null si le modèle ne s'y prête pas
// (les bras ne sont pas repérables) : il est alors affiché immobile.
export function preparerPersonnage(modele) {
  if (!CONFIG_PERSONNAGES.animation) return null;
  const geometrie = fusionner(modele);
  if (!geometrie) return null;
  const h = H();
  const positions = geometrie.attributes.position;

  const brasD = analyserBras(positions, -1);
  const brasG = analyserBras(positions, 1);
  if (!brasD || !brasG) {
    console.warn("Personnage : bras introuvables, modèle affiché sans animation");
    return null;
  }

  // Positions des os au repos (repère de l'avatar)
  const yBassin = 0.52 * h, yGenou = 0.28 * h, yBuste = 0.62 * h, yCou = 0.85 * h;
  const xHanche = 0.055 * h;
  const repos = [];
  repos[OS.racine] = new THREE.Vector3(0, 0, 0);
  repos[OS.bassin] = new THREE.Vector3(0, yBassin, 0);
  repos[OS.buste] = new THREE.Vector3(0, yBuste, 0);
  repos[OS.tete] = new THREE.Vector3(0, yCou, 0);
  repos[OS.epauleD] = brasD.epaule.clone();
  repos[OS.coudeD] = brasD.epaule.clone().addScaledVector(brasD.direction, brasD.longueur * 0.5);
  repos[OS.epauleG] = brasG.epaule.clone();
  repos[OS.coudeG] = brasG.epaule.clone().addScaledVector(brasG.direction, brasG.longueur * 0.5);
  repos[OS.jambeD] = new THREE.Vector3(-xHanche, yBassin, 0);
  repos[OS.genouD] = new THREE.Vector3(-xHanche, yGenou, 0);
  repos[OS.jambeG] = new THREE.Vector3(xHanche, yBassin, 0);
  repos[OS.genouG] = new THREE.Vector3(xHanche, yGenou, 0);

  // Poids de chaque sommet (jusqu'à 3 os)
  const indices = new Uint16Array(positions.count * 4);
  const poids = new Float32Array(positions.count * 4);
  const v = new THREE.Vector3();
  const rel = new THREE.Vector3();
  const rayonBras = 0.075 * h;

  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    const liste = [];   // [os, poids]

    // Bras : près de l'axe épaule → main, du bon côté
    let bras = null, osEpaule = 0, osCoude = 0, t = 0;
    for (const [b, e, c] of [[brasD, OS.epauleD, OS.coudeD], [brasG, OS.epauleG, OS.coudeG]]) {
      if (Math.sign(v.x) !== Math.sign(b.epaule.x)) continue;
      rel.copy(v).sub(b.epaule);
      const tt = rel.dot(b.direction);
      const distanceAxe = rel.addScaledVector(b.direction, -tt).length();
      if (tt > -0.03 * h && distanceAxe < rayonBras) { bras = b; osEpaule = e; osCoude = c; t = tt; break; }
    }

    if (bras) {
      const wBras = lisse(-0.02 * h, 0.04 * h, t);
      const wAvantBras = lisse(bras.longueur * 0.5 - 0.03 * h, bras.longueur * 0.5 + 0.03 * h, t);
      liste.push([OS.buste, 1 - wBras], [osEpaule, wBras * (1 - wAvantBras)], [osCoude, wBras * wAvantBras]);
    } else if (v.y < yBassin + 0.02 * h) {
      // Jambes
      const wJambe = lisse(yBassin + 0.02 * h, yBassin - 0.05 * h, v.y);
      const wGenou = lisse(yGenou + 0.03 * h, yGenou - 0.03 * h, v.y);
      const [osJambe, osGenou] = v.x < 0 ? [OS.jambeD, OS.genouD] : [OS.jambeG, OS.genouG];
      liste.push([OS.bassin, 1 - wJambe], [osJambe, wJambe * (1 - wGenou)], [osGenou, wJambe * wGenou]);
    } else {
      // Tronc et tête
      const wBuste = lisse(yBassin + 0.02 * h, yBuste + 0.04 * h, v.y);
      const wTete = lisse(yCou - 0.015 * h, yCou + 0.02 * h, v.y);
      liste.push([OS.bassin, 1 - wBuste], [OS.buste, wBuste * (1 - wTete)], [OS.tete, wBuste * wTete]);
    }

    const somme = liste.reduce((s, [, w]) => s + w, 0) || 1;
    liste.forEach(([os, w], k) => {
      indices[i * 4 + k] = os;
      poids[i * 4 + k] = w / somme;
    });
  }
  geometrie.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  geometrie.setAttribute("skinWeight", new THREE.Float32BufferAttribute(poids, 4));
  geometrie.computeBoundingSphere();

  // Pose « fusil en main » : main droite sur la poignée, main gauche sous le garde-main
  // (droite du personnage = -X, devant = +Z)
  const mainDroite = new THREE.Vector3(-0.075 * h, 0.70 * h, 0.13 * h);
  const mainGauche = new THREE.Vector3(-0.025 * h, 0.725 * h, 0.29 * h);
  const poseD = poserBras(brasD, mainDroite, new THREE.Vector3(-0.6, -1, -0.3));
  const poseG = poserBras(brasG, mainGauche, new THREE.Vector3(0.6, -1, -0.2));

  // Fusil : crosse à l'épaule droite, canon vers l'avant, centre entre les deux mains
  const positionArme = new THREE.Vector3(-0.06 * h, 0.74 * h, 0.22 * h);

  return { geometrie, repos, poseD, poseG, positionArme };
}

// Crée le corps animé d'un avatar (os propres à l'avatar, géométrie partagée)
export function creerCorpsAnime(donnees, materiau) {
  const os = donnees.repos.map(() => new THREE.Bone());
  os.forEach((b, i) => {
    const parent = PARENTS[i];
    b.position.copy(donnees.repos[i]);
    if (parent >= 0) {
      b.position.sub(donnees.repos[parent]);
      os[parent].add(b);
    }
  });

  const maillage = new THREE.SkinnedMesh(donnees.geometrie, materiau);
  maillage.frustumCulled = false;
  maillage.add(os[OS.racine]);
  maillage.updateMatrixWorld(true);
  maillage.bind(new THREE.Skeleton(os));   // pose de repos = pose de liaison

  // Bras en position de tir
  os[OS.epauleD].quaternion.copy(donnees.poseD.qEpaule);
  os[OS.coudeD].quaternion.copy(donnees.poseD.qCoude);
  os[OS.epauleG].quaternion.copy(donnees.poseG.qEpaule);
  os[OS.coudeG].quaternion.copy(donnees.poseG.qCoude);

  return { maillage, os, phase: 0, yBassin: donnees.repos[OS.bassin].y, positionArme: donnees.positionArme, buste: os[OS.buste], reposBuste: donnees.repos[OS.buste] };
}

// Ajoute le fusil dans les mains (il suit le buste, donc le regard)
export function attacherArme(corps, geometrie, materiau) {
  if (corps.arme) return;
  const fusil = new THREE.Mesh(geometrie, materiau);
  fusil.position.copy(corps.positionArme).sub(corps.reposBuste);
  corps.buste.add(fusil);
  corps.arme = fusil;
}

// À chaque image : vitesse au sol (m/s) et regard vertical (radians, positif vers le haut)
export function animerCorps(corps, dt, vitesse, pitch) {
  const os = corps.os;
  const C = CONFIG_PERSONNAGES;

  // Buste et tête suivent le regard (le fusil, attaché au buste, vise donc dans la bonne direction)
  os[OS.buste].rotation.x = -pitch * C.inclinaisonVisee;
  os[OS.tete].rotation.x = -pitch * (1 - C.inclinaisonVisee) * 0.8;

  // Marche : la phase avance avec la distance parcourue, l'amplitude avec la vitesse
  const intensite = Math.min(1.25, vitesse / 4.5);
  corps.phase += dt * vitesse * (Math.PI * 2 / C.foulee);
  const amplitude = C.amplitudeMarche * intensite;
  const s = Math.sin(corps.phase);
  os[OS.jambeD].rotation.x = amplitude * s;
  os[OS.jambeG].rotation.x = -amplitude * s;
  // Genou plié quand la jambe revient vers l'avant
  os[OS.genouD].rotation.x = Math.max(0, -Math.cos(corps.phase)) * amplitude * 1.3;
  os[OS.genouG].rotation.x = Math.max(0, Math.cos(corps.phase)) * amplitude * 1.3;
  // Léger rebond du bassin à chaque pas
  os[OS.bassin].position.y = corps.yBassin - Math.abs(Math.cos(corps.phase)) * 0.025 * intensite;
}
