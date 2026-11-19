// =====================================================
// GRENADES : lancer, rebonds sur le décor, minuterie et explosion
// =====================================================
import * as THREE from "three";
import { scene, camera } from "./moteur.js";
import { CONFIG_GRENADE, CONFIG_CIBLE, CONFIG_RETICULE, HAUTEUR_SOL, HAUTEUR_YEUX } from "./config.js";
import { etat } from "./etat.js";
import { surfaces } from "./monde.js";
import { creerModeleGrenade } from "./arme.js";
import { mettreAJourHud } from "./munitions.js";
import { cible, infligerDegats } from "./cible.js";
import { textureFlash, creerEtincelles } from "./effets.js";
import { initialiserAudio, jouerSonExplosion, jouerSonHitmarker } from "./audio.js";
import { afficherDegats, declencherTouche } from "./reticule.js";
import { reseau, envoyer } from "./reseau.js";
import { signalerTouche } from "./partie.js";
import { ennemisVivants } from "./joueursDistants.js";

const G = CONFIG_GRENADE;
const RAYON = 0.045;                      // rayon de collision de la grenade (mètres)
const grenadesLancees = [];               // { modele, vitesse, minuterie, auRepos, rotation }
const raycaster = new THREE.Raycaster();
const normale = new THREE.Vector3();
const deplacement = new THREE.Vector3();

// Texte affiché au-dessus du réticule quand l'explosion touche la cible
const ZONE_EXPLOSION = { nom: "Grenade", degats: G.paliersDegats[0].degats, texte: "#ff8a3d" };
const RAYON_EXPLOSION = Math.max(...G.paliersDegats.map(p => p.jusqua));   // portée maximale des dégâts

// =====================================================
// LANCER
// =====================================================
let compteurGrenades = 0;   // identifiant des grenades lancées (multijoueur)
const arrondi = v => Math.round(v * 1000) / 1000;

export function lancerGrenade() {
  if (etat.mort || etat.partieTerminee) return;
  if (etat.grenades <= 0 || etat.tempsLancer > 0) return;           // plus de grenade, ou lancer déjà en cours
  if (etat.rechargement || etat.armeRangee) return;                 // mains occupées
  initialiserAudio();

  etat.grenades--;
  etat.tempsLancer = G.dureeLancer;
  mettreAJourHud();

  // Départ : à hauteur de la main droite, légèrement devant la caméra
  camera.updateMatrixWorld(true);
  const depart = camera.localToWorld(new THREE.Vector3(0.18, -0.12, -0.45));

  // Direction : celle du regard, relevée de quelques degrés
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const droite = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
  direction.applyAxisAngle(droite, THREE.MathUtils.degToRad(G.angleLancer)).normalize();

  const vitesse = direction.multiplyScalar(G.vitesseLancer);
  const gid = reseau.role ? reseau.monId + "-" + (compteurGrenades++) : null;
  ajouterGrenade(depart, vitesse, G.delaiExplosion, gid, false);

  // Multijoueur : les autres voient la grenade voler (même trajectoire calculée chez eux)
  if (reseau.role) envoyer({ t: "grenade", gid, p: depart.toArray().map(arrondi), v: vitesse.toArray().map(arrondi) });
}

// distante : grenade d'un autre joueur (affichage seulement ; elle explose quand son lanceur l'annonce)
function ajouterGrenade(position, vitesse, minuterie, gid, distante) {
  const modele = creerModeleGrenade();
  modele.position.copy(position);
  scene.add(modele);
  grenadesLancees.push({
    modele, vitesse, minuterie, gid, distante,
    auRepos: false,
    rotation: new THREE.Vector3(Math.random() * 8 + 6, Math.random() * 4 - 2, Math.random() * 4 - 2)   // tournoiement (rad/s)
  });
}

// Grenade lancée par un autre joueur (p, v : tableaux [x, y, z])
export function ajouterGrenadeDistante(gid, p, v) {
  // Explosion de secours si l'annonce du lanceur se perd
  ajouterGrenade(new THREE.Vector3(...p), new THREE.Vector3(...v), G.delaiExplosion + 2, gid, true);
}

// Le lanceur annonce l'explosion de sa grenade, à la position exacte calculée chez lui
export function exploserGrenadeDistante(gid, p) {
  const point = new THREE.Vector3(...p);
  const index = grenadesLancees.findIndex(g => g.gid === gid);
  if (index !== -1) {
    const g = grenadesLancees[index];
    grenadesLancees.splice(index, 1);
    g.modele.position.copy(point);
    exploser(g);
  } else {
    creerExplosion(point);
    jouerSonExplosion(point.distanceTo(camera.position));
  }
}

