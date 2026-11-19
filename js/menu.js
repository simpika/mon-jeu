// =====================================================
// MENU DE JEU (touche Échap) + PARAMÈTRES (onglets Sensibilité, Raccourcis et Jeu)
// =====================================================
import { renderer, sourisCapturee } from "./moteur.js";
import {
  NIVEAU_MIN, NIVEAU_MAX, NIVEAU_DEFAUT, ACTIONS_TOUCHES, TOUCHES_PAR_DEFAUT, TOUCHES_RESERVEES
} from "./config.js";
import { etat } from "./etat.js";
import {
  prefs, limiterNiveau, sauvegarderNiveau, CLE_HORIZONTALE, CLE_VERTICALE,
  cleEntree, copierTouches, sauvegarderTouches, libelleTouche, libelleSouris,
  sauvegarderRechargementAuto, RECHARGEMENT_AUTO_DEFAUT, sauvegarderModeSprint, MODE_SPRINT_DEFAUT,
  sauvegarderCarte
} from "./preferences.js";
import { reticule } from "./reticule.js";
import { hud } from "./munitions.js";
import { arreterDeplacement } from "./joueur.js";
import { creerPanneauMultijoueur } from "./salon.js";

// Message d'invitation à cliquer pour capturer la souris
const invite = document.createElement("div");
invite.textContent = "Cliquez pour jouer (Échap : menu)";
invite.style.cssText =
  "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);color:#fff;" +
  "font:16px sans-serif;background:rgba(0,0,0,0.7);padding:10px 18px;z-index:20;pointer-events:none;";
document.body.appendChild(invite);

const styleMenu = document.createElement("style");
styleMenu.textContent = `
  #menu-jeu {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    display: none; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.7); z-index: 30;
    cursor: default; font-family: sans-serif;
  }
  #menu-jeu .panneau {
    width: 400px; max-width: 92vw; max-height: 92vh; overflow-y: auto;
    padding: 28px 32px;
    background: #1b1b1b; border: 1px solid #444; border-radius: 8px;
    color: #fff; text-align: center; box-sizing: border-box;
  }
  #menu-jeu h2 { margin: 0 0 22px; font-size: 22px; letter-spacing: 2px; }
  #menu-jeu button {
    display: block; width: 100%; margin: 10px 0 0; padding: 12px 16px;
    font-size: 16px; color: #fff; background: #333;
    border: 1px solid #666; border-radius: 6px; cursor: pointer;
  }
  #menu-jeu button:hover { background: #4a4a4a; }
  #menu-jeu .libelle { text-align: left; font-size: 14px; color: #ccc; margin-bottom: 6px; }
  #menu-jeu .ligne { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  #menu-jeu input[type=range] { flex: 1; cursor: pointer; }
  #menu-jeu .valeur { min-width: 56px; text-align: right; font-variant-numeric: tabular-nums; }
  #menu-jeu .message { min-height: 18px; margin-top: 12px; font-size: 13px; color: #ff9a9a; }

  /* Onglets */
  #menu-jeu .onglets { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #444; }
  #menu-jeu .onglet {
    flex: 1; margin: 0; padding: 10px 8px; font-size: 15px; color: #aaa;
    background: transparent; border: none; border-bottom: 2px solid transparent;
    border-radius: 6px 6px 0 0;
  }
  #menu-jeu .onglet.actif { color: #fff; background: #2a2a2a; border-bottom-color: #ff8a1f; }

  /* Raccourcis */
  #menu-jeu .touche-ligne {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 10px;
  }
  #menu-jeu .touche-ligne .nom { font-size: 14px; color: #ddd; text-align: left; }
  #menu-jeu .touche-ligne button.touche {
    width: 170px; margin: 0; padding: 8px 10px; font-size: 14px; font-weight: 600;
  }
  #menu-jeu .touche-ligne button.touche.attente { border-color: #ff8a1f; color: #ffb870; }

  /* Jeu : choix à deux options */
  #menu-jeu .choix { display: flex; gap: 6px; }
  #menu-jeu .choix { flex-shrink: 0; }
  #menu-jeu .choix button {
    width: auto; min-width: 88px; margin: 0; padding: 8px 10px; font-size: 14px; color: #aaa; white-space: nowrap;
  }
  #menu-jeu .choix button.actif { color: #fff; background: #4a3420; border-color: #ff8a1f; }
`;
document.head.appendChild(styleMenu);

