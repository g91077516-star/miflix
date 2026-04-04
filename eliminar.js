#!/usr/bin/env node
/**
 * ELIMINAR PELÍCULA O SERIE
 * Uso: node eliminar.js
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const INDEX_HTML = path.join(__dirname, "index.html");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function preguntar(texto) {
  return new Promise(resolve => rl.question(texto, a => resolve(a.trim())));
}

function leerMovies(content) {
  const matches = [...content.matchAll(/\{\s*\n\s*id:(\d+),\s*title:"([^"]+)",\s*year:(\d+)/g)];
  return matches.map(m => ({ id: parseInt(m[1]), title: m[2], year: parseInt(m[3]) }));
}

function eliminarById(content, id) {
  const updated = content.replace(
    new RegExp(`,?\\s*\\{[^{}]*id:${id},[\\s\\S]*?\\}(?=\\s*[,\\n]|\\s*\\];)`, "g"),
    ""
  );
  return updated.replace(/,(\s*\]);/, "$1").replace(/,\s*,/g, ",");
}

async function main() {
  if (!fs.existsSync(INDEX_HTML)) {
    console.error("❌ No se encontró index.html"); rl.close(); process.exit(1);
  }

  const content = fs.readFileSync(INDEX_HTML, "utf-8");
  const allMovies = leerMovies(content);

  if (allMovies.length === 0) {
    console.log("\n📋 El catálogo está vacío.\n"); rl.close(); return;
  }

  console.log("\n🗑️  MIFLIX — Eliminar película o serie\n");

  let elegido = null;
  while (!elegido) {
    const input = await preguntar("   Título (o parte del título): ");
    if (!input) continue;

    const resultados = allMovies.filter(m => m.title.toLowerCase().includes(input.toLowerCase()));

    if (resultados.length === 0) {
      console.log(`\n   No se encontró "${input}". Títulos disponibles:\n`);
      allMovies.forEach(m => console.log(`   — ${m.title} (${m.year})`));
      console.log("");
      continue;
    }

    if (resultados.length === 1) {
      elegido = resultados[0];
    } else {
      console.log(`\n   Varios resultados:\n`);
      resultados.forEach((m, i) => console.log(`   ${i + 1}. ${m.title} (${m.year})`));
      console.log(`   ${resultados.length + 1}. Buscar de nuevo\n`);
      const eleccion = await preguntar("   ¿Cuál querés eliminar? (número): ");
      const idx = parseInt(eleccion) - 1;
      if (idx === resultados.length) { console.log(""); continue; }
      if (isNaN(idx) || idx < 0 || idx >= resultados.length) { console.log("   Número inválido.\n"); continue; }
      elegido = resultados[idx];
    }
  }

  console.log(`\n⚠️  Vas a eliminar: "${elegido.title}" (${elegido.year})`);
  const confirmar = await preguntar("   ¿Confirmás? (s/n): ");
  rl.close();

  if (confirmar.toLowerCase() !== "s" && confirmar.toLowerCase() !== "si" && confirmar.toLowerCase() !== "sí") {
    console.log("\n   Cancelado.\n"); return;
  }

  try {
    const updated = eliminarById(content, elegido.id);
    fs.writeFileSync(INDEX_HTML, updated, "utf-8");
    console.log(`\n✅ "${elegido.title}" eliminada del catálogo.`);
    console.log("   Recargá index.html para ver los cambios.\n");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
