// =====================================================
// JOUEUR LOCAL EN MULTIJOUEUR : vie, dégâts reçus, mort et réapparition
// - barre de vie en bas à gauche
// - voile rouge et repère de direction quand on est touché
// - écran « Éliminé par X », puis réapparition au spawn de son équipe (loin des ennemis)
// =====================================================
import { camera } from "./moteur.js";
import { CONFIG_MULTI, CONFIG_MUNITIONS, CONFIG_GRENADE, CONFIG_RETICULE } from "./config.js";
import { etat } from "./etat.js";
import { reseau, surEvenement } from "./reseau.js";
import { partie, surPartie, monEquipe, estAllie, pseudoDe, demanderReapparition } from "./partie.js";
import { positionJoueurDistant, ennemisVivants } from "./joueursDistants.js";
import { mettreAJourHud } from "./munitions.js";
import { arme } from "./arme.js";
import { arreterDeplacement, placerJoueur } from "./joueur.js";
import { declencherTouche } from "./reticule.js";

const style = document.createElement("style");
style.textContent = `
  #hud-vie {
    position: fixed; left: 28px; bottom: 28px; z-index: 15; display: none; pointer-events: none;
    font-family: sans-serif; color: #fff;
  }
  #hud-vie .nombre { font-size: 28px; font-weight: 700; text-shadow: 0 0 6px rgba(0,0,0,0.9); font-variant-numeric: tabular-nums; }
  #hud-vie .barre { width: 220px; height: 8px; margin-top: 6px; background: rgba(0,0,0,0.6); border-radius: 4px; overflow: hidden; }
  #hud-vie .remplissage { height: 100%; width: 100%; background: #e8e8e8; transition: width 0.15s; }
  #hud-vie.faible .remplissage { background: #ff3b3b; }
  #hud-vie .equipe { font-size: 12px; letter-spacing: 1px; margin-bottom: 4px; color: ${CONFIG_MULTI.couleurTexteAllie}; }

  #voile-degats {
    position: fixed; inset: 0; z-index: 14; pointer-events: none; opacity: 0;
    background: radial-gradient(ellipse at center, rgba(255,0,0,0) 45%, rgba(200,0,0,0.75) 100%);
  }
  .repere-degats {
    position: fixed; left: 50%; top: 50%; width: 0; height: 0; z-index: 14; pointer-events: none;
  }
  .repere-degats::before {
    content: ""; position: absolute; left: -70px; top: -175px; width: 140px; height: 40px;
    border-top: 7px solid rgba(255, 40, 40, 0.9); border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    filter: drop-shadow(0 0 4px rgba(0,0,0,0.8));
  }

  #ecran-mort {
    position: fixed; inset: 0; z-index: 18; display: none; pointer-events: none;
    background: rgba(60, 0, 0, 0.45); color: #fff; font-family: sans-serif; text-align: center;
  }
  #ecran-mort .bloc { position: absolute; top: 38%; left: 0; right: 0; }
  #ecran-mort .titre { font-size: 40px; font-weight: 700; letter-spacing: 3px; text-shadow: 0 0 10px #000; }
  #ecran-mort .tueur { margin-top: 8px; font-size: 20px; text-shadow: 0 0 6px #000; }
  #ecran-mort .tueur strong { color: ${CONFIG_MULTI.couleurTexteEnnemi}; }
  #ecran-mort .compte { margin-top: 18px; font-size: 15px; color: #ddd; }
`;
document.head.appendChild(style);

const hudVie = document.createElement("div");
hudVie.id = "hud-vie";
hudVie.innerHTML = `<div class="equipe"></div><div class="nombre"></div><div class="barre"><div class="remplissage"></div></div>`;
document.body.appendChild(hudVie);
const hudEquipe = hudVie.querySelector(".equipe");
const hudNombre = hudVie.querySelector(".nombre");
const hudRemplissage = hudVie.querySelector(".remplissage");

const voile = document.createElement("div");
voile.id = "voile-degats";
document.body.appendChild(voile);

const ecranMort = document.createElement("div");
ecranMort.id = "ecran-mort";
ecranMort.innerHTML = `<div class="bloc"><div class="titre">ÉLIMINÉ</div><div class="tueur"></div><div class="compte"></div></div>`;
document.body.appendChild(ecranMort);
const texteTueur = ecranMort.querySelector(".tueur");
const texteCompte = ecranMort.querySelector(".compte");

let tempsAvantReapparition = 0;
const reperes = [];   // repères de direction des dégâts : { element, tireur, temps }

// --- Barre de vie ---
function majHudVie() {
  const enLigne = reseau.role !== null && monEquipe() !== null;
  hudVie.style.display = enLigne ? "block" : "none";
  if (!enLigne) return;
  const vie = Math.max(0, partie.vies.get(reseau.monId) ?? CONFIG_MULTI.vie);
  hudNombre.textContent = vie;
  hudRemplissage.style.width = (100 * vie / CONFIG_MULTI.vie) + "%";
  hudVie.classList.toggle("faible", vie <= CONFIG_MULTI.vie * 0.3);
  hudEquipe.textContent = "ÉQUIPE " + (monEquipe() === "sud" ? "SUD" : "NORD");
}

// --- Dégâts reçus ---
function flashDegats(force) {
  voile.animate(
    [{ opacity: Math.min(1, 0.35 + force) }, { opacity: 0 }],
    { duration: 700, easing: "ease-out" }
  );
}