// =====================================================
// PHYSIQUE : chute, rebonds sur le décor
// =====================================================
function deplacerGrenade(g, dt) {
  if (g.auRepos) return;
  g.vitesse.y -= G.gravite * dt;

  const position = g.modele.position;
  deplacement.copy(g.vitesse).multiplyScalar(dt);
  const distance = deplacement.length();
  if (distance < 1e-6) return;

  // Rencontre-t-elle une surface pendant ce déplacement ?
  raycaster.set(position, deplacement.clone().divideScalar(distance));
  raycaster.far = distance + RAYON;
  const contact = raycaster.intersectObjects(surfaces, false)[0];

  if (contact && contact.face) {
    normale.copy(contact.face.normal).transformDirection(contact.object.matrixWorld);
    if (normale.dot(deplacement) > 0) normale.negate();   // face vue de l'autre côté (surfaces à double face)

    // Posée contre la surface, puis rebond : composante normale inversée et amortie, frottement le long de la surface
    position.copy(contact.point).addScaledVector(normale, RAYON);
    const vn = g.vitesse.dot(normale);
    const normaleVitesse = normale.clone().multiplyScalar(vn);
    const tangente = g.vitesse.clone().sub(normaleVitesse).multiplyScalar(G.frottement);
    g.vitesse.copy(tangente).addScaledVector(normaleVitesse, -G.rebond);
    g.rotation.multiplyScalar(0.3);   // le tournoiement s'éteint vite au contact

    // Sur un sol presque plat et lente : elle s'immobilise
    if (normale.y > 0.7 && g.vitesse.length() < G.vitesseArret) {
      g.auRepos = true;
      g.vitesse.set(0, 0, 0);
    }
  } else {
    position.add(deplacement);
  }

  // Sécurité : jamais sous le sol
  if (position.y < HAUTEUR_SOL + RAYON) {
    position.y = HAUTEUR_SOL + RAYON;
    g.vitesse.y = Math.abs(g.vitesse.y) * G.rebond;
    g.vitesse.x *= G.frottement;
    g.vitesse.z *= G.frottement;
    if (g.vitesse.length() < G.vitesseArret) { g.auRepos = true; g.vitesse.set(0, 0, 0); }
  }

  // Tournoiement en vol
  g.modele.rotation.x += g.rotation.x * dt;
  g.modele.rotation.y += g.rotation.y * dt;
  g.modele.rotation.z += g.rotation.z * dt;
}

// =====================================================
// EXPLOSION : boule de feu, éclat, lumière, étincelles, fumée, son, dégâts
// =====================================================
function creerTextureFumee() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const d = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  d.addColorStop(0, "rgba(70,70,70,0.85)");
  d.addColorStop(0.6, "rgba(55,55,55,0.45)");
  d.addColorStop(1, "rgba(40,40,40,0)");
  g.fillStyle = d;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const textureFumee = creerTextureFumee();
const geometrieBoule = new THREE.SphereGeometry(1, 20, 14);
const explosions = [];   // { boule, eclat, fumee, origine, temps }

// Une seule lumière, présente dès le départ (en ajouter une en cours de partie provoquerait un à-coup)
const lumiereExplosion = new THREE.PointLight(0xffa050, 0, 18);
scene.add(lumiereExplosion);
let tempsLumiere = Infinity;

const DUREE_EXPLOSION = 1.6;   // durée totale de l'effet (fumée comprise)

function creerExplosion(point) {
  const boule = new THREE.Mesh(geometrieBoule, new THREE.MeshBasicMaterial({
    color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  boule.position.copy(point);

  const eclat = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textureFlash, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  }));
  eclat.position.copy(point);

  const fumee = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textureFumee, transparent: true, depthWrite: false, opacity: 0
  }));
  fumee.position.copy(point);

  lumiereExplosion.position.set(point.x, point.y + 0.5, point.z);
  tempsLumiere = 0;

  scene.add(boule, eclat, fumee);
  explosions.push({ boule, eclat, fumee, origine: point.clone(), temps: 0 });

  // Gerbe d'étincelles dans toutes les directions (vers le haut surtout)
  for (let i = 0; i < 8; i++) {
    const n = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.8 + 0.2, Math.random() * 2 - 1).normalize();
    creerEtincelles(point, n);
  }
}

