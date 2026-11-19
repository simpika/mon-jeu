// =====================================================
// MULTIJOUEUR : lien entre le réseau et le jeu
// - envoie ma position et mon regard plusieurs fois par seconde
// - crée / retire les avatars des autres joueurs, les colore selon l'équipe, suit leur vie
// - affiche les tirs et les grenades des autres joueurs
// - en début de partie : retire la cible d'entraînement (le placement au spawn suit l'attribution de l'équipe)
// =====================================================
import * as THREE from "three";
import { camera } from "./moteur.js";
import { CONFIG_MULTI, CONFIG_TIR } from "./config.js";
import { etat } from "./etat.js";
import { surfaces } from "./monde.js";
import { reseau, surEvenement, envoyer } from "./reseau.js";
import {
  ajouterJoueurDistant, retirerJoueurDistant, retirerTousLesJoueurs, recevoirEtat,
  definirAllegeance, definirVie, definirVivant, signalerTirDistant, positionJoueurDistant
} from "./joueursDistants.js";
import { partie, surPartie, estAllie, initialiserPartieHote } from "./partie.js";
import { activerCible } from "./cible.js";
import { creerBalle } from "./balles.js";
import { ajouterGrenadeDistante, exploserGrenadeDistante } from "./grenades.js";
import { creerEtincelles } from "./effets.js";
import { jouerSonTir } from "./audio.js";

const raycaster = new THREE.Raycaster();

// Tableau [x, y, z] valide → vecteur (sinon null)
function vecteur(tableau) {
  if (!Array.isArray(tableau) || tableau.length !== 3 || !tableau.every(Number.isFinite)) return null;
  return new THREE.Vector3(...tableau);
}

// Tir d'un autre joueur : trait et impact recalculés ici, son atténué avec la distance
function afficherTirDistant(m) {
  const origine = vecteur(m.o);
  const direction = vecteur(m.d);
  if (!origine || !direction || direction.lengthSq() < 1e-6) return;
  direction.normalize();
  raycaster.set(origine, direction);
  raycaster.far = CONFIG_TIR.portee;
  const impact = raycaster.intersectObjects(surfaces, false).find(i => i.object.userData.joueurId !== m.de);
  creerBalle(origine, direction, impact, true);
  jouerSonTir(origine.distanceTo(camera.position));
  signalerTirDistant(m.de);
}

// Applique à un avatar l'équipe et la vie connues
function majAvatar(id) {
  if (!partie.equipes.has(id)) return;
  definirAllegeance(id, estAllie(id));
  const vie = partie.vies.get(id) ?? CONFIG_MULTI.vie;
  definirVie(id, vie);
  definirVivant(id, vie > 0);
}

surEvenement("arrivee", joueur => {
  ajouterJoueurDistant(joueur.id, joueur.pseudo);
  majAvatar(joueur.id);   // l'état de la partie a pu être annoncé juste avant la création de l'avatar
});
surEvenement("depart", joueur => retirerJoueurDistant(joueur.id));
surEvenement("message", m => {
  if (m.t === "e") recevoirEtat(m.de, m);
  else if (m.t === "tir") afficherTirDistant(m);
  else if (m.t === "grenade" && vecteur(m.p) && vecteur(m.v)) ajouterGrenadeDistante(m.gid, m.p, m.v);
  else if (m.t === "explosion" && vecteur(m.p)) exploserGrenadeDistante(m.gid, m.p);
});
surEvenement("fin", () => {
  retirerTousLesJoueurs();
  activerCible(true);   // retour au mode solo
});

// Équipes et vies annoncées par l'hôte → couleur, barre de vie et visibilité des avatars
surPartie("etat", () => reseau.joueurs.forEach((joueur, id) => majAvatar(id)));
surPartie("vie", (id, vie, avant, message) => {
  definirVie(id, vie);
  if (message.reapparu) definirVivant(id, true);
});
surPartie("mort", message => {
  // Éclatement à l'endroit où l'avatar se trouvait
  const pieds = positionJoueurDistant(message.id);
  if (pieds) {
    const centre = pieds.clone();
    centre.y += 1.1;
    const versMoi = camera.position.clone().sub(centre).normalize();
    creerEtincelles(centre, versMoi);
    creerEtincelles(centre, versMoi);
  }
  definirVivant(message.id, false);
});

// À appeler quand on vient d'héberger ou de rejoindre une partie
export function commencerPartieMulti() {
  activerCible(false);
  if (reseau.role === "hote") initialiserPartieHote();   // l'hôte prend l'équipe Sud ; les autres reçoivent la leur
}

// Envoi régulier de mon état (timer indépendant de l'affichage : il continue menu ouvert)
const arrondir = (valeur, precision) => Math.round(valeur * precision) / precision;
setInterval(() => {
  if (!reseau.role) return;
  envoyer({
    t: "e",
    x: arrondir(camera.position.x, 100),
    y: arrondir(camera.position.y, 100),
    z: arrondir(camera.position.z, 100),
    yaw: arrondir(etat.yaw, 1000),
    pitch: arrondir(etat.pitch, 1000)
  });
}, 1000 / CONFIG_MULTI.envoisParSeconde);
