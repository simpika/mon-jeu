// =====================================================
// RÉSEAU PAIR-À-PAIR (PeerJS / WebRTC)
//
// Organisation en étoile : l'hôte est relié à chaque joueur et relaie les messages.
//   - l'hôte s'enregistre sur le serveur PeerJS sous l'identifiant « préfixe + code »
//   - un joueur rejoint en se connectant à cet identifiant, puis se présente (« bonjour »)
//   - tout message d'un joueur passe par l'hôte, qui le transmet aux autres en ajoutant « de » (l'expéditeur)
// Le serveur PeerJS ne sert qu'à se trouver : la partie passe ensuite directement entre les navigateurs.
//
// Événements (surEvenement) :
//   "arrivee" (joueur, dejaPresent)  un joueur est là (dejaPresent : il était déjà dans le salon quand on l'a rejoint)
//   "depart"  (joueur)               un joueur est parti
//   "message" (message)              message de jeu ; message.de = identifiant de l'expéditeur
//   "fin"     (raison)               la partie multijoueur est terminée (raison : texte, ou null si on a quitté soi-même)
// =====================================================
import { Peer } from "peerjs";
import { CONFIG_MULTI } from "./config.js";

const LETTRES = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // sans I ni O (confondus avec 1 et 0)

// Demandes adressées à l'hôte (arbitre de la partie) : il ne les relaie pas aux autres joueurs
const POUR_HOTE_SEULEMENT = new Set(["touche", "reapparition", "demandeEquipe"]);

export const reseau = {
  role: null,          // null (solo), "hote" ou "client"
  code: null,          // code du salon
  monId: null,         // mon identifiant de joueur
  idHote: null,        // identifiant de l'hôte
  pseudo: "",
  personnage: "homme", // mon personnage (vu par les autres)
  infos: null,         // informations de la partie fixées par l'hôte (ex. { carte })
  joueurs: new Map()   // autres joueurs : id → { id, pseudo, personnage }
};

let peer = null;                     // connexion au serveur PeerJS (la mienne)
let peerEnAttente = null;            // pendant une tentative d'hébergement / de connexion
let connexionHote = null;            // client : connexion vers l'hôte
const connexions = new Map();        // hôte : id du joueur → connexion
const derniereNouvelle = new Map();  // id → instant du dernier message reçu (ms)

const ecouteurs = { arrivee: [], depart: [], message: [], fin: [] };
export function surEvenement(type, fonction) { ecouteurs[type].push(fonction); }
function emettre(type, ...args) {
  ecouteurs[type].forEach(fonction => {
    try { fonction(...args); } catch (e) { console.error(e); }
  });
}

export const nettoyerPersonnage = valeur => (valeur === "femme" ? "femme" : "homme");

export function nettoyerPseudo(texte) {
  const pseudo = String(texte || "").replace(/\s+/g, " ").trim().slice(0, 16);
  return pseudo || "Joueur";
}

function genererCode() {
  let code = "";
  for (let i = 0; i < CONFIG_MULTI.longueurCode; i++) code += LETTRES[Math.floor(Math.random() * LETTRES.length)];
  return code;
}

function creerPeer(id) {
  const options = { debug: 1 };
  if (CONFIG_MULTI.serveursIce) options.config = { iceServers: CONFIG_MULTI.serveursIce };
  return id ? new Peer(id, options) : new Peer(options);
}

// -----------------------------------------------------
// HÔTE
// -----------------------------------------------------
// infos : informations transmises à chaque joueur qui rejoint (ex. { carte: "industrielle" })
// Renvoie une promesse résolue avec le code du salon
export function heberger(pseudo, infos, personnage) {
  quitter();
  return new Promise((resoudre, rejeter) => {
    let essais = 0;
    const essayer = () => {
      const code = genererCode();
      const p = creerPeer(CONFIG_MULTI.prefixeSalon + code);
      peerEnAttente = p;
      let ouvert = false;

      p.on("open", id => {
        if (peerEnAttente !== p) return;
        ouvert = true;
        peerEnAttente = null;
        peer = p;
        Object.assign(reseau, {
          role: "hote", code, monId: id, idHote: id, pseudo: nettoyerPseudo(pseudo),
          personnage: nettoyerPersonnage(personnage), infos
        });
        p.on("connection", accueillir);
        resoudre(code);
      });

      // Coupure avec le serveur PeerJS : les joueurs déjà connectés restent, on se réenregistre pour en accueillir d'autres
      p.on("disconnected", () => { if (peer === p && !p.destroyed) p.reconnect(); });

      p.on("error", err => {
        if (ouvert) { console.warn("Réseau (hôte) :", err.type, err); return; }
        p.destroy();
        if (peerEnAttente !== p) return;
        peerEnAttente = null;
        if (err.type === "unavailable-id" && ++essais < 5) essayer();   // code déjà pris : on en tire un autre
        else rejeter(new Error(texteErreur(err)));
      });
    };
    essayer();
  });
}

