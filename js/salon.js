// =====================================================
// SALON MULTIJOUEUR : panneau du menu (Échap > Multijoueur), notifications et rappel du code en jeu
// =====================================================
import { renderer } from "./moteur.js";
import { CONFIG_MULTI } from "./config.js";
import { prefs, sauvegarderCarte, CARTES } from "./preferences.js";
import { reseau, surEvenement, heberger, rejoindre, quitter, nettoyerPseudo } from "./reseau.js";
import { commencerPartieMulti } from "./multijoueur.js";
import { surPartie, equipeDe, monEquipe, demanderEquipe, EQUIPES, NOMS_EQUIPES } from "./partie.js";

const CLE_PSEUDO = "pseudoMulti";
const CLE_REJOINDRE = "rejoindreApresChargement";   // sessionStorage : salon à rejoindre après un changement de carte

const style = document.createElement("style");
style.textContent = `
  #menu-jeu input.champ {
    width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 16px;
    color: #fff; background: #111; border: 1px solid #666; border-radius: 6px; outline: none;
  }
  #menu-jeu input.champ:focus { border-color: #ff8a1f; }
  #menu-jeu .ligne-code { display: flex; gap: 8px; }
  #menu-jeu .ligne-code input { flex: 1; text-transform: uppercase; letter-spacing: 4px; font-weight: 700; text-align: center; }
  #menu-jeu .ligne-code button { width: auto; margin: 0; padding: 10px 16px; }
  #menu-jeu .separation { margin: 22px 0 14px; border-top: 1px solid #444; }
  #menu-jeu .code-salon { font-size: 15px; color: #ccc; margin-bottom: 4px; }
  #menu-jeu .code-salon strong { font-size: 34px; letter-spacing: 8px; color: #ffb870; display: block; margin: 6px 0; }
  #menu-jeu .aide { font-size: 12px; color: #999; margin-bottom: 16px; }
  #menu-jeu .liste-joueurs { list-style: none; margin: 0 0 8px; padding: 0; text-align: left; }
  #menu-jeu .liste-joueurs li { padding: 7px 10px; margin-bottom: 4px; background: #262626; border-radius: 4px; font-size: 14px; }
  #menu-jeu .liste-joueurs li .role { float: right; color: #999; font-size: 12px; }
  #menu-jeu .liste-joueurs li.titre-equipe {
    background: none; padding: 10px 2px 4px; font-size: 12px; font-weight: 700; letter-spacing: 1px;
  }
  #menu-jeu button.principal { background: #8a4a12; border-color: #ff8a1f; font-weight: 700; }
  #menu-jeu button.principal:hover { background: #a85a18; }

  #notifications-multi {
    position: fixed; top: 130px; left: 50%; transform: translateX(-50%); z-index: 35;
    display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none;
    font-family: sans-serif;
  }
  #notifications-multi div {
    padding: 8px 16px; background: rgba(0, 0, 0, 0.75); color: #fff; font-size: 14px;
    border-radius: 4px; border-left: 3px solid #ff8a1f; transition: opacity 0.4s;
  }
  #etiquette-salon {
    position: fixed; top: 16px; left: 16px; z-index: 15; pointer-events: none; display: none;
    padding: 6px 10px; background: rgba(0, 0, 0, 0.55); color: #ddd; border-radius: 4px;
    font: 13px sans-serif;
  }
  #etiquette-salon strong { color: #ffb870; letter-spacing: 2px; }
`;
document.head.appendChild(style);

// --- Notifications (« X a rejoint la partie »...) ---
const zoneNotifications = document.createElement("div");
zoneNotifications.id = "notifications-multi";
document.body.appendChild(zoneNotifications);

export function notifier(texte) {
  const element = document.createElement("div");
  element.textContent = texte;
  zoneNotifications.appendChild(element);
  setTimeout(() => { element.style.opacity = "0"; }, 3600);
  setTimeout(() => element.remove(), 4000);
}

// --- Rappel du salon en jeu (en haut à gauche) ---
const etiquetteSalon = document.createElement("div");
etiquetteSalon.id = "etiquette-salon";
document.body.appendChild(etiquetteSalon);

function lirePseudo() {
  try { return localStorage.getItem(CLE_PSEUDO) || ""; } catch (e) { return ""; }
}
function sauvegarderPseudo(pseudo) {
  try { localStorage.setItem(CLE_PSEUDO, pseudo); } catch (e) { /* ignoré */ }
}

let elements = null;   // éléments du panneau, une fois créé

