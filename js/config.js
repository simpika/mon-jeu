// =====================================================
// CONFIGURATION : tous les réglages du jeu sont ici
// =====================================================

// Le sol est 1,60 m sous la caméra (les yeux du joueur)
export const HAUTEUR_SOL = -1.6;
export const HAUTEUR_YEUX = -HAUTEUR_SOL;

// =====================================================
// ARME
// =====================================================
export const CONFIG_ARME = {
  fichier: "assets/M4/M4.fbx",
  longueur: 1.0,                 // taille du modèle à l'écran
  rotationX: 0,
  rotationY: Math.PI,            // orientation à 180°
  rotationZ: 0,
  position: { x: 0.3, y: -0.3, z: -0.45 }
};

// =====================================================
// MAINS (gants et avant-bras en formes simples, attachés à l'arme)
// Touche H : outil de réglage de la position des mains
// =====================================================
export const CONFIG_MAINS = {
  actif: false,                  // false = pas de mains (le modèle M4 a déjà ses propres bras)
  couleurGant: 0x2b2f33,         // doigts, dos de la main et avant-bras (essayez 0xc99a74 pour des mains nues)
  couleurManchette: 0x5a626c,    // plaque sur la main et protège-avant-bras
  echelle: 1,                    // taille des mains (1 = normale)
  longueurAvantBras: 0.45,       // longueur des avant-bras (ils sortent par le bas de l'écran)

  // position : repère de l'arme (x : droite, y : haut, z : vers vous ; l'avant du canon est à z négatif)
  // rayonPrise : épaisseur de ce que la main serre (mètres)
  // avantBras : direction de l'avant-bras à partir du poignet

  // Main qui tire : serre la poignée
  droite: {
    type: "poignee",
    position: { x: 0.0, y: -0.08, z: 0.12 },
    rayonPrise: 0.03,
    avantBras: { x: 0.22, y: -0.55, z: 0.8 }
  },

  // Main d'appui : soutient le garde-main sous le canon
  gauche: {
    type: "garde-main",
    position: { x: 0.0, y: -0.065, z: -0.10 },
    rayonPrise: 0.035,
    avantBras: { x: -0.45, y: -0.45, z: 0.75 }
  }
};

// =====================================================
// TIR (les dégâts dépendent de la zone touchée : voir CONFIG_CIBLE.zones)
// =====================================================
export const CONFIG_TIR = {
  cadence: 0.14,                 // secondes entre deux tirs en tir automatique
  bouche: { x: -0.01, y: 0.1, z: -0.3 }, // sortie du canon de secours (normalement repérée sur le modèle ; touche M pour la visualiser)
  flashDecalage: 0.05,           // recul du flash derrière la sortie du canon (plus grand = plus derrière l'arme)
  vitesseBalle: 90,              // vitesse du trait lumineux
  longueurTrait: 2.5,            // longueur du trait
  portee: 130,                   // distance maximale du tir (mètres ; la carte industrielle fait 80 × 110 m)
  couleurTrait: 0xffc060,
  afficherTrait: true,           // trait lumineux derrière la balle (false = balle seule)
  longueurBalle: 0.06,           // longueur du modèle de balle (mètres ; une 5.56x45 mm mesure 0,057 m)
  volume: 0.5                   // 0 = muet, 1 = fort
};

// =====================================================
// DÉPLACEMENT (touches configurables) ET SAUT
// =====================================================
export const CONFIG_DEPLACEMENT = {
  vitesse: 4.5,                  // vitesse de marche (mètres par seconde)
  acceleration: 12,              // démarrage / arrêt : plus grand = plus sec
  rayonJoueur: 0.35,             // distance minimale entre le joueur et un mur (mètres)
  hauteurJoueur: 1.75,           // taille du joueur, des pieds au sommet de la tête (mètres)
  limite: 90,                    // limite de la zone de jeu : ±90 m autour du centre
  hauteurSaut: 1.0,              // hauteur maximale du saut (mètres)
  gravite: 22,                   // gravité (plus grand = saut plus court et plus sec)
  hauteurMarche: 0.25,           // hauteur franchie automatiquement : marches d'escalier, petits rebords (mètres)
  tamponSaut: 0.12               // un appui sur la touche de saut juste avant l'atterrissage est mémorisé (secondes)
};