function accueillir(conn) {
  conn.on("data", message => recevoirDuJoueur(conn, message));
  conn.on("close", () => retirerJoueur(conn.peer));
  conn.on("error", () => retirerJoueur(conn.peer));
}

function recevoirDuJoueur(conn, message) {
  if (!message || typeof message !== "object" || typeof message.t !== "string") return;
  const id = conn.peer;
  derniereNouvelle.set(id, performance.now());

  if (message.t === "bonjour") {
    if (connexions.has(id)) return;
    if (connexions.size + 1 >= CONFIG_MULTI.joueursMax) {
      conn.send({ t: "refus", raison: "Le salon est plein (" + CONFIG_MULTI.joueursMax + " joueurs maximum)." });
      setTimeout(() => conn.close(), 500);
      return;
    }
    const joueur = { id, pseudo: nettoyerPseudo(message.pseudo), personnage: nettoyerPersonnage(message.personnage) };
    connexions.set(id, conn);
    conn.send({
      t: "bienvenue",
      id,
      idHote: reseau.monId,
      infos: reseau.infos,
      joueurs: [{ id: reseau.monId, pseudo: reseau.pseudo, personnage: reseau.personnage }, ...reseau.joueurs.values()]
    });
    diffuser({ t: "arrivee", joueur }, id);
    reseau.joueurs.set(id, joueur);
    emettre("arrivee", joueur, false);
    return;
  }

  if (!connexions.has(id)) return;   // ne s'est pas encore présenté
  const relaye = { ...message, de: id };
  if (!POUR_HOTE_SEULEMENT.has(message.t)) diffuser(relaye, id);
  emettre("message", relaye);
}

// Hôte : envoie à tous les joueurs (sauf un)
function diffuser(message, sauf) {
  for (const [id, conn] of connexions) {
    if (id !== sauf && conn.open) conn.send(message);
  }
}

function retirerJoueur(id) {
  derniereNouvelle.delete(id);
  const conn = connexions.get(id);
  if (!conn) return;
  connexions.delete(id);
  try { conn.close(); } catch (e) { /* déjà fermée */ }
  const joueur = reseau.joueurs.get(id) || { id, pseudo: "Joueur" };
  reseau.joueurs.delete(id);
  diffuser({ t: "depart", id });
  emettre("depart", joueur);
}

// -----------------------------------------------------
// CLIENT
// -----------------------------------------------------
// Renvoie une promesse résolue avec le message de bienvenue de l'hôte ({ infos, joueurs... })
export function rejoindre(code, pseudo, personnage) {
  quitter();
  code = String(code || "").toUpperCase().trim();
  return new Promise((resoudre, rejeter) => {
    const p = creerPeer();
    peerEnAttente = p;
    let fini = false;

    const echec = texte => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      p.destroy();
      if (peerEnAttente === p) peerEnAttente = null;
      rejeter(new Error(texte));
    };
    const minuteur = setTimeout(
      () => echec("Pas de réponse de l'hôte : vérifiez le code, ou votre réseau bloque la connexion."), 15000);

    p.on("error", err => {
      if (!fini) echec(err.type === "peer-unavailable" ? "Aucune partie avec le code « " + code + " »." : texteErreur(err));
      else console.warn("Réseau (client) :", err.type, err);
    });

    p.on("open", () => {
      const conn = p.connect(CONFIG_MULTI.prefixeSalon + code, { reliable: true, serialization: "json" });
      conn.on("open", () => conn.send({
        t: "bonjour", pseudo: nettoyerPseudo(pseudo), personnage: nettoyerPersonnage(personnage)
      }));
      conn.on("close", () => { if (fini && connexionHote === conn) terminer("L'hôte a quitté la partie."); });
      conn.on("data", message => {
        if (!message || typeof message !== "object") return;
        if (fini) { recevoirDeLHote(message); return; }

        if (message.t === "refus") { echec(message.raison); return; }
        if (message.t !== "bienvenue") return;

        fini = true;
        clearTimeout(minuteur);
        if (peerEnAttente === p) peerEnAttente = null;
        peer = p;
        connexionHote = conn;
        Object.assign(reseau, {
          role: "client", code, monId: message.id, idHote: message.idHote,
          pseudo: nettoyerPseudo(pseudo), personnage: nettoyerPersonnage(personnage), infos: message.infos
        });
        derniereNouvelle.set(message.idHote, performance.now());
        message.joueurs.forEach(j => reseau.joueurs.set(j.id, {
          id: j.id, pseudo: nettoyerPseudo(j.pseudo), personnage: nettoyerPersonnage(j.personnage)
        }));
        resoudre(message);
        reseau.joueurs.forEach(j => emettre("arrivee", j, true));
      });
    });
  });
}

