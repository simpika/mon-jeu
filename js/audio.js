// =====================================================
// SONS : fichiers (tir, rechargement) et sons synthétisés de secours
// =====================================================
import { CONFIG_TIR, CONFIG_IMPACT, CONFIG_MUNITIONS, CONFIG_SONS, CONFIG_GRENADE } from "./config.js";

let audio = null;
let tamponBruit = null;

// Contexte audio créé dès le chargement (en pause tant que le joueur n'a pas cliqué)
// pour pouvoir décoder les fichiers à l'avance
function creerContexte() {
  if (audio) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audio = new AudioCtx();

  const duree = 0.25;
  tamponBruit = audio.createBuffer(1, Math.floor(audio.sampleRate * duree), audio.sampleRate);
  const donnees = tamponBruit.getChannelData(0);
  for (let i = 0; i < donnees.length; i++) {
    donnees[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / donnees.length, 3);
  }
}

export function initialiserAudio() {
  creerContexte();
  if (audio && audio.state === "suspended") audio.resume();
}

// =====================================================
// FICHIERS SONS
// =====================================================
const fichiers = {
  tir: null,            // { tampon, debut } : debut = premier son audible (le silence initial est sauté)
  rechargement: null    // { tampon, debut, claquements: [s...] } : instants des claquements dans le fichier
};

// Enveloppe sonore par fenêtres de 10 ms (moyenne des canaux)
function enveloppe(tampon) {
  const pas = Math.floor(tampon.sampleRate * 0.01);
  const canaux = [];
  for (let c = 0; c < tampon.numberOfChannels; c++) canaux.push(tampon.getChannelData(c));
  const env = [];
  for (let debut = 0; debut + pas <= tampon.length; debut += pas) {
    let somme = 0;
    for (let i = debut; i < debut + pas; i++) {
      for (const canal of canaux) somme += canal[i] * canal[i];
    }
    env.push(Math.sqrt(somme / (pas * canaux.length)));
  }
  return env;   // env[i] = niveau entre i*10 ms et (i+1)*10 ms
}

// Premier instant audible et claquements (attaques brusques) du son, en secondes
function analyserSon(tampon) {
  const env = enveloppe(tampon);
  const max = Math.max(...env, 1e-6);
  const premier = Math.max(0, env.findIndex(v => v > 0.05 * max));

  const claquements = [];
  for (let i = 3; i < env.length - 1; i++) {
    const avant = Math.min(env[i - 1], env[i - 2], env[i - 3]);
    const attaque = env[i] > 0.3 * max && env[i] > 2.5 * avant && env[i] >= env[i + 1];
    const precedent = claquements[claquements.length - 1];
    if (attaque && (!precedent || i * 0.01 - precedent.t > 0.12)) {
      claquements.push({ t: Math.max(0, i - 1) * 0.01, niveau: env[i] / max });
    }
  }
  return { debut: Math.max(0, premier - 1) * 0.01, claquements };
}

async function chargerSon(chemin) {
  const reponse = await fetch(encodeURI(chemin));
  if (!reponse.ok) throw new Error(reponse.status + " " + chemin);
  const donnees = await reponse.arrayBuffer();
  return new Promise((ok, erreur) => audio.decodeAudioData(donnees, ok, erreur));
}

creerContexte();
if (audio) {
  [
    ["tir", CONFIG_SONS.tir],
    ["rechargement", CONFIG_SONS.rechargement],
    ["partie1", CONFIG_SONS.rechargementPartie1],
    ["partie2", CONFIG_SONS.rechargementPartie2],
    ["hitmarkerTete", CONFIG_SONS.hitmarkerTete],
    ["hitmarkerCorps", CONFIG_SONS.hitmarkerCorps]
  ].forEach(([cle, chemin]) => {
    if (!chemin) return;
    chargerSon(chemin)
      .then(tampon => {
        const analyse = analyserSon(tampon);
        fichiers[cle] = { tampon, debut: analyse.debut, claquements: analyse.claquements.map(c => c.t) };
        console.info(
          "Son « " + cle + " » chargé (" + tampon.duration.toFixed(2) + " s) : début audible " +
          analyse.debut.toFixed(2) + " s, claquements à " +
          (analyse.claquements.map(c => c.t.toFixed(2) + " s").join(", ") || "aucun")
        );
      })
      .catch(e => console.warn("Son introuvable, son synthétisé utilisé à la place : " + chemin, e));
  });
}