// =====================================================
// SPRINT (Maj gauche par défaut ; maintenir ou appuyer une fois : Paramètres > Jeu)
// Ni tir ni rechargement pendant le sprint
// =====================================================
export const CONFIG_SPRINT = {
  multiplicateur: 1.6,           // vitesse de sprint = vitesse de marche × multiplicateur
  inclinaison: 0.35,             // l'arme pique vers le bas (radians, ~20°)
  rotationLaterale: 0.3,         // l'arme pivote vers la gauche (radians)
  abaissement: 0.05,             // l'arme descend (mètres)
  transition: 8                  // vitesse de passage marche ↔ sprint (plus grand = plus rapide)
};

// =====================================================
// FICHIERS SONS (si un fichier manque, un son synthétisé le remplace)
// =====================================================
export const CONFIG_SONS = {
  tir: "assets/sounds_effect/Full Sound/5.56/WAV/556 Single WAV.wav",
  // Rechargement en deux parties : chacune est jouée pile au moment correspondant de l'animation
  // (partie 1 = retrait du chargeur, partie 2 = insertion). Si elles manquent, le fichier complet est utilisé.
  rechargementPartie1: "assets/sounds_effect/Reloads, Cycling & More/WAV/AR Reload Part 1 WAV.wav",
  rechargementPartie2: "assets/sounds_effect/Reloads, Cycling & More/WAV/AR Reload Part 2 WAV.wav",
  rechargement: "assets/sounds_effect/Reloads, Cycling & More/WAV/AR Reload Full WAV.wav",
  // Calage du fichier complet sur l'animation. Vide = automatique (les claquements du son
  // sont alignés sur le retrait et l'insertion du chargeur détectés dans l'animation).
  // Réglage manuel : debut = instant de l'animation (s) où commence le fichier ; vitesse = 1 pour la vitesse d'origine.
  // Exemple : { Reload: { debut: 0.2, vitesse: 1 }, Reload_Empty: { debut: 0.3, vitesse: 1 } }
  calageRechargement: {},
  // Hitmarker (balle qui touche la cible) : un son pour la tête, un pour le reste du corps.
  // Vide = son synthétisé ; sinon chemin d'un fichier (ex. "assets/sons/hitmarker_tete.wav")
  hitmarkerTete: "",
  hitmarkerCorps: "",
  volumeHitmarker: 0.6           // 0 = muet, 1 = fort
};

// =====================================================
// MUNITIONS ET RECHARGEMENT (touche configurable, R par défaut)
// =====================================================
export const CONFIG_MUNITIONS = {
  chargeur: 35,                  // munitions par chargeur (= nombre de barres)
  chargeurs: 10,                 // chargeurs de réserve au début de la partie (un rechargement en consomme un)
  chargeursParElimination: 1,    // chargeurs gagnés en éliminant une cible
  dureeRechargement: 1.8,        // durée du rechargement si le modèle n'a pas d'animation Reload (secondes)
  // Après l'insertion du chargeur, la fin de l'animation est jouée plus vite (1 = vitesse d'origine)
  vitesseFinRechargement: 1.8,
  // Tir de nouveau disponible avant la fin du mouvement de l'animation (secondes d'avance)
  avanceFinRechargement: 0.4,
  // Réglage précis par animation (secondes depuis le début ; remplace le calcul automatique)
  // Exemple : { Reload: 1.4, Reload_Empty: 1.6 }
  finRechargement: {},
  // Moments des sons du chargeur (secondes depuis le début de l'animation).
  // Vide = détection automatique d'après le mouvement du chargeur dans l'animation.
  // Exemple : { Reload: { retrait: 0.4, insertion: 1.5 }, Reload_Empty: { retrait: 0.4, insertion: 1.6 } }
  sonsRechargement: {},
  seuilAlerte: 10,               // à partir de ce nombre de munitions, le nombre et les barres clignotent en rouge
  volume: 0.4                    // volume des bruitages (0 = muet, 1 = fort)
};

