// =====================================================
// JOUEURS DISTANTS : avatars des autres joueurs, lissés entre deux états reçus
//
// Chaque état reçu (position des yeux, regard) est daté à sa réception. L'avatar est affiché
// CONFIG_MULTI.retardAffichage secondes dans le passé, en interpolant entre les deux états qui encadrent
// cet instant : le mouvement reste fluide même si les messages arrivent irrégulièrement.
//
// Couleurs vues par le joueur local : alliés en bleu, ennemis en rouge.
// Seuls les ennemis vivants reçoivent les balles (leurs parties sont ajoutées aux surfaces touchables).
// =====================================================
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { scene } from "./moteur.js";
import { CONFIG_MULTI, CONFIG_PERSONNAGES, HAUTEUR_YEUX } from "./config.js";
import { surfaces } from "./monde.js";
import { creerSilhouette } from "./silhouette.js";

const avatars = new Map();   // id → avatar

// =====================================================
// MODÈLES DES PERSONNAGES (Homme / Femme), chargés une fois puis copiés pour chaque avatar
// =====================================================
const chargeurFbx = new FBXLoader();
const modeles = {};   // nom → promesse du modèle prêt à copier (null si le fichier est introuvable)

// Met le modèle debout, à la taille d'un joueur, pieds en 0 et centré sur l'axe vertical
function normaliserModele(objet, reglages) {
  const pivot = new THREE.Group();
  pivot.add(objet);
  const boite = new THREE.Box3();
  const taille = new THREE.Vector3();

  pivot.updateMatrixWorld(true);
  boite.setFromObject(pivot).getSize(taille);
  // Modèle couché (axe vertical Z dans le fichier) : on le redresse
  if (taille.z > taille.y * 1.3 && taille.z >= taille.x) {
    objet.rotation.x -= Math.PI / 2;
    pivot.updateMatrixWorld(true);
    boite.setFromObject(pivot).getSize(taille);
  }

  pivot.scale.setScalar(CONFIG_PERSONNAGES.hauteur / Math.max(taille.y, 1e-6));
  pivot.updateMatrixWorld(true);
  boite.setFromObject(pivot);
  const centre = boite.getCenter(new THREE.Vector3());
  pivot.position.set(-centre.x, -boite.min.y, -centre.z);

  const modele = new THREE.Group();
  modele.add(pivot);
  modele.rotation.y = reglages.rotationY || 0;   // orientation : le joueur regarde vers +Z de l'avatar
  return modele;
}

function chargerModele(nom) {
  if (!modeles[nom]) {
    const reglages = CONFIG_PERSONNAGES[nom];
    modeles[nom] = new Promise(resoudre => {
      chargeurFbx.load(
        encodeURI(reglages.fichier),
        objet => resoudre(normaliserModele(objet, reglages)),
        undefined,
        erreur => {
          console.warn("Personnage introuvable (silhouette utilisée à la place) : " + reglages.fichier, erreur);
          resoudre(null);
        }
      );
    });
  }
  return modeles[nom];
}

// Chargés dès le départ : l'avatar d'un joueur qui arrive s'affiche aussitôt
chargerModele("homme");
chargerModele("femme");

const geometrieArme = new THREE.BoxGeometry(0.07, 0.11, 0.62);
geometrieArme.translate(0, 0, 0.3);   // l'arme part de l'épaule vers l'avant (+Z)
const materiauArme = new THREE.MeshStandardMaterial({ color: CONFIG_MULTI.couleurArmeAvatar, roughness: 0.5, metalness: 0.4 });

const LARGEUR_BARRE = 0.58;

// Pseudo affiché au-dessus de la tête (texte blanc, teinté en bleu ou rouge par la couleur du sprite)
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
  etiquette.renderOrder = 3;
  return etiquette;
}

// Barre de vie sous le pseudo (ennemis seulement)
function creerBarreVie() {
  const fond = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, transparent: true, opacity: 0.85, depthWrite: false }));
  fond.scale.set(LARGEUR_BARRE + 0.04, 0.07, 1);
  fond.renderOrder = 1;
  const remplissage = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x44dd66, transparent: true, depthWrite: false }));
  remplissage.renderOrder = 2;
  const barre = new THREE.Group();
  barre.add(fond, remplissage);
  return { barre, remplissage };
}

