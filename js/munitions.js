// =====================================================
// MUNITIONS : HUD en bas à droite + rechargement (touche configurable)
// =====================================================
import { CONFIG_MUNITIONS } from "./config.js";
import { etat } from "./etat.js";
import { prefs } from "./preferences.js";
import {
  initialiserAudio, jouerSonChargeurRetire, jouerSonChargeurInsere,
  sonRechargementDisponible, jouerSonRechargement
} from "./audio.js";

let sonChargeurInsereJoue = false;
let sonChargeurRetireJoue = false;
let momentRetrait = 0;             // secondes depuis le début du rechargement
let momentInsertion = 0;
let hudCache = "";                 // évite de retoucher le DOM quand rien ne change

const styleHud = document.createElement("style");
styleHud.textContent = `
  #hud-munitions {
    position: fixed; right: 28px; bottom: 24px; z-index: 15;
    pointer-events: none; text-align: right; color: #fff; font-family: sans-serif;
  }
  #hud-munitions .message {
    min-height: 18px; margin-bottom: 4px; font-size: 14px; letter-spacing: 1px;
    color: #ffb347; text-shadow: 0 0 4px #000;
  }
  #hud-munitions .ligne-munitions {
    display: flex; align-items: flex-end; justify-content: flex-end; gap: 18px; margin-bottom: 8px;
  }
  #hud-munitions .nombre {
    font-size: 48px; font-weight: 700; line-height: 1;
    font-variant-numeric: tabular-nums; text-shadow: 0 0 6px rgba(0, 0, 0, 0.9);
  }

  /* Chargeurs en réserve : icône + nombre, à gauche des munitions */
  #hud-munitions .chargeurs {
    display: flex; align-items: center; gap: 6px; padding-bottom: 4px;
    font-size: 24px; font-weight: 700; line-height: 1;
    font-variant-numeric: tabular-nums; text-shadow: 0 0 6px rgba(0, 0, 0, 0.9);
  }
  #hud-munitions .chargeurs svg {
    width: 16px; height: 28px; fill: #fff; filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.9));
  }
  #hud-munitions .chargeurs.epuise { color: #ff3b3b; }
  #hud-munitions .chargeurs.epuise svg { fill: #ff3b3b; }

  /* Icône du M4, à gauche des munitions */
  #hud-munitions .icone-m4 {
    width: 72px; height: 27px; padding-bottom: 6px; fill: #fff;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.9));
  }

  /* Grenades disponibles : nombre + icône, à droite des munitions */
  #hud-munitions .grenades {
    display: flex; align-items: center; gap: 6px; padding-bottom: 4px;
    font-size: 24px; font-weight: 700; line-height: 1;
    font-variant-numeric: tabular-nums; text-shadow: 0 0 6px rgba(0, 0, 0, 0.9);
  }
  #hud-munitions .grenades svg {
    width: 20px; height: 28px; fill: #fff; stroke: #fff;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.9));
  }
  #hud-munitions .grenades.epuise { color: #ff3b3b; }
  #hud-munitions .grenades.epuise svg { fill: #ff3b3b; stroke: #ff3b3b; }

  #hud-munitions .groupe-m4 { display: flex; align-items: flex-end; gap: 18px; }

  /* Alerte : le nombre clignote en rouge */
  #hud-munitions.alerte .nombre {
    color: #ff3b3b; animation: hud-clignote 0.7s ease-in-out infinite;
  }
  @keyframes hud-clignote { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
`;
document.head.appendChild(styleHud);

export const hud = document.createElement("div");
hud.id = "hud-munitions";
hud.innerHTML = `
  <div class="message" id="hud-message"></div>
  <div class="ligne-munitions">
    <div class="groupe-m4" id="hud-groupe-m4">
      <div class="chargeurs" id="hud-chargeurs">
        <svg viewBox="0 0 16 28" aria-hidden="true">
          <!-- chargeur incurvé : lèvres en haut, corps légèrement courbé, talon en bas -->
          <path d="M3 0h8v3H3z M2 4h10l1.5 18.5-0.5 2.5H5l-1.2-2.4z M4.5 25.5h9v2.5h-9z"/>
        </svg>
        <span id="hud-chargeurs-nombre"></span>
      </div>
      <svg class="icone-m4" viewBox="0 0 64 24" aria-hidden="true">
        <!-- M4 de profil, canon vers la droite : crosse, boîtier, rail, garde-main, canon, guidon, poignée, chargeur -->
        <path d="M0 6h10l4 2v6h-4L0 17z M14 6h22v8H14z M16 3.5h18V6H16z M36 7h14v6H36z M50 9h13v2H50z
                 M46 3.5h2.5V7H46z M19 14h5.5l-2 8H17z M28 14h6l1 8.5-5 1z"/>
      </svg>
      <div class="nombre" id="hud-nombre"></div>
    </div>
    <div class="grenades" id="hud-grenades">
      <span id="hud-grenades-nombre"></span>
      <svg viewBox="0 0 20 28" aria-hidden="true">
        <!-- grenade : corps ovoïde, bouchon, cuillère à droite, anneau de goupille à gauche -->
        <ellipse cx="10" cy="18" rx="7.5" ry="9" stroke="none"/>
        <path d="M7 5h6v4H7z" stroke="none"/>
        <path d="M12 4.5l5 2.5 1 12.5h-2L15 8.5l-3-1.5z" stroke="none"/>
        <circle cx="4.5" cy="5.5" r="3" fill="none" stroke-width="1.6"/>
      </svg>
    </div>
  </div>
`;
document.body.appendChild(hud);

