// =====================================================
// MODE DOMINATION : capture des drapeaux A, B, C, score, chrono et fin de partie
//
// L'hôte arbitre : 10 fois par seconde, il compte les joueurs vivants de chaque équipe dans chaque zone
// de capture, fait avancer les captures, ajoute les points et gère le chrono. Il annonce l'état
// (« dom ») 4 fois par seconde ; chacun l'affiche avec ses couleurs (à nous : bleu, ennemi : rouge).
//
// Contrôle d'un drapeau : de -1 (tenu par Nord) à +1 (tenu par Sud), 0 = neutre.
// Phases : "attente" (une équipe est vide), "jeu", "fin" (écran de fin, puis nouvelle partie).
// =====================================================
import { camera } from "./moteur.js";
import { CONFIG_DOMINATION, CONFIG_MULTI, HAUTEUR_YEUX } from "./config.js";
import { etat } from "./etat.js";
import { objectifs, colorerObjectif, COULEUR_OBJECTIF } from "./monde.js";
import { reseau, surEvenement, envoyer } from "./reseau.js";
import { partie, monEquipe, reinitialiserScoresHote } from "./partie.js";
import { positionJoueurDistant } from "./joueursDistants.js";
import { reapparaitreAuSpawn } from "./combatJoueur.js";
import { remplirTableauScores } from "./filEliminations.js";
import { jouerSonAnnonce } from "./audio.js";

const D = CONFIG_DOMINATION;
const SIGNE = { sud: 1, nord: -1 };

// État affiché (identique chez tous, reçu de l'hôte)
const domination = {
  phase: null,                 // null tant qu'aucun état n'a été reçu
  reste: 0,                    // secondes restantes
  scores: { sud: 0, nord: 0 },
  drapeaux: [],                // { proprietaire: "sud" | "nord" | null, controle, conteste }
  vainqueur: null,             // "sud", "nord" ou "egalite"
  finDans: 0                   // secondes avant la partie suivante
};

// =====================================================
// AFFICHAGE
// =====================================================
const style = document.createElement("style");
style.textContent = `
  #hud-domination {
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 15; display: none;
    pointer-events: none; font-family: sans-serif; color: #fff; text-align: center;
  }
  #hud-domination .ligne { display: flex; align-items: center; justify-content: center; gap: 14px; }
  #hud-domination .score {
    min-width: 64px; padding: 4px 10px; font-size: 26px; font-weight: 700; border-radius: 4px;
    background: rgba(0, 0, 0, 0.55); font-variant-numeric: tabular-nums; text-shadow: 0 0 4px #000;
  }
  #hud-domination .drapeaux { display: flex; gap: 8px; }
  #hud-domination .drapeau {
    position: relative; width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 700; text-shadow: 0 0 3px #000;
    border: 3px solid rgba(255, 255, 255, 0.7); box-sizing: border-box;
  }
  #hud-domination .drapeau.conteste { animation: dom-clignote 0.5s steps(2) infinite; }
  @keyframes dom-clignote { 50% { border-color: #ffd23f; } }
  #hud-domination .chrono {
    display: inline-block; margin-top: 6px; padding: 2px 10px; font-size: 14px; letter-spacing: 1px;
    background: rgba(0, 0, 0, 0.55); border-radius: 3px; font-variant-numeric: tabular-nums;
  }
  #hud-domination .statut { margin-top: 8px; font-size: 14px; font-weight: 700; letter-spacing: 2px; text-shadow: 0 0 4px #000; }
  #hud-domination .jauge { width: 180px; height: 6px; margin: 4px auto 0; background: rgba(0,0,0,0.6); border-radius: 3px; overflow: hidden; }
  #hud-domination .jauge div { height: 100%; width: 0; }

  #annonce-domination {
    position: fixed; top: 24%; left: 0; right: 0; z-index: 16; pointer-events: none; text-align: center;
    font: 700 30px sans-serif; letter-spacing: 3px; text-shadow: 0 0 10px #000; opacity: 0;
  }

  #fin-domination {
    position: fixed; inset: 0; z-index: 26; display: none; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.6); font-family: sans-serif; color: #fff; pointer-events: none;
  }
  #fin-domination .panneau-fin {
    min-width: 520px; padding: 24px 28px; background: rgba(15, 15, 15, 0.92);
    border: 1px solid #444; border-radius: 8px; text-align: center;
  }
  #fin-domination .resultat { font-size: 48px; font-weight: 700; letter-spacing: 6px; }
  #fin-domination .scores-fin { margin: 6px 0 18px; font-size: 22px; font-variant-numeric: tabular-nums; }
  #fin-domination .suivante { margin-top: 16px; font-size: 14px; color: #bbb; }
`;
document.head.appendChild(style);