const menu = document.createElement("div");
menu.id = "menu-jeu";
menu.innerHTML = `
  <div class="panneau" id="menu-principal">
    <h2>MENU</h2>
    <button id="btn-multijoueur">Multijoueur</button>
    <button id="btn-parametres">Paramètres</button>
    <button id="btn-retour">Retour</button>
    <div class="message" id="menu-message"></div>
  </div>
  <div class="panneau" id="menu-parametres" style="display:none">
    <h2>PARAMÈTRES</h2>
    <div class="onglets">
      <button class="onglet actif" id="onglet-sensibilite" type="button">Sensibilité</button>
      <button class="onglet" id="onglet-raccourcis" type="button">Raccourcis</button>
      <button class="onglet" id="onglet-jeu" type="button">Jeu</button>
    </div>

    <div id="contenu-sensibilite">
      <div class="libelle">Sensibilité horizontale</div>
      <div class="ligne">
        <input type="range" id="curseur-horizontale" min="${NIVEAU_MIN}" max="${NIVEAU_MAX}" step="1">
        <span class="valeur" id="valeur-horizontale"></span>
      </div>
      <div class="libelle">Sensibilité verticale</div>
      <div class="ligne">
        <input type="range" id="curseur-verticale" min="${NIVEAU_MIN}" max="${NIVEAU_MAX}" step="1">
        <span class="valeur" id="valeur-verticale"></span>
      </div>
    </div>

    <div id="contenu-raccourcis" style="display:none">
      <div id="liste-touches"></div>
      <div class="message" id="touches-message"></div>
    </div>

    <div id="contenu-jeu" style="display:none">
      <div class="touche-ligne">
        <span class="nom">Rechargement automatique</span>
        <div class="choix">
          <button type="button" id="recharge-auto-oui">Activé</button>
          <button type="button" id="recharge-auto-non">Désactivé</button>
        </div>
      </div>
      <div class="touche-ligne">
        <span class="nom">Sprint</span>
        <div class="choix">
          <button type="button" id="sprint-maintenir">Maintenir</button>
          <button type="button" id="sprint-basculer">Appuyer une fois</button>
        </div>
      </div>
      <div class="touche-ligne">
        <span class="nom">Carte</span>
        <div class="choix">
          <button type="button" id="carte-industrielle">Industrielle</button>
          <button type="button" id="carte-entrainement">Entraînement</button>
        </div>
      </div>
    </div>

    <button id="btn-reinitialiser" type="button">Réinitialiser cet onglet</button>
    <button id="btn-retour-menu" type="button">Retour au menu</button>
  </div>
`;
document.body.appendChild(menu);

// Panneau Multijoueur (salon : héberger / rejoindre)
const panneauMultijoueur = creerPanneauMultijoueur(() => afficherPanneau("principal"));
menu.appendChild(panneauMultijoueur);

// Pas de menu contextuel du navigateur dans le menu (le clic droit peut être assigné à une action)
menu.addEventListener("contextmenu", e => e.preventDefault());

const panneauPrincipal = document.getElementById("menu-principal");
const panneauParametres = document.getElementById("menu-parametres");
const messageMenu = document.getElementById("menu-message");
const curseurHorizontal = document.getElementById("curseur-horizontale");
const valeurHorizontale = document.getElementById("valeur-horizontale");
const curseurVertical = document.getElementById("curseur-verticale");
const valeurVerticale = document.getElementById("valeur-verticale");
const ongletSensibilite = document.getElementById("onglet-sensibilite");
const ongletRaccourcis = document.getElementById("onglet-raccourcis");
const contenuSensibilite = document.getElementById("contenu-sensibilite");
const contenuRaccourcis = document.getElementById("contenu-raccourcis");
const ongletJeu = document.getElementById("onglet-jeu");
const contenuJeu = document.getElementById("contenu-jeu");
const boutonRechargeAutoOui = document.getElementById("recharge-auto-oui");
const boutonRechargeAutoNon = document.getElementById("recharge-auto-non");
const boutonSprintMaintenir = document.getElementById("sprint-maintenir");
const boutonSprintBasculer = document.getElementById("sprint-basculer");
const listeTouches = document.getElementById("liste-touches");
const messageTouches = document.getElementById("touches-message");

let panneauActif = "principal";  // panneau affiché : "principal" ou "parametres"
let ongletActif = "sensibilite"; // onglet affiché dans Paramètres : "sensibilite", "raccourcis" ou "jeu"
let heureOuvertureMenu = 0;      // sert à ignorer l'Échap qui vient d'ouvrir le menu
let actionEnAttente = null;      // action dont on attend la nouvelle entrée (onglet Raccourcis)
let supprimerClicJusqua = 0;     // après l'assignation d'un bouton de souris, on ignore le clic qui suit