// =====================================================
// CIBLE (SILHOUETTE HUMAINE) ET ZONES DE DÉGÂTS
// =====================================================
export const CONFIG_CIBLE = {
  actif: true,                   // false = pas de cible
  vie: 200,                      // points de vie
  echelle: 1,                    // taille de la silhouette (1 = 1,80 m)
  delaiReapparition: 1.5,        // secondes avant la réapparition
  distanceMin: 8,                // distance d'apparition minimale (mètres)
  distanceMax: 16,               // distance d'apparition maximale (mètres)
  ouvertureAngle: 100,           // zone d'apparition devant votre vue (degrés)
  barreVie: true,                // petite barre de vie au-dessus de la silhouette
  afficherDegats: true,          // petit texte « dégâts / zone » au-dessus du réticule à chaque touche

  // Zones de dégâts (l'ordre compte : zones[0] = tête, zones[1] = torse, zones[2] = reste du corps)
  // nom : texte affiché à l'impact
  // degats : dégâts infligés par balle
  // couleur : couleur de la partie du corps
  // texte : couleur du chiffre affiché à l'impact
  zones: [
    { nom: "Zone 1 · Tête",  degats: 68, couleur: 0xa83c00, texte: "#ffd23f" },   // tête
    { nom: "Zone 2 · Torse", degats: 50, couleur: 0xdd6a0a, texte: "#ffffff" },   // torse
    { nom: "Zone 3 · Corps", degats: 40, couleur: 0xff8a1f, texte: "#ffb870" }    // cou, bras, jambes
  ],

  // Baisse des dégâts des balles avec la distance (damage falloff)
  //   jusqu'à distancePleine : 100 % des dégâts de la zone
  //   de distancePleine à distanceReduite : baisse progressive (linéaire)
  //   au-delà de distanceReduite : degatsMinimum (fraction des dégâts de la zone)
  // Exemple avec les valeurs ci-dessous : tête 68 à 10 m, 51 à 25 m, 34 à 40 m et plus
  chuteDegats: {
    actif: true,
    distancePleine: 10,          // mètres
    distanceReduite: 40,         // mètres
    degatsMinimum: 0.5           // 0.5 = la moitié des dégâts au-delà de distanceReduite
  }
};

// =====================================================
// IMPACTS (balles sur les décors)
// =====================================================
export const CONFIG_IMPACT = {
  etincelles: 14,                // nombre d'étincelles par impact (0 = aucune)
  vitesseEtincelles: 3.5,        // vitesse d'éjection (m/s)
  dureeEtincelles: 0.5,          // durée de vie moyenne (secondes)
  tailleEtincelles: 5,           // taille à l'écran (pixels)
  gravite: 9,                    // chute des étincelles
  couleurEtincelles: 0xffb060,
  trou: true,                    // marque laissée sur la surface
  tailleTrou: 0.12,              // taille de la marque (mètres)
  maxTrous: 80,                  // nombre maximum de marques (les plus anciennes disparaissent)
  flash: true,                   // éclat lumineux à l'impact
  tailleFlash: 0.3,              // taille de l'éclat (mètres)
  volume: 0.35                   // 0 = muet, 1 = fort
};

// =====================================================
// VUE ET VISÉE
// =====================================================
export const CONFIG_VUE = {
  sensibiliteNiveau6: 0.0012     // vitesse de rotation au niveau 6 (niveau de référence et par défaut)
};

// Sensibilités du menu Paramètres : niveaux entiers de 1 à 10, proportionnels au niveau 6
// vitesse = sensibiliteNiveau6 × (niveau / 6)  →  niveau 1 = 0.0002, niveau 6 = 0.0012, niveau 10 = 0.0020
export const NIVEAU_MIN = 1;
export const NIVEAU_MAX = 10;
export const NIVEAU_REFERENCE = 6;
export const NIVEAU_DEFAUT = 6;

export const CONFIG_VISEE = {
  distance: 15                   // distance (m) à laquelle le canon pointe exactement sur le réticule
};

// =====================================================
// MONDE : SOL, RAMPES, ESCALIERS, PASSERELLES, PONT
// =====================================================
export const CONFIG_MONDE = {
  actif: true                    // false = fond uni sans décor (et sans impacts sur le décor)
};