export function sonRechargementDisponible() {
  return !!fichiers.rechargement || (!!fichiers.partie1 && !!fichiers.partie2);
}

// Instant du claquement principal d'une partie (le premier) : c'est lui qu'on cale sur l'animation
function claquementPrincipal(son) {
  return son.claquements.length ? son.claquements[0] : son.debut;
}

// Joue un tampon : quand (temps audio) peut être dans le passé → on démarre plus loin dans le fichier
function jouerTampon(tampon, volume, quand, decalage = 0, vitesse = 1) {
  const source = audio.createBufferSource();
  source.buffer = tampon;
  source.playbackRate.value = vitesse;
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(audio.destination);

  const maintenant = audio.currentTime;
  if (quand < maintenant) {
    decalage += (maintenant - quand) * vitesse;
    quand = maintenant;
  }
  if (decalage < tampon.duration) source.start(quand, decalage);
  return source;
}

// Son du rechargement calé sur l'animation.
// moments : { retrait, insertion } dans l'animation (s) ; nomAnimation : Reload ou Reload_Empty
let sourcesRechargement = [];
export function jouerSonRechargement(nomAnimation, moments) {
  if (!audio || CONFIG_MUNITIONS.volume <= 0) return;
  sourcesRechargement.forEach(s => { try { s.stop(); } catch (e) { /* déjà fini */ } });
  sourcesRechargement = [];
  const volume = 1.6 * CONFIG_MUNITIONS.volume;
  const maintenant = audio.currentTime;

  // Deux parties : chaque claquement tombe exactement sur son moment, à la vitesse d'origine
  if (fichiers.partie1 && fichiers.partie2) {
    const p1 = fichiers.partie1, p2 = fichiers.partie2;
    sourcesRechargement.push(
      jouerTampon(p1.tampon, volume, maintenant + moments.retrait - claquementPrincipal(p1)),
      jouerTampon(p2.tampon, volume, maintenant + moments.insertion - claquementPrincipal(p2))
    );
    return;
  }

  const son = fichiers.rechargement;
  if (!son) return;

  let debut, vitesse;   // debut : instant de l'animation où le fichier commence à 0 s
  const manuel = CONFIG_SONS.calageRechargement[nomAnimation];
  if (manuel) {
    debut = manuel.debut ?? 0;
    vitesse = manuel.vitesse ?? 1;
  } else {
    // Premier claquement ↔ retrait du chargeur.
    // Insertion : parmi les claquements suivants, celui qui demande la vitesse la plus proche de 1
    // (ex. 0,22 s / 1,60 s / 1,94 s : 1,60 s est l'insertion, 1,94 s la culasse).
    const VITESSE_MIN = 0.9, VITESSE_MAX = 1.1;   // au-delà, le son paraîtrait déformé
    const c = son.claquements;
    const sonRetrait = c.length ? c[0] : son.debut;
    const ecartAnimation = moments.insertion - moments.retrait;

    let sonInsertion = null;
    vitesse = 1;
    if (ecartAnimation > 0) {
      let meilleur = Infinity;
      c.slice(1).forEach(t => {
        const v = (t - sonRetrait) / ecartAnimation;
        if (Math.abs(Math.log(v)) < meilleur) { meilleur = Math.abs(Math.log(v)); sonInsertion = t; }
      });
      if (sonInsertion !== null) {
        vitesse = Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, (sonInsertion - sonRetrait) / ecartAnimation));
      }
    }

    // Priorité à l'insertion (le claquement le plus marquant) ; sinon calage sur le retrait
    debut = sonInsertion !== null
      ? moments.insertion - sonInsertion / vitesse
      : moments.retrait - sonRetrait / vitesse;
    console.info(
      "Son de rechargement (" + nomAnimation + ") : début à " + debut.toFixed(2) + " s de l'animation, vitesse " +
      vitesse.toFixed(2) + (sonInsertion !== null ? ", insertion du son à " + sonInsertion.toFixed(2) + " s" : "")
    );
  }

  sourcesRechargement.push(jouerTampon(son.tampon, volume, maintenant + debut, 0, vitesse));
}

