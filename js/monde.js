// =====================================================
// MONDE : sol, rampes, escaliers, passerelles, pont, bunker...
// =====================================================
import * as THREE from "three";
import { scene } from "./moteur.js";
import { HAUTEUR_SOL, CONFIG_DOMINATION } from "./config.js";

export const surfaces = [];   // objets qui reçoivent des impacts de balles
export const solides = [];    // éléments praticables : empreinte, dessous, hauteur du dessus (collisions et atterrissage)
export const elementsCarte = []; // empreintes au sol des éléments du décor, dessinées sur la mini-carte
export const objectifs = [];     // emplacements d'objectifs (A, B, C...) : marquage au sol, repère flottant et mini-carte

// Ajoute une empreinte rectangulaire à la mini-carte (haut : hauteur du sommet, pour dessiner le plus haut par-dessus)
function ajouterACarte(minX, maxX, minZ, maxZ, couleur, haut) {
  elementsCarte.push({ minX, maxX, minZ, maxZ, couleur: "#" + couleur.toString(16).padStart(6, "0"), haut });
}

const COULEURS_DECOR = {
  beton: 0x7b8088,
  betonFonce: 0x555a62,
  metal: 0x3d434b,
  escalier: 0x9097a0,
  rampe: 0x858c96,
  securite: 0xd9a21b,
  caisse: 0x8c6b3d,
  eau: 0x1c4a6e
};

const cacheMateriaux = new Map();
function materiauDecor(couleur, deuxFaces = false) {
  const cle = couleur + (deuxFaces ? "-double" : "-simple");
  if (!cacheMateriaux.has(cle)) {
    cacheMateriaux.set(cle, new THREE.MeshStandardMaterial({
      color: couleur,
      roughness: 0.85,
      metalness: 0.05,
      side: deuxFaces ? THREE.DoubleSide : THREE.FrontSide
    }));
  }
  return cacheMateriaux.get(cle);
}

// Distance entre un point au sol et l'empreinte d'un élément du décor
export function distanceEmpreinte(solide, x, z) {
  const dx = Math.max(solide.minX - x, 0, x - solide.maxX);
  const dz = Math.max(solide.minZ - z, 0, z - solide.maxZ);
  return Math.hypot(dx, dz);
}

// Un élément praticable : empreinte au sol (minX, maxX, minZ, maxZ), hauteur du dessous (bas)
// et fonction donnant la hauteur du dessus en un point (hauteurEn)
function enregistrerSolide(solide) {
  // Un élément qui occupe la hauteur d'un joueur au sol empêche la cible d'y apparaître
  solide.bloqueSol = solide.bas < HAUTEUR_SOL + 2.0;
  solides.push(solide);
}

// Boîte (mur, plateforme, caisse, colonne) : yBas et yHaut sont mesurés au-dessus du sol
export function ajouterBoite(cx, cz, largeur, profondeur, yBas, yHaut, couleur) {
  const bas = HAUTEUR_SOL + yBas;
  const haut = HAUTEUR_SOL + yHaut;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(largeur, haut - bas, profondeur),
    materiauDecor(couleur)
  );
  mesh.position.set(cx, (bas + haut) / 2, cz);
  scene.add(mesh);
  surfaces.push(mesh);
  ajouterACarte(cx - largeur / 2, cx + largeur / 2, cz - profondeur / 2, cz + profondeur / 2, couleur, haut);

  enregistrerSolide({
    minX: cx - largeur / 2, maxX: cx + largeur / 2,
    minZ: cz - profondeur / 2, maxZ: cz + profondeur / 2,
    bas,
    hauteurEn: () => haut
  });
  return mesh;
}

// Progression (0 à 1) le long de la direction de montée d'une rampe ou d'un escalier
function progressionLe(direction, minX, maxX, minZ, maxZ, x, z) {
  let u;
  if (direction === "+x") u = (x - minX) / (maxX - minX);
  else if (direction === "-x") u = (maxX - x) / (maxX - minX);
  else if (direction === "+z") u = (z - minZ) / (maxZ - minZ);
  else u = (maxZ - z) / (maxZ - minZ);
  return Math.min(1, Math.max(0, u));
}