// =====================================================
// GRENADE (raccourci « Lancer une grenade », touche A par défaut)
// =====================================================
export const CONFIG_GRENADE = {
  nombre: 2,                     // grenades disponibles au début de la partie (et après chaque élimination)
  couleurCorps: 0x4b5320,        // vert olive
  couleurMetal: 0x8a8f96,        // bouchon, cuillère et goupille

  // Lancer et explosion
  delaiExplosion: 3,             // secondes entre le lancer et l'explosion
  // Dégâts par paliers selon la distance (m) entre l'explosion et la cible (si aucun mur ne la protège) :
  // le premier palier dont la distance n'est pas dépassée s'applique ; au-delà du dernier : aucun dégât
  paliersDegats: [
    { jusqua: 3, degats: 100 },  // jusqu'à 3 m
    { jusqua: 5, degats: 60 },   // de 3 à 5 m
    { jusqua: 6, degats: 40 }    // de 5 à 6 m
  ],
  vitesseLancer: 14,             // vitesse de la grenade au départ (m/s)
  angleLancer: 8,                // la grenade part un peu au-dessus du réticule (degrés)
  gravite: 15,                   // chute de la grenade
  rebond: 0.18,                  // vitesse conservée à chaque rebond (0 = s'arrête net, 1 = rebondit sans perte)
  frottement: 0.95,               // vitesse conservée le long de la surface à chaque contact (plus petit = roule moins)
  vitesseArret: 2,               // en dessous de cette vitesse (m/s) au contact du sol, la grenade s'immobilise
  dureeLancer: 0.6,              // durée du geste de lancer : le M4 s'abaisse puis remonte, pas de tir pendant ce temps (secondes)
  volume: 0.8                    // volume de l'explosion (0 = muet, 1 = fort)
};

// =====================================================
// CARTE (mini-carte circulaire en haut à droite)
// =====================================================
export const CONFIG_CARTE = {
  actif: true,                   // false = pas de carte
  taille: 190,                   // diamètre de la carte à l'écran (pixels)
  portee: 35,                    // distance visible entre le joueur et le bord de la carte (mètres)
  marge: 20,                     // distance au coin haut droit de l'écran (pixels)
  couleurFond: "rgba(20, 24, 28, 0.78)",
  couleurBord: "rgba(255, 255, 255, 0.85)",
  couleurNord: "#ff4a3d",        // lettre N et repère du Nord
  couleurJoueur: "#2f8cff"       // flèche du joueur
};

// =====================================================
// RECUL (kick)
// =====================================================
export const CONFIG_RECUL = {
  distance: 0.03,                // recul de l'arme vers l'arrière (0 = aucun)
  cabrage: 0.035,                // l'arme se relève (0 = aucun)
  max: 1.8,                      // limite d'accumulation en tir automatique
  retour: 8                      // vitesse de retour au repos (plus grand = plus sec)
};

// =====================================================
// RÉTICULE
// =====================================================
export const CONFIG_RETICULE = {
  ecartRepos: 6,                 // écart (px) entre le point et les branches au repos
  ecartTir: 14,                  // écart (px) tant que le bouton est maintenu
  vitesseTransition: 20,         // plus la valeur est grande, plus la transition est rapide
  couleur: "#ffffff",            // couleur normale
  couleurTouche: "#ff2a2a",      // couleur quand une balle touche la cible
  dureeTouche: 0.2,              // durée du rouge après une touche (secondes)
  dureeToucheElimination: 0.4    // durée du rouge quand la cible est éliminée (secondes)
};

// =====================================================
// RACCOURCIS CONFIGURABLES (onglet Raccourcis du menu Paramètres)
// =====================================================
// Chaque action est liée à une entrée :
//   type "key"   : touche du clavier, repérée par sa position physique (code), indépendante de la disposition
//   type "mouse" : bouton de la souris (0 = gauche, 1 = milieu, 2 = droit)
// label : texte affiché dans le menu
export const ACTIONS_TOUCHES = [
  { id: "avant",    nom: "Avancer" },
  { id: "arriere",  nom: "Reculer" },
  { id: "gauche",   nom: "Tourner à gauche" },
  { id: "droite",   nom: "Tourner à droite" },
  { id: "saut",     nom: "Sauter" },
  { id: "sprint",   nom: "Sprinter" },
  { id: "tir",      nom: "Tirer" },
  { id: "recharge", nom: "Recharger" },
  { id: "grenade",  nom: "Lancer une grenade" }
];

// Entrées par défaut (clavier AZERTY) : Z, S, Q, D, Espace, Maj gauche, clic gauche et R
export const TOUCHES_PAR_DEFAUT = {
  avant:    { type: "key",   code: "KeyW",  label: "Z" },
  arriere:  { type: "key",   code: "KeyS",  label: "S" },
  gauche:   { type: "key",   code: "KeyA",  label: "Q" },
  droite:   { type: "key",   code: "KeyD",  label: "D" },
  saut:     { type: "key",   code: "Space", label: "Espace" },
  sprint:   { type: "key",   code: "ShiftLeft", label: "Maj gauche" },
  tir:      { type: "mouse", code: 0,       label: "Clic gauche" },
  recharge: { type: "key",   code: "KeyR",  label: "R" },
  grenade:  { type: "key",   code: "KeyQ",  label: "A" }     // touche A du clavier AZERTY (position du Q en QWERTY)
};