function afficherPanneau(nom) {
  annulerCapture();
  panneauActif = nom;
  panneauPrincipal.style.display = nom === "principal" ? "block" : "none";
  panneauParametres.style.display = nom === "parametres" ? "block" : "none";
  panneauMultijoueur.style.display = nom === "multijoueur" ? "block" : "none";
}

function afficherOnglet(nom) {
  annulerCapture();
  ongletActif = nom;
  contenuSensibilite.style.display = nom === "sensibilite" ? "block" : "none";
  contenuRaccourcis.style.display = nom === "raccourcis" ? "block" : "none";
  contenuJeu.style.display = nom === "jeu" ? "block" : "none";
  ongletSensibilite.classList.toggle("actif", nom === "sensibilite");
  ongletRaccourcis.classList.toggle("actif", nom === "raccourcis");
  ongletJeu.classList.toggle("actif", nom === "jeu");
}

// --- Onglet Jeu : rechargement automatique (Activé / Désactivé) ---
function appliquerRechargementAuto(actif, sauvegarder = true) {
  prefs.rechargementAuto = actif;
  boutonRechargeAutoOui.classList.toggle("actif", actif);
  boutonRechargeAutoNon.classList.toggle("actif", !actif);
  if (sauvegarder) sauvegarderRechargementAuto();
}

// --- Onglet Jeu : mode du sprint (Maintenir / Appuyer une fois) ---
function appliquerModeSprint(mode, sauvegarder = true) {
  prefs.modeSprint = mode;
  boutonSprintMaintenir.classList.toggle("actif", mode === "maintenir");
  boutonSprintBasculer.classList.toggle("actif", mode === "basculer");
  arreterDeplacement();   // repart d'un état propre (pas de sprint resté actif)
  if (sauvegarder) sauvegarderModeSprint();
}

function ouvrirMenu() {
  etat.menuOuvert = true;
  heureOuvertureMenu = performance.now();
  arreterDeplacement();
  menu.style.display = "flex";
  afficherPanneau("principal");
  messageMenu.textContent = "";
  reticule.style.display = "none";
  hud.style.display = "none";
  invite.style.display = "none";
}

function fermerMenu() {
  etat.menuOuvert = false;
  menu.style.display = "none";
  reticule.style.display = "";
  hud.style.display = "";
}

// Bouton Retour : un clic est une action de l'utilisateur, le navigateur accepte donc la capture de la souris
function reprendreJeuParBouton() {
  messageMenu.textContent = "";
  renderer.domElement.requestPointerLock();
}

// Échap dans le menu principal : le navigateur refuse de recapturer la souris sans clic.
// On ferme donc le menu et on invite à cliquer pour reprendre la main.
function reprendreJeuParClavier() {
  fermerMenu();
  invite.textContent = "Cliquez pour reprendre (Échap : menu)";
  invite.style.display = "block";
}

// --- Onglet Sensibilité : niveaux entiers de 1 à 10, mis à jour dans les curseurs, les textes et la sauvegarde ---
function appliquerSensibiliteHorizontale(niveau, sauvegarder = true) {
  prefs.niveauHorizontal = limiterNiveau(niveau);
  curseurHorizontal.value = prefs.niveauHorizontal;
  valeurHorizontale.textContent = prefs.niveauHorizontal + " / " + NIVEAU_MAX;
  if (sauvegarder) sauvegarderNiveau(CLE_HORIZONTALE, prefs.niveauHorizontal);
}

function appliquerSensibiliteVerticale(niveau, sauvegarder = true) {
  prefs.niveauVertical = limiterNiveau(niveau);
  curseurVertical.value = prefs.niveauVertical;
  valeurVerticale.textContent = prefs.niveauVertical + " / " + NIVEAU_MAX;
  if (sauvegarder) sauvegarderNiveau(CLE_VERTICALE, prefs.niveauVertical);
}

appliquerSensibiliteHorizontale(prefs.niveauHorizontal, false);
appliquerSensibiliteVerticale(prefs.niveauVertical, false);

curseurHorizontal.addEventListener("input", () => appliquerSensibiliteHorizontale(parseInt(curseurHorizontal.value, 10)));
curseurVertical.addEventListener("input", () => appliquerSensibiliteVerticale(parseInt(curseurVertical.value, 10)));