// Rampe : monte dans la direction donnée ("+x", "-x", "+z" ou "-z") de yBas à yHaut
export function ajouterRampe(minX, maxX, minZ, maxZ, direction, yBas, yHaut, couleur) {
  const bas = HAUTEUR_SOL + yBas;
  const haut = HAUTEUR_SOL + yHaut;
  const sensX = direction === "+x" || direction === "-x";
  const longueur = sensX ? maxX - minX : maxZ - minZ;
  const largeur = sensX ? maxZ - minZ : maxX - minX;

  // Profil en coupe : un triangle qui monte vers +x, extrudé sur la largeur puis orienté
  const profil = new THREE.Shape();
  profil.moveTo(0, 0);
  profil.lineTo(longueur, 0);
  profil.lineTo(longueur, haut - bas);
  profil.closePath();

  const geometrie = new THREE.ExtrudeGeometry(profil, { depth: largeur, bevelEnabled: false });
  geometrie.translate(-longueur / 2, 0, -largeur / 2);

  const mesh = new THREE.Mesh(geometrie, materiauDecor(couleur, true));
  mesh.rotation.y = { "+x": 0, "-x": Math.PI, "+z": -Math.PI / 2, "-z": Math.PI / 2 }[direction];
  mesh.position.set((minX + maxX) / 2, bas, (minZ + maxZ) / 2);
  scene.add(mesh);
  surfaces.push(mesh);
  ajouterACarte(minX, maxX, minZ, maxZ, couleur, haut);

  enregistrerSolide({
    minX, maxX, minZ, maxZ,
    bas,
    hauteurEn: (x, z) => bas + (haut - bas) * progressionLe(direction, minX, maxX, minZ, maxZ, x, z)
  });
}

// Escalier : "nombre" marches de "hauteurMarche" mètres, qui montent dans la direction donnée
export function ajouterEscalier(minX, maxX, minZ, maxZ, direction, yBas, nombre, hauteurMarche, couleur) {
  const bas = HAUTEUR_SOL + yBas;
  const sensX = direction === "+x" || direction === "-x";
  const longueur = sensX ? maxX - minX : maxZ - minZ;
  const profondeur = longueur / nombre;
  const materiau = materiauDecor(couleur);

  for (let i = 0; i < nombre; i++) {
    const a = i * profondeur;
    const b = (i + 1) * profondeur;
    let x0 = minX, x1 = maxX, z0 = minZ, z1 = maxZ;
    if (direction === "+x") { x0 = minX + a; x1 = minX + b; }
    else if (direction === "-x") { x1 = maxX - a; x0 = maxX - b; }
    else if (direction === "+z") { z0 = minZ + a; z1 = minZ + b; }
    else { z1 = maxZ - a; z0 = maxZ - b; }

    const hauteur = (i + 1) * hauteurMarche;
    const marcheMesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, hauteur, z1 - z0), materiau);
    marcheMesh.position.set((x0 + x1) / 2, bas + hauteur / 2, (z0 + z1) / 2);
    scene.add(marcheMesh);
    surfaces.push(marcheMesh);
  }
  ajouterACarte(minX, maxX, minZ, maxZ, couleur, bas + nombre * hauteurMarche);

  enregistrerSolide({
    minX, maxX, minZ, maxZ,
    bas,
    hauteurEn: (x, z) => {
      const u = progressionLe(direction, minX, maxX, minZ, maxZ, x, z);
      const index = Math.min(nombre - 1, Math.floor(u * nombre));
      return bas + (index + 1) * hauteurMarche;
    }
  });
}

