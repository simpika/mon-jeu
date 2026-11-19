// =====================================================
// JOUEURS DISTANTS : avatars des autres joueurs, lissés entre deux états reçus
//
// Chaque état reçu (position des yeux, regard) est daté à sa réception. L'avatar est affiché
// CONFIG_MULTI.retardAffichage secondes dans le passé, en interpolant entre les deux états qui encadrent
// cet instant : le mouvement reste fluide même si les messages arrivent irrégulièrement.
// =====================================================
import * as THREE from "three";
import { scene } from "./moteur.js";
import { CONFIG_MULTI, HAUTEUR_YEUX } from "./config.js";
import { creerSilhouette } from "./silhouette.js";

const avatars = new Map();   // id → avatar

const geometrieArme = new THREE.BoxGeometry(0.07, 0.11, 0.62);
geometrieArme.translate(0, 0, 0.3);   // l'arme part de l'épaule vers l'avant (+Z)
const materiauArme = new THREE.MeshStandardMaterial({ color: CONFIG_MULTI.couleurArmeAvatar, roughness: 0.5, metalness: 0.4 });

// Pseudo affiché au-dessus de la tête
function creerEtiquette(pseudo) {
  const toile = document.createElement("canvas");
  toile.width = 256;
  toile.height = 64;
  const g = toile.getContext("2d");
  g.font = "bold 34px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0, 0, 0, 0.85)";
  g.strokeText(pseudo, 128, 34);
  g.fillStyle = "#ffffff";
  g.fillText(pseudo, 128, 34);
  const texture = new THREE.CanvasTexture(toile);
  texture.colorSpace = THREE.SRGBColorSpace;
  const etiquette = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  etiquette.scale.set(1.0, 0.25, 1);
  return etiquette;
}

export function ajouterJoueurDistant(id, pseudo) {
  if (avatars.has(id)) return;
  const materiaux = CONFIG_MULTI.couleursAvatar.map(couleur =>
    new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.6, metalness: 0.1 }));
  const { groupe, parties } = creerSilhouette(materiaux);
  parties.forEach(partie => { partie.userData.joueurId = id; });

  // Arme tenue à l'épaule droite : elle suit le regard vertical
  const pivotArme = new THREE.Group();
  pivotArme.position.set(0.2, 1.38, 0.08);
  pivotArme.add(new THREE.Mesh(geometrieArme, materiauArme));
  groupe.add(pivotArme);

  const etiquette = creerEtiquette(pseudo);
  etiquette.position.set(0, 2.05, 0);
  groupe.add(etiquette);

  groupe.visible = false;   // visible dès le premier état reçu
  scene.add(groupe);
  avatars.set(id, { id, pseudo, groupe, parties, pivotArme, etiquette, materiaux, etats: [] });
}

export function retirerJoueurDistant(id) {
  const avatar = avatars.get(id);
  if (!avatar) return;
  scene.remove(avatar.groupe);
  avatar.materiaux.forEach(m => m.dispose());
  avatar.etiquette.material.map.dispose();
  avatar.etiquette.material.dispose();
  avatar.parties.forEach(partie => partie.geometry.dispose());
  avatars.delete(id);
}

export function retirerTousLesJoueurs() {
  [...avatars.keys()].forEach(retirerJoueurDistant);
}

// e : { x, y, z } = position des yeux, yaw et pitch = regard
export function recevoirEtat(id, e) {
  const avatar = avatars.get(id);
  if (!avatar || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z)) return;
  avatar.etats.push({ t: performance.now(), x: e.x, y: e.y, z: e.z, yaw: +e.yaw || 0, pitch: +e.pitch || 0 });
  if (avatar.etats.length > 40) avatar.etats.shift();
}

// Écart d'angle ramené entre -π et π (pour tourner par le chemin le plus court)
function ecartAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function mettreAJourJoueursDistants() {
  const instant = performance.now() - CONFIG_MULTI.retardAffichage * 1000;

  for (const avatar of avatars.values()) {
    const etats = avatar.etats;
    if (etats.length === 0) continue;

    // On garde etats[0] juste avant l'instant affiché et etats[1] juste après
    while (etats.length >= 2 && etats[1].t <= instant) etats.shift();

    let x, y, z, yaw, pitch;
    const a = etats[0];
    if (etats.length >= 2 && a.t <= instant) {
      const b = etats[1];
      const k = Math.min(1, Math.max(0, (instant - a.t) / (b.t - a.t)));
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
      z = a.z + (b.z - a.z) * k;
      yaw = a.yaw + ecartAngle(a.yaw, b.yaw) * k;
      pitch = a.pitch + (b.pitch - a.pitch) * k;
    } else {
      ({ x, y, z, yaw, pitch } = a);   // un seul état (ou pas encore d'état plus récent) : on reste dessus
    }

    // La silhouette regarde vers +Z ; le joueur regarde vers -Z tourné de yaw
    avatar.groupe.position.set(x, y - HAUTEUR_YEUX, z);
    avatar.groupe.rotation.y = yaw + Math.PI;
    avatar.pivotArme.rotation.x = -pitch;
    avatar.groupe.visible = true;
  }
}

// Positions au sol des joueurs visibles (mini-carte)
export function positionsJoueursDistants() {
  const positions = [];
  for (const avatar of avatars.values()) {
    if (avatar.groupe.visible) positions.push({ x: avatar.groupe.position.x, z: avatar.groupe.position.z });
  }
  return positions;
}