// --- Onglet Raccourcis : un bouton par action ---
const boutonsTouches = {};
ACTIONS_TOUCHES.forEach(action => {
  const ligne = document.createElement("div");
  ligne.className = "touche-ligne";

  const nom = document.createElement("span");
  nom.className = "nom";
  nom.textContent = action.nom;

  const bouton = document.createElement("button");
  bouton.className = "touche";
  bouton.type = "button";
  bouton.addEventListener("click", () => commencerCapture(action.id));

  ligne.append(nom, bouton);
  listeTouches.appendChild(ligne);
  boutonsTouches[action.id] = bouton;
});

function afficherMessageTouches(texte, erreur = false) {
  messageTouches.textContent = texte;
  messageTouches.style.color = erreur ? "#ff9a9a" : "#b8d8b8";
}

function rafraichirTouches() {
  ACTIONS_TOUCHES.forEach(action => {
    const bouton = boutonsTouches[action.id];
    if (actionEnAttente === action.id) {
      bouton.textContent = "Touche ou clic…";
      bouton.classList.add("attente");
    } else {
      bouton.textContent = prefs.touches[action.id].label;
      bouton.classList.remove("attente");
    }
  });
}

function commencerCapture(id) {
  actionEnAttente = id;
  afficherMessageTouches("Appuyez sur une touche (Échap : annuler). Pour un bouton de souris, cliquez sur ce bouton.");
  // Retire le focus du bouton pour qu'Espace ou Entrée ne le réactive pas
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  rafraichirTouches();
}

function annulerCapture() {
  if (actionEnAttente === null) return;
  actionEnAttente = null;
  messageTouches.textContent = "";
  rafraichirTouches();
}

// Assigne une nouvelle entrée (touche ou bouton de souris) à une action ;
// si elle servait déjà à une autre action, les deux entrées sont échangées
function assignerEntree(id, nouvelle) {
  const ancienne = prefs.touches[id];
  const autre = ACTIONS_TOUCHES.find(a => a.id !== id && cleEntree(prefs.touches[a.id]) === cleEntree(nouvelle));

  let message = "";
  if (autre) {
    prefs.touches[autre.id] = { ...ancienne };
    message = "« " + nouvelle.label + " » servait déjà à « " + autre.nom + " » : les deux entrées ont été échangées.";
  }
  prefs.touches[id] = nouvelle;
  actionEnAttente = null;

  // Remet à zéro les états en cours pour éviter une action bloquée après le changement
  arreterDeplacement();
  etat.tirEnCours = false;

  sauvegarderTouches();
  rafraichirTouches();
  afficherMessageTouches(message);
}

// Écoute de la touche (phase de capture : elle passe avant tous les autres raccourcis du jeu)
window.addEventListener("keydown", e => {
  if (actionEnAttente === null) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  if (e.repeat) return;

  // Touches non assignables : on continue d'attendre (Maj, Ctrl et Alt sont acceptés, ex. pour le sprint)
  if (["Meta", "AltGraph", "CapsLock", "Dead", "Unidentified"].includes(e.key)) return;

  // Échap annule le changement sans fermer le menu
  if (e.key === "Escape") {
    annulerCapture();
    return;
  }

  // Touches utilisées par les outils de réglage
  if (TOUCHES_RESERVEES.includes(e.key.toLowerCase())) {
    afficherMessageTouches("Cette touche est réservée à une autre fonction du jeu.", true);
    return;
  }

  assignerEntree(actionEnAttente, { type: "key", code: e.code, label: libelleTouche(e) });
}, true);