function mettreAJourExplosions(dt) {
  // Lumière : intense puis décroît (0,5 s)
  tempsLumiere += dt;
  lumiereExplosion.intensity = 60 * Math.max(0, 1 - tempsLumiere / 0.5);

  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.temps += dt;
    const t = e.temps;

    // Boule de feu : grossit très vite puis s'efface (0,4 s)
    const pb = Math.min(1, t / 0.4);
    const tailleBoule = 0.3 + (RAYON_EXPLOSION * 0.38) * (1 - Math.pow(1 - pb, 3));
    e.boule.scale.setScalar(tailleBoule);
    e.boule.material.opacity = 1 - pb;
    e.boule.material.color.setHSL(0.09 - 0.06 * pb, 1, 0.6 - 0.3 * pb);   // jaune-orangé → rouge sombre
    e.boule.visible = pb < 1;

    // Éclat lumineux bref (0,15 s)
    const pe = Math.min(1, t / 0.15);
    const tailleEclat = 3 + 3 * pe;
    e.eclat.scale.set(tailleEclat, tailleEclat, 1);
    e.eclat.material.opacity = 1 - pe;
    e.eclat.visible = pe < 1;

    // Fumée : monte et s'étale, puis disparaît
    const pf = t / DUREE_EXPLOSION;
    const tailleFumee = 1.5 + 3 * pf;
    e.fumee.scale.set(tailleFumee, tailleFumee, 1);
    e.fumee.position.y = e.origine.y + 0.5 + 1.2 * pf;
    e.fumee.material.opacity = Math.min(1, t / 0.15) * (1 - pf) * 0.8;

    if (t >= DUREE_EXPLOSION) {
      scene.remove(e.boule, e.eclat, e.fumee);
      e.boule.material.dispose();
      e.eclat.material.dispose();
      e.fumee.material.dispose();
      explosions.splice(i, 1);
    }
  }
}

// Dégâts reçus par un corps debout (base : position des pieds) : 0 s'il est hors de portée ou protégé par un mur,
// sinon dégâts qui baissent avec la distance entre l'explosion et le point du corps le plus proche
function degatsSurCorps(point, base, hauteurCorps = 1.75) {
  // Point du corps le plus proche : sur l'axe vertical de la silhouette, des chevilles au sommet du crâne
  const y = THREE.MathUtils.clamp(point.y, base.y + 0.1, base.y + hauteurCorps);
  const plusProche = new THREE.Vector3(base.x, y, base.z);
  const versCible = plusProche.clone().sub(point);
  const distance = Math.max(0, versCible.length() - 0.2);   // 0,2 m : demi-épaisseur du corps
  const palier = G.paliersDegats.find(p => distance <= p.jusqua);
  if (!palier) return 0;                                     // trop loin : aucun dégât

  // Un élément du décor entre l'explosion et le milieu du corps le protège (les corps ne protègent pas)
  const centre = new THREE.Vector3(base.x, base.y + hauteurCorps * (1.0 / 1.75), base.z);
  const versCentre = centre.clone().sub(point);
  const distanceCentre = versCentre.length();
  if (distanceCentre > 0.05) {
    raycaster.set(point, versCentre.divideScalar(distanceCentre));
    raycaster.far = distanceCentre;
    const obstacle = raycaster.intersectObjects(surfaces, false)
      .find(i => !i.object.userData.estCible && !i.object.userData.joueurId && i.distance > 0.05);
    if (obstacle) return 0;
  }

  return palier.degats;
}

function exploser(g) {
  const point = g.modele.position.clone();
  scene.remove(g.modele);

  creerExplosion(point);
  jouerSonExplosion(point.distanceTo(camera.position));
  if (g.distante) return;   // grenade d'un autre joueur : il calcule lui-même les dégâts

  // Multijoueur : j'annonce l'explosion et je signale à l'hôte les joueurs touchés (ennemis, et moi-même)
  if (reseau.role) {
    envoyer({ t: "explosion", gid: g.gid, p: point.toArray().map(arrondi) });
    let meilleurCoup = 0;
    for (const ennemi of ennemisVivants()) {
      const degats = degatsSurCorps(point, ennemi.base);
      if (degats > 0) {
        signalerTouche(ennemi.id, degats, -1, "grenade", point);
        meilleurCoup = Math.max(meilleurCoup, degats);
      }
    }
    if (!etat.mort) {
      const pieds = new THREE.Vector3(camera.position.x, camera.position.y - HAUTEUR_YEUX, camera.position.z);
      const degats = degatsSurCorps(point, pieds);
      if (degats > 0) signalerTouche(reseau.monId, degats, -1, "grenade", point);
    }
    if (meilleurCoup > 0) {
      afficherDegats(ZONE_EXPLOSION, meilleurCoup);
      jouerSonHitmarker(false);
      declencherTouche(CONFIG_RETICULE.dureeTouche);
    }
    return;
  }

  // Solo : la cible d'entraînement
  if (!cible.vivante || !cible.groupe) return;
  const degats = degatsSurCorps(point, cible.groupe.position, 1.75 * CONFIG_CIBLE.echelle);
  if (degats > 0) infligerDegats(degats, ZONE_EXPLOSION);
}

// =====================================================
// MISE À JOUR (à chaque image)
// =====================================================
export function mettreAJourGrenades(dt) {
  // Geste de lancer en cours (le M4 est abaissé, pas de tir)
  if (etat.tempsLancer > 0) etat.tempsLancer = Math.max(0, etat.tempsLancer - dt);

  for (let i = grenadesLancees.length - 1; i >= 0; i--) {
    const g = grenadesLancees[i];
    deplacerGrenade(g, dt);
    g.minuterie -= dt;
    if (g.minuterie <= 0) {
      exploser(g);
      grenadesLancees.splice(i, 1);
    }
  }

  mettreAJourExplosions(dt);
}