function recevoirDeLHote(message) {
  derniereNouvelle.set(reseau.idHote, performance.now());
  if (message.t === "arrivee") {
    const joueur = {
      id: message.joueur.id, pseudo: nettoyerPseudo(message.joueur.pseudo),
      personnage: nettoyerPersonnage(message.joueur.personnage)
    };
    reseau.joueurs.set(joueur.id, joueur);
    emettre("arrivee", joueur, false);
  } else if (message.t === "depart") {
    const joueur = reseau.joueurs.get(message.id);
    if (!joueur) return;
    reseau.joueurs.delete(message.id);
    emettre("depart", joueur);
  } else if (typeof message.t === "string") {
    if (!message.de) message.de = reseau.idHote;
    emettre("message", message);
  }
}

// -----------------------------------------------------
// COMMUN
// -----------------------------------------------------
// Envoie un message de jeu à tous les autres joueurs
export function envoyer(message) {
  if (reseau.role === "client") {
    if (connexionHote && connexionHote.open) connexionHote.send(message);
  } else if (reseau.role === "hote") {
    diffuser({ ...message, de: reseau.monId });
  }
}

// Quitter la partie (aucun message de fin affiché)
export function quitter() {
  if (peerEnAttente) { peerEnAttente.destroy(); peerEnAttente = null; }
  if (reseau.role) terminer(null);
}

function terminer(raison) {
  const etaitConnecte = reseau.role !== null;
  const partis = [...reseau.joueurs.values()];
  if (peer) { try { peer.destroy(); } catch (e) { /* ignoré */ } }
  peer = null;
  connexionHote = null;
  connexions.clear();
  derniereNouvelle.clear();
  reseau.joueurs.clear();
  Object.assign(reseau, { role: null, code: null, monId: null, idHote: null, infos: null });
  if (!etaitConnecte) return;
  partis.forEach(j => emettre("depart", j));
  emettre("fin", raison);
}

function texteErreur(err) {
  const textes = {
    "browser-incompatible": "Ce navigateur ne permet pas le multijoueur.",
    "network": "Serveur de connexion injoignable : vérifiez votre accès à Internet.",
    "server-error": "Serveur de connexion indisponible, réessayez dans un instant.",
    "socket-error": "Serveur de connexion injoignable : vérifiez votre accès à Internet.",
    "unavailable-id": "Impossible de créer un salon, réessayez.",
    "webrtc": "La connexion directe a échoué (réseau trop restrictif)."
  };
  return textes[err.type] || ("Connexion impossible (" + err.type + ").");
}

// Joueurs (ou hôte) muets depuis trop longtemps : considérés comme partis
setInterval(() => {
  if (!reseau.role) return;
  const limite = performance.now() - CONFIG_MULTI.delaiDeconnexion * 1000;
  if (reseau.role === "hote") {
    for (const [id, instant] of derniereNouvelle) if (instant < limite) retirerJoueur(id);
  } else if ((derniereNouvelle.get(reseau.idHote) || 0) < limite) {
    terminer("Connexion perdue avec l'hôte.");
  }
}, 1000);

// Fermeture de l'onglet : on prévient les autres tout de suite
window.addEventListener("beforeunload", () => { if (peer) peer.destroy(); });
