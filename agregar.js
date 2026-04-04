#!/usr/bin/env node
/**
 * AGREGAR PELÍCULA O SERIE AL CATÁLOGO
 *
 * Uso:
 *   node agregar.js "Nombre de la peli" "https://hgplaycdn.com/e/CODIGO"
 *
 * Ejemplos:
 *   node agregar.js "Inception" "https://hgplaycdn.com/e/2o88z0ec7fqi"
 *   node agregar.js "Breaking Bad" "https://hgplaycdn.com/e/abc123"
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const TMDB_KEY = "cc0c294ab8a2535a4ebe9b0604104ffa";
const INDEX_HTML = path.join(__dirname, "index.html");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "MiFlix/1.0" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Error al parsear respuesta")); }
      });
    }).on("error", reject);
  });
}

async function searchTMDB(name) {
  // Busca primero como película
  const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=es-AR`;
  const movieRes = await fetchJson(movieUrl);

  // Busca también como serie
  const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=es-AR`;
  const tvRes = await fetchJson(tvUrl);

  const movies = (movieRes.results || []).map(r => ({ ...r, _type: "Película" }));
  const series = (tvRes.results || []).map(r => ({ ...r, _type: "Serie" }));

  const all = [...movies, ...series].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  if (all.length === 0) throw new Error(`No se encontró "${name}" en TMDB`);
  return all[0];
}

async function getDetails(result) {
  const isSerie = result._type === "Serie";
  const endpoint = isSerie
    ? `https://api.themoviedb.org/3/tv/${result.id}?api_key=${TMDB_KEY}&language=es-AR&append_to_response=credits`
    : `https://api.themoviedb.org/3/movie/${result.id}?api_key=${TMDB_KEY}&language=es-AR&append_to_response=credits`;

  return fetchJson(endpoint);
}

function getNextId(html) {
  const ids = [...html.matchAll(/id:(\d+)/g)].map(m => parseInt(m[1]));
  return ids.length ? Math.max(...ids) + 1 : 10;
}

function esc(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function buildBlock(data, id, streamUrl, type) {
  const isSerie = type === "Serie";

  const title = esc(isSerie ? (data.name || data.original_name) : (data.title || data.original_title));
  const year = isSerie
    ? parseInt((data.first_air_date || "0").slice(0, 4))
    : parseInt((data.release_date || "0").slice(0, 4));

  const genres = (data.genres || []).map(g => `"${esc(g.name)}"`).join(", ");
  const rating = Math.round((data.vote_average || 0) * 10) / 10;
  const duration = isSerie
    ? `${data.episode_run_time?.[0] || "?"}min por ep.`
    : `${Math.floor((data.runtime || 0) / 60)}h ${(data.runtime || 0) % 60}min`;

  const desc = esc((data.overview || "Sin descripción.").slice(0, 300));

  const cast = (data.credits?.cast || []).slice(0, 5).map(a => `"${esc(a.name)}"`).join(", ");

  const poster = data.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
    : "";
  const backdrop = data.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
    : poster;

  const tags = (data.genres || []).slice(0, 3).map(g => `"${esc(g.name)}"`).join(", ");

  return `  {
    id:${id}, title:"${title}", year:${year}, genres:[${genres}],
    rating:${rating}, age:"+13", duration:"${duration}", match:"95%", type:"${type}",
    poster:"${poster}",
    backdrop:"${backdrop}",
    streamUrl:"${esc(streamUrl)}",
    description:"${desc}",
    actors:[${cast}],
    tags:[${tags}]
  }`;
}

async function main() {
  const name = process.argv[2];
  const streamUrl = process.argv[3];

  if (!name || !streamUrl) {
    console.error('\n❌ Uso: node agregar.js "Nombre de la peli" "https://hgplaycdn.com/e/CODIGO"');
    console.error('   Ejemplo: node agregar.js "Inception" "https://hgplaycdn.com/e/2o88z0ec7fqi"\n');
    process.exit(1);
  }

  if (!fs.existsSync(INDEX_HTML)) {
    console.error("❌ No se encontró index.html");
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Buscando "${name}" en TMDB...`);
    const result = await searchTMDB(name);
    const type = result._type;

    console.log(`   Encontrado como: ${type}`);
    console.log(`   Obteniendo detalles...`);
    const details = await getDetails(result);

    const title = type === "Serie"
      ? (details.name || details.original_name)
      : (details.title || details.original_title);

    console.log(`\n✅ Info obtenida:`);
    console.log(`   Título:   ${title}`);
    console.log(`   Año:      ${(details.first_air_date || details.release_date || "").slice(0, 4)}`);
    console.log(`   Tipo:     ${type}`);
    console.log(`   Géneros:  ${(details.genres || []).map(g => g.name).join(", ")}`);
    console.log(`   Rating:   ★ ${details.vote_average?.toFixed(1)}`);
    console.log(`   Actores:  ${(details.credits?.cast || []).slice(0, 3).map(a => a.name).join(", ")}`);
    console.log(`   Póster:   ${details.poster_path ? "✓" : "No encontrado"}`);

    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    const id = getNextId(content);
    const block = buildBlock(details, id, streamUrl, type);

    const insertIdx = content.lastIndexOf("\n];");
    if (insertIdx === -1) {
      console.error("❌ No se pudo encontrar el array movies en index.html");
      process.exit(1);
    }

    const updated = content.slice(0, insertIdx) + ",\n" + block + content.slice(insertIdx);
    fs.writeFileSync(INDEX_HTML, updated, "utf-8");

    console.log(`\n🎬 "${title}" agregada al catálogo (id: ${id})`);
    console.log(`   Recargá index.html en el navegador para ver los cambios.\n`);

  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