const hud = document.createElement("div");
hud.id = "hud-domination";
hud.innerHTML = `
  <div class="ligne">
    <div class="score" id="dom-score-nous"></div>
    <div class="drapeaux" id="dom-drapeaux"></div>
    <div class="score" id="dom-score-eux"></div>
  </div>
  <div class="chrono" id="dom-chrono"></div>
  <div class="statut" id="dom-statut"></div>
`;
document.body.appendChild(hud);
const elScoreNous = hud.querySelector("#dom-score-nous");
const elScoreEux = hud.querySelector("#dom-score-eux");
const elDrapeaux = hud.querySelector("#dom-drapeaux");
const elChrono = hud.querySelector("#dom-chrono");
const elStatut = hud.querySelector("#dom-statut");
elScoreNous.style.color = CONFIG_MULTI.couleurTexteAllie;
elScoreEux.style.color = CONFIG_MULTI.couleurTexteEnnemi;

const annonce = document.createElement("div");
annonce.id = "annonce-domination";
document.body.appendChild(annonce);

const ecranFin = document.createElement("div");
ecranFin.id = "fin-domination";
ecranFin.innerHTML = `
  <div class="panneau-fin">
    <div class="resultat"></div>
    <div class="scores-fin"></div>
    <div class="scores-equipes"></div>
    <div class="suivante"></div>
  </div>
`;
document.body.appendChild(ecranFin);
const elResultat = ecranFin.querySelector(".resultat");
const elScoresFin = ecranFin.querySelector(".scores-fin");
const elTableauFin = ecranFin.querySelector(".scores-equipes");
const elSuivante = ecranFin.querySelector(".suivante");

const enDomination = () => reseau.role !== null && objectifs.length > 0 && domination.phase !== null;

// Couleur d'une équipe vue par moi : la mienne en bleu, l'autre en rouge, neutre en blanc
function couleurEquipe(equipe) {
  if (!equipe) return "#ffffff";
  return equipe === monEquipe() ? CONFIG_MULTI.couleurTexteAllie : CONFIG_MULTI.couleurTexteEnnemi;
}

function afficherAnnonce(texte, positif) {
  annonce.textContent = texte;
  annonce.style.color = positif ? CONFIG_MULTI.couleurTexteAllie : CONFIG_MULTI.couleurTexteEnnemi;
  annonce.animate(
    [{ opacity: 0, transform: "scale(1.15)" }, { opacity: 1, transform: "scale(1)", offset: 0.1 },
     { opacity: 1, offset: 0.75 }, { opacity: 0 }],
    { duration: 2600, easing: "ease-out" }
  );
  jouerSonAnnonce(positif);
}

