// =====================================================
// MINI-CARTE CIRCULAIRE (en haut à droite)
// - tourne avec le joueur : le haut de la carte = la direction regardée
// - le Nord (axe -Z du monde) est indiqué par un « N » sur le bord
// - flèche bleue fixe au centre = le joueur
// =====================================================
import { camera } from "./moteur.js";
import { CONFIG_CARTE } from "./config.js";
import { etat } from "./etat.js";
import { elementsCarte, objectifs } from "./monde.js";
import { positionsJoueursDistants, tirsEnnemisRecents } from "./joueursDistants.js";
import { CONFIG_MULTI } from "./config.js";

const C = CONFIG_CARTE;
const toile = document.createElement("canvas");
toile.style.cssText =
  "position:fixed;top:" + C.marge + "px;right:" + C.marge + "px;width:" + C.taille + "px;height:" + C.taille + "px;" +
  "z-index:15;pointer-events:none;";
if (C.actif) document.body.appendChild(toile);
const ctx = toile.getContext("2d");

let elementsTries = null;   // éléments du décor, du plus bas au plus haut (le plus haut est dessiné par-dessus)

function ajusterResolution() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  toile.width = Math.round(C.taille * ratio);
  toile.height = Math.round(C.taille * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
ajusterResolution();
window.addEventListener("resize", ajusterResolution);

export function mettreAJourCarte() {
  if (!C.actif) return;
  if (!elementsTries) elementsTries = [...elementsCarte].sort((a, b) => a.haut - b.haut);

  const rayon = C.taille / 2;
  const rayonInterieur = rayon - 3;
  const echelle = (rayonInterieur - 4) / C.portee;   // pixels par mètre
  const yaw = etat.yaw;
  const px = camera.position.x;
  const pz = camera.position.z;

  ctx.clearRect(0, 0, C.taille, C.taille);

  // --- Fond et décor, découpés dans le disque ---
  ctx.save();
  ctx.beginPath();
  ctx.arc(rayon, rayon, rayonInterieur, 0, Math.PI * 2);
  ctx.fillStyle = C.couleurFond;
  ctx.fill();
  ctx.clip();

  // Repère : centre = joueur, rotation de yaw pour que la direction regardée soit en haut
  // (en yaw = 0 le joueur regarde vers -Z, le Nord, qui est alors en haut)
  ctx.translate(rayon, rayon);
  ctx.rotate(yaw);
  ctx.scale(echelle, echelle);
  ctx.translate(-px, -pz);

  // Quadrillage tous les 10 m
  const pas = 10;
  const etendue = C.portee * 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1 / echelle;
  ctx.beginPath();
  for (let x = Math.floor((px - etendue) / pas) * pas; x <= px + etendue; x += pas) {
    ctx.moveTo(x, pz - etendue); ctx.lineTo(x, pz + etendue);
  }
  for (let z = Math.floor((pz - etendue) / pas) * pas; z <= pz + etendue; z += pas) {
    ctx.moveTo(px - etendue, z); ctx.lineTo(px + etendue, z);
  }
  ctx.stroke();

  // Éléments du décor
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  for (const e of elementsTries) {
    if (e.maxX < px - etendue || e.minX > px + etendue || e.maxZ < pz - etendue || e.minZ > pz + etendue) continue;
    ctx.fillStyle = e.couleur;
    ctx.fillRect(e.minX, e.minZ, e.maxX - e.minX, e.maxZ - e.minZ);
    ctx.strokeRect(e.minX, e.minZ, e.maxX - e.minX, e.maxZ - e.minZ);
  }

  // Alliés (multijoueur) : points bleus
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineWidth = 1.5 / echelle;
  ctx.fillStyle = CONFIG_MULTI.couleurTexteAllie;
  for (const j of positionsJoueursDistants()) {
    ctx.beginPath();
    ctx.arc(j.x, j.z, 4 / echelle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Position d'un point du monde sur la carte (pixels) ; hors de portée, il reste collé au bord
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const distanceMax = rayonInterieur - 12;
  function versCarte(x, z) {
    const dx = (x - px) * echelle;
    const dz = (z - pz) * echelle;
    let sx = dx * cos - dz * sin;   // même rotation que le décor
    let sy = dx * sin + dz * cos;
    const d = Math.hypot(sx, sy);
    if (d > distanceMax) { sx *= distanceMax / d; sy *= distanceMax / d; }
    return { x: rayon + sx, y: rayon + sy };
  }

  // --- Tirs ennemis : point rouge à l'endroit du tir, qui s'efface en quelques secondes ---
  for (const tir of tirsEnnemisRecents()) {
    const p = versCarte(tir.x, tir.z);
    const opacite = 1 - tir.age;
    ctx.globalAlpha = opacite * 0.45;                 // halo
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6 + 6 * tir.age, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2020";
    ctx.fill();
    ctx.globalAlpha = opacite;                        // point
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- Objectifs (A, B, C...) : pastille de la couleur de l'équipe qui contrôle le point ---
  // (orange hors Domination, sombre si neutre, bleu si à nous, rouge si ennemi)
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const o of objectifs) {
    const p = versCarte(o.x, o.z);
    const neutre = o.couleur === "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = neutre ? "rgba(0, 0, 0, 0.75)" : o.couleur;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = neutre ? "#ffffff" : "rgba(0, 0, 0, 0.85)";
    ctx.stroke();
    ctx.fillStyle = neutre ? "#ffffff" : "#111111";
    ctx.fillText(o.lettre, p.x, p.y + 0.5);
  }

  // --- Bord du cercle ---
  ctx.beginPath();
  ctx.arc(rayon, rayon, rayonInterieur, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.couleurBord;
  ctx.stroke();

  // --- Nord sur le bord : direction (0, -1) du monde, tournée comme la carte ---
  const nx = Math.sin(yaw);
  const ny = -Math.cos(yaw);
  const rN = rayonInterieur - 11;
  const xN = rayon + nx * rN;
  const yN = rayon + ny * rN;
  ctx.beginPath();
  ctx.arc(xN, yN, 10, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.couleurNord;
  ctx.stroke();
  ctx.fillStyle = C.couleurNord;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", xN, yN + 0.5);

  // --- Flèche bleue du joueur (fixe, pointe vers le haut = direction regardée) ---
  ctx.save();
  ctx.translate(rayon, rayon);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fillStyle = C.couleurJoueur;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}