// distance : 0 pour mon tir ; pour le tir d'un autre joueur, le son baisse avec la distance
export function jouerSonTir(distance = 0) {
  if (!audio || CONFIG_TIR.volume <= 0) return;
  const t = audio.currentTime;
  const volume = CONFIG_TIR.volume / (1 + distance * 0.05);

  // Fichier son : joué dès le premier son audible (pas de silence au début)
  if (fichiers.tir) {
    jouerTampon(fichiers.tir.tampon, 1.6 * volume, t, fichiers.tir.debut);
    return;
  }

  // Détonation (bruit filtré)
  const bruit = audio.createBufferSource();
  bruit.buffer = tamponBruit;
  const filtre = audio.createBiquadFilter();
  filtre.type = "lowpass";
  filtre.frequency.setValueAtTime(3500, t);
  filtre.frequency.exponentialRampToValueAtTime(400, t + 0.25);
  const gainBruit = audio.createGain();
  gainBruit.gain.value = 0.6 * volume;
  bruit.connect(filtre);
  filtre.connect(gainBruit);
  gainBruit.connect(audio.destination);
  bruit.start(t);

  // Choc grave
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const gainOsc = audio.createGain();
  gainOsc.gain.setValueAtTime(0.8 * volume, t);
  gainOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gainOsc);
  gainOsc.connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

// Petit « tic » d'impact, plus faible quand l'impact est loin
export function jouerSonImpact(distance) {
  if (!audio || CONFIG_IMPACT.volume <= 0) return;
  const t = audio.currentTime;

  const bruit = audio.createBufferSource();
  bruit.buffer = tamponBruit;
  const filtre = audio.createBiquadFilter();
  filtre.type = "bandpass";
  filtre.frequency.value = 1800 + Math.random() * 1500;
  filtre.Q.value = 1.2;
  const gain = audio.createGain();
  const attenuation = 1 / (1 + distance * 0.05);
  gain.gain.setValueAtTime(0.6 * CONFIG_IMPACT.volume * attenuation, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  bruit.connect(filtre);
  filtre.connect(gain);
  gain.connect(audio.destination);
  bruit.start(t);
  bruit.stop(t + 0.12);
}

// =====================================================
// HITMARKER : son joué quand une balle touche la cible
// tete = true : « ding » métallique aigu ; false : « tic » sec et court
// =====================================================
function jouerNote(frequence, type, volume, t, duree, destination) {
  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequence, t);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.003);   // attaque très rapide
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(t);
  osc.stop(t + duree + 0.02);
}

export function jouerSonHitmarker(tete) {
  const volume = CONFIG_SONS.volumeHitmarker;
  if (!audio || volume <= 0) return;
  const t = audio.currentTime;

  // Fichier son fourni dans la config
  const fichier = tete ? fichiers.hitmarkerTete : fichiers.hitmarkerCorps;
  if (fichier) {
    jouerTampon(fichier.tampon, volume, t, fichier.debut);
    return;
  }

  // Sortie commune légèrement filtrée (adoucit les aigus des ondes carrées / triangles)
  const filtre = audio.createBiquadFilter();
  filtre.type = "lowpass";
  filtre.frequency.value = tete ? 9000 : 6000;
  filtre.connect(audio.destination);

  if (tete) {
    // Tête : « ding » métallique, deux notes inharmoniques qui résonnent, plus un petit claquement
    jouerNote(2350, "sine", 0.45 * volume, t, 0.32, filtre);
    jouerNote(3520, "sine", 0.22 * volume, t, 0.22, filtre);
    jouerNote(5900, "triangle", 0.10 * volume, t, 0.08, filtre);
  } else {
    // Corps : « tic » sec et court
    jouerNote(1500, "triangle", 0.5 * volume, t, 0.05, filtre);
    jouerNote(3000, "sine", 0.18 * volume, t, 0.035, filtre);
  }

  // Petit claquement de bruit au début (donne du mordant)
  const bruit = audio.createBufferSource();
  bruit.buffer = tamponBruit;
  const passeHaut = audio.createBiquadFilter();
  passeHaut.type = "highpass";
  passeHaut.frequency.value = 4000;
  const gainBruit = audio.createGain();
  gainBruit.gain.setValueAtTime((tete ? 0.25 : 0.35) * volume, t);
  gainBruit.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
  bruit.connect(passeHaut);
  passeHaut.connect(gainBruit);
  gainBruit.connect(audio.destination);
  bruit.start(t);
  bruit.stop(t + 0.04);
}