// Crée le panneau Multijoueur dans le menu. retourMenu : revient au menu principal
export function creerPanneauMultijoueur(retourMenu) {
  const panneau = document.createElement("div");
  panneau.className = "panneau";
  panneau.id = "menu-multijoueur";
  panneau.style.display = "none";
  panneau.innerHTML = `
    <h2>MULTIJOUEUR</h2>
    <div id="multi-hors-ligne">
      <div class="libelle">Pseudo</div>
      <input class="champ" id="multi-pseudo" type="text" maxlength="16" placeholder="Votre pseudo" autocomplete="off">
      <button id="multi-heberger" type="button">Héberger une partie</button>
      <div class="separation"></div>
      <div class="libelle">Rejoindre avec un code</div>
      <div class="ligne-code">
        <input class="champ" id="multi-code" type="text" maxlength="${CONFIG_MULTI.longueurCode}" placeholder="CODE" autocomplete="off">
        <button id="multi-rejoindre" type="button">Rejoindre</button>
      </div>
    </div>
    <div id="multi-en-ligne" style="display:none">
      <div class="code-salon">Code du salon <strong id="multi-code-affiche"></strong></div>
      <div class="aide">Donnez ce code à vos amis : Échap > Multijoueur > Rejoindre</div>
      <div class="libelle" id="multi-titre-liste">Joueurs</div>
      <ul class="liste-joueurs" id="multi-liste"></ul>
      <button id="multi-changer-equipe" type="button">Changer d'équipe</button>
      <button id="multi-quitter" type="button">Quitter la partie</button>
    </div>
    <div class="message" id="multi-message"></div>
    <button id="multi-jouer" class="principal" type="button">Jouer en solo</button>
    <button id="multi-retour" type="button">Retour au menu</button>
  `;

  const $ = id => panneau.querySelector("#" + id);
  elements = {
    horsLigne: $("multi-hors-ligne"), enLigne: $("multi-en-ligne"),
    pseudo: $("multi-pseudo"), code: $("multi-code"),
    heberger: $("multi-heberger"), rejoindre: $("multi-rejoindre"), quitter: $("multi-quitter"),
    codeAffiche: $("multi-code-affiche"), titreListe: $("multi-titre-liste"), liste: $("multi-liste"),
    message: $("multi-message"), jouer: $("multi-jouer"), changerEquipe: $("multi-changer-equipe")
  };

  // Jouer : capture de la souris (le clic est une action de l'utilisateur, le navigateur l'accepte)
  elements.jouer.addEventListener("click", () => renderer.domElement.requestPointerLock());
  elements.changerEquipe.addEventListener("click", () => {
    const mienne = monEquipe();
    if (mienne) demanderEquipe(mienne === "sud" ? "nord" : "sud");
  });
  elements.pseudo.value = lirePseudo();

  // Les touches tapées dans les champs ne doivent pas déclencher les actions du jeu ni les outils de réglage
  [elements.pseudo, elements.code].forEach(champ => {
    champ.addEventListener("keydown", e => {
      if (e.key === "Escape") return;   // Échap garde son rôle (retour au menu)
      e.stopPropagation();
      if (e.key === "Enter") (champ === elements.code ? lancerRejoindre : lancerHebergement)();
    });
  });
  elements.pseudo.addEventListener("change", () => sauvegarderPseudo(nettoyerPseudo(elements.pseudo.value)));
  elements.code.addEventListener("input", () => {
    elements.code.value = elements.code.value.toUpperCase().replace(/[^A-Z]/g, "");
  });

  elements.heberger.addEventListener("click", lancerHebergement);
  elements.rejoindre.addEventListener("click", lancerRejoindre);
  elements.quitter.addEventListener("click", () => {
    quitter();
    afficherMessage("Vous avez quitté la partie.");
    rafraichir();
  });
  $("multi-retour").addEventListener("click", retourMenu);

  rafraichir();
  return panneau;
}

function afficherMessage(texte, erreur = false) {
  if (!elements) return;
  elements.message.textContent = texte;
  elements.message.style.color = erreur ? "#ff9a9a" : "#b8d8b8";
}

function occupe(oui) {
  if (!elements) return;
  elements.heberger.disabled = oui;
  elements.rejoindre.disabled = oui;
}

function pseudoChoisi() {
  const pseudo = nettoyerPseudo(elements ? elements.pseudo.value : lirePseudo());
  if (elements) elements.pseudo.value = pseudo;
  sauvegarderPseudo(pseudo);
  return pseudo;
}

async function lancerHebergement() {
  const pseudo = pseudoChoisi();
  occupe(true);
  afficherMessage("Création du salon…");
  try {
    const code = await heberger(pseudo, { carte: prefs.carte });
    commencerPartieMulti();
    afficherMessage("Salon créé : donnez le code à vos amis, puis cliquez sur Jouer.");
    notifier("Salon " + code + " créé");
  } catch (e) {
    afficherMessage(e.message, true);
  }
  occupe(false);
  rafraichir();
}

