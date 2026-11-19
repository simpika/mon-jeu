// =====================================================
// MULTIJOUEUR : lien entre le réseau et le jeu
// - envoie ma position et mon regard plusieurs fois par seconde
// - crée / retire les avatars des autres joueurs
// - en début de partie : retire la cible d'entraînement et place le joueur à un point de départ
// =====================================================
import { camera } from "./moteur.js";
import { CONFIG_MULTI, HAUTEUR_SOL, HAUTEUR_YEUX } from "./config.js";
import { etat } from "./etat.js";
import { reseau, surEvenement, envoyer } from "./reseau.js";
import {
  ajouterJoueurDistant, retirerJoueurDistant, retirerTousLesJoueurs, recevoirEtat
} from "./joueursDistants.js";
import { activerCible } from "./cible.js";

surEvenement("arrivee", joueur => ajouterJoueurDistant(joueur.id, joueur.pseudo));
surEvenement("depart", joueur => retirerJoueurDistant(joueur.id));
surEvenement("message", message => {
  if (message.t === "e") recevoirEtat(message.de, message);
});
surEvenement("fin", () => {
  retirerTousLesJoueurs();
  activerCible(true);   // retour au mode solo
});

// Place le joueur au sol, regard horizontal
export function placerJoueur(x, z, yaw) {
  camera.position.set(x, HAUTEUR_SOL + HAUTEUR_YEUX, z);
  etat.yaw = yaw;
  etat.pitch = 0;
  camera.rotation.x = 0;
  camera.rotation.y = yaw;
}

// À appeler quand on vient d'héberger ou de rejoindre une partie
// (en attendant les équipes : l'hôte part du spawn sud, les autres du spawn nord)
export function commencerPartieMulti() {
  activerCible(false);
  const departs = etat.departs;
  if (!departs) return;
  const depart = reseau.role === "hote" ? departs.sud : departs.nord;
  placerJoueur(depart.x + (Math.random() * 2 - 1) * 2.5, depart.z, depart.yaw);
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