// Écoute du bouton de souris : un clic sur le bouton en attente l'assigne ; un clic ailleurs annule le changement
window.addEventListener("mousedown", e => {
  if (actionEnAttente === null) return;

  const bouton = boutonsTouches[actionEnAttente];
  if (bouton.contains(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Le clic qui suit (click / auxclick) ne doit ni relancer la capture ni activer autre chose
    supprimerClicJusqua = performance.now() + 700;

    if (e.button > 2) {
      afficherMessageTouches("Seuls les clics gauche, milieu et droit sont acceptés.", true);
      return;
    }
    assignerEntree(actionEnAttente, { type: "mouse", code: e.button, label: libelleSouris(e.button) });
  } else {
    annulerCapture();   // clic ailleurs : le clic agit ensuite normalement
  }
}, true);

function supprimerClicSiBesoin(e) {
  if (performance.now() > supprimerClicJusqua) return;
  supprimerClicJusqua = 0;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}
window.addEventListener("click", supprimerClicSiBesoin, true);
window.addEventListener("auxclick", supprimerClicSiBesoin, true);

rafraichirTouches();

// --- Boutons du menu ---
ongletSensibilite.addEventListener("click", () => afficherOnglet("sensibilite"));
ongletRaccourcis.addEventListener("click", () => afficherOnglet("raccourcis"));
ongletJeu.addEventListener("click", () => afficherOnglet("jeu"));

appliquerRechargementAuto(prefs.rechargementAuto, false);
boutonRechargeAutoOui.addEventListener("click", () => appliquerRechargementAuto(true));
boutonRechargeAutoNon.addEventListener("click", () => appliquerRechargementAuto(false));

// --- Onglet Jeu : carte (le décor est construit au chargement : changer de carte recharge la page) ---
const boutonsCarte = {
  industrielle: document.getElementById("carte-industrielle"),
  entrainement: document.getElementById("carte-entrainement")
};
Object.entries(boutonsCarte).forEach(([nom, bouton]) => {
  bouton.classList.toggle("actif", prefs.carte === nom);
  bouton.addEventListener("click", () => {
    if (prefs.carte === nom) return;
    prefs.carte = nom;
    sauvegarderCarte();
    location.reload();
  });
});

appliquerModeSprint(prefs.modeSprint, false);
boutonSprintMaintenir.addEventListener("click", () => appliquerModeSprint("maintenir"));
boutonSprintBasculer.addEventListener("click", () => appliquerModeSprint("basculer"));

// Réinitialise uniquement l'onglet affiché
document.getElementById("btn-reinitialiser").addEventListener("click", () => {
  if (ongletActif === "sensibilite") {
    appliquerSensibiliteHorizontale(NIVEAU_DEFAUT);
    appliquerSensibiliteVerticale(NIVEAU_DEFAUT);
  } else if (ongletActif === "jeu") {
    appliquerRechargementAuto(RECHARGEMENT_AUTO_DEFAUT);
    appliquerModeSprint(MODE_SPRINT_DEFAUT);
  } else {
    annulerCapture();
    prefs.touches = copierTouches(TOUCHES_PAR_DEFAUT);
    sauvegarderTouches();
    rafraichirTouches();
    afficherMessageTouches("Raccourcis par défaut rétablis.");
  }
});

document.getElementById("btn-parametres").addEventListener("click", () => afficherPanneau("parametres"));
document.getElementById("btn-multijoueur").addEventListener("click", () => afficherPanneau("multijoueur"));
document.getElementById("btn-retour-menu").addEventListener("click", () => afficherPanneau("principal"));
document.getElementById("btn-retour").addEventListener("click", reprendreJeuParBouton);

// Le navigateur peut refuser la capture juste après une sortie par Échap : on invite à réessayer
document.addEventListener("pointerlockerror", () => {
  if (etat.menuOuvert) messageMenu.textContent = "La souris n'a pas pu être reprise. Cliquez de nouveau sur Retour.";
});

// À l'arrivée sur le jeu : menu ouvert sur le panneau Multijoueur (pseudo, héberger, rejoindre, ou jouer en solo)
ouvrirMenu();
afficherPanneau("multijoueur");

// Échap en jeu (ou toute perte de capture) ouvre le menu ; la capture le referme
document.addEventListener("pointerlockchange", () => {
  if (sourisCapturee()) {
    etat.aDejaJoue = true;
    invite.style.display = "none";
    fermerMenu();
  } else {
    etat.tirEnCours = false;   // plus de tir si la souris est libérée
    arreterDeplacement();      // le joueur s'arrête
    if (etat.aDejaJoue) ouvrirMenu();
    else invite.style.display = "block";
  }
});

// Touche Échap : revient en arrière dans les menus
window.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;

  // Échap dans un menu : revient en arrière
  if (etat.menuOuvert) {
    e.preventDefault();
    if (e.repeat) return;
    if (performance.now() - heureOuvertureMenu < 300) return; // ignore l'Échap qui vient d'ouvrir le menu

    if (panneauActif !== "principal") afficherPanneau("principal");  // Paramètres / Multijoueur → menu principal
    else reprendreJeuParClavier();                                    // menu principal → jeu
    return;
  }

  // Échap quand le menu est fermé et que la souris n'est pas encore reprise : rouvre le menu
  if (!sourisCapturee() && etat.aDejaJoue) {
    e.preventDefault();
    if (!e.repeat) ouvrirMenu();
  }
});