// Garde-corps : segment (x0, z0) → (x1, z1), parallèle à un axe, posé sur un plancher à la hauteur yPont
export function ajouterGardeCorps(x0, z0, x1, z1, yPont) {
  const bas = HAUTEUR_SOL + yPont;
  const hauteur = 1.2;
  const epaisseur = 0.08;
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
  const longueurX = maxX - minX, longueurZ = maxZ - minZ;
  const materiau = materiauDecor(COULEURS_DECOR.securite);

  // Lisses horizontales (haute et médiane)
  [hauteur - 0.05, hauteur * 0.5].forEach(h => {
    const lisse = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(longueurX, epaisseur), epaisseur, Math.max(longueurZ, epaisseur)),
      materiau
    );
    lisse.position.set((minX + maxX) / 2, bas + h, (minZ + maxZ) / 2);
    scene.add(lisse);
    surfaces.push(lisse);
  });

  // Poteaux
  const longueur = Math.max(longueurX, longueurZ);
  const nombrePoteaux = Math.max(2, Math.ceil(longueur / 1.5) + 1);
  const geometriePoteau = new THREE.BoxGeometry(epaisseur, hauteur, epaisseur);
  for (let i = 0; i < nombrePoteaux; i++) {
    const t = i / (nombrePoteaux - 1);
    const poteau = new THREE.Mesh(geometriePoteau, materiau);
    poteau.position.set(minX + longueurX * t, bas + hauteur / 2, minZ + longueurZ * t);
    scene.add(poteau);
    surfaces.push(poteau);
  }

  ajouterACarte(minX - 0.1, maxX + 0.1, minZ - 0.1, maxZ + 0.1, COULEURS_DECOR.securite, bas + hauteur);

  // Le garde-corps est un obstacle plein pour le joueur (il empêche de tomber)
  enregistrerSolide({
    minX: minX - epaisseur / 2, maxX: maxX + epaisseur / 2,
    minZ: minZ - epaisseur / 2, maxZ: maxZ + epaisseur / 2,
    bas,
    hauteurEn: () => bas + hauteur
  });
}

// Sol (il reçoit les impacts) et quadrillage posé juste au-dessus (opaciteGrille : 0 = pas de quadrillage)
export function creerSol(couleur, opaciteGrille = 1) {
  const sol = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.95 })
  );
  sol.rotation.x = -Math.PI / 2;
  sol.position.y = HAUTEUR_SOL;
  scene.add(sol);
  surfaces.push(sol);

  if (opaciteGrille > 0) {
    const grille = new THREE.GridHelper(200, 100, 0x888888, 0x444444);
    grille.material.transparent = opaciteGrille < 1;
    grille.material.opacity = opaciteGrille;
    grille.position.y = HAUTEUR_SOL + 0.003;
    scene.add(grille);
  }
}

// Bande peinte au sol (marquage de voie, limite de zone) : décor seul, sans collision
export function ajouterMarquage(minX, maxX, minZ, maxZ, couleur) {
  const bande = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
    new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.9 })
  );
  bande.rotation.x = -Math.PI / 2;
  bande.position.set((minX + maxX) / 2, HAUTEUR_SOL + 0.008, (minZ + maxZ) / 2);
  scene.add(bande);
}

// Dessine une lettre d'objectif dans un cercle, en blanc (la couleur vient de la teinte du matériau)
// rempli : fond sombre et grande lettre (repère flottant) ; sinon anneau de la zone de capture (marquage au sol)
function texteObjectif(lettre, rempli) {
  const toile = document.createElement("canvas");
  toile.width = toile.height = 256;
  const g = toile.getContext("2d");
  // Disque plein : il prend toute la couleur de l'équipe qui contrôle le point (teinte du matériau)
  g.beginPath();
  g.arc(128, 128, rempli ? 112 : 120, 0, Math.PI * 2);
  g.fillStyle = rempli ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.3)";
  g.fill();
  g.lineWidth = rempli ? 14 : 8;
  g.strokeStyle = "rgba(255, 255, 255, 1)";
  g.stroke();
  g.fillStyle = rempli ? "#151515" : "#ffffff";   // lettre sombre sur le disque coloré du repère flottant
  g.font = "bold " + (rempli ? 150 : 90) + "px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(lettre, 128, rempli ? 138 : 133);
  const texture = new THREE.CanvasTexture(toile);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const COULEUR_OBJECTIF = "#ff8a1f";   // couleur des objectifs hors Domination

// Emplacement d'objectif : cercle de la zone de capture au sol, lettre flottante au-dessus, repère sur la mini-carte
// yHaut : hauteur du plateau au-dessus du sol
export function ajouterObjectif(lettre, x, z, yHaut) {
  const y = HAUTEUR_SOL + yHaut;
  const diametre = 2 * CONFIG_DOMINATION.rayonCapture;

  const marquage = new THREE.Mesh(
    new THREE.PlaneGeometry(diametre, diametre),
    new THREE.MeshBasicMaterial({ map: texteObjectif(lettre, false), transparent: true, depthWrite: false })
  );
  marquage.rotation.x = -Math.PI / 2;
  marquage.position.set(x, y + 0.02, z);
  scene.add(marquage);

  const repere = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texteObjectif(lettre, true), transparent: true, depthWrite: false })
  );
  repere.scale.set(1.1, 1.1, 1);
  repere.position.set(x, y + 3.2, z);
  scene.add(repere);

  const objectif = { lettre, x, z, y, marquage, repere, couleur: COULEUR_OBJECTIF };
  objectifs.push(objectif);
  colorerObjectif(objectif, COULEUR_OBJECTIF);
}

