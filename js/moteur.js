// =====================================================
// MOTEUR : scène, caméra, rendu et lumières
// =====================================================
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 160); // 160 m : toute la carte industrielle reste visible
camera.rotation.order = "YXZ"; // rotation FPS : gauche/droite puis haut/bas
scene.add(camera);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const soleil = new THREE.DirectionalLight(0xffffff, 2.5);
soleil.position.set(2, 3, 2);
scene.add(soleil);

// Environnement lumineux : indispensable pour que les surfaces métalliques
// aient quelque chose à refléter (sans lui, un métal à 100 % paraît noir)
const generateurPMREM = new THREE.PMREMGenerator(renderer);
scene.environment = generateurPMREM.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8; // réduisez si l'arme est trop brillante

export function sourisCapturee() {
  return document.pointerLockElement === renderer.domElement;
}

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});