function formatChrono(secondes) {
  const s = Math.max(0, Math.ceil(secondes));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// Pieds du joueur local s'il est vivant, sinon null
function mesPieds() {
  if (etat.mort) return null;
  return { x: camera.position.x, y: camera.position.y - HAUTEUR_YEUX, z: camera.position.z };
}

// Index de la zone de capture qui contient ce point (-1 : aucune). Il faut être sur le plateau.
function zoneDe(pieds) {
  if (!pieds) return -1;
  return objectifs.findIndex(o =>
    Math.hypot(pieds.x - o.x, pieds.z - o.z) <= D.rayonCapture && Math.abs(pieds.y - o.y) <= 1.0);
}

function majVisuels() {
  const actif = enDomination();
  hud.style.display = actif ? "block" : "none";
  ecranFin.style.display = actif && domination.phase === "fin" ? "flex" : "none";

  // Objectifs dans le monde et sur la mini-carte
  objectifs.forEach((o, i) => {
    const d = domination.drapeaux[i];
    colorerObjectif(o, actif && d ? couleurEquipe(d.proprietaire) : COULEUR_OBJECTIF);
  });
  if (!actif) return;

  const mienne = monEquipe() || "sud";
  const autre = mienne === "sud" ? "nord" : "sud";
  elScoreNous.textContent = Math.floor(domination.scores[mienne]);
  elScoreEux.textContent = Math.floor(domination.scores[autre]);

  // Pastilles A, B, C : remplissage = part de contrôle de l'équipe qui tient (ou prend) le drapeau
  if (elDrapeaux.children.length !== objectifs.length) {
    elDrapeaux.innerHTML = "";
    objectifs.forEach(o => {
      const pastille = document.createElement("div");
      pastille.className = "drapeau";
      pastille.textContent = o.lettre;
      elDrapeaux.appendChild(pastille);
    });
  }
  domination.drapeaux.forEach((d, i) => {
    const pastille = elDrapeaux.children[i];
    if (!pastille) return;
    const equipeEnTete = d.controle > 0 ? "sud" : d.controle < 0 ? "nord" : null;
    const couleur = couleurEquipe(equipeEnTete);
    const angle = Math.round(Math.abs(d.controle) * 360);
    pastille.style.background = `conic-gradient(${couleur}cc ${angle}deg, rgba(0,0,0,0.55) ${angle}deg)`;
    pastille.style.borderColor = d.proprietaire ? couleurEquipe(d.proprietaire) : "rgba(255,255,255,0.7)";
    pastille.classList.toggle("conteste", d.conteste);
  });

  if (domination.phase === "attente") elChrono.textContent = "EN ATTENTE D'ADVERSAIRES";
  else if (domination.phase === "fin") elChrono.textContent = "FIN DE PARTIE";
  else elChrono.textContent = formatChrono(domination.reste) + "  ·  " + D.scoreVictoire + " POINTS";

  majStatut();
  if (domination.phase === "fin") majEcranFin();
}

// Statut sous le chrono : capture en cours dans la zone où je me trouve
function majStatut() {
  elStatut.innerHTML = "";
  if (domination.phase !== "jeu") return;
  const i = zoneDe(mesPieds());
  const d = domination.drapeaux[i];
  if (i === -1 || !d) return;
  const lettre = objectifs[i].lettre;
  const mienne = monEquipe();
  let texte, couleur = CONFIG_MULTI.couleurTexteAllie;
  if (d.conteste) { texte = lettre + " CONTESTÉ"; couleur = "#ffd23f"; }
  else if (d.proprietaire === mienne && Math.abs(d.controle) >= 1) texte = lettre + " SÉCURISÉ";
  else if (d.proprietaire && d.proprietaire !== mienne) texte = "NEUTRALISATION DE " + lettre;
  else texte = "CAPTURE DE " + lettre;
  const titre = document.createElement("div");
  titre.textContent = texte;
  titre.style.color = couleur;
  const jauge = document.createElement("div");
  jauge.className = "jauge";
  const remplissage = document.createElement("div");
  remplissage.style.width = (Math.abs(d.controle) * 100) + "%";
  remplissage.style.background = couleurEquipe(d.controle > 0 ? "sud" : d.controle < 0 ? "nord" : null);
  jauge.appendChild(remplissage);
  elStatut.append(titre, jauge);
}

function majEcranFin() {
  const mienne = monEquipe() || "sud";
  const autre = mienne === "sud" ? "nord" : "sud";
  if (domination.vainqueur === "egalite") { elResultat.textContent = "ÉGALITÉ"; elResultat.style.color = "#ffd23f"; }
  else if (domination.vainqueur === mienne) { elResultat.textContent = "VICTOIRE"; elResultat.style.color = CONFIG_MULTI.couleurTexteAllie; }
  else { elResultat.textContent = "DÉFAITE"; elResultat.style.color = CONFIG_MULTI.couleurTexteEnnemi; }
  elScoresFin.innerHTML = "";
  const nous = document.createElement("span");
  nous.textContent = Math.floor(domination.scores[mienne]);
  nous.style.color = CONFIG_MULTI.couleurTexteAllie;
  const eux = document.createElement("span");
  eux.textContent = Math.floor(domination.scores[autre]);
  eux.style.color = CONFIG_MULTI.couleurTexteEnnemi;
  elScoresFin.append(nous, "  –  ", eux);
  remplirTableauScores(elTableauFin);
  elSuivante.textContent = "Nouvelle partie dans " + Math.max(0, Math.ceil(domination.finDans)) + " s";
}

// Annonce du changement de propriétaire d'un drapeau, vue par moi
function annoncerDrapeau(i, avant, apres) {
  const lettre = objectifs[i].lettre;
  const mienne = monEquipe();
  if (apres === mienne) afficherAnnonce("DRAPEAU " + lettre + " CAPTURÉ", true);
  else if (apres) afficherAnnonce(avant === mienne ? "DRAPEAU " + lettre + " PERDU" : "L'ENNEMI A PRIS " + lettre, false);
  else if (avant === mienne) afficherAnnonce("DRAPEAU " + lettre + " NEUTRALISÉ PAR L'ENNEMI", false);
  else afficherAnnonce("DRAPEAU " + lettre + " NEUTRALISÉ", true);
}

// =====================================================
// APPLICATION DE L'ÉTAT ANNONCÉ PAR L'HÔTE
// =====================================================
function appliquer(m) {
  if (!Array.isArray(m.o) || !Array.isArray(m.s)) return;
  const anciennePhase = domination.phase;
  const anciensProprietaires = domination.drapeaux.map(d => d.proprietaire);

  domination.phase = m.p;
  domination.reste = +m.r || 0;
  domination.scores = { sud: +m.s[0] || 0, nord: +m.s[1] || 0 };
  domination.drapeaux = m.o.map(([proprietaire, controle, conteste]) => ({
    proprietaire: proprietaire === "sud" || proprietaire === "nord" ? proprietaire : null,
    controle: +controle || 0,
    conteste: !!conteste
  }));
  domination.vainqueur = m.v || null;
  domination.finDans = +m.f || 0;
  etat.partieTerminee = m.p === "fin";

  if (m.p === "jeu" && (anciennePhase === "attente" || anciennePhase === "fin")) {
    reapparaitreAuSpawn();
    afficherAnnonce("LA PARTIE COMMENCE", true);
  } else if (m.p === "fin" && anciennePhase === "jeu") {
    etat.tirEnCours = false;
    const mienne = monEquipe();
    jouerSonAnnonce(m.v === mienne);
  } else if (m.p === "jeu" && anciennePhase === "jeu") {
    domination.drapeaux.forEach((d, i) => {
      if (d.proprietaire !== anciensProprietaires[i]) annoncerDrapeau(i, anciensProprietaires[i], d.proprietaire);
    });
  }
  majVisuels();
}

surEvenement("message", m => {
  if (m.t === "dom" && reseau.role === "client" && m.de === reseau.idHote) appliquer(m);
});

surEvenement("fin", () => {
  hote = null;
  domination.phase = null;
  domination.drapeaux = [];
  etat.partieTerminee = false;
  majVisuels();
});

// =====================================================
// HÔTE : ARBITRAGE
// =====================================================
let hote = null;   // état de l'arbitre (null si je ne suis pas l'hôte)

function nouvelEtat(phase) {
  return {
    phase,
    reste: D.dureePartie,
    scores: { sud: 0, nord: 0 },
    drapeaux: objectifs.map(() => ({ proprietaire: null, controle: 0, conteste: false })),
    accumulateur: 0,
    vainqueur: null,
    finDans: 0
  };
}

function demarrer() {
  hote = nouvelEtat("jeu");
  reinitialiserScoresHote();   // éliminations / morts à zéro, tout le monde en vie
}

function terminer() {
  hote.phase = "fin";
  hote.finDans = D.delaiNouvellePartie;
  const { sud, nord } = hote.scores;
  hote.vainqueur = sud > nord ? "sud" : nord > sud ? "nord" : "egalite";
}

// Joueurs vivants de chaque équipe dans chaque zone
function compterPresents() {
  const presents = objectifs.map(() => ({ sud: 0, nord: 0 }));
  partie.equipes.forEach((equipe, id) => {
    if ((partie.vies.get(id) ?? 0) <= 0) return;
    const pieds = id === reseau.monId ? mesPieds() : positionJoueurDistant(id);
    const i = zoneDe(pieds);
    if (i !== -1) presents[i][equipe]++;
  });
  return presents;
}

function majDrapeaux(dt) {
  const presents = compterPresents();
  hote.drapeaux.forEach((d, i) => {
    const { sud, nord } = presents[i];
    d.conteste = sud > 0 && nord > 0;
    if (d.conteste) return;   // les deux équipes dans la zone : rien ne bouge

    let objectif, vitesse;
    if (sud > 0 || nord > 0) {
      const equipe = sud > 0 ? "sud" : "nord";
      const nombre = sud || nord;
      objectif = SIGNE[equipe];
      vitesse = Math.min(D.bonusMax, 1 + D.bonusParJoueur * (nombre - 1)) / D.dureeCapture;
      if (d.controle * objectif < 0) vitesse *= 2;   // neutraliser le drapeau adverse va plus vite
    } else {
      // Zone vide : un drapeau tenu se recharge, une capture abandonnée retombe
      objectif = d.proprietaire ? SIGNE[d.proprietaire] : 0;
      vitesse = 1 / D.dureeCapture;
    }

    const ecart = objectif - d.controle;
    const pas = vitesse * dt;
    d.controle = Math.abs(ecart) <= pas ? objectif : d.controle + Math.sign(ecart) * pas;

    if (d.controle >= 1) d.proprietaire = "sud";
    else if (d.controle <= -1) d.proprietaire = "nord";
    else if ((d.proprietaire === "sud" && d.controle <= 0) || (d.proprietaire === "nord" && d.controle >= 0)) d.proprietaire = null;
  });
}

function tickHote(dt) {
  let sud = 0, nord = 0;
  partie.equipes.forEach(e => { if (e === "sud") sud++; else nord++; });
  const assez = sud >= D.joueursMinParEquipe && nord >= D.joueursMinParEquipe;

  if (hote.phase === "attente") {
    if (assez) demarrer();
  } else if (hote.phase === "jeu") {
    if (!assez) { hote = nouvelEtat("attente"); return; }   // une équipe s'est vidée
    majDrapeaux(dt);
    hote.accumulateur += dt;
    while (hote.accumulateur >= 1) {
      hote.accumulateur -= 1;
      hote.drapeaux.forEach(d => { if (d.proprietaire) hote.scores[d.proprietaire] += D.pointsParDrapeau; });
    }
    hote.scores.sud = Math.min(D.scoreVictoire, hote.scores.sud);
    hote.scores.nord = Math.min(D.scoreVictoire, hote.scores.nord);
    hote.reste = Math.max(0, hote.reste - dt);
    if (Math.max(hote.scores.sud, hote.scores.nord) >= D.scoreVictoire || hote.reste <= 0) terminer();
  } else if (hote.phase === "fin") {
    hote.finDans -= dt;
    if (hote.finDans <= 0) demarrer();
  }
}

function annoncerEtat() {
  const arrondi = v => Math.round(v * 100) / 100;
  const message = {
    t: "dom",
    p: hote.phase,
    r: Math.ceil(hote.reste),
    s: [hote.scores.sud, hote.scores.nord],
    o: hote.drapeaux.map(d => [d.proprietaire || 0, arrondi(d.controle), d.conteste ? 1 : 0]),
    v: hote.vainqueur,
    f: Math.ceil(hote.finDans)
  };
  envoyer(message);
  appliquer(message);
}

let dernierTick = performance.now();
let tempsAnnonce = 0;
setInterval(() => {
  const maintenant = performance.now();
  const dt = Math.min(0.5, (maintenant - dernierTick) / 1000);
  dernierTick = maintenant;

  if (reseau.role === "hote" && objectifs.length > 0) {
    if (!hote) { hote = nouvelEtat("attente"); tempsAnnonce = Infinity; }
    tickHote(dt);
    tempsAnnonce += dt;
    if (tempsAnnonce >= 0.25) { tempsAnnonce = 0; annoncerEtat(); }
  } else {
    hote = null;
    if (enDomination()) majStatut();   // client : la zone où je me trouve change sans attendre l'hôte
  }
}, 100);