// Couleur d'un objectif (marquage, lettre flottante et mini-carte) : couleur CSS, ex. "#7fbfff"
export function colorerObjectif(objectif, couleur) {
  if (objectif.couleur === couleur && objectif.marquage.material.userData.couleur === couleur) return;
  objectif.couleur = couleur;
  objectif.marquage.material.color.set(couleur);
  objectif.marquage.material.userData.couleur = couleur;
  objectif.repere.material.color.set(couleur);
}

// Carte « Entraînement » (décor de test)
export function creerMonde() {
  creerSol(0x2b2b2b);

  const C = COULEURS_DECOR;

  // ---------------------------------------------------
  // NORD : deux tours reliées par une passerelle
  // (escalier à gauche, rampe à droite)
  // ---------------------------------------------------
  const hautTour = 3.0;

  [-12, 12].forEach(cx => {
    // Plateforme de la tour et ses quatre colonnes
    ajouterBoite(cx, -22, 6, 6, hautTour - 0.4, hautTour, C.beton);
    [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].forEach(([dx, dz]) => {
      ajouterBoite(cx + dx, -22 + dz, 0.7, 0.7, 0, hautTour - 0.4, C.betonFonce);
    });

    // Garde-corps : tout le pourtour, sauf les ouvertures de la passerelle, de l'escalier et de la rampe
    const x0 = cx - 2.95, x1 = cx + 2.95;
    ajouterGardeCorps(x0, -24.95, x1, -24.95, hautTour);   // côté nord
    ajouterGardeCorps(x0, -19.05, x1, -19.05, hautTour);   // côté sud
    [x0, x1].forEach(x => {                                // côtés ouest et est, avec une ouverture de 2,4 m
      ajouterGardeCorps(x, -24.95, x, -23.2, hautTour);
      ajouterGardeCorps(x, -20.8, x, -19.05, hautTour);
    });
  });

  // Passerelle entre les deux tours, avec ses appuis et ses garde-corps
  ajouterBoite(0, -22, 18, 2.4, hautTour - 0.35, hautTour, C.metal);
  [-4.5, 0, 4.5].forEach(x => ajouterBoite(x, -22, 0.5, 0.5, 0, hautTour - 0.35, C.betonFonce));
  ajouterGardeCorps(-9, -23.15, 9, -23.15, hautTour);
  ajouterGardeCorps(-9, -20.85, 9, -20.85, hautTour);

  // Accès : escalier de 15 marches à gauche, rampe à droite
  ajouterEscalier(-21, -15, -23.2, -20.8, "+x", 0, 15, 0.2, C.escalier);
  ajouterRampe(15, 22, -23.2, -20.8, "-x", 0, hautTour, C.rampe);

  // ---------------------------------------------------
  // EST : canal, pont et rampes d'accès
  // ---------------------------------------------------
  const eau = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 44),
    new THREE.MeshStandardMaterial({ color: C.eau, roughness: 0.15, metalness: 0.3 })
  );
  eau.rotation.x = -Math.PI / 2;
  eau.position.set(27, HAUTEUR_SOL + 0.015, 12);
  scene.add(eau);
  surfaces.push(eau);
  ajouterACarte(24, 30, -10, 34, C.eau, HAUTEUR_SOL);

  // Bordures basses du canal (franchies sans sauter)
  ajouterBoite(23.8, 12, 0.4, 44, 0, 0.15, C.betonFonce);
  ajouterBoite(30.2, 12, 0.4, 44, 0, 0.15, C.betonFonce);

  const hautPont = 2.4;
  ajouterBoite(26, 10, 18, 3, hautPont - 0.4, hautPont, C.beton);                 // tablier
  [20, 27, 33].forEach(x => ajouterBoite(x, 10, 1, 2.6, 0, hautPont - 0.4, C.betonFonce)); // piles
  ajouterGardeCorps(17, 8.55, 35, 8.55, hautPont);
  ajouterGardeCorps(17, 11.45, 35, 11.45, hautPont);
  ajouterRampe(9, 17, 8.5, 11.5, "+x", 0, hautPont, C.rampe);                     // rampe d'accès ouest
  ajouterRampe(35, 43, 8.5, 11.5, "-x", 0, hautPont, C.rampe);                    // rampe d'accès est

  // ---------------------------------------------------
  // OUEST : pyramide à deux étages
  // (volée de 10 marches au sud, rampe à l'est)
  // ---------------------------------------------------
  ajouterBoite(-28, 10, 10, 10, 0, 1.0, C.beton);                                 // premier étage (1 m)
  ajouterBoite(-28, 11, 6, 6, 0, 2.0, C.beton);                                   // deuxième étage (2 m)
  ajouterEscalier(-29, -27, 2.5, 5, "+z", 0, 5, 0.2, C.escalier);                 // sol → premier étage
  ajouterEscalier(-29, -27, 5, 8, "+z", 1.0, 5, 0.2, C.escalier);                 // premier → deuxième étage
  ajouterRampe(-23, -17, 9, 11, "-x", 0, 1.0, C.rampe);                           // sol → premier étage

  // Garde-corps du deuxième étage (ouverture au sud pour l'escalier)
  ajouterGardeCorps(-30.95, 13.95, -25.05, 13.95, 2.0);
  ajouterGardeCorps(-30.95, 8.05, -30.95, 13.95, 2.0);
  ajouterGardeCorps(-25.05, 8.05, -25.05, 13.95, 2.0);
  ajouterGardeCorps(-30.95, 8.05, -29, 8.05, 2.0);
  ajouterGardeCorps(-27, 8.05, -25.05, 8.05, 2.0);

  // ---------------------------------------------------
  // SUD : caisses à escalader, bunker et colline
  // ---------------------------------------------------
  // Caisses de hauteur croissante : on y monte en sautant de l'une à l'autre
  ajouterBoite(-4, 16, 1.2, 1.2, 0, 0.6, C.caisse);
  ajouterBoite(-2.4, 17.6, 1.2, 1.2, 0, 1.0, C.caisse);
  ajouterBoite(-0.6, 19.2, 1.2, 1.2, 0, 1.4, C.caisse);
  ajouterBoite(1.6, 20.6, 2, 2, 0, 2.0, C.caisse);

  // Bunker : quatre murs de 2,2 m avec une porte au nord et une au sud
  ajouterBoite(10, 16, 4, 0.5, 0, 2.2, C.betonFonce);
  ajouterBoite(16, 16, 4, 0.5, 0, 2.2, C.betonFonce);
  ajouterBoite(10, 26, 4, 0.5, 0, 2.2, C.betonFonce);
  ajouterBoite(16, 26, 4, 0.5, 0, 2.2, C.betonFonce);
  ajouterBoite(8, 21, 0.5, 10, 0, 2.2, C.betonFonce);
  ajouterBoite(18, 21, 0.5, 10, 0, 2.2, C.betonFonce);
  ajouterBoite(13, 21, 2, 2, 0, 1.0, C.caisse);                                   // caisses au centre
  ajouterBoite(13, 21, 1.2, 1.2, 1.0, 2.0, C.caisse);

  // Colline : deux rampes face à face et un plateau
  ajouterRampe(-18, -12, 22, 26, "+x", 0, 1.6, C.rampe);
  ajouterBoite(-10.5, 24, 3, 4, 0, 1.6, C.beton);
  ajouterRampe(-9, -3, 22, 26, "-x", 0, 1.6, C.rampe);

  // ---------------------------------------------------
  // COLONNES de couvert dispersées
  // ---------------------------------------------------
  [[-7, -8], [7, -8], [-14, 0], [14, 0], [-20, -10], [20, -8], [0, 34], [-16, 14]].forEach(([x, z]) => {
    ajouterBoite(x, z, 1, 1, 0, 3.2, C.betonFonce);
  });

  // Brume légère pour donner de la profondeur
  scene.fog = new THREE.Fog(0x222222, 20, 80);

  // Points de départ : centre de la carte (solo) et face à face à 12 m (multijoueur)
  return {
    sud: { x: 0, z: 0, yaw: 0 },
    nord: { x: 0, z: -12, yaw: Math.PI }
  };
}