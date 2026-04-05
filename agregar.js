#!/usr/bin/env node
/**
 * AGREGAR PELÍCULA O SERIE AL CATÁLOGO
 * Uso: node agregar.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const readline = require("readline");

const TMDB_KEY = "cc0c294ab8a2535a4ebe9b0604104ffa";
const INDEX_HTML = path.join(__dirname, "index.html");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function preguntar(texto) {
  return new Promise(resolve => rl.question(texto, a => resolve(a.trim())));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "MiFlix/1.0" } }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error("Error TMDB")); } });
    }).on("error", reject);
  });
}

// Busca en español latino y también en inglés para cubrir títulos latinos
async function searchTMDB(name) {
  const [mr_es, tr_es, mr_en, tr_en] = await Promise.all([
    fetchJson(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=es-419`),
    fetchJson(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=es-419`),
    fetchJson(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=en-US`),
    fetchJson(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=en-US`),
  ]);

  // Combinar resultados, usando título en español latino si está disponible
  const seen = new Set();
  const all = [];

  const addResult = (r, type, isEs) => {
    if (seen.has(r.id + type)) return;
    seen.add(r.id + type);
    const esTitle = type === "Película"
      ? (r.title || r.original_title)
      : (r.name || r.original_name);
    const year = type === "Película"
      ? (r.release_date || "?").slice(0, 4)
      : (r.first_air_date || "?").slice(0, 4);
    all.push({ ...r, _type: type, _year: year, _esTitle: esTitle, _isEs: isEs });
  };

  (mr_es.results || []).slice(0, 5).forEach(r => addResult(r, "Película", true));
  (tr_es.results || []).slice(0, 5).forEach(r => addResult(r, "Serie", true));
  (mr_en.results || []).slice(0, 5).forEach(r => addResult(r, "Película", false));
  (tr_en.results || []).slice(0, 5).forEach(r => addResult(r, "Serie", false));

  return all.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 10);
}

// Busca los detalles completos en español latino
async function getDetails(result) {
  const isSerie = result._type === "Serie";
  return fetchJson(isSerie
    ? `https://api.themoviedb.org/3/tv/${result.id}?api_key=${TMDB_KEY}&language=es-419&append_to_response=credits,translations`
    : `https://api.themoviedb.org/3/movie/${result.id}?api_key=${TMDB_KEY}&language=es-419&append_to_response=credits,translations`
  );
}

// Obtener el título en español latino desde las traducciones
function getTitleLatino(details, type) {
  const isSerie = type === "Serie";
  const translations = details.translations?.translations || [];

  // Buscar traducción latinoamericana primero
  const latino = translations.find(t => t.iso_639_1 === "es" && t.iso_3166_1 === "MX")
    || translations.find(t => t.iso_639_1 === "es" && t.iso_3166_1 === "AR")
    || translations.find(t => t.iso_639_1 === "es");

  if (latino) {
    const data = latino.data;
    const title = isSerie ? data.name : data.title;
    if (title && title.trim()) return title.trim();
  }

  // Fallback al título que ya trajo TMDB en es-419
  return isSerie
    ? (details.name || details.original_name)
    : (details.title || details.original_title);
}

function getNextId(html) {
  const ids = [...html.matchAll(/id:(\d+)/g)].map(m => parseInt(m[1]));
  return ids.length ? Math.max(...ids) + 1 : 10;
}

function esc(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function buildBlock(data, id, streamUrl, type, episodios, titleOverride) {
  const isSerie  = type === "Serie";
  const title    = esc(titleOverride || (isSerie ? (data.name || data.original_name) : (data.title || data.original_title)));
  const year     = parseInt((isSerie ? data.first_air_date : data.release_date || "0").slice(0, 4));
  const genres   = (data.genres || []).map(g => `"${esc(g.name)}"`).join(", ");
  const rating   = Math.round((data.vote_average || 0) * 10) / 10;
  const runtime  = isSerie ? (data.episode_run_time?.[0] || 0) : (data.runtime || 0);
  const duration = isSerie ? `${runtime}min por ep.` : `${Math.floor(runtime / 60)}h ${runtime % 60}min`;
  const desc     = esc((data.overview || "Sin descripción.").slice(0, 300));
  const cast     = (data.credits?.cast || []).slice(0, 5).map(a => `"${esc(a.name)}"`).join(", ");
  const poster   = data.poster_path   ? `https://image.tmdb.org/t/p/w500${data.poster_path}`   : "";
  const backdrop = data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : poster;
  const tags     = (data.genres || []).slice(0, 3).map(g => `"${esc(g.name)}"`).join(", ");

  let episodiosStr = "";
  if (isSerie && episodios && episodios.length > 0) {
    const eps = episodios.map(e =>
      `      {temporada:${e.temporada},episodio:${e.episodio},titulo:"${esc(e.titulo)}",streamUrl:"${esc(e.streamUrl)}"}`
    ).join(",\n");
    episodiosStr = `,\n    episodios:[\n${eps}\n    ]`;
  }

  return `  {
    id:${id}, title:"${title}", year:${year}, genres:[${genres}],
    rating:${rating}, age:"+13", duration:"${duration}", match:"95%", type:"${type}",
    poster:"${poster}",
    backdrop:"${backdrop}",
    streamUrl:"${esc(streamUrl)}",
    description:"${desc}",
    actors:[${cast}],
    tags:[${tags}]${episodiosStr}
  }`;
}

async function pedirEpisodios() {
  const episodios = [];
  console.log("\n📺 Agregar episodios (Enter sin URL para terminar)\n");
  let temporada = 1;
  let numEp = 1;

  while (true) {
    const url = await preguntar(`   T${temporada}E${numEp} — URL del reproductor (Enter para terminar): `);
    if (!url) break;
    const titulo = await preguntar(`   T${temporada}E${numEp} — Título (Enter para saltear): `);
    episodios.push({ temporada, episodio: numEp, titulo: titulo || `Episodio ${numEp}`, streamUrl: url });
    console.log(`   ✓ T${temporada}E${numEp} agregado`);
    numEp++;
    const cambiar = await preguntar(`   ¿Siguiente es T${temporada}E${numEp}? (Enter=sí / nro de temporada si cambió): `);
    if (cambiar && !isNaN(parseInt(cambiar))) { temporada = parseInt(cambiar); numEp = 1; }
  }
  return episodios;
}

async function main() {
  console.log("\n🎬 MIFLIX — Agregar película o serie");
  console.log("   Podés escribir el título en español latino o inglés\n");

  let elegido = null;

  while (!elegido) {
    const input = await preguntar("   Título: ");
    if (!input) { console.log("   Ingresá un título.\n"); continue; }

    console.log(`\n🔍 Buscando "${input}"...\n`);

    let resultados;
    try {
      resultados = await searchTMDB(input);
    } catch(e) {
      console.error("   Error al buscar:", e.message, "\n");
      continue;
    }

    if (resultados.length === 0) {
      console.log("   Sin resultados. Probá con otro nombre.\n");
      continue;
    }

    console.log("   Resultados:\n");
    resultados.forEach((r, i) => {
      const nombre = r._esTitle || r.title || r.name || r.original_title || r.original_name;
      const rating = r.vote_average ? `★ ${r.vote_average.toFixed(1)}` : "";
      const lang = r._isEs ? "🇦🇷" : "🌐";
      console.log(`   ${i + 1}. ${lang} ${nombre} (${r._year}) — ${r._type} ${rating}`);
    });
    console.log(`   ${resultados.length + 1}. Buscar con otro nombre\n`);

    const eleccion = await preguntar("   ¿Cuál es? (número): ");
    const idx = parseInt(eleccion) - 1;

    if (idx === resultados.length) { console.log(""); continue; }
    if (isNaN(idx) || idx < 0 || idx >= resultados.length) { console.log("   Número inválido.\n"); continue; }

    elegido = resultados[idx];
  }

  const streamUrl = await preguntar("\n   URL del reproductor: ");
  if (!streamUrl) { console.error("❌ Ingresá la URL."); rl.close(); process.exit(1); }

  if (!fs.existsSync(INDEX_HTML)) { console.error("❌ No se encontró index.html"); rl.close(); process.exit(1); }

  let episodios = [];

  try {
    console.log(`\n⏳ Obteniendo info completa en español latino...`);
    const details = await getDetails(elegido);
    const type = elegido._type;
    const titleLatino = getTitleLatino(details, type);

    console.log(`\n✅ Info obtenida:`);
    console.log(`   Título latino: ${titleLatino}`);
    console.log(`   Año:      ${(details.first_air_date || details.release_date || "").slice(0, 4)}`);
    console.log(`   Tipo:     ${type}`);
    console.log(`   Géneros:  ${(details.genres || []).map(g => g.name).join(", ")}`);
    console.log(`   Rating:   ★ ${details.vote_average?.toFixed(1)}`);
    console.log(`   Actores:  ${(details.credits?.cast || []).slice(0, 3).map(a => a.name).join(", ")}`);

    // Confirmar título
    const confirmar = await preguntar(`\n   ¿El título "${titleLatino}" es correcto? (Enter=sí / escribí el título correcto): `);
    const finalTitle = confirmar || titleLatino;

    if (type === "Serie") {
      const agregarEps = await preguntar("\n   ¿Querés agregar episodios ahora? (s/n): ");
      if (agregarEps.toLowerCase() === "s" || agregarEps.toLowerCase() === "si") {
        episodios = await pedirEpisodios();
        console.log(`\n   Total episodios: ${episodios.length}`);
      }
    }

    rl.close();

    const content   = fs.readFileSync(INDEX_HTML, "utf-8");
    const id        = getNextId(content);
    const block     = buildBlock(details, id, streamUrl, type, episodios, finalTitle);
    const insertIdx = content.lastIndexOf("\n];");
    if (insertIdx === -1) { console.error("❌ No se encontró el array movies."); process.exit(1); }

    const updated = content.slice(0, insertIdx) + ",\n" + block + content.slice(insertIdx);
    fs.writeFileSync(INDEX_HTML, updated, "utf-8");

    console.log(`\n🎬 "${finalTitle}" agregada al catálogo (id: ${id})`);
    if (episodios.length > 0) console.log(`   Con ${episodios.length} episodio(s).`);
    console.log(`   Recargá index.html para ver los cambios.\n`);

  } catch (err) {
    rl.close();
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  }
}

main();
