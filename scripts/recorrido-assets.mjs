// Descarga los assets del recorrido 3D desde Poly Haven (CC0) a public/recorrido/.
// No se versionan: pesan ~60 MB y se regeneran con `npm run recorrido:assets`.
// Idempotente: lo que ya está en disco no se vuelve a bajar.
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUT = "public/recorrido";
const API = "https://api.polyhaven.com/files/";
const UA = { "User-Agent": "soma-recorrido/1.0" };

// Un solo cielo de tarde: la luz de la foto es la que ilumina la casa.
const HDRIS = { tarde: ["qwantani_late_afternoon_puresky", "2k"] };

// Mapas PBR. `mapas` limita qué se baja: las telas usan solo relieve y rugosidad, el color lo pone la escena.
const TEXTURAS = {
  piso: ["laminate_floor_02", "2k"],
  estuco: ["white_stucco", "1k"],
  fachada: ["beige_wall_001", "1k"],
  teja: ["clay_roof_tiles_02", "1k"],
  cesped: ["leafy_grass", "1k"],
  marmol: ["marble_01", "1k"],
  nogal: ["walnut_veneer", "1k"],
  deck: ["wood_planks_grey", "1k"],
  adoquin: ["rectangular_paving", "1k"],
  asfalto: ["asphalt_02", "1k"],
  corteza: ["bark_brown_02", "1k"],
  cuero: ["fabric_leather_02", "1k"],
  lino: ["rough_linen", "1k", ["nor_gl", "rough"]],
  boucle: ["poly_wool_herringbone", "1k", ["nor_gl", "rough"]],
};

const MODELOS = [
  "mid_century_lounge_chair", "modern_arm_chair_01", "modern_ceiling_lamp_01",
  "ceramic_vase_01", "ceramic_vase_03", "potted_plant_02", "potted_plant_04",
  "modern_wooden_cabinet", "outdoor_table_chair_set_01", "grass_medium_01", "pachira_aquatica_01",
];

const existe = (p) => access(p).then(() => true, () => false);
async function bajar(url, destino) {
  if (await existe(destino)) return 0;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, buf);
  return buf.length;
}
const info = async (id) => (await fetch(API + id, { headers: UA })).json();

let total = 0;
for (const [nombre, [id, res]] of Object.entries(HDRIS)) {
  const f = (await info(id)).hdri[res].hdr;
  total += await bajar(f.url, join(OUT, "cielo", `${nombre}.hdr`));
}
for (const [nombre, [id, res, mapas = ["diff", "nor_gl", "rough"]]] of Object.entries(TEXTURAS)) {
  const d = await info(id);
  for (const m of mapas) {
    const clave = Object.keys(d).find((k) => k.toLowerCase() === m.toLowerCase() || (m === "diff" && k === "Diffuse"));
    const f = d[clave]?.[res]?.jpg;
    if (!f) { console.warn(`sin ${m} para ${id}`); continue; }
    total += await bajar(f.url, join(OUT, "tex", nombre, `${m}.jpg`));
  }
}
for (const id of MODELOS) {
  const g = (await info(id)).gltf["1k"].gltf;
  total += await bajar(g.url, join(OUT, "modelos", id, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include ?? {})) total += await bajar(f.url, join(OUT, "modelos", id, rel));
}
await writeFile(join(OUT, "LEEME.txt"), "Assets de Poly Haven (https://polyhaven.com), licencia CC0.\nGenerados por scripts/recorrido-assets.mjs; no se versionan.\n");
console.log(`listo: ${(total / 1e6).toFixed(1)} MB nuevos en ${OUT}`);
