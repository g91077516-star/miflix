#!/usr/bin/env node
/**
 * EDITAR PELÍCULA O SERIE
 * Uso: node editar.js
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

function esc(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function editarCampo(content, id, campo, valor) {
  const camposString = ["title", "streamUrl", "description", "duration", "age", "match", "type", "poster", "backdrop"];
  const camposNumero = ["rating", "year"];

  if (camposString.includes(campo)) {
    const regex = new RegExp(`(\\{[^{}]*id:${id},[\\s\\S]*?${campo}:")([^"]*)(")`, "");
    if (!regex.test(content)) throw new Error(`No se encontró el campo "${campo}"`);
    return content.replace(regex, `$1${esc(valor)}$3`);
  } else if (camposNumero.includes(campo)) {
    const num = parseFloat(valor);
    if (isNaN(num)) throw new Error(`El valor para "${campo}" debe ser un número`);
    const regex = new RegExp(`(\\{[^{}]*id:${id},[\\s\\S]*?${campo}:)([\\d.]+)`, "");
    if (!regex.test(content)) throw new Error(`No se encontró el campo "${campo}"`);
    return content.replace(regex, `$1${num}`);
  } else {
    throw new Error(`Campo inválido: "${campo}"`);
  }
}

const CAMPOS = [
  { key: "title",       label: "Título" },
  { key: "year",        label: "Año" },
  { key: "rating",      label: "Rating (ej: 8.5)" },
  { key: "duration",    label: "Duración (ej: 2h 10min)" },
  { key: "age",         label: "Clasificación (ej: +13)" },
  { key: "description", label: "Descripción" },
  { key: "streamUrl",   label: "URL del reproductor" },
  { key: "poster",      label: "URL del póster" },
  { key: "backdrop",    label: "URL del fondo" },
  { key: "type",        label: "Tipo (Película / Serie)" },
];

async function main() {
  if (!fs.existsSync(INDEX_HTML)) {
    console.error("❌ No se encontró index.html"); rl.close(); process.exit(1);
  }

  let content = fs.readFileSync(INDEX_HTML, "utf-8");
  const allMovies = leerMovies(content);

  if (allMovies.length === 0) {
    console.log("\n📋 El catálogo está vacío.\n"); rl.close(); return;
  }

  console.log("\n✏️  MIFLIX — Editar película o serie\n");

  // Buscar por título
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
      console.log("");
      const eleccion = await preguntar("   ¿Cuál querés editar? (número): ");
      const idx = parseInt(eleccion) - 1;
      if (isNaN(idx) || idx < 0 || idx >= resultados.length) { console.log("   Número inválido.\n"); continue; }
      elegido = resultados[idx];
    }
  }

  console.log(`\n   Editando: "${elegido.title}" (${elegido.year})\n`);

  // Mostrar campos para elegir
  let editando = true;
  while (editando) {
    console.log("   ¿Qué querés editar?\n");
    CAMPOS.forEach((c, i) => console.log(`   ${i + 1}. ${c.label}`));
    console.log(`   ${CAMPOS.length + 1}. Terminar\n`);

    const eleccion = await preguntar("   Elegí una opción: ");
    const idx = parseInt(eleccion) - 1;

    if (idx === CAMPOS.length) { editando = false; break; }
    if (isNaN(idx) || idx < 0 || idx >= CAMPOS.length) { console.log("\n   Número inválido.\n"); continue; }

    const campo = CAMPOS[idx];
    const nuevoValor = await preguntar(`\n   Nuevo valor para "${campo.label}": `);

    if (!nuevoValor) { console.log("   No escribiste nada, se cancela este campo.\n"); continue; }

    try {
      content = editarCampo(content, elegido.id, campo.key, nuevoValor);
      fs.writeFileSync(INDEX_HTML, content, "utf-8");
      console.log(`\n   ✓ "${campo.label}" actualizado a: ${nuevoValor}\n`);
    } catch (err) {
      console.error(`\n   ❌ Error: ${err.message}\n`);
    }

    const seguir = await preguntar("   ¿Querés editar otro campo? (s/n): ");
    if (seguir.toLowerCase() !== "s" && seguir.toLowerCase() !== "si") editando = false;
    console.log("");
  }

  console.log(`\n✅ "${elegido.title}" guardada correctamente.`);
  console.log("   Recargá index.html para ver los cambios.\n");
  rl.close();
}

main();