async function lancerRejoindre(codeImpose, pseudoImpose) {
  const code = (typeof codeImpose === "string" ? codeImpose : elements.code.value).toUpperCase().trim();
  const pseudo = typeof pseudoImpose === "string" ? nettoyerPseudo(pseudoImpose) : pseudoChoisi();
  if (code.length !== CONFIG_MULTI.longueurCode) {
    afficherMessage("Le code fait " + CONFIG_MULTI.longueurCode + " lettres.", true);
    return;
  }
  occupe(true);
  afficherMessage("Connexion au salon " + code + "…");
  try {
    const bienvenue = await rejoindre(code, pseudo);

    // L'hôte joue sur une autre carte : on la charge (rechargement de la page), puis on rejoint de nouveau
    const carte = bienvenue.infos && bienvenue.infos.carte;
    if (CARTES.includes(carte) && carte !== prefs.carte) {
      quitter();
      try { sessionStorage.setItem(CLE_REJOINDRE, JSON.stringify({ code, pseudo })); } catch (e) { /* ignoré */ }
      prefs.carte = carte;
      sauvegarderCarte();
      location.reload();
      return;
    }

    commencerPartieMulti();
    afficherMessage("Connecté : cliquez sur Jouer.");
    const hote = reseau.joueurs.get(reseau.idHote);
    notifier("Vous avez rejoint la partie" + (hote ? " de " + hote.pseudo : ""));
  } catch (e) {
    afficherMessage(e.message, true);
    notifier(e.message);
  }
  occupe(false);
  rafraichir();
}

// Met à jour le panneau et le rappel du salon selon l'état de la connexion
function rafraichir() {
  const enLigne = reseau.role !== null;
  const nombre = reseau.joueurs.size + 1;
  etiquetteSalon.style.display = enLigne ? "block" : "none";
  if (enLigne) {
    etiquetteSalon.innerHTML = "";
    etiquetteSalon.append("Salon ");
    const code = document.createElement("strong");
    code.textContent = reseau.code;
    etiquetteSalon.append(code, " · " + nombre + " joueur" + (nombre > 1 ? "s" : ""));
  }

  if (!elements) return;
  elements.horsLigne.style.display = enLigne ? "none" : "block";
  elements.enLigne.style.display = enLigne ? "block" : "none";
  elements.jouer.textContent = enLigne ? "Jouer" : "Jouer en solo";
  if (!enLigne) return;

  elements.codeAffiche.textContent = reseau.code;
  elements.titreListe.textContent = "Joueurs (" + nombre + " / " + CONFIG_MULTI.joueursMax + ")";
  elements.liste.innerHTML = "";

  // Joueurs groupés par équipe : la mienne en bleu, l'autre en rouge
  const mienne = monEquipe();
  const tous = [{ id: reseau.monId, pseudo: reseau.pseudo, moi: true }, ...reseau.joueurs.values()];
  const groupes = EQUIPES.map(equipe => [
    "Équipe " + NOMS_EQUIPES[equipe] + (equipe === mienne ? " · la vôtre" : ""),
    equipe === mienne ? CONFIG_MULTI.couleurTexteAllie : CONFIG_MULTI.couleurTexteEnnemi,
    tous.filter(j => equipeDe(j.id) === equipe)
  ]);
  const enAttente = tous.filter(j => !equipeDe(j.id));
  if (enAttente.length) groupes.push(["En attente d'équipe", "#999", enAttente]);

  groupes.forEach(([titre, couleur, membres]) => {
    const entete = document.createElement("li");
    entete.className = "titre-equipe";
    entete.textContent = titre.toUpperCase();
    entete.style.color = couleur;
    elements.liste.appendChild(entete);
    membres.forEach(joueur => {
      const li = document.createElement("li");
      li.textContent = joueur.pseudo + (joueur.moi ? " (vous)" : "");
      li.style.color = couleur;
      if (joueur.id === reseau.idHote) {
        const role = document.createElement("span");
        role.className = "role";
        role.textContent = "hôte";
        li.appendChild(role);
      }
      elements.liste.appendChild(li);
    });
  });

  elements.changerEquipe.style.display = mienne ? "block" : "none";
  if (mienne) elements.changerEquipe.textContent = "Passer dans l'équipe " + NOMS_EQUIPES[mienne === "sud" ? "nord" : "sud"];
}

surPartie("etat", rafraichir);

surEvenement("arrivee", (joueur, dejaPresent) => {
  rafraichir();
  if (!dejaPresent) notifier(joueur.pseudo + " a rejoint la partie");
});
surEvenement("depart", joueur => {
  rafraichir();
  if (reseau.role) notifier(joueur.pseudo + " a quitté la partie");
});
surEvenement("fin", raison => {
  rafraichir();
  if (raison) {
    notifier(raison);
    afficherMessage(raison, true);
  }
});

// Après un changement de carte imposé par l'hôte : on rejoint automatiquement le salon
(function rejoindreApresChargement() {
  let demande = null;
  try {
    demande = JSON.parse(sessionStorage.getItem(CLE_REJOINDRE));
    sessionStorage.removeItem(CLE_REJOINDRE);
  } catch (e) { /* ignoré */ }
  if (demande && typeof demande.code === "string") {
    notifier("Connexion au salon " + demande.code + "…");
    setTimeout(() => lancerRejoindre(demande.code, demande.pseudo), 0);
  }
})();