const hudMessage = document.getElementById("hud-message");
const hudNombre = document.getElementById("hud-nombre");
const hudChargeurs = document.getElementById("hud-chargeurs");
const hudChargeursNombre = document.getElementById("hud-chargeurs-nombre");
const hudGrenades = document.getElementById("hud-grenades");
const hudGrenadesNombre = document.getElementById("hud-grenades-nombre");

export function mettreAJourHud() {
  let affichees = etat.munitions;
  // Rechargement manuel : le nombre remonte peu à peu.
  // Rechargement automatique : le chargeur passe d'un coup de vide à plein à la fin.
  if (etat.rechargement && !etat.rechargementAutomatique) {
    const progression = 1 - etat.tempsRechargement / etat.dureeRechargement;
    affichees = Math.min(CONFIG_MUNITIONS.chargeur, Math.max(0, Math.floor(progression * CONFIG_MUNITIONS.chargeur)));
  }

  // Pas de clignotement pendant le rechargement
  const alerte = etat.munitions <= CONFIG_MUNITIONS.seuilAlerte;
  const statut = etat.rechargement ? "recharge" : (alerte ? "alerte" : "normal");
  const cle = affichees + "|" + statut + "|" + etat.chargeurs + "|" + etat.grenades;
  if (cle === hudCache) return;
  hudCache = cle;

  hudNombre.textContent = affichees;
  hudChargeursNombre.textContent = etat.chargeurs;
  hudChargeurs.classList.toggle("epuise", etat.chargeurs === 0);
  hudGrenadesNombre.textContent = etat.grenades;
  hudGrenades.classList.toggle("epuise", etat.grenades === 0);


  hud.classList.toggle("alerte", statut === "alerte");
  hudMessage.textContent = statut === "recharge" ? "RECHARGEMENT..." : "";
}
mettreAJourHud();

// Une munition de moins (appelée à chaque tir)
export function consommerMunition() {
  etat.munitions = Math.max(0, etat.munitions - 1);
  mettreAJourHud();
}

// Recharger est possible à tout moment, sauf si le chargeur est déjà plein, pendant un rechargement
// ou s'il ne reste plus de chargeur en réserve
function peutRecharger() {
  if (etat.rechargement || etat.armeRangee || etat.sprint || etat.chargeurs <= 0) return false;
  if (etat.tempsLancer > 0 || etat.mort) return false;   // pas de rechargement pendant le lancer d'une grenade, ni mort
  return etat.munitions < CONFIG_MUNITIONS.chargeur;
}

// automatique : true quand le rechargement est déclenché par le chargeur vide (Paramètres > Jeu)
export function lancerRechargement(automatique = false) {
  if (!peutRecharger()) return;
  initialiserAudio();
  // Durée calée sur l'animation du modèle, sinon sur CONFIG_MUNITIONS.dureeRechargement.
  // Automatique : toujours Reload. Manuel : Reload_Empty si le chargeur est vide, sinon Reload.
  const durees = etat.dureesAnimations;
  const nom = !automatique && etat.munitions === 0 && durees.Reload_Empty ? "Reload_Empty" : "Reload";
  etat.animationRechargement = nom;
  etat.rechargementAutomatique = automatique;
  etat.dureeRechargement = durees[nom] || CONFIG_MUNITIONS.dureeRechargement;
  etat.rechargement = true;
  etat.tempsRechargement = etat.dureeRechargement;
  etat.chargeurs--;   // un chargeur de la réserve est utilisé

  // Sons du chargeur : réglage manuel, sinon moments détectés dans l'animation, sinon valeurs par défaut
  const moments = CONFIG_MUNITIONS.sonsRechargement[nom] || etat.momentsChargeur[nom] || {};
  momentRetrait = moments.retrait ?? 0;
  momentInsertion = moments.insertion ?? 0.62 * etat.dureeRechargement;
  // Fichier son de rechargement : un seul son, calé sur l'animation (remplace les deux clics synthétisés)
  const fichierSon = sonRechargementDisponible();
  if (fichierSon) jouerSonRechargement(nom, { retrait: momentRetrait, insertion: momentInsertion });
  sonChargeurRetireJoue = fichierSon;
  sonChargeurInsereJoue = fichierSon;
  mettreAJourHud();
}

export function mettreAJourRechargement(dt) {
  // Rechargement automatique (Paramètres > Jeu) : dès que le chargeur est vide
  if (!etat.rechargement && prefs.rechargementAuto && etat.munitions === 0) lancerRechargement(true);
  if (!etat.rechargement) return;

  etat.tempsRechargement -= dt;
  const ecoule = etat.dureeRechargement - etat.tempsRechargement;

  // Sons calés sur le mouvement du chargeur dans l'animation
  if (!sonChargeurRetireJoue && ecoule >= momentRetrait) {
    sonChargeurRetireJoue = true;
    jouerSonChargeurRetire();
  }
  if (!sonChargeurInsereJoue && ecoule >= momentInsertion) {
    sonChargeurInsereJoue = true;
    jouerSonChargeurInsere();
  }

  if (etat.tempsRechargement <= 0) {
    etat.rechargement = false;
    etat.munitions = CONFIG_MUNITIONS.chargeur;
    etat.clicVideJoue = false;
  }
  mettreAJourHud();
}

// Abaissement de l'arme pendant le rechargement : 0 = arme en place, 1 = arme baissée
export function facteurRechargement() {
  if (!etat.rechargement) return 0;
  const progression = 1 - etat.tempsRechargement / etat.dureeRechargement;
  const t = Math.min(1, Math.max(0, Math.min(progression, 1 - progression) / 0.25));
  return t * t * (3 - 2 * t);
}