// =====================================================
// EFFETS D'IMPACT : étincelles, trous de balle, éclat lumineux
// =====================================================
import * as THREE from "three";
import { scene } from "./moteur.js";
import { CONFIG_IMPACT, HAUTEUR_SOL } from "./config.js";
import { jouerSonImpact } from "./audio.js";

const axeZ = new THREE.Vector3(0, 0, 1);
const tmpVec = new THREE.Vector3();

// --- Texture de l'éclat lumineux (aussi utilisée pour le flash de bouche de l'arme) ---
function creerTextureFlash() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");

  const degrade = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  degrade.addColorStop(0, "rgba(255,255,255,1)");
  degrade.addColorStop(0.25, "rgba(255,220,120,0.9)");
  degrade.addColorStop(0.6, "rgba(255,120,30,0.35)");
  degrade.addColorStop(1, "rgba(255,80,0,0)");
  g.fillStyle = degrade;
  g.fillRect(0, 0, 128, 128);

  // Éclats en étoile
  g.translate(64, 64);
  g.fillStyle = "rgba(255,230,160,0.85)";
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath();
    g.moveTo(0, -3);
    g.lineTo(62, 0);
    g.lineTo(0, 3);
    g.closePath();
    g.fill();
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const textureFlash = creerTextureFlash();

// --- Étincelles (un seul objet Points pour toutes les particules) ---
const MAX_PARTICULES = 300;
const posP = new Float32Array(MAX_PARTICULES * 3);
const colP = new Float32Array(MAX_PARTICULES * 3);
const velP = new Float32Array(MAX_PARTICULES * 3);
const vieP = new Float32Array(MAX_PARTICULES);     // temps de vie restant
const dureeP = new Float32Array(MAX_PARTICULES);   // durée de vie totale
let indexP = 0;
const couleurEtincelles = new THREE.Color(CONFIG_IMPACT.couleurEtincelles);

function creerTexturePoint() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  const d = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  d.addColorStop(0, "rgba(255,255,255,1)");
  d.addColorStop(0.4, "rgba(255,255,255,0.6)");
  d.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = d;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const geometrieParticules = new THREE.BufferGeometry();
