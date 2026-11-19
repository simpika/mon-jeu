// =====================================================
// FIL DES ÉLIMINATIONS (en haut à gauche) ET TABLEAU DES SCORES (Tab maintenu)
// Pseudos colorés vus par le joueur local : alliés en bleu, ennemis en rouge, moi en jaune
// =====================================================
import { CONFIG_MULTI } from "./config.js";
import { etat } from "./etat.js";
import { reseau, surEvenement } from "./reseau.js";
import { partie, surPartie, estAllie, pseudoDe, monEquipe, NOMS_EQUIPES } from "./partie.js";

const style = document.createElement("style");
style.textContent = `
  #fil-eliminations {
    position: fixed; top: 52px; left: 16px; z-index: 15; pointer-events: none;
    display: flex; flex-direction: column; gap: 4px; font: 14px sans-serif;
  }
  #fil-eliminations .ligne {
    display: flex; align-items: center; gap: 8px; padding: 4px 10px;
    background: rgba(0, 0, 0, 0.55); border-radius: 3px; color: #fff; transition: opacity 0.5s;
  }
  #fil-eliminations .ligne.moi { background: rgba(60, 50, 0, 0.6); }
  #fil-eliminations svg { height: 14px; fill: #fff; flex-shrink: 0; }
  #fil-eliminations .nom { font-weight: 700; }

  #tableau-scores {
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 25; display: none;
    min-width: 520px; padding: 18px 22px; background: rgba(15, 15, 15, 0.9); border: 1px solid #444;
    border-radius: 8px; color: #fff; font: 14px sans-serif; pointer-events: none;
  }
  #tableau-scores h3 { margin: 14px 0 6px; font-size: 14px; letter-spacing: 2px; }
  #tableau-scores h3:first-child { margin-top: 0; }
  #tableau-scores table { width: 100%; border-collapse: collapse; }
  #tableau-scores th { text-align: right; font-weight: 400; color: #999; font-size: 12px; padding: 2px 8px; }
  #tableau-scores th:first-child, #tableau-scores td:first-child { text-align: left; }
  #tableau-scores td { text-align: right; padding: 5px 8px; background: rgba(255,255,255,0.04); font-variant-numeric: tabular-nums; }
  #tableau-scores tr.moi td { background: rgba(255, 210, 63, 0.15); }
  #tableau-scores tr.mort td:first-child { opacity: 0.5; }
`;
document.head.appendChild(style);

// Icônes : M4, grenade, tête (élimination à la tête)
const ICONES = {
  m4: `<svg viewBox="0 0 64 24"><path d="M0 6h10l4 2v6h-4L0 17z M14 6h22v8H14z M16 3.5h18V6H16z M36 7h14v6H36z M50 9h13v2H50z M46 3.5h2.5V7H46z M19 14h5.5l-2 8H17z M28 14h6l1 8.5-5 1z"/></svg>`,
  grenade: `<svg viewBox="0 0 20 28"><ellipse cx="10" cy="18" rx="7.5" ry="9"/><path d="M7 5h6v4H7z"/><path d="M12 4.5l5 2.5 1 12.5h-2L15 8.5l-3-1.5z"/></svg>`,
  tete: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#ff5050" stroke-width="2.5"/><circle cx="12" cy="12" r="3.5" fill="#ff5050"/></svg>`
};

const fil = document.createElement("div");
fil.id = "fil-eliminations";
document.body.appendChild(fil);

function couleurJoueur(id) {
  if (id === reseau.monId) return "#ffd23f";
  return estAllie(id) ? CONFIG_MULTI.couleurTexteAllie : CONFIG_MULTI.couleurTexteEnnemi;
}

function nomColore(id) {
  const nom = document.createElement("span");
  nom.className = "nom";
  nom.textContent = pseudoDe(id);
  nom.style.color = couleurJoueur(id);
  return nom;
}

function ajouterElimination(m) {
  const ligne = document.createElement("div");
  ligne.className = "ligne";
  if (m.id === reseau.monId || m.tueur === reseau.monId) ligne.classList.add("moi");

  if (m.tueur && m.tueur !== m.id) ligne.append(nomColore(m.tueur));
  const icone = document.createElement("span");
  icone.innerHTML = ICONES[m.arme === "grenade" ? "grenade" : "m4"] + (m.tete ? ICONES.tete : "");
  icone.style.display = "flex";
  icone.style.gap = "4px";
  ligne.append(icone, nomColore(m.id));

  fil.appendChild(ligne);
  while (fil.children.length > 5) fil.firstChild.remove();
  setTimeout(() => { ligne.style.opacity = "0"; }, 5500);
  setTimeout(() => ligne.remove(), 6000);
}

surPartie("mort", ajouterElimination);
surEvenement("fin", () => { fil.innerHTML = ""; });

// --- Tableau des scores ---
const tableau = document.createElement("div");
tableau.id = "tableau-scores";
document.body.appendChild(tableau);

function remplirTableau() {
  tableau.innerHTML = "";
  const mienne = monEquipe() || "sud";
  const autre = mienne === "sud" ? "nord" : "sud";
  [[mienne, "VOTRE ÉQUIPE", CONFIG_MULTI.couleurTexteAllie], [autre, "ÉQUIPE ADVERSE", CONFIG_MULTI.couleurTexteEnnemi]]
    .forEach(([equipe, titre, couleur]) => {
      const membres = [...partie.equipes].filter(([, e]) => e === equipe).map(([id]) => id);
      membres.sort((a, b) => (partie.scores.get(b)?.e || 0) - (partie.scores.get(a)?.e || 0));

      const h3 = document.createElement("h3");
      h3.textContent = titre + " · " + NOMS_EQUIPES[equipe].toUpperCase();
      h3.style.color = couleur;
      const table = document.createElement("table");
      table.innerHTML = "<tr><th>Joueur</th><th>Éliminations</th><th>Morts</th></tr>";
      membres.forEach(id => {
        const s = partie.scores.get(id) || { e: 0, m: 0 };
        const tr = document.createElement("tr");
        if (id === reseau.monId) tr.className = "moi";
        if ((partie.vies.get(id) ?? 1) <= 0) tr.classList.add("mort");
        [pseudoDe(id) + (id === reseau.monId ? " (vous)" : ""), s.e, s.m].forEach(valeur => {
          const td = document.createElement("td");
          td.textContent = valeur;
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      tableau.append(h3, table);
    });
}

let tableauVisible = false;
function afficherTableau(visible) {
  tableauVisible = visible && reseau.role !== null && !etat.menuOuvert;
  tableau.style.display = tableauVisible ? "block" : "none";
  if (tableauVisible) remplirTableau();
}

window.addEventListener("keydown", e => {
  if (e.code !== "Tab" || reseau.role === null || etat.menuOuvert) return;
  e.preventDefault();   // pas de changement de focus du navigateur
  if (!e.repeat) afficherTableau(true);
});
window.addEventListener("keyup", e => { if (e.code === "Tab") afficherTableau(false); });
window.addEventListener("blur", () => afficherTableau(false));
surPartie("etat", () => { if (tableauVisible) remplirTableau(); });
surPartie("mort", () => { if (tableauVisible) remplirTableau(); });