// Touches déjà utilisées par les outils de réglage du jeu (elles ne peuvent pas être assignées)
export const TOUCHES_RESERVEES = ["m", "g", "t", "b", "h", "x"];

// =====================================================
// MULTIJOUEUR (pair-à-pair : un joueur héberge, les autres rejoignent avec un code)
// Échap > Multijoueur
// =====================================================
export const CONFIG_MULTI = {
  prefixeSalon: "monjeu3d-simpika-", // identifiant du salon sur le serveur PeerJS = préfixe + code (évite les autres jeux)
  longueurCode: 4,               // lettres du code de salon
  joueursMax: 8,                 // hôte compris
  envoisParSeconde: 20,          // fréquence d'envoi de la position et du regard
  retardAffichage: 0.1,          // les autres joueurs sont affichés avec ce retard (s) pour être lissés entre deux envois
  delaiDeconnexion: 6,           // secondes sans nouvelles avant de considérer un joueur (ou l'hôte) comme parti
  serveursIce: null,             // null = serveurs par défaut de PeerJS (STUN Google + relais PeerJS) ;
                                 // sinon une liste, ex. [{ urls: "turn:...", username: "...", credential: "..." }]
  // Combat (dégâts des balles : CONFIG_CIBLE.zones et chuteDegats ; grenades : CONFIG_GRENADE.paliersDegats)
  vie: 150,                      // points de vie d'un joueur
  delaiReapparition: 3,          // secondes entre la mort et la réapparition
  protectionReapparition: 1.5,   // secondes d'invulnérabilité après la réapparition

  // Deux équipes : spawn sud et spawn nord. Couleurs vues par chaque joueur : alliés en bleu, ennemis en rouge
  couleursAllie: [0x1f4e8c, 0x2f6fbf, 0x5b93d6],   // tête, torse, reste du corps
  couleursEnnemi: [0x8c1f1f, 0xbf2f2f, 0xd65b5b],
  couleurArmeAvatar: 0x1e2226,
  couleurTexteAllie: "#7fbfff",  // pseudos, fil des éliminations, mini-carte
  couleurTexteEnnemi: "#ff6b6b",
  dureeRepereEnnemi: 2           // un ennemi qui tire apparaît sur la mini-carte pendant ce temps (secondes)
};

// =====================================================
// PERSONNAGES (multijoueur) : modèle 3D vu par les autres joueurs (Paramètres > Jeu > Personnage)
// Le modèle est mis automatiquement à la taille d'un joueur et coloré selon l'équipe.
// Les zones de dégâts restent celles de la silhouette (tête, torse, reste du corps), invisibles.
// =====================================================
export const CONFIG_PERSONNAGES = {
  hauteur: 1.8,                  // taille du modèle (mètres)
  // rotationY : demi-tour (Math.PI) car les modèles regardent à l'opposé de l'avatar dans les fichiers
  homme: { nom: "Homme", fichier: "assets/players/BASE MASH - LOW POLY Male .fbx", rotationY: Math.PI },
  femme: { nom: "Femme", fichier: "assets/players/BASE MASH - LOW POLY FE.fbx", rotationY: Math.PI }
};

// =====================================================
// MODE DOMINATION (multijoueur, sur une carte avec des objectifs A, B, C)
// L'équipe qui tient un drapeau marque des points chaque seconde
// =====================================================
export const CONFIG_DOMINATION = {
  rayonCapture: 2.8,             // rayon de la zone de capture autour de chaque lettre (mètres, sur le plateau)
  dureeCapture: 5,               // secondes pour prendre un drapeau neutre, seul
  bonusParJoueur: 0.5,           // chaque coéquipier de plus dans la zone accélère la capture de 50 %...
  bonusMax: 2,                   // ...jusqu'à 2 fois plus vite
  // Un drapeau ennemi doit d'abord être neutralisé (2 fois plus vite qu'une capture), puis capturé
  pointsParDrapeau: 1,           // points par seconde et par drapeau tenu
  scoreVictoire: 200,            // première équipe à ce score : victoire
  dureePartie: 600,              // secondes (10 min) ; à la fin, la meilleure équipe gagne
  delaiNouvellePartie: 15,       // secondes d'écran de fin avant la partie suivante
  joueursMinParEquipe: 1         // la partie démarre quand chaque équipe a au moins ce nombre de joueurs
};