function dessinerBarre(avatar) {
  const ratio = Math.max(0, Math.min(1, avatar.vie / CONFIG_MULTI.vie));
  const largeur = LARGEUR_BARRE * Math.max(ratio, 0.001);
  avatar.remplissage.scale.set(largeur, 0.04, 1);
  // Le sprite est centré sur sa position : on décale son point d'ancrage pour garder le bord gauche fixe
  avatar.remplissage.center.set((LARGEUR_BARRE / 2) / largeur, 0.5);
  avatar.remplissage.material.color.setHSL(0.33 * ratio, 0.75, 0.5);   // vert → rouge
}

// Remplace le corps visible de l'avatar par le modèle du personnage (la silhouette reste comme zones de dégâts)
export function definirPersonnage(id, personnage) {
  const avatar = avatars.get(id);
  if (!avatar || !CONFIG_PERSONNAGES[personnage] || avatar.personnage === personnage) return;
  avatar.personnage = personnage;
  const demande = ++avatar.demandeModele;
  chargerModele(personnage).then(modele => {
    if (avatars.get(id) !== avatar || avatar.demandeModele !== demande) return;   // parti ou nouveau choix entre-temps
    if (avatar.modele) avatar.groupe.remove(avatar.modele);
    avatar.modele = null;
    if (!modele) {
      avatar.parties.forEach(partie => { partie.visible = true; });   // fichier introuvable : silhouette visible
      return;
    }
    const copie = modele.clone(true);
    copie.traverse(objet => { if (objet.isMesh) objet.material = avatar.materiauCorps; });
    avatar.groupe.add(copie);
    avatar.modele = copie;
    // Les parties de la silhouette restent touchables par les balles, mais ne sont plus dessinées
    avatar.parties.forEach(partie => { partie.visible = false; });
  });
}

export function ajouterJoueurDistant(id, pseudo, personnage = "homme") {
  if (avatars.has(id)) return;
  const materiaux = CONFIG_MULTI.couleursAllie.map(couleur =>
    new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.6, metalness: 0.1 }));
  const { groupe, parties } = creerSilhouette(materiaux);
  parties.forEach(partie => { partie.userData.joueurId = id; });

  // Arme tenue à l'épaule droite : elle suit le regard vertical
  const pivotArme = new THREE.Group();
  pivotArme.position.set(0.2, 1.38, 0.08);
  pivotArme.add(new THREE.Mesh(geometrieArme, materiauArme));
  groupe.add(pivotArme);

  const etiquette = creerEtiquette(pseudo);
  etiquette.position.set(0, 2.08, 0);
  groupe.add(etiquette);

  const { barre, remplissage } = creerBarreVie();
  barre.position.set(0, 1.94, 0);
  barre.visible = false;
  groupe.add(barre);

  groupe.visible = false;   // visible dès le premier état reçu
  scene.add(groupe);
  const avatar = {
    id, pseudo, groupe, parties, pivotArme, etiquette, barre, remplissage, materiaux,
    etats: [],
    allie: null,            // null tant que les équipes ne sont pas connues
    vivant: true,
    vie: CONFIG_MULTI.vie,
    dernierTir: -Infinity,  // instant du dernier tir (repère sur la mini-carte)
    personnage: null,       // "homme" ou "femme"
    modele: null,           // modèle 3D affiché (null : silhouette affichée)
    demandeModele: 0,
    materiauCorps: new THREE.MeshStandardMaterial({ color: CONFIG_MULTI.couleursAllie[1], roughness: 0.7, metalness: 0.05 })
  };
  avatars.set(id, avatar);
  dessinerBarre(avatar);
  definirPersonnage(id, personnage);
}

// Un avatar reçoit les balles seulement s'il est ennemi et vivant
function majSurfaces(avatar) {
  const touchable = avatar.allie === false && avatar.vivant;
  avatar.parties.forEach(partie => {
    const index = surfaces.indexOf(partie);
    if (touchable && index === -1) surfaces.push(partie);
    if (!touchable && index !== -1) surfaces.splice(index, 1);
  });
}