geometrieParticules.setAttribute("position", new THREE.BufferAttribute(posP, 3));
geometrieParticules.setAttribute("color", new THREE.BufferAttribute(colP, 3));
const particules = new THREE.Points(
  geometrieParticules,
  new THREE.PointsMaterial({
    size: CONFIG_IMPACT.tailleEtincelles,
    sizeAttenuation: false,      // taille constante à l'écran, visible même de loin
    map: creerTexturePoint(),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
particules.frustumCulled = false;
scene.add(particules);

export function creerEtincelles(point, normale) {
  for (let k = 0; k < CONFIG_IMPACT.etincelles; k++) {
    const i = indexP;
    indexP = (indexP + 1) % MAX_PARTICULES;
    const o = i * 3;

    // Direction : surtout le long de la normale, avec dispersion aléatoire
    tmpVec.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .multiplyScalar(0.8)
      .addScaledVector(normale, 1)
      .normalize();
    if (tmpVec.dot(normale) < 0) tmpVec.reflect(normale); // jamais vers l'intérieur de la surface
    tmpVec.multiplyScalar(CONFIG_IMPACT.vitesseEtincelles * (0.4 + Math.random() * 0.9));

    posP[o] = point.x + normale.x * 0.01;
    posP[o + 1] = point.y + normale.y * 0.01;
    posP[o + 2] = point.z + normale.z * 0.01;
    velP[o] = tmpVec.x;
    velP[o + 1] = tmpVec.y;
    velP[o + 2] = tmpVec.z;

    dureeP[i] = CONFIG_IMPACT.dureeEtincelles * (0.5 + Math.random() * 0.7);
    vieP[i] = dureeP[i];
    colP[o] = couleurEtincelles.r;
    colP[o + 1] = couleurEtincelles.g;
    colP[o + 2] = couleurEtincelles.b;
  }
  geometrieParticules.attributes.position.needsUpdate = true;
  geometrieParticules.attributes.color.needsUpdate = true;
}

export function mettreAJourEtincelles(dt) {
  let actif = false;
  for (let i = 0; i < MAX_PARTICULES; i++) {
    if (vieP[i] <= 0) continue;
    actif = true;
    const o = i * 3;
    vieP[i] -= dt;

    velP[o + 1] -= CONFIG_IMPACT.gravite * dt;
    posP[o] += velP[o] * dt;
    posP[o + 1] += velP[o + 1] * dt;
    posP[o + 2] += velP[o + 2] * dt;

    // Rebond sur le sol
    if (posP[o + 1] < HAUTEUR_SOL) {
      posP[o + 1] = HAUTEUR_SOL;
      velP[o + 1] *= -0.35;
      velP[o] *= 0.7;
      velP[o + 2] *= 0.7;
    }

    // Fondu : la couleur tend vers le noir (invisible en mode additif)
    const f = vieP[i] > 0 ? vieP[i] / dureeP[i] : 0;
    colP[o] = couleurEtincelles.r * f;
    colP[o + 1] = couleurEtincelles.g * f;
    colP[o + 2] = couleurEtincelles.b * f;
  }
  if (actif) {
    geometrieParticules.attributes.position.needsUpdate = true;
    geometrieParticules.attributes.color.needsUpdate = true;
  }
}

// --- Trous de balle ---
function creerTextureTrou() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const d = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  d.addColorStop(0, "rgba(0,0,0,0.95)");
  d.addColorStop(0.35, "rgba(0,0,0,0.85)");
  d.addColorStop(0.55, "rgba(20,15,10,0.45)");
  d.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = d;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const geometrieTrou = new THREE.PlaneGeometry(1, 1);
const materiauTrou = new THREE.MeshBasicMaterial({
  map: creerTextureTrou(),
  transparent: true,
  depthWrite: false,
  polygonOffset: true,         // évite le scintillement sur la surface
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4
});
const trous = [];

function creerTrou(point, normale) {
  const trou = new THREE.Mesh(geometrieTrou, materiauTrou);
  const taille = CONFIG_IMPACT.tailleTrou * (0.8 + Math.random() * 0.5);
  trou.scale.set(taille, taille, 1);
  trou.position.copy(point).addScaledVector(normale, 0.006);
  trou.quaternion.setFromUnitVectors(axeZ, normale);
  trou.rotateZ(Math.random() * Math.PI * 2);
  scene.add(trou);
  trous.push(trou);
  if (trous.length > CONFIG_IMPACT.maxTrous) scene.remove(trous.shift());
}

// --- Éclat lumineux à l'impact ---
const flashImpact = new THREE.Sprite(new THREE.SpriteMaterial({
  map: textureFlash,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false
}));
flashImpact.visible = false;
scene.add(flashImpact);

const lumiereImpact = new THREE.PointLight(0xffaa55, 0, 3);
scene.add(lumiereImpact);
let dureeFlashImpact = 0;

// sansTrou : true pour la cible (un trou resterait dans le vide quand elle disparaît)
export function creerImpact(point, normale, distance, sansTrou = false) {
  if (CONFIG_IMPACT.etincelles > 0) creerEtincelles(point, normale);
  if (CONFIG_IMPACT.trou && !sansTrou) creerTrou(point, normale);

  if (CONFIG_IMPACT.flash) {
    const t = CONFIG_IMPACT.tailleFlash * (0.8 + Math.random() * 0.4);
    flashImpact.position.copy(point).addScaledVector(normale, 0.03);
    flashImpact.scale.set(t, t, 1);
    flashImpact.material.rotation = Math.random() * Math.PI * 2;
    flashImpact.visible = true;
    lumiereImpact.position.copy(point).addScaledVector(normale, 0.15);
    dureeFlashImpact = 0.08;
  }

  jouerSonImpact(distance);
}

export function mettreAJourFlashImpact(dt) {
  if (dureeFlashImpact > 0) {
    dureeFlashImpact -= dt;
    lumiereImpact.intensity = 5;
    if (dureeFlashImpact <= 0) flashImpact.visible = false;
  } else {
    lumiereImpact.intensity = 0;
  }
}