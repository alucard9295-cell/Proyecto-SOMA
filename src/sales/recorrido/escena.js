// Escena 3D del recorrido: una casa de un piso que se lee desde el aire, se
// recorre por dentro y termina en el patio. Todo sale de public/recorrido/
// (Poly Haven, CC0), así que la CSP `script-src 'self'` no cambia.
//
// Tres capas de realismo, de la más barata a la más cara:
//   1. Luz y cielo de una foto HDR real, texturas PBR escaneadas y muebles glTF.
//   2. Rasterizado con sombras suaves, oclusión ambiental (GTAO) y tono AgX.
//      La gradación de color va en CSS, así cubre también la imagen trazada.
//   3. Cuando la cámara se detiene, un path tracer acumula muestras encima:
//      rebotes de luz, sombras de contacto y reflejos verdaderos.
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { WebGLPathTracer } from "three-gpu-pathtracer";

const BASE = "/recorrido/";

// Posición y punto de mira de cada parada. Dentro de la casa van a la misma
// altura: verticales rectas, como en fotografía de arquitectura. `s` es el
// índice de la escena de texto; null es un punto de paso.
export const KEYS = [
  { p: [11, 17, 21], l: [-0.8, 0.4, -1.8], s: 0 },
  { p: [-2.6, 6.2, 5.0], l: [-3.4, 0.3, -1.8], s: 1 },
  { p: [-3.4, 1.4, 4.2], l: [-3.6, 1.2, -5], s: 2 },
  { p: [0.1, 1.5, 1.5], l: [2.4, 1.05, -2.4], s: 3 },
  { p: [2.6, 1.45, 1.15], l: [7, 1.45, 1.1], s: 4 },
  { p: [4.9, 1.45, 1.6], l: [5.5, 0.9, -3.2], s: 5 },
  { p: [2.8, 1.5, 0.9], l: [-2, 1.45, -6], s: null },
  { p: [-2.0, 1.5, -3.8], l: [-2.4, 1.5, -9], s: null },
  { p: [-8.2, 1.6, -15], l: [-2.8, 1.7, -5], s: 6 },
];
const N = KEYS.length;
export const keyDeEscena = (s) => KEYS.findIndex((k) => k.s === s);
export const paradas = KEYS.length;

const H = 3.2, T = 0.2;

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// UV en metros según la cara: la textura conserva su escala real en cualquier
// caja o plano, sin estirarse.
function uvMundo(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = [];
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.push(p.getX(i), p.getZ(i));
    else if (ax >= az) uv.push(p.getZ(i), p.getY(i));
    else uv.push(p.getX(i), p.getY(i));
  }
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