// =====================================================
// ANNONCE (Domination) : deux notes montantes (bonne nouvelle) ou descendantes (mauvaise nouvelle)
// =====================================================
export function jouerSonAnnonce(positif) {
  if (!audio) return;
  const t = audio.currentTime;
  const volume = 0.25;
  const [premiere, seconde] = positif ? [660, 990] : [520, 350];
  jouerNote(premiere, "triangle", volume, t, 0.18, audio.destination);
  jouerNote(seconde, "triangle", volume, t + 0.14, 0.32, audio.destination);
}

// =====================================================
// EXPLOSION DE GRENADE (synthétisée) : détonation, grondement grave et souffle
// distance : plus l'explosion est loin, plus elle est faible et sourde
// =====================================================
let tamponExplosion = null;

export function jouerSonExplosion(distance) {
  const volumeBase = CONFIG_GRENADE.volume;
  if (!audio || volumeBase <= 0) return;
  const t = audio.currentTime;
  const attenuation = 1 / (1 + distance * 0.06);
  const volume = volumeBase * attenuation;

  // Bruit long (1,8 s) créé une seule fois
  if (!tamponExplosion) {
    const duree = 1.8;
    tamponExplosion = audio.createBuffer(1, Math.floor(audio.sampleRate * duree), audio.sampleRate);
    const d = tamponExplosion.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  }

  // Détonation + souffle : bruit dont les aigus s'éteignent vite (plus sourd de loin)
  const bruit = audio.createBufferSource();
  bruit.buffer = tamponExplosion;
  const filtre = audio.createBiquadFilter();
  filtre.type = "lowpass";
  filtre.frequency.setValueAtTime(5000 * attenuation + 600, t);
  filtre.frequency.exponentialRampToValueAtTime(180, t + 1.4);
  const gainBruit = audio.createGain();
  gainBruit.gain.setValueAtTime(1.2 * volume, t);
  gainBruit.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
  bruit.connect(filtre);
  filtre.connect(gainBruit);
  gainBruit.connect(audio.destination);
  bruit.start(t);

  // Grondement grave
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.8);
  const gainOsc = audio.createGain();
  gainOsc.gain.setValueAtTime(1.4 * volume, t);
  gainOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  osc.connect(gainOsc);
  gainOsc.connect(audio.destination);
  osc.start(t);
  osc.stop(t + 1);
}

// Clic mécanique court (chargeur, culasse, tir à vide)
function jouerClic(frequence, volume, delai = 0) {
  if (!audio || CONFIG_MUNITIONS.volume <= 0) return;
  const t = audio.currentTime + delai;

  // Claquement métallique
  const bruit = audio.createBufferSource();
  bruit.buffer = tamponBruit;
  const filtre = audio.createBiquadFilter();
  filtre.type = "bandpass";
  filtre.frequency.value = frequence;
  filtre.Q.value = 2;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(volume * CONFIG_MUNITIONS.volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  bruit.connect(filtre);
  filtre.connect(gain);
  gain.connect(audio.destination);
  bruit.start(t);
  bruit.stop(t + 0.1);

  // Petit choc sourd
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequence / 8, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);
  const gainOsc = audio.createGain();
  gainOsc.gain.setValueAtTime(0.5 * volume * CONFIG_MUNITIONS.volume, t);
  gainOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.connect(gainOsc);
  gainOsc.connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.09);
}

export function jouerClicVide() {
  jouerClic(2600, 0.5);
}

export function jouerSonChargeurRetire() {
  jouerClic(900, 0.8);
}

export function jouerSonChargeurInsere() {
  jouerClic(1300, 0.9);
  jouerClic(2200, 0.7, 0.12);   // armement de la culasse
}