export function retirerJoueurDistant(id) {
  const avatar = avatars.get(id);
  if (!avatar) return;
  avatar.vivant = false;
  majSurfaces(avatar);
  scene.remove(avatar.groupe);
  avatar.materiaux.forEach(m => m.dispose());
  avatar.materiauCorps.dispose();   // la géométrie du modèle est partagée : elle n'est pas libérée
  avatar.etiquette.material.map.dispose();
  avatar.etiquette.material.dispose();
  avatar.barre.children.forEach(s => s.material.dispose());
  avatar.parties.forEach(partie => partie.geometry.dispose());
  avatars.delete(id);
}

export function retirerTousLesJoueurs() {
  [...avatars.keys()].forEach(retirerJoueurDistant);
}

// allie : true (bleu, intouchable), false (rouge, touchable, barre de vie visible)
export function definirAllegeance(id, allie) {
  const avatar = avatars.get(id);
  if (!avatar || avatar.allie === allie) return;
  avatar.allie = allie;
  const couleurs = allie ? CONFIG_MULTI.couleursAllie : CONFIG_MULTI.couleursEnnemi;
  avatar.materiaux.forEach((m, i) => m.color.setHex(couleurs[i]));
  avatar.materiauCorps.color.setHex(couleurs[1]);
  avatar.etiquette.material.color.set(allie ? CONFIG_MULTI.couleurTexteAllie : CONFIG_MULTI.couleurTexteEnnemi);
  avatar.barre.visible = !allie;
  majSurfaces(avatar);
}

export function definirVie(id, vie) {
  const avatar = avatars.get(id);
  if (!avatar) return;
  avatar.vie = vie;
  dessinerBarre(avatar);
}

export function definirVivant(id, vivant) {
  const avatar = avatars.get(id);
  if (!avatar || avatar.vivant === vivant) return;
  avatar.vivant = vivant;
  if (!vivant) avatar.groupe.visible = false;
  // Réapparition : on oublie les anciennes positions (sinon l'avatar glisserait du lieu de sa mort jusqu'au spawn)
  else avatar.etats = [];
  majSurfaces(avatar);
}

export function joueurTouchable(id) {
  const avatar = avatars.get(id);
  return !!avatar && avatar.vivant && avatar.allie === false;
}

export function signalerTirDistant(id) {
  const avatar = avatars.get(id);
  if (avatar) avatar.dernierTir = performance.now();
}

// Position des pieds d'un joueur (null s'il est inconnu)
export function positionJoueurDistant(id) {
  const avatar = avatars.get(id);
  return avatar && avatar.etats.length ? avatar.groupe.position : null;
}

// Pieds de tous les joueurs visibles et vivants, alliés compris (collisions entre joueurs)
export function corpsJoueursDistants() {
  const corps = [];
  for (const avatar of avatars.values()) {
    if (avatar.vivant && avatar.groupe.visible) corps.push(avatar.groupe.position);
  }
  return corps;
}

// Ennemis vivants (dégâts des grenades) : { id, base = position des pieds }
export function ennemisVivants() {
  const liste = [];
  for (const avatar of avatars.values()) {
    if (avatar.allie === false && avatar.vivant && avatar.etats.length) liste.push({ id: avatar.id, base: avatar.groupe.position });
  }
  return liste;
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
    avatar.groupe.visible = avatar.vivant;
  }
}

// Joueurs à montrer sur la mini-carte : alliés vivants, et ennemis qui viennent de tirer
export function positionsJoueursDistants() {
  const positions = [];
  const maintenant = performance.now();
  for (const avatar of avatars.values()) {
    if (!avatar.groupe.visible) continue;
    const repere = avatar.allie !== false || maintenant - avatar.dernierTir < CONFIG_MULTI.dureeRepereEnnemi * 1000;
    if (repere) positions.push({ x: avatar.groupe.position.x, z: avatar.groupe.position.z, allie: avatar.allie !== false });
  }
  return positions;
}