// Cubierta a cuatro aguas, con UV en metros sobre cada faldón.
function hipRoof(w, d, h) {
  const x = w / 2, z = d / 2, r = Math.max(0, x - z);
  const A = [-x, 0, z], B = [x, 0, z], C = [x, 0, -z], D = [-x, 0, -z], E = [-r, h, 0], F = [r, h, 0];
  const slope = Math.hypot(z, h), slopeX = Math.hypot(x - r, h);
  const tris = [[A, B, F, 0, 1], [A, F, E, 0, 1], [C, D, E, 0, -1], [C, E, F, 0, -1], [B, C, F, 1, 1], [D, A, E, 1, -1]];
  const pos = [], uv = [];
  for (const [p, q, s, lado, sg] of tris) for (const v of [p, q, s]) {
    pos.push(...v);
    // la coordenada que baja por el faldón se mide sobre la pendiente, no en planta
    if (lado) uv.push(v[2], (1 - v[1] / h) * slopeX * sg);
    else uv.push(v[0], (1 - v[1] / h) * slope * sg);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Busca el píxel más brillante del HDR (el sol) y devuelve su dirección.
function direccionDelSol(tex) {
  const { data, width: w, height: h } = tex.image;
  const c = data.length / (w * h);
  let best = 0, bi = 0;
  for (let i = 0; i < w * h; i++) {
    const l = data[i * c] + data[i * c + 1] + data[i * c + 2];
    if (l > best) { best = l; bi = i; }
  }
  const col = bi % w, row = Math.floor(bi / w);
  const u = (col + 0.5) / w, v = tex.flipY ? 1 - (row + 0.5) / h : (row + 0.5) / h;
  const phi = (u - 0.5) * Math.PI * 2, el = (v - 0.5) * Math.PI;
  return new THREE.Vector3(Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi));
}

/**
 * Monta la escena en `canvas`. `alProgreso(pct, msg)` informa la carga y
 * `alEscena(s)` avisa cuando cambia la escena de texto.
 */
export async function crearRecorrido(canvas, { alProgreso = () => {}, alEscena = () => {}, alEstado = () => {}, reducido = false, movil = false } = {}) {
  const R = rng(20260930);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  let PR = Math.min(window.devicePixelRatio || 1, movil ? 1.25 : 1.5);
  const ancho = () => canvas.clientWidth || window.innerWidth, alto = () => canvas.clientHeight || window.innerHeight;
  renderer.setPixelRatio(PR);
  renderer.setSize(ancho(), alto(), false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fovFor = () => (alto() > ancho() ? 62 : 40);
  const camera = new THREE.PerspectiveCamera(fovFor(), ancho() / alto(), 0.1, 900);
  const root = new THREE.Group(); scene.add(root);

  /* ---------- carga ---------- */
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, hechos, total) => alProgreso(5 + (hechos / total) * 75, "Trayendo materiales reales");
  const texLoader = new THREE.TextureLoader(manager);
  const hdrLoader = new HDRLoader(manager).setDataType(THREE.FloatType);
  const gltfLoader = new GLTFLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const cache = {};
  function mapa(nombre, cual, srgb) {
    const k = `${nombre}/${cual}`;
    if (!cache[k]) {
      const t = texLoader.load(`${BASE}tex/${nombre}/${cual}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      cache[k] = t;
    }
    return cache[k];
  }
  // Material PBR a partir de una textura escaneada. `metros` es cuánto mide un
  // mosaico de la textura en la realidad.
  function pbr(nombre, { metros = 1, color, sinColor = false, normal = 1, fisico, ...extra } = {}) {
    const rep = 1 / metros;
    const clon = (t) => { const c = t.clone(); c.repeat.set(rep, rep); c.needsUpdate = true; return c; };
    const o = {
      normalMap: clon(mapa(nombre, "nor_gl")),
      normalScale: new THREE.Vector2(normal, normal),
      roughnessMap: clon(mapa(nombre, "rough")),
      ...extra,
    };
    if (!sinColor) o.map = clon(mapa(nombre, "diff", true));
    if (color) o.color = new THREE.Color(color);
    return fisico ? new THREE.MeshPhysicalMaterial({ ...o, ...fisico }) : new THREE.MeshStandardMaterial(o);
  }

  const cieloP = hdrLoader.loadAsync(`${BASE}cielo/tarde.hdr`);
  const MODELOS = ["mid_century_lounge_chair", "modern_arm_chair_01", "modern_ceiling_lamp_01", "ceramic_vase_01", "ceramic_vase_03",
    "potted_plant_02", "potted_plant_04", "modern_wooden_cabinet", "outdoor_table_chair_set_01", "grass_medium_01", "pachira_aquatica_01"];
  const modelosP = Promise.all(MODELOS.map((id) => gltfLoader.loadAsync(`${BASE}modelos/${id}/${id}.gltf`).then((g) => [id, g.scene])));

  const M = {
    piso: pbr("piso", { metros: 2.2, roughness: 1 }),
    estuco: pbr("estuco", { metros: 2.5, color: "#F1ECE3", normal: 0.5 }),
    fachada: pbr("fachada", { metros: 3, color: "#EDE5D8", normal: 0.7 }),
    teja: pbr("teja", { metros: 2, side: THREE.DoubleSide }),
    cesped: pbr("cesped", { metros: 2.5, color: "#C9D0B0" }),
    marmol: pbr("marmol", { metros: 1.6, fisico: { clearcoat: 0.35, clearcoatRoughness: 0.25 } }),
    nogal: pbr("nogal", { metros: 1.2 }),
    deck: pbr("deck", { metros: 2 }),
    adoquin: pbr("adoquin", { metros: 2 }),
    asfalto: pbr("asfalto", { metros: 4 }),
    corteza: pbr("corteza", { metros: 1 }),
    cuero: pbr("cuero", { metros: 0.8, color: "#8A6A52" }),
    lino: pbr("lino", { sinColor: true, metros: 0.35, color: "#E4DDD1", fisico: { sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.8 } }),
    boucle: pbr("boucle", { sinColor: true, metros: 0.3, color: "#CFC3B1", fisico: { sheen: 0.8, sheenColor: new THREE.Color("#efe6d8"), sheenRoughness: 0.7 } }),
    manta: pbr("lino", { sinColor: true, metros: 0.3, color: "#A99479", fisico: { sheen: 0.7, sheenColor: new THREE.Color("#e8dcc8"), sheenRoughness: 0.75 } }),
    cielorraso: new THREE.MeshStandardMaterial({ color: "#F2EEE7", roughness: 1 }),
    laca: new THREE.MeshStandardMaterial({ color: "#E5DED2", roughness: 0.42 }),
    metal: new THREE.MeshStandardMaterial({ color: "#2A2824", metalness: 0.7, roughness: 0.4 }),
    laton: new THREE.MeshStandardMaterial({ color: "#B39365", metalness: 1, roughness: 0.32 }),
    // vidrio físico: el path tracer lo atraviesa de verdad; en raster es casi invisible
    vidrio: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.02, transmission: 1, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.12, depthWrite: false }),
    cortina: new THREE.MeshPhysicalMaterial({ color: "#F4EFE7", roughness: 1, transmission: 0.35, thickness: 0.02, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    vidrioOscuro: new THREE.MeshStandardMaterial({ color: "#1d2022", roughness: 0.08, metalness: 0.2 }),
    tierra: new THREE.MeshStandardMaterial({ color: "#4A3B2E", roughness: 1 }),
    luz: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: new THREE.Color("#FFD9A8"), emissiveIntensity: 2.2, roughness: 0.5 }),
  };
  M.cuadro1 = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  M.cuadro2 = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  {
    const cuadro = (dibujar) => {
      const c = document.createElement("canvas"); c.width = 400; c.height = 500;
      dibujar(c.getContext("2d"), 400, 500);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    M.cuadro1.map = cuadro((g, w, h) => {
      g.fillStyle = "#E4DCCD"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#B07A58"; g.beginPath(); g.arc(w * 0.42, h * 0.62, w * 0.3, Math.PI, 0); g.fill();
      g.fillStyle = "#3A423D"; g.fillRect(w * 0.12, h * 0.62, w * 0.76, h * 0.04);
    });
    M.cuadro2.map = cuadro((g, w, h) => {
      g.fillStyle = "#2F2B27"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(226,217,200,.7)"; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(w * 0.5, h * 1.05, 40 + i * 18, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    });
  }

  /* ---------- utilidades de geometría ---------- */
  function mesh(geo, mat, x = 0, y = 0, z = 0, { cast = true, receive = true, ry = 0, rx = 0, rz = 0, parent = root } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = cast; m.receiveShadow = receive; parent.add(m);
    return m;
  }
  const box = (w, h, d, mat, x, y, z, o) => mesh(uvMundo(new THREE.BoxGeometry(w, h, d)), mat, x, y, z, o);
  const rbox = (w, h, d, r, mat, x, y, z, o) => mesh(uvMundo(new RoundedBoxGeometry(w, h, d, 4, r)), mat, x, y, z, o);
  const plano = (w, d, mat, x, y, z, o) => mesh(uvMundo(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), mat, x, y, z, { cast: false, ...o });
  // Copias fusionadas en una sola malla: el path tracer no entiende
  // InstancedMesh en WebGL, y una malla fusionada cuesta una sola llamada.
  function fusion(geo, mat, matrices, o = {}) {
    const g = mergeGeometries(matrices.map((m) => geo.clone().applyMatrix4(m)));
    return mesh(g, mat, 0, 0, 0, o);
  }
  const mtx = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), new THREE.Vector3(s, s, s));

  /* ---------- casa ---------- */
  function casco() {
    // zócalo: su cara superior queda 1,5 cm bajo el piso para que no peleen por el mismo plano
    box(14.8, 0.6, 10.8, M.fachada, 0, -0.315, 0, { cast: false });
    box(7.6, 0.6, 3.8, M.fachada, -3.2, -0.315, -6.9, { cast: false });
    plano(14.2, 10.2, M.piso, 0, 0, 0);
    plano(7.4, 3.6, M.deck, -3.2, 0, -6.9);
    mesh(new THREE.PlaneGeometry(14.4, 10.4), M.cielorraso, 0, H, 0, { rx: Math.PI / 2, receive: false });
    // muros: por dentro estuco, por fuera la cara de fachada es otra caja delgada
    const muro = (w, h, d, x, y, z) => {
      box(w, h, d, M.estuco, x, y, z);
    };
    muro(T, H, 10.4, -7.1, H / 2, 0);
    muro(14.4, H, T, 0, H / 2, 5.1);
    muro(0.7, H, T, -6.85, H / 2, -5.1);
    muro(7.7, H, T, 3.35, H / 2, -5.1);
    muro(6, 0.3, T, -3.5, 3.05, -5.1);
    muro(T, H, 4.2, 7.1, H / 2, -3.1);
    muro(T, H, 4.2, 7.1, H / 2, 3.1);
    muro(T, 0.6, 2, 7.1, 0.3, 0);
    muro(T, 0.6, 2, 7.1, 2.9, 0);
    // fachada exterior: piel de 2 cm sobre los muros perimetrales
    const piel = [[0.02, H + 0.3, 10.45, -7.21, 0], [14.45, H + 0.3, 0.02, 0, 5.21], [0.02, H + 0.3, 10.45, 7.21, 0]];
    for (const [w, h, d, x, z] of piel) box(w, h, d, M.fachada, x, (H + 0.3) / 2 - 0.3, z, { cast: false });
    // ventana de la fachada sur y del muro este
    box(0.05, 2, 0.05, M.metal, 7.05, 1.6, 0);
    mesh(new THREE.PlaneGeometry(2, 2), M.vidrio, 7.12, 1.6, 0, { ry: -Math.PI / 2, cast: false, receive: false });
    // tabique de la alcoba con vano de puerta
    muro(T, H, 5.5, 4, H / 2, -2.25);
    muro(T, H, 3.3, 4, H / 2, 3.35);
    muro(T, 0.8, 1.2, 4, 2.8, 1.1);
    box(0.06, 2.4, 0.24, M.nogal, 4, 1.2, 0.47); box(0.06, 2.4, 0.24, M.nogal, 4, 1.2, 1.73);
    // guardaescobas
    for (const [w, x, z, ry] of [[14, 0, 4.99, 0], [9.9, -6.99, 0, Math.PI / 2], [6.7, 3.35, -4.99, 0]]) box(w, 0.08, 0.015, M.laca, x, 0.04, z, { ry, cast: false });
    // carpintería del ventanal
    for (const x of [-6.5, -5.0, -3.3]) box(0.05, 2.9, 0.08, M.metal, x, 1.45, -5.02);
    box(6.1, 0.05, 0.08, M.metal, -3.5, 2.9, -5.02);
    mesh(new THREE.PlaneGeometry(3.2, 2.9), M.vidrio, -4.9, 1.45, -5.0, { cast: false, receive: false });
    // listones de nogal en el muro sur de la sala
    fusion(new THREE.BoxGeometry(0.045, 3.0, 0.06), M.nogal, Array.from({ length: 60 }, (_, i) => mtx(-6.85 + i * 0.108, 1.5, 4.95)));
    // cortinas de lino con pliegues
    const cg = new THREE.PlaneGeometry(0.7, 2.95, 48, 1);
    const pos = cg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 26) * 0.045);
    cg.computeVertexNormals();
    mesh(cg, M.cortina, -6.45, 1.5, -4.82, { receive: false });
    mesh(cg, M.cortina, -0.62, 1.5, -4.82, { receive: false });
    box(6.4, 0.03, 0.03, M.metal, -3.5, 3.0, -4.82);
    // cuadros
    box(0.04, 1.1, 0.88, M.nogal, -6.97, 1.65, -0.2);
    mesh(new THREE.PlaneGeometry(0.8, 1.02), M.cuadro1, -6.945, 1.65, -0.2, { ry: Math.PI / 2, cast: false });
    box(0.04, 1.1, 0.88, M.nogal, -6.97, 1.65, 1.05);
    mesh(new THREE.PlaneGeometry(0.8, 1.02), M.cuadro2, -6.945, 1.65, 1.05, { ry: Math.PI / 2, cast: false });
    // ventanas de la fachada sur (vistas desde la calle)
    for (const x of [-4.2, 1.2, 5.6]) {
      box(1.5, 1.6, 0.03, M.metal, x, 1.5, 5.225, { cast: false });
      box(1.36, 1.46, 0.02, M.vidrioOscuro, x, 1.5, 5.235, { cast: false });
      box(1.7, 0.06, 0.18, M.fachada, x, 0.68, 5.3);
    }
    // puerta de entrada
    box(1.1, 2.3, 0.04, M.nogal, 3.2, 1.15, 5.235, { cast: false });
  }

  let techo;
  function cubierta() {
    techo = new THREE.Group(); root.add(techo);
    mesh(hipRoof(16.2, 12.2, 2.3), M.teja, 0, H + 0.2, 0, { parent: techo });
    // alero con su canal: el borde grueso que hace que el techo no parezca de papel
    box(16.2, 0.2, 12.2, M.fachada, 0, H + 0.1, 0, { parent: techo, receive: false });
    box(16.3, 0.12, 0.08, M.metal, 0, H + 0.14, 6.14, { parent: techo, cast: false });
    box(16.3, 0.12, 0.08, M.metal, 0, H + 0.14, -6.14, { parent: techo, cast: false });
  }

  function sala() {
    const cx = -3.5, cz = -0.55, Rr = 2.25;
    mesh(uvMundo(new THREE.ShapeGeometry(roundedRect(5.4, 3.9, 0.5)).rotateX(-Math.PI / 2)), M.boucle, cx, 0.006, -1.2, { cast: false });
    // sofá curvo por segmentos
    const segs = 9, a0 = -0.9, a1 = 0.9, da = (a1 - a0) / segs;
    for (let i = 0; i < segs; i++) {
      const a = a0 + da * (i + 0.5), wSeg = Rr * da * 1.04;
      const px = cx + Math.sin(a) * Rr, pz = cz - Math.cos(a) * Rr;
      rbox(wSeg, 0.4, 0.98, 0.09, M.lino, px, 0.26, pz, { ry: -a });
      const bx = cx + Math.sin(a) * (Rr + 0.42), bz = cz - Math.cos(a) * (Rr + 0.42);
      rbox(wSeg * 1.18, 0.5, 0.3, 0.12, M.lino, bx, 0.68, bz, { ry: -a });
      rbox(wSeg * 0.9, 0.06, 0.9, 0.02, M.nogal, px, 0.03, pz, { ry: -a });
    }
    for (const [a, tilt] of [[-0.55, 0.25], [-0.18, 0.3], [0.3, 0.22], [0.62, 0.28]]) {
      const px = cx + Math.sin(a) * (Rr + 0.22), pz = cz - Math.cos(a) * (Rr + 0.22);
      rbox(0.5, 0.42, 0.15, 0.07, a > 0 ? M.manta : M.boucle, px, 0.64, pz, { ry: -a, rx: tilt });
    }
    // mesa de centro de mármol
    const top = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.06, 64), M.marmol, cx, 0.38, -1.25); top.scale.set(1.45, 1, 1);
    const base = mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.35, 48), M.marmol, cx - 0.35, 0.175, -1.25); base.scale.set(1.2, 1, 1);
    mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.35, 48), M.marmol, cx + 0.55, 0.175, -1.2);
    box(0.32, 0.05, 0.24, M.laca, cx + 0.45, 0.435, -1.4, { ry: 0.2 });
    box(0.28, 0.04, 0.21, M.cuero, cx + 0.45, 0.48, -1.4, { ry: 0.35 });
    // lámpara de pie
    mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 32), M.laton, -6.25, 0.015, -2.7);
    box(0.02, 1.55, 0.02, M.laton, -6.25, 0.8, -2.7);
    mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 40, 1, true), M.lino, -6.25, 1.62, -2.7, { cast: false });
    const l = new THREE.PointLight("#FFC98A", 1.6, 5, 2); l.position.set(-6.25, 1.5, -2.7); root.add(l);
  }

  function cocina() {
    box(3.6, 0.88, 0.62, M.nogal, 2.1, 0.44, -4.66);
    box(3.64, 0.04, 0.66, M.marmol, 2.1, 0.9, -4.66);
    box(3.6, 0.6, 0.02, M.marmol, 2.1, 1.22, -4.98, { cast: false });
    box(3.6, 0.05, 0.32, M.nogal, 2.1, 1.85, -4.84);
    box(1.0, 2.9, 0.64, M.laca, 0.7, 1.45, -4.66);
    // isla
    box(2.5, 0.86, 0.95, M.nogal, 2.1, 0.43, -2.2);
    box(2.7, 0.05, 1.08, M.marmol, 2.1, 0.905, -2.2);
    box(0.05, 0.93, 1.08, M.marmol, 0.775, 0.465, -2.2); box(0.05, 0.93, 1.08, M.marmol, 3.425, 0.465, -2.2);
    for (const x of [1.45, 2.1, 2.75]) {
      mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.06, 32), M.cuero, x, 0.66, -1.35);
      box(0.025, 0.64, 0.025, M.metal, x, 0.33, -1.35);
      mesh(new THREE.TorusGeometry(0.15, 0.01, 8, 32), M.metal, x, 0.24, -1.35, { rx: Math.PI / 2 });
      mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.01, 32), M.metal, x, 0.005, -1.35);
    }
    const l = new THREE.PointLight("#FFD3A0", 2.2, 5, 2); l.position.set(2.1, 1.9, -2.2); root.add(l);
  }

  function alcoba() {
    box(2.0, 0.3, 2.2, M.nogal, 5.5, 0.15, -3.75);
    rbox(1.92, 0.26, 2.08, 0.08, M.lino, 5.5, 0.43, -3.75);
    rbox(1.98, 0.1, 1.35, 0.05, M.manta, 5.5, 0.58, -3.2);
    rbox(0.62, 0.18, 0.4, 0.08, M.lino, 5.05, 0.64, -4.55, { rx: -0.35 });
    rbox(0.62, 0.18, 0.4, 0.08, M.lino, 5.95, 0.64, -4.55, { rx: -0.35 });
    rbox(2.5, 1.15, 0.12, 0.05, M.boucle, 5.5, 0.92, -4.92);
    for (const x of [4.3, 6.7]) {
      box(0.42, 0.45, 0.4, M.nogal, x, 0.225, -4.72);
      mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 24, 1, true), M.lino, x, 0.78, -4.72, { cast: false });
      box(0.012, 0.22, 0.012, M.laton, x, 0.56, -4.72);
    }
    const l = new THREE.PointLight("#FFC285", 0.9, 3, 2); l.position.set(5.5, 0.9, -4.5); root.add(l);
    box(1.3, 0.42, 0.38, M.cuero, 5.5, 0.21, -2.35);
    mesh(uvMundo(new THREE.ShapeGeometry(roundedRect(2.6, 2.8, 0.3)).rotateX(-Math.PI / 2)), M.boucle, 5.5, 0.006, -3.2, { cast: false });
    box(0.04, 0.8, 1.2, M.nogal, 4.13, 1.7, -3.3);
    mesh(new THREE.PlaneGeometry(1.1, 0.7), M.cuadro2, 4.155, 1.7, -3.3, { ry: Math.PI / 2, cast: false });
  }

  function patio() {
    // pérgola: los listones dibujan sombra rayada sobre el deck
    for (const x of [-6.8, -0.4]) box(0.14, 2.75, 0.14, M.nogal, x, 1.375, -8.6);
    box(6.7, 0.2, 0.12, M.nogal, -3.6, 2.8, -8.6);
    box(6.7, 0.2, 0.12, M.nogal, -3.6, 2.8, -5.3);
    fusion(uvMundo(new THREE.BoxGeometry(0.05, 0.14, 3.5)), M.nogal, Array.from({ length: 19 }, (_, i) => mtx(-6.7 + i * 0.34, 2.95, -6.95)));
    // jardineras de concreto
    for (const [x, z] of [[-6.6, -6.8], [-0.1, -6.4]]) {
      box(0.6, 0.5, 2.4, M.fachada, x, 0.25, z);
      plano(0.5, 2.3, M.tierra, x, 0.48, z);
    }
    // escalón y sendero de piedra hacia el jardín
    box(2.2, 0.22, 0.5, M.adoquin, -3.4, -0.34, -9.05);
    for (let i = 0; i < 6; i++) box(1.1, 0.06, 0.6, M.adoquin, -3.4 + (R() - 0.5) * 0.3, -0.44, -10 - i * 0.9, { ry: (R() - 0.5) * 0.2 });
  }

  function vecina(x, z, w, d, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    box(w, H + 0.5, d, M.fachada, 0, (H + 0.5) / 2 - 0.45, 0, { parent: g });
    mesh(hipRoof(w + 1, d + 1, 2.1), M.teja, 0, H + 0.05, 0, { parent: g });
    for (let i = 0; i < 3; i++) box(1.1, 1.3, 0.05, M.vidrioOscuro, -w / 3 + i * w / 3, 1.2, d / 2 + 0.01, { parent: g, cast: false });
  }

  function terreno() {
    plano(260, 260, M.cesped, 0, -0.45, 0, { receive: true });
    plano(260, 7, M.asfalto, 0, -0.44, 17.5);
    box(260, 0.12, 1.8, M.adoquin, 0, -0.39, 13.2, { cast: false });
    box(260, 0.12, 1.8, M.adoquin, 0, -0.39, 21.8, { cast: false });
    // camino de la puerta a la calle
    plano(1.4, 7, M.adoquin, 3.2, -0.43, 8.7);
    // muro del lote
    const wallH = 2.2, y = -0.45 + wallH / 2;
    box(26, wallH, 0.25, M.fachada, 0, y, -17);
    box(0.25, wallH, 28.2, M.fachada, -13, y, -3);
    box(0.25, wallH, 28.2, M.fachada, 13, y, -3);
    box(9.3, wallH * 0.55, 0.25, M.fachada, -8.35, -0.45 + wallH * 0.275, 11);
    box(9.3, wallH * 0.55, 0.25, M.fachada, 8.35, -0.45 + wallH * 0.275, 11);
    for (const [x, z, w, d, ry] of [[-27, -4, 13, 10, 0], [27, -3, 12, 11, 0], [-26, -30, 14, 10, 0.05], [2, -31, 13, 10, 0], [28, -31, 12, 10, -0.04],
      [-26, 32, 13, 10, 0], [1, 32, 14, 10, 0], [28, 31, 12, 11, 0.03]]) vecina(x, z, w, d, ry);
  }

  /* ---------- muebles y vegetación reales ---------- */
  function preparar(obj) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // hojas con mezcla alfa se ordenan mal y no dan sombra: se pasan a recorte
        if (m.transparent && m.map) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; }
        if (m.map) m.map.anisotropy = aniso;
      }
    });
    return obj;
  }
  // Coloca `obj` con la base en `y` y el centro en planta en (x, z).
  function colocar(obj, x, y, z, { ry = 0, s = 1 } = {}) {
    const g = new THREE.Group(); g.add(obj); obj.scale.setScalar(s);
    const b = new THREE.Box3().setFromObject(obj), c = b.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -b.min.y, -c.z);
    g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
    return g;
  }
  // Parte de un glTF que trae varias variantes en fila (sufijo _a, _b…).
  function variante(escena, sufijo) {
    const g = new THREE.Group();
    escena.children.filter((n) => n.name.endsWith(sufijo) || n.name.endsWith(`${sufijo}_LOD0`)).forEach((n) => g.add(n.clone()));
    return g;
  }

  function amoblar(mod) {
    const c = (id) => preparar(mod[id].clone(true));
    // sala
    colocar(c("mid_century_lounge_chair"), -6.05, 0, -0.35, { ry: 1.2 });
    colocar(c("mid_century_lounge_chair"), -0.95, 0, -0.35, { ry: -1.2 });
    colocar(c("modern_wooden_cabinet"), -6.72, 0, 0.45, { ry: Math.PI / 2 });
    colocar(c("ceramic_vase_03"), -6.72, 0.68, -0.45);
    colocar(c("ceramic_vase_01"), -3.85, 0.41, -1.2, { s: 0.8 });
    colocar(c("potted_plant_04"), -3.2, 0.41, -1.45);
    colocar(c("potted_plant_02"), -6.3, 0, -4.3, { s: 1.9 });
    colocar(c("potted_plant_02"), -0.9, 0, 4.3, { s: 1.6, ry: 2 });
    // cocina
    for (const x of [1.4, 2.1, 2.8]) colocar(c("modern_ceiling_lamp_01"), x, H - 1.17 * 0.8, -2.2, { s: 0.8 });
    colocar(c("ceramic_vase_03"), 1.2, 0.92, -4.7);
    colocar(c("ceramic_vase_01"), 2.9, 0.93, -2.3, { s: 0.7 });
    // alcoba
    colocar(c("modern_arm_chair_01"), 6.55, 0, -1.2, { ry: -2.3 });
    colocar(c("potted_plant_02"), 6.6, 0, 4.3, { s: 1.4 });
    colocar(c("potted_plant_04"), 6.7, 0.45, -4.72);
    // patio
    colocar(c("outdoor_table_chair_set_01"), -3.6, 0, -6.9, { ry: 0.3 });
    const pasto = mod.grass_medium_01;
    for (const [x, z] of [[-6.6, -6.8], [-0.1, -6.4]]) for (let i = 0; i < 7; i++) {
      const v = preparar(variante(pasto, ["_tall_a", "_tall_b", "_tall_c", "_mid_b", "_large_b"][i % 5]));
      colocar(v, x + (R() - 0.5) * 0.3, 0.48, z - 1 + i * 0.33, { s: 2.2, ry: R() * 6 });
    }
    // árboles del jardín: el pachira crecido a escala de árbol
    const arbol = mod.pachira_aquatica_01;
    const sufijos = ["_a", "_b", "_c", "_d"];
    for (const [x, z, s, i] of [[-10, -13, 3.6, 3], [9.5, -12.5, 4, 1], [10.5, 7, 3.2, 2], [-10.5, 7.5, 3.4, 0], [3, -14.5, 3, 3],
      [-15, 17.5, 4, 1], [-4, 24, 3.4, 2], [7, 24, 4, 3], [17, 17.5, 3.6, 0]]) {
      const v = preparar(variante(arbol, sufijos[i]));
      colocar(v, x, -0.45, z, { s, ry: R() * 6.28 });
    }
    for (let i = 0; i < 40; i++) {
      const v = preparar(variante(pasto, ["_large_b", "_mid_b", "_tall_a"][i % 3]));
      const a = R() * 6.28, r = 2 + R() * 9;
      colocar(v, -3.4 + Math.cos(a) * r * 0.9, -0.45, -12 + Math.sin(a) * r * 0.35, { s: 2.5, ry: R() * 6 });
    }
  }

  /* ---------- cielo y sol ---------- */
  const sol = new THREE.DirectionalLight("#FFF0DC", 3.2);
  sol.castShadow = true;
  sol.shadow.mapSize.set(movil ? 1024 : 4096, movil ? 1024 : 4096);
  Object.assign(sol.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 });
  sol.shadow.radius = movil ? 2 : 3;
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.025;
  sol.target.position.set(0, 0, -3);
  scene.add(sol, sol.target);

  function cielo(hdr) {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = hdr;
    scene.environment = hdr;
    // Se gira el cielo para que el sol de la foto entre por el ventanal norte
    // de la sala, y la luz directa se alinea con el sol que se ve en el cielo.
    const d = direccionDelSol(hdr);
    const deseado = new THREE.Vector3(-0.55, 0, -0.84).normalize();
    let mejor = 0, rot = 0;
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const v = d.clone().applyEuler(new THREE.Euler(0, a, 0)); v.y = 0; v.normalize();
      if (v.dot(deseado) > mejor) { mejor = v.dot(deseado); rot = a; }
    }
    scene.backgroundRotation.set(0, rot, 0);
    scene.environmentRotation.set(0, rot, 0);
    const dir = d.applyEuler(new THREE.Euler(0, rot, 0));
    // un sol muy rasante casi no entra: se sube a un mínimo de 22°
    const minEl = Math.sin(THREE.MathUtils.degToRad(22));
    if (dir.y < minEl) { const hz = Math.sqrt(1 - minEl * minEl); const f = hz / Math.hypot(dir.x, dir.z); dir.set(dir.x * f, minEl, dir.z * f); }
    sol.position.copy(sol.target.position).addScaledVector(dir, 60);
    scene.environmentIntensity = 1;
  }

  /* ---------- postproceso ---------- */
  const rt = new THREE.WebGLRenderTarget(ancho() * PR, alto() * PR, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(PR); composer.setSize(ancho(), alto());
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (!movil) {
    try {
      gtao = new GTAOPass(scene, camera, ancho(), alto());
      gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      gtao.blendIntensity = 1;
      composer.addPass(gtao);
    } catch (e) { console.warn("GTAO no disponible", e); }
  }
  composer.addPass(new OutputPass());

  /* ---------- path tracer en reposo ---------- */
  let pt = null, ptListo = false, ptPreparando = false, quieto = 0;
  const ptPermitido = !movil && !reducido;
  async function prepararPT() {
    if (pt || ptPreparando || !ptPermitido) return;
    ptPreparando = true;
    try {
      pt = new WebGLPathTracer(renderer);
      pt.bounces = 4;
      pt.filterGlossyFactor = 0.5;
      pt.renderScale = 0.5;
      pt.tiles.set(2, 2);
      pt.minSamples = 3;
      pt.fadeDuration = 900;
      pt.renderDelay = 0;
      pt.dynamicLowRes = false;
      pt.textureSize.set(512, 512);
      pt.rasterizeSceneCallback = () => composer.render();
      await pt.setSceneAsync(scene, camera);
      ptListo = true;
    } catch (e) {
      console.warn("path tracer no disponible", e);
      pt = null;
    }
    ptPreparando = false;
  }
  let techoPT = null;

  /* ---------- cámara sobre riel ---------- */
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.p)), false, "centripetal");
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.l)), false, "centripetal");
  const HOLD = KEYS.map((k) => (k.s === null ? 0 : 0.2));
  const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  function railU(p) {
    const seg = THREE.MathUtils.clamp(p, 0, 1) * (N - 1);
    const i = Math.min(Math.floor(seg), N - 2), f = seg - i;
    const a = i === 0 ? 0.06 : HOLD[i], b = HOLD[i + 1];
    const e = f <= a ? 0 : f >= 1 - b ? 1 : smoother((f - a) / (1 - a - b));
    return (i + e) / (N - 1);
  }

  /* ---------- armado ---------- */
  alProgreso(4, "Levantando muros");
  casco(); cubierta(); sala(); cocina(); alcoba(); patio(); terreno();
  const [hdr, lista] = await Promise.all([cieloP, modelosP]);
  alProgreso(84, "Amoblando");
  cielo(hdr);
  amoblar(Object.fromEntries(lista));
  alProgreso(92, "Encendiendo la luz");
  camera.position.copy(posCurve.getPoint(0)); camera.lookAt(lookCurve.getPoint(0));
  await renderer.compileAsync(scene, camera);
  composer.render();
  alProgreso(100, "Listo");

  /* ---------- bucle ---------- */
  let objetivo = 0, cur = 0, shown = -2, vivo = true, raf = 0;
  const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
  const clock = new THREE.Clock();
  const look = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3(0, 1, 0);
  const ultima = new THREE.Matrix4();
  let frames = 0, acc = 0, lento = 0;

  function loop() {
    if (!vivo) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    cur += (objetivo - cur) * (1 - Math.exp(-dt * (reducido ? 30 : 3.2)));
    if (Math.abs(objetivo - cur) < 1e-5) cur = objetivo;
    const u = railU(cur);
    camera.position.copy(posCurve.getPoint(u));
    look.copy(lookCurve.getPoint(u));
    if (!reducido) {
      mouseS.lerp(mouse, 1 - Math.exp(-dt * 2));
      if (mouseS.distanceToSquared(mouse) < 1e-7) mouseS.copy(mouse);
      side.subVectors(look, camera.position).cross(upv).normalize();
      look.addScaledVector(side, mouseS.x * 0.5); look.y -= mouseS.y * 0.25;
    }
    camera.lookAt(look);
    camera.updateMatrixWorld();
    // el techo se retira mientras la cámara entra por arriba y vuelve cuando sale al jardín
    const outX = Math.max(Math.abs(camera.position.x) - 7.6, 0), outZ = Math.max(Math.abs(camera.position.z) - 5.6, 0);
    const conTecho = camera.position.y > 9.5 || Math.hypot(outX, outZ) > 1.5;
    techo.visible = conTecho;

    const s = KEYS[Math.round(cur * (N - 1))].s;
    if (s !== shown) { shown = s; alEscena(s); }

    const movio = !ultima.equals(camera.matrixWorld);
    ultima.copy(camera.matrixWorld);
    quieto = movio ? 0 : quieto + dt;

    if (ptListo && quieto > 0.35) {
      if (techoPT !== conTecho) { techoPT = conTecho; ptListo = false; pt.setSceneAsync(scene, camera).then(() => { ptListo = true; }); composer.render(); }
      else {
        if (quieto - dt <= 0.35) { pt.updateCamera(); alEstado({ trazando: true }); }
        pt.renderSample();
        if (pt.samples >= 1) alEstado({ trazando: true, muestras: Math.floor(pt.samples) });
      }
    } else {
      if (movio && ptListo) alEstado({ trazando: false });
      composer.render(dt);
      if (!pt && quieto > 1.2) prepararPT();
    }

    frames++; acc += dt;
    if (acc > 1 && !(ptListo && quieto > 0.35)) {
      const fps = frames / acc;
      alEstado({ fps: Math.round(fps) });
      lento = fps < 28 ? lento + 1 : 0;
      if (lento >= 3 && gtao?.enabled) { gtao.enabled = false; lento = 0; }
      frames = 0; acc = 0;
    } else if (acc > 1) { frames = 0; acc = 0; }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  const onMove = (e) => { if (e.pointerType === "mouse") mouse.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5); };
  window.addEventListener("pointermove", onMove);

  function redimensionar() {
    camera.aspect = ancho() / alto(); camera.fov = fovFor(); camera.updateProjectionMatrix();
    renderer.setSize(ancho(), alto(), false); composer.setSize(ancho(), alto());
    gtao?.setSize(ancho(), alto());
    pt?.updateCamera();
  }

  return {
    // progreso del scroll, de 0 a 1
    objetivo(p) { objetivo = THREE.MathUtils.clamp(p, 0, 1); },
    saltar(p) { objetivo = cur = THREE.MathUtils.clamp(p, 0, 1); },
    redimensionar,
    destruir() {
      vivo = false; cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      pt?.dispose(); composer.dispose(); renderer.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); });
      Object.values(cache).forEach((t) => t.dispose());
      hdr.dispose();
    },
  };
}