function ajouterRepere(tireur) {
  if (!tireur || tireur === reseau.monId || !positionJoueurDistant(tireur)) return;
  const element = document.createElement("div");
  element.className = "repere-degats";
  document.body.appendChild(element);
  reperes.push({ element, tireur, temps: 0 });
}

// --- Mort et réapparition ---
function mourir(tueur) {
  etat.mort = true;
  etat.tirEnCours = false;
  etat.rechargement = false;
  arreterDeplacement();
  tempsAvantReapparition = CONFIG_MULTI.delaiReapparition;
  texteTueur.innerHTML = "";
  if (tueur && tueur !== reseau.monId) {
    texteTueur.append("par ");
    const nom = document.createElement("strong");
    nom.textContent = pseudoDe(tueur);
    texteTueur.append(nom);
  } else {
    texteTueur.textContent = "par votre propre grenade";
  }
  ecranMort.style.display = "block";
}

// Point de départ de l'équipe le plus éloigné des ennemis (parmi plusieurs emplacements du spawn)
function choisirPointDeDepart(equipe) {
  const base = etat.departs && etat.departs[equipe];
  if (!base) return null;
  const ennemis = ennemisVivants();
  let meilleur = null, meilleurScore = -Infinity;
  [-12, -8, -4, 0, 4, 8, 12].forEach(dx => {
    const x = base.x + dx, z = base.z;
    let distanceMin = 1000;
    ennemis.forEach(e => { distanceMin = Math.min(distanceMin, Math.hypot(e.base.x - x, e.base.z - z)); });
    const score = distanceMin + Math.random() * 3;
    if (score > meilleurScore) { meilleurScore = score; meilleur = { x, z, yaw: base.yaw }; }
  });
  return meilleur;
}

// demander : true après une mort (l'hôte doit remettre la vie à fond) ; false après un changement d'équipe
function reapparaitre(demander) {
  etat.mort = false;
  ecranMort.style.display = "none";
  const point = choisirPointDeDepart(monEquipe());
  if (point) placerJoueur(point.x, point.z, point.yaw);

  // Équipement neuf
  etat.munitions = CONFIG_MUNITIONS.chargeur;
  etat.chargeurs = CONFIG_MUNITIONS.chargeurs;
  etat.grenades = CONFIG_GRENADE.nombre;
  etat.rechargement = false;
  etat.tempsLancer = 0;
  etat.clicVideJoue = false;
  mettreAJourHud();

  partie.vies.set(reseau.monId, CONFIG_MULTI.vie);
  majHudVie();
  if (demander) demanderReapparition();
}

// Nouvelle partie (Domination) : chacun repart du spawn de son équipe, équipement neuf
export function reapparaitreAuSpawn() {
  if (monEquipe()) reapparaitre(false);
}

// --- Annonces de l'hôte ---
surPartie("etat", majHudVie);

surPartie("equipe", () => reapparaitre(false));   // équipe attribuée ou changée : départ du spawn de l'équipe

surPartie("vie", (id, vie, avant, message) => {
  if (id !== reseau.monId) return;
  majHudVie();
  if (vie < avant && vie > 0) {
    flashDegats((avant - vie) / CONFIG_MULTI.vie);
    ajouterRepere(message.tireur);
  }
});

surPartie("mort", message => {
  if (message.id === reseau.monId) {
    flashDegats(1);
    ajouterRepere(message.tueur);
    mourir(message.tueur);
  } else if (message.tueur === reseau.monId && !estAllie(message.id)) {
    // Récompense de l'élimination (comme sur la cible d'entraînement)
    etat.grenades = CONFIG_GRENADE.nombre;
    etat.chargeurs += CONFIG_MUNITIONS.chargeursParElimination;
    mettreAJourHud();
    declencherTouche(CONFIG_RETICULE.dureeToucheElimination);
  }
});

// Fin de la partie multijoueur : retour au mode solo
surEvenement("fin", () => {
  etat.mort = false;
  ecranMort.style.display = "none";
  reperes.forEach(r => r.element.remove());
  reperes.length = 0;
  majHudVie();
});

// --- À chaque image (dt réel : le compte à rebours continue même menu ouvert) ---
export function mettreAJourCombatJoueur(dt) {
  if (etat.mort) {
    tempsAvantReapparition -= dt;
    texteCompte.textContent = "Réapparition dans " + Math.max(1, Math.ceil(tempsAvantReapparition)) + " s";
    if (tempsAvantReapparition <= 0) reapparaitre(true);
  }
  arme.visible = !etat.mort;

  // Repères de direction : ils suivent la rotation du joueur et s'effacent en 1,5 s
  for (let i = reperes.length - 1; i >= 0; i--) {
    const r = reperes[i];
    r.temps += dt;
    const p = positionJoueurDistant(r.tireur);
    if (r.temps > 1.5 || !p) {
      r.element.remove();
      reperes.splice(i, 1);
      continue;
    }
    // Angle du tireur, mesuré comme le regard (0 = nord, positif vers la gauche), relatif à mon regard
    const angle = Math.atan2(-(p.x - camera.position.x), -(p.z - camera.position.z)) - etat.yaw;
    r.element.style.transform = "rotate(" + (-angle) + "rad)";
    r.element.style.opacity = String(1 - r.temps / 1.5);
  }
}
