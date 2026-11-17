// =======================================================
// Residente de Obra — app.js
// Todo se guarda localmente en el teléfono con IndexedDB.
// No hay servidor ni internet involucrado para los datos.
// =======================================================

const ROADMAP = [];

let db;
let currentPhotos = []; // base64 strings for the entry being edited/created
let editingId = null;
let movTargetItemId = null; // item currently receiving a movement
let editingItemId = null;
let editingWorkerId = null;
let currentObraId = null;

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("controlObraDB", 14);
    req.onupgradeneeded = (e) => {
      const _db = e.target.result;
      const txn = e.target.transaction;
      if (!_db.objectStoreNames.contains("obras")) {
        const obras = _db.createObjectStore("obras", { keyPath: "id", autoIncrement: true });
        obras.createIndex("nombre", "nombre", { unique: false });
      }
      if (!_db.objectStoreNames.contains("bitacora")) {
        const store = _db.createObjectStore("bitacora", { keyPath: "id", autoIncrement: true });
        store.createIndex("fecha", "fecha", { unique: false });
      }
      if (!_db.objectStoreNames.contains("inv_items")) {
        const items = _db.createObjectStore("inv_items", { keyPath: "id", autoIncrement: true });
        items.createIndex("nombre", "nombre", { unique: false });
      }
      if (!_db.objectStoreNames.contains("inv_movs")) {
        const movs = _db.createObjectStore("inv_movs", { keyPath: "id", autoIncrement: true });
        movs.createIndex("itemId", "itemId", { unique: false });
        movs.createIndex("fecha", "fecha", { unique: false });
      }
      if (!_db.objectStoreNames.contains("personal")) {
        const workers = _db.createObjectStore("personal", { keyPath: "id", autoIncrement: true });
        workers.createIndex("nombre", "nombre", { unique: false });
      }
      if (!_db.objectStoreNames.contains("asistencia")) {
        const asis = _db.createObjectStore("asistencia", { keyPath: "id", autoIncrement: true });
        asis.createIndex("fecha", "fecha", { unique: false });
        asis.createIndex("workerFecha", "workerFecha", { unique: true });
      }
      if (!_db.objectStoreNames.contains("nomina_pagos")) {
        _db.createObjectStore("nomina_pagos", { keyPath: "id", autoIncrement: true });
      }
      if (!_db.objectStoreNames.contains("maq_equipos")) {
        const eq = _db.createObjectStore("maq_equipos", { keyPath: "id", autoIncrement: true });
        eq.createIndex("nombre", "nombre", { unique: false });
      }
      if (!_db.objectStoreNames.contains("maq_usos")) {
        const usos = _db.createObjectStore("maq_usos", { keyPath: "id", autoIncrement: true });
        usos.createIndex("equipoId", "equipoId", { unique: false });
        usos.createIndex("fecha", "fecha", { unique: false });
      }
      if (!_db.objectStoreNames.contains("caja_movs")) {
        const caja = _db.createObjectStore("caja_movs", { keyPath: "id", autoIncrement: true });
        caja.createIndex("fecha", "fecha", { unique: false });
      }
      if (!_db.objectStoreNames.contains("pedidos")) {
        const pedidos = _db.createObjectStore("pedidos", { keyPath: "id", autoIncrement: true });
        pedidos.createIndex("fechaSolicitud", "fechaSolicitud", { unique: false });
        pedidos.createIndex("estado", "estado", { unique: false });
      }
      if (!_db.objectStoreNames.contains("settings")) {
        _db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!_db.objectStoreNames.contains("dias_trabajados")) {
        const dias = _db.createObjectStore("dias_trabajados", { keyPath: "id", autoIncrement: true });
        dias.createIndex("fecha", "fecha", { unique: false });
      }
      if (!_db.objectStoreNames.contains("cargos")) {
        const cargos = _db.createObjectStore("cargos", { keyPath: "id", autoIncrement: true });
        cargos.createIndex("nombre", "nombre", { unique: false });
      }
      if (!_db.objectStoreNames.contains("tareas")) {
        const tareas = _db.createObjectStore("tareas", { keyPath: "id", autoIncrement: true });
        tareas.createIndex("fechaLimite", "fechaLimite", { unique: false });
      }
      if (!_db.objectStoreNames.contains("categorias_inventario")) {
        const catInv = _db.createObjectStore("categorias_inventario", { keyPath: "id", autoIncrement: true });
        catInv.createIndex("nombre", "nombre", { unique: false });
      }
      if (!_db.objectStoreNames.contains("unidades_inventario")) {
        const unidInv = _db.createObjectStore("unidades_inventario", { keyPath: "id", autoIncrement: true });
        unidInv.createIndex("nombre", "nombre", { unique: false });
      }

      // Índice obraId en los stores que se filtran por obra activa (se agrega
      // tanto si el store se acaba de crear arriba como si ya existía de antes).
      ["bitacora", "inv_items", "personal", "maq_equipos", "caja_movs", "pedidos", "nomina_pagos", "dias_trabajados", "cargos", "tareas", "categorias_inventario", "unidades_inventario"].forEach((storeName) => {
        if (_db.objectStoreNames.contains(storeName)) {
          const store = txn.objectStore(storeName);
          if (!store.indexNames.contains("obraId")) {
            store.createIndex("obraId", "obraId", { unique: false });
          }
        }
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e);
  });
}

function tx(storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function getAllFromStore(name) {
  return new Promise((resolve, reject) => {
    const req = tx(name, "readonly").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function putIntoStore(name, record) {
  return new Promise((resolve, reject) => {
    const req = tx(name, "readwrite").put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// ---------- Configuración (clave de IA, etc.) ----------
function getSetting(key) {
  return new Promise((resolve, reject) => {
    const req = tx("settings", "readonly").get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = (e) => reject(e);
  });
}

function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    const req = tx("settings", "readwrite").put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Obras (proyectos) ----------
const OBRA_SCOPED_STORES = ["bitacora", "inv_items", "personal", "maq_equipos", "caja_movs", "pedidos", "nomina_pagos", "dias_trabajados", "cargos", "tareas", "categorias_inventario", "unidades_inventario"];

const CATEGORIAS_INVENTARIO_DEFAULT = ["Materiales", "Herramientas", "Equipo menor"];
const UNIDADES_INVENTARIO_DEFAULT = ["Bultos", "kg", "Ton", "m³", "m²", "m", "Unidades", "Galones", "Litros", "Rollos", "Cajas", "Pares", "Juegos", "Varillas"];

async function seedCategoriasInventarioDefault(obraId) {
  for (const nombre of CATEGORIAS_INVENTARIO_DEFAULT) {
    await saveCategoriaInventario({ nombre, obraId });
  }
}

async function seedUnidadesInventarioDefault(obraId) {
  for (const nombre of UNIDADES_INVENTARIO_DEFAULT) {
    await saveUnidadInventario({ nombre, obraId });
  }
}

const CARGOS_DEFAULT = [
  { nombre: "Ingeniero Residente", nombrePlural: "Ingenieros Residentes", categoria: "profesional" },
  { nombre: "Ingeniero Auxiliar", nombrePlural: "Ingenieros Auxiliares", categoria: "profesional" },
  { nombre: "Auxiliar SST", nombrePlural: "Auxiliares SST", categoria: "profesional" },
  { nombre: "Almacenista", nombrePlural: "Almacenistas", categoria: "profesional" },
  { nombre: "Topógrafo", nombrePlural: "Topógrafos", categoria: "profesional" },
  { nombre: "Maestro de obra", nombrePlural: "Maestros de obra", categoria: "mano_obra" },
  { nombre: "Oficial", nombrePlural: "Oficiales", categoria: "mano_obra" },
  { nombre: "Ayudante", nombrePlural: "Ayudantes", categoria: "mano_obra" },
  { nombre: "Operador de maquinaria", nombrePlural: "Operadores de maquinaria", categoria: "mano_obra" },
  { nombre: "Soldador", nombrePlural: "Soldadores", categoria: "mano_obra" },
  { nombre: "Electricista", nombrePlural: "Electricistas", categoria: "mano_obra" },
  { nombre: "Plomero", nombrePlural: "Plomeros", categoria: "mano_obra" },
  { nombre: "Otro", nombrePlural: "Otros", categoria: "mano_obra" },
];

async function seedCargosDefault(obraId) {
  for (const c of CARGOS_DEFAULT) {
    await saveCargo({ ...c, obraId });
  }
}

// Crea una obra nueva y le siembra la lista de cargos por defecto — se usa
// en todos los flujos donde nace una obra (migración, onboarding, header).
async function crearObraConDefaults(nombre) {
  const obraId = await saveObra({ nombre });
  await seedCargosDefault(obraId);
  await seedCategoriasInventarioDefault(obraId);
  await seedUnidadesInventarioDefault(obraId);
  return obraId;
}

function getAllObras() {
  return new Promise((resolve, reject) => {
    const req = tx("obras", "readonly").getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    req.onerror = (e) => reject(e);
  });
}

function saveObra(obra) {
  return new Promise((resolve, reject) => {
    const store = tx("obras", "readwrite");
    const req = obra.id ? store.put(obra) : store.add(obra);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// ---------- Cargos (personal profesional / mano de obra) ----------
function getAllCargos() {
  return new Promise((resolve, reject) => {
    const req = tx("cargos", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => (a.categoria === b.categoria ? a.nombre.localeCompare(b.nombre) : a.categoria === "profesional" ? -1 : 1)));
    req.onerror = (e) => reject(e);
  });
}

function getCargo(id) {
  return new Promise((resolve, reject) => {
    const req = tx("cargos", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function saveCargo(cargo) {
  return new Promise((resolve, reject) => {
    const store = tx("cargos", "readwrite");
    const req = cargo.id ? store.put(cargo) : store.add(cargo);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deleteCargo(id) {
  return new Promise((resolve, reject) => {
    const req = tx("cargos", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

async function deleteObraCascade(obraId) {
  const items = (await getAllFromStore("inv_items")).filter((r) => r.obraId === obraId);
  for (const it of items) await deleteItem(it.id); // ya elimina inv_movs asociados

  const workers = (await getAllFromStore("personal")).filter((r) => r.obraId === obraId);
  for (const w of workers) await deleteWorker(w.id); // ya elimina asistencia asociada

  const equipos = (await getAllFromStore("maq_equipos")).filter((r) => r.obraId === obraId);
  for (const eq of equipos) await deleteEquipo(eq.id); // ya elimina maq_usos asociados

  const entries = (await getAllFromStore("bitacora")).filter((r) => r.obraId === obraId);
  for (const en of entries) await deleteEntry(en.id);

  const cajas = (await getAllFromStore("caja_movs")).filter((r) => r.obraId === obraId);
  for (const c of cajas) await deleteCajaMov(c.id);

  const pedidosArr = (await getAllFromStore("pedidos")).filter((r) => r.obraId === obraId);
  for (const p of pedidosArr) await deletePedido(p.id);

  const pagos = (await getAllFromStore("nomina_pagos")).filter((r) => r.obraId === obraId);
  for (const pg of pagos) await deletePago(pg.id);

  const dias = (await getAllFromStore("dias_trabajados")).filter((r) => r.obraId === obraId);
  for (const d of dias) await deleteDia(d.id);

  const cargos = (await getAllFromStore("cargos")).filter((r) => r.obraId === obraId);
  const cargosStore = tx("cargos", "readwrite");
  cargos.forEach((c) => cargosStore.delete(c.id));

  const tareas = (await getAllFromStore("tareas")).filter((r) => r.obraId === obraId);
  const tareasStore = tx("tareas", "readwrite");
  tareas.forEach((t) => tareasStore.delete(t.id));

  const catInv = (await getAllFromStore("categorias_inventario")).filter((r) => r.obraId === obraId);
  const catInvStore = tx("categorias_inventario", "readwrite");
  catInv.forEach((c) => catInvStore.delete(c.id));

  const unidInv = (await getAllFromStore("unidades_inventario")).filter((r) => r.obraId === obraId);
  const unidInvStore = tx("unidades_inventario", "readwrite");
  unidInv.forEach((u) => unidInvStore.delete(u.id));

  return new Promise((resolve, reject) => {
    const req = tx("obras", "readwrite").delete(obraId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// La primera vez que se abre la app con esta versión, si ya había datos de
// una sola obra (de antes de que existiera este módulo), los agrupa en una
// obra por defecto para no perder nada. Si es una instalación nueva, pide el
// nombre de la primera obra antes de continuar.
async function ensureObraSetup() {
  const obras = await getAllObras();
  if (obras.length === 0) {
    let hasLegacy = false;
    for (const s of OBRA_SCOPED_STORES) {
      const all = await getAllFromStore(s);
      if (all.some((r) => r.obraId == null)) { hasLegacy = true; break; }
    }
    const nombre = hasLegacy ? "Cancha Sintética" : await promptNombreObraInicial();
    const obraId = await crearObraConDefaults(nombre);
    if (hasLegacy) {
      for (const s of OBRA_SCOPED_STORES) {
        const all = await getAllFromStore(s);
        for (const r of all) {
          if (r.obraId == null) { r.obraId = obraId; await putIntoStore(s, r); }
        }
      }
      showToast(`Creamos tu primera obra "${nombre}" con tus datos anteriores`);
    }
    await setSetting("obraActualId", obraId);
    currentObraId = obraId;
  } else {
    let saved = await getSetting("obraActualId");
    if (!saved || !obras.find((o) => o.id === saved)) saved = obras[0].id;
    currentObraId = saved;
    await ensureCargosForObra(currentObraId);
    await ensureCategoriasInventarioForObra(currentObraId);
    await ensureUnidadesInventarioForObra(currentObraId);
  }
  updateHeaderObraName();
}

function promptNombreObraInicial() {
  return new Promise((resolve) => {
    const modalEl = document.getElementById("onboardingModal");
    modalEl.classList.add("open");
    document.getElementById("onboardingForm").addEventListener("submit", function handler(e) {
      e.preventDefault();
      const val = document.getElementById("onb-nombre").value.trim() || "Mi obra";
      modalEl.classList.remove("open");
      e.target.removeEventListener("submit", handler);
      resolve(val);
    });
  });
}

// Por si la obra ya existía de antes de que existiera esta lista de cargos.
async function ensureCargosForObra(obraId) {
  const existentes = (await getAllFromStore("cargos")).filter((c) => c.obraId === obraId);
  if (!existentes.length) await seedCargosDefault(obraId);
}

// Por si la obra ya existía de antes de que existieran las categorías de inventario.
async function ensureCategoriasInventarioForObra(obraId) {
  const existentes = (await getAllFromStore("categorias_inventario")).filter((c) => c.obraId === obraId);
  if (!existentes.length) await seedCategoriasInventarioDefault(obraId);
}

// Por si la obra ya existía de antes de que existieran las unidades de inventario.
async function ensureUnidadesInventarioForObra(obraId) {
  const existentes = (await getAllFromStore("unidades_inventario")).filter((u) => u.obraId === obraId);
  if (!existentes.length) await seedUnidadesInventarioDefault(obraId);
}

function getActiveScreenName() {
  const active = document.querySelector(".nav-item.active");
  return active ? active.dataset.screen : "inicio";
}

async function updateHeaderObraName() {
  const obras = await getAllObras();
  const obra = obras.find((o) => o.id === currentObraId);
  document.getElementById("projectName").textContent = obra ? obra.nombre : "Mi obra";
}

async function switchToObra(obraId) {
  currentObraId = obraId;
  await ensureCargosForObra(obraId);
  await ensureCategoriasInventarioForObra(obraId);
  await ensureUnidadesInventarioForObra(obraId);
  await setSetting("obraActualId", obraId);
  await updateHeaderObraName();
  closeObraModal();
  renderStats();
  goToScreen(getActiveScreenName());
}

async function renderObraSwitchList() {
  const obras = await getAllObras();
  const el = document.getElementById("obraListSwitch");
  el.innerHTML = obras.map((o) => `
    <div class="obra-row ${o.id === currentObraId ? "current" : ""}" data-id="${o.id}">
      <div class="obra-row-name">${o.id === currentObraId ? "✓ " : ""}${escapeHtml(o.nombre)}</div>
      <div class="obra-row-actions">
        <button type="button" class="icon-btn" data-action="rename-obra" data-id="${o.id}" title="Renombrar">✎</button>
        ${obras.length > 1 ? `<button type="button" class="icon-btn" data-action="delete-obra" data-id="${o.id}" title="Eliminar">🗑</button>` : ""}
      </div>
    </div>`).join("");

  el.querySelectorAll(".obra-row").forEach((row) => {
    row.addEventListener("click", (ev) => {
      if (ev.target.closest(".icon-btn")) return;
      switchToObra(parseInt(row.dataset.id));
    });
  });
  el.querySelectorAll("[data-action='rename-obra']").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const obras2 = await getAllObras();
      const obra = obras2.find((o) => o.id === parseInt(btn.dataset.id));
      const nuevo = prompt("Nuevo nombre de la obra:", obra.nombre);
      if (nuevo && nuevo.trim()) {
        obra.nombre = nuevo.trim();
        await saveObra(obra);
        if (obra.id === currentObraId) updateHeaderObraName();
        renderObraSwitchList();
      }
    });
  });
  el.querySelectorAll("[data-action='delete-obra']").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const obras2 = await getAllObras();
      const obra = obras2.find((o) => o.id === id);
      if (!confirm(`¿Eliminar la obra "${obra.nombre}"? Esto borra TODOS sus datos (bitácora, inventario, asistencia, nómina, maquinaria, caja y pedidos) de forma permanente. Esta acción no se puede deshacer.`)) return;
      await deleteObraCascade(id);
      if (id === currentObraId) {
        const restantes = await getAllObras();
        await switchToObra(restantes[0].id);
      } else {
        renderObraSwitchList();
      }
      showToast("Obra eliminada");
    });
  });
}

function closeObraModal() { document.getElementById("obraModal").classList.remove("open"); }

document.getElementById("appHeader").addEventListener("click", async () => {
  await renderObraSwitchList();
  document.getElementById("obraModal").classList.add("open");
});
document.getElementById("closeObraModal").addEventListener("click", closeObraModal);
document.getElementById("obraModal").addEventListener("click", (e) => { if (e.target.id === "obraModal") closeObraModal(); });

document.getElementById("btnCrearObra").addEventListener("click", async () => {
  const input = document.getElementById("newObraNombre");
  const nombre = input.value.trim();
  if (!nombre) { showToast("Escribe un nombre para la obra"); return; }
  const obraId = await crearObraConDefaults(nombre);
  input.value = "";
  await switchToObra(obraId);
  showToast(`Obra "${nombre}" creada`);
});

// ---------- Mejora de redacción ----------
// Sin clave de IA configurada: limpieza mecánica (espacios, mayúsculas, puntuación).
// Nunca cambia el significado del texto — por eso no hay riesgo de que "invente".
function mejorarTextoLocal(texto) {
  let t = texto.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  t = t.replace(/([!?]){2,}/g, "$1");
  t = t.replace(/\s+([.,;:!?])/g, "$1");
  // Capitalizar después de punto, salto de línea, o al inicio.
  t = t.replace(/(^|[.\n]\s*)([a-záéíóúñ])/g, (m, pre, letra) => pre + letra.toUpperCase());
  const sinPuntuacionFinal = !/[.!?]$/.test(t.trim());
  if (sinPuntuacionFinal && t.trim().length) t = t.trim() + ".";
  return t.trim();
}

async function mejorarTextoIA(texto, apiKey) {
  const prompt = `Eres un asistente que mejora la redacción de una bitácora de obra de construcción, escrita en español de Colombia.
Reglas estrictas:
1. No inventes ni agregues ninguna información que no esté en el texto original.
2. No exageres ni uses adjetivos grandilocuentes ni lenguaje publicitario.
3. Sé breve: el resultado debe ser igual de corto o más corto que el original.
4. Solo corrige gramática, ortografía y mejora la fluidez del lenguaje técnico.
5. Responde ÚNICAMENTE con el texto mejorado, sin comillas, sin comentarios, sin explicaciones.

Texto original:
"""${texto}"""`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("Respuesta vacía de la IA");
  return out.trim();
}

async function mejorarTexto(texto) {
  const key = await getSetting("geminiApiKey");
  if (key) {
    try {
      return await mejorarTextoIA(texto, key);
    } catch (err) {
      console.error("Error IA:", err);
      showToast("No se pudo conectar con la IA — se aplicó una limpieza básica");
      return mejorarTextoLocal(texto);
    }
  }
  return mejorarTextoLocal(texto);
}

function setupAiButton(btnId, textareaId, undoBtnId) {
  const btn = document.getElementById(btnId);
  const textarea = document.getElementById(textareaId);
  const undoBtn = document.getElementById(undoBtnId);
  let previousValue = null;

  btn.addEventListener("click", async () => {
    const original = textarea.value.trim();
    if (!original) { showToast("Escribe algo primero"); return; }
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Mejorando…";
    try {
      const mejorado = await mejorarTexto(original);
      previousValue = original;
      textarea.value = mejorado;
      undoBtn.style.display = "inline-block";
    } catch (err) {
      console.error(err);
      showToast("No se pudo mejorar el texto");
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  undoBtn.addEventListener("click", () => {
    if (previousValue !== null) {
      textarea.value = previousValue;
      previousValue = null;
      undoBtn.style.display = "none";
    }
  });
}

function getAllEntries() {
  return new Promise((resolve, reject) => {
    const req = tx("bitacora", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
    req.onerror = (e) => reject(e);
  });
}

function saveEntry(entry) {
  return new Promise((resolve, reject) => {
    const store = tx("bitacora", "readwrite");
    const req = entry.id ? store.put(entry) : store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deleteEntry(id) {
  return new Promise((resolve, reject) => {
    const req = tx("bitacora", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Inventario: categorías ----------
function getAllCategoriasInventario() {
  return new Promise((resolve, reject) => {
    const req = tx("categorias_inventario", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    req.onerror = (e) => reject(e);
  });
}

function getCategoriaInventario(id) {
  return new Promise((resolve, reject) => {
    const req = tx("categorias_inventario", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function saveCategoriaInventario(cat) {
  return new Promise((resolve, reject) => {
    const store = tx("categorias_inventario", "readwrite");
    const req = cat.id ? store.put(cat) : store.add(cat);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deleteCategoriaInventario(id) {
  return new Promise((resolve, reject) => {
    const req = tx("categorias_inventario", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Inventario: unidades ----------
function getAllUnidadesInventario() {
  return new Promise((resolve, reject) => {
    const req = tx("unidades_inventario", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    req.onerror = (e) => reject(e);
  });
}

function getUnidadInventario(id) {
  return new Promise((resolve, reject) => {
    const req = tx("unidades_inventario", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function saveUnidadInventario(u) {
  return new Promise((resolve, reject) => {
    const store = tx("unidades_inventario", "readwrite");
    const req = u.id ? store.put(u) : store.add(u);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deleteUnidadInventario(id) {
  return new Promise((resolve, reject) => {
    const req = tx("unidades_inventario", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Inventario: materiales ----------
function getAllItems() {
  return new Promise((resolve, reject) => {
    const req = tx("inv_items", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    req.onerror = (e) => reject(e);
  });
}

function saveItem(item) {
  return new Promise((resolve, reject) => {
    const store = tx("inv_items", "readwrite");
    const req = item.id ? store.put(item) : store.add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function getItem(id) {
  return new Promise((resolve, reject) => {
    const req = tx("inv_items", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

async function deleteItem(id) {
  const movs = await getMovsForItem(id);
  const store = tx("inv_movs", "readwrite");
  movs.forEach((m) => store.delete(m.id));
  return new Promise((resolve, reject) => {
    const req = tx("inv_items", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Inventario: movimientos ----------
function getMovsForItem(itemId) {
  return new Promise((resolve, reject) => {
    const req = tx("inv_movs", "readonly").index("itemId").getAll(itemId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
    req.onerror = (e) => reject(e);
  });
}

function addMov(mov) {
  return new Promise((resolve, reject) => {
    const req = tx("inv_movs", "readwrite").add(mov);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// ---------- Personal (trabajadores) ----------
function getAllWorkers() {
  return new Promise((resolve, reject) => {
    const req = tx("personal", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    req.onerror = (e) => reject(e);
  });
}

function getWorker(id) {
  return new Promise((resolve, reject) => {
    const req = tx("personal", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function saveWorker(worker) {
  return new Promise((resolve, reject) => {
    const store = tx("personal", "readwrite");
    const req = worker.id ? store.put(worker) : store.add(worker);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

async function deleteWorker(id) {
  const all = await new Promise((resolve, reject) => {
    const req = tx("asistencia", "readonly").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
  const store = tx("asistencia", "readwrite");
  all.filter((a) => a.workerId === id).forEach((a) => store.delete(a.id));
  return new Promise((resolve, reject) => {
    const req = tx("personal", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Asistencia ----------
function getAsistenciaForFecha(fecha) {
  return new Promise((resolve, reject) => {
    const req = tx("asistencia", "readonly").index("fecha").getAll(fecha);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function getAsistenciaRange(fechaInicio, fechaFin) {
  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound(fechaInicio, fechaFin);
    const req = tx("asistencia", "readonly").index("fecha").getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function getAsistenciaByWorkerFecha(workerFecha) {
  return new Promise((resolve, reject) => {
    const req = tx("asistencia", "readonly").index("workerFecha").get(workerFecha);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

async function upsertAsistencia({ workerId, fecha, estado, horasExtra }) {
  const workerFecha = `${workerId}_${fecha}`;
  const existing = await getAsistenciaByWorkerFecha(workerFecha);
  const record = {
    workerId, fecha, workerFecha,
    estado,
    horasExtra: horasExtra || 0,
  };
  if (existing) record.id = existing.id;
  return new Promise((resolve, reject) => {
    const store = tx("asistencia", "readwrite");
    const req = record.id ? store.put(record) : store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// ---------- Nómina: pagos registrados ----------
function getAllPagos() {
  return new Promise((resolve, reject) => {
    const req = tx("nomina_pagos", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fechaFin.localeCompare(a.fechaFin)));
    req.onerror = (e) => reject(e);
  });
}

function savePago(pago) {
  return new Promise((resolve, reject) => {
    const req = tx("nomina_pagos", "readwrite").add(pago);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deletePago(id) {
  return new Promise((resolve, reject) => {
    const req = tx("nomina_pagos", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Maquinaria: equipos ----------
function getAllEquipos() {
  return new Promise((resolve, reject) => {
    const req = tx("maq_equipos", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    req.onerror = (e) => reject(e);
  });
}

function getEquipo(id) {
  return new Promise((resolve, reject) => {
    const req = tx("maq_equipos", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function saveEquipo(equipo) {
  return new Promise((resolve, reject) => {
    const store = tx("maq_equipos", "readwrite");
    const req = equipo.id ? store.put(equipo) : store.add(equipo);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

async function deleteEquipo(id) {
  const usos = await getUsosForEquipo(id);
  const store = tx("maq_usos", "readwrite");
  usos.forEach((u) => store.delete(u.id));
  return new Promise((resolve, reject) => {
    const req = tx("maq_equipos", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Maquinaria: usos ----------
function getUsosForEquipo(equipoId) {
  return new Promise((resolve, reject) => {
    const req = tx("maq_usos", "readonly").index("equipoId").getAll(equipoId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
    req.onerror = (e) => reject(e);
  });
}

function addUso(uso) {
  return new Promise((resolve, reject) => {
    const req = tx("maq_usos", "readwrite").add(uso);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// ---------- Caja menor ----------
function getAllCajaMovs() {
  return new Promise((resolve, reject) => {
    const req = tx("caja_movs", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
    req.onerror = (e) => reject(e);
  });
}

function saveCajaMov(mov) {
  return new Promise((resolve, reject) => {
    const store = tx("caja_movs", "readwrite");
    const req = mov.id ? store.put(mov) : store.add(mov);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deleteCajaMov(id) {
  return new Promise((resolve, reject) => {
    const req = tx("caja_movs", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Pedidos de material ----------
function getAllPedidos() {
  return new Promise((resolve, reject) => {
    const req = tx("pedidos", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fechaSolicitud.localeCompare(a.fechaSolicitud) || b.id - a.id));
    req.onerror = (e) => reject(e);
  });
}

function getPedido(id) {
  return new Promise((resolve, reject) => {
    const req = tx("pedidos", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function savePedido(pedido) {
  return new Promise((resolve, reject) => {
    const store = tx("pedidos", "readwrite");
    const req = pedido.id ? store.put(pedido) : store.add(pedido);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deletePedido(id) {
  return new Promise((resolve, reject) => {
    const req = tx("pedidos", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Días trabajados ----------
function getAllDias(todasLasObras) {
  if (todasLasObras) {
    return getAllFromStore("dias_trabajados").then((list) => list.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
  }
  return new Promise((resolve, reject) => {
    const req = tx("dias_trabajados", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
    req.onerror = (e) => reject(e);
  });
}

function getDia(id) {
  return new Promise((resolve, reject) => {
    const req = tx("dias_trabajados", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function saveDia(dia) {
  return new Promise((resolve, reject) => {
    const store = tx("dias_trabajados", "readwrite");
    const req = dia.id ? store.put(dia) : store.add(dia);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deleteDia(id) {
  return new Promise((resolve, reject) => {
    const req = tx("dias_trabajados", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Tareas / pendientes ----------
function getAllTareas(todasLasObras) {
  const sortFn = (a, b) => a.fechaLimite.localeCompare(b.fechaLimite) || a.id - b.id;
  if (todasLasObras) {
    return getAllFromStore("tareas").then((list) => list.sort(sortFn));
  }
  return new Promise((resolve, reject) => {
    const req = tx("tareas", "readonly").index("obraId").getAll(currentObraId);
    req.onsuccess = () => resolve(req.result.sort(sortFn));
    req.onerror = (e) => reject(e);
  });
}

function getTarea(id) {
  return new Promise((resolve, reject) => {
    const req = tx("tareas", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function saveTarea(tarea) {
  return new Promise((resolve, reject) => {
    const store = tx("tareas", "readwrite");
    const req = tarea.id ? store.put(tarea) : store.add(tarea);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function deleteTarea(id) {
  return new Promise((resolve, reject) => {
    const req = tx("tareas", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- Utilidades ----------
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function formatFechaLarga(iso) {
  const [y, m, d] = iso.split("-");
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${meses[parseInt(m,10)-1]} ${y}`;
}

// Formato largo con día de la semana, para la Bitácora: "martes 12 de septiembre de 2026"
function nombreDiaSemana(fechaISO) {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return dias[new Date(fechaISO + "T00:00:00").getDay()];
}

function formatFechaCompleta(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const dia = nombreDiaSemana(iso);
  return `${capitalizar(dia)} ${parseInt(d, 10)} de ${meses[parseInt(m, 10) - 1]} de ${y}`;
}

function formatCOP(n) {
  return "$" + Math.round(n || 0).toLocaleString("es-CO");
}

function compressImage(file, maxWidth = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Navegación ----------
function goToScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.screen === name));
  document.getElementById("btnNewEntry").style.display = name === "bitacora" ? "flex" : "none";
  document.getElementById("btnNewItem").style.display = name === "inventario" ? "flex" : "none";
  document.getElementById("btnNewWorker").style.display = name === "asistencia" ? "flex" : "none";
  if (name === "inventario") renderItemList();
  if (name === "asistencia") renderAsistenciaScreen();
  if (name === "nomina") renderNominaScreen();
  document.getElementById("btnNewEquipo").style.display = name === "maquinaria" ? "flex" : "none";
  if (name === "maquinaria") renderEquipoList();
  document.getElementById("btnNewCaja").style.display = name === "caja" ? "flex" : "none";
  if (name === "caja") renderCajaScreen();
  document.getElementById("btnNewPedido").style.display = name === "pedidos" ? "flex" : "none";
  if (name === "pedidos") renderPedidosScreen();
  if (name === "herramientas" && !window._herramientasInit) {
    renderConvCategorias();
    renderConvUnidades();
    calcularConversion();
    window._herramientasInit = true;
  }
  document.getElementById("btnNewDia").style.display = name === "dias" ? "flex" : "none";
  if (name === "dias") renderDiasScreen();
  document.getElementById("btnNewTarea").style.display = name === "tareas" ? "flex" : "none";
  if (name === "tareas") renderTareasScreen();
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => goToScreen(btn.dataset.screen));
});

// ---------- Roadmap (Inicio) ----------
function renderRoadmap() {
  const el = document.getElementById("roadmapList");
  const roadmapTitle = document.getElementById("roadmapTitle");
  if (!ROADMAP.length) {
    if (roadmapTitle) roadmapTitle.style.display = "none";
    el.innerHTML = "";
    return;
  }
  if (roadmapTitle) roadmapTitle.style.display = "block";
  el.innerHTML = ROADMAP.map(
    (m) => `
    <div class="roadmap-card">
      <div class="icon">${m.icon}</div>
      <div>
        <div class="name">${m.name}</div>
        <div class="tag">Próximamente</div>
      </div>
    </div>`
  ).join("");
}

// ---------- Estadísticas ----------
async function renderStats() {
  const entries = await getAllEntries();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = entries.filter((e) => e.fecha.startsWith(ym));
  document.getElementById("statMonthCount").textContent = thisMonth.length;
  document.getElementById("statLastDate").textContent = entries.length
    ? formatFechaLarga(entries[0].fecha)
    : "—";
}

// ---------- Días trabajados ----------
const TIPOS_DIA = [
  { value: "Obra", cls: "sel-presente" },
  { value: "Informes", cls: "sel-incapacidad" },
  { value: "Oficina/Trámites", cls: "sel-pedido" },
  { value: "Otro", cls: "sel-permiso" },
];

let diasInicio, diasFin;
let diasFiltradasActuales = [];
let diasScope = "actual"; // "actual" | "todas"

function defaultDiasRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  diasInicio = first.toISOString().slice(0, 10);
  diasFin = now.toISOString().slice(0, 10);
}

function capitalizar(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

async function renderDiasScreen() {
  if (!diasInicio) defaultDiasRange();
  document.getElementById("diasInicioInput").value = diasInicio;
  document.getElementById("diasFinInput").value = diasFin;
  await filtrarYRenderDias();
}

// Une los días cargados a mano con los días que tienen registro en Bitácora.
// Un día (obra + fecha) cuenta una sola vez: si existe el manual, se usa ese.
async function getDiasUnificados(todasLasObras) {
  const manuales = await getAllDias(todasLasObras);
  const bit = todasLasObras ? await getAllFromStore("bitacora") : await getAllEntries();
  const claveManual = new Set(manuales.map((d) => d.obraId + "|" + d.fecha));
  const grupos = {};
  bit.forEach((e) => {
    const k = e.obraId + "|" + e.fecha;
    if (claveManual.has(k)) return;
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(e);
  });
  const derivados = Object.values(grupos).map((es) => ({
    id: "b" + es[0].id,
    origen: "bitacora",
    obraId: es[0].obraId,
    fecha: es[0].fecha,
    tipo: "Obra",
    descripcion: es.map((e) => e.actividades).filter(Boolean).join(" / "),
    entryIds: es.map((e) => e.id),
    cuenta: es.some((e) => e.cuentaComoDia !== false),
  }));
  const lista = [...manuales.map((d) => ({ ...d, origen: "manual", cuenta: true })), ...derivados];
  return lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.id).localeCompare(String(a.id)));
}

// Regla del domingo: si en una obra se trabajó de lunes a sábado de esa semana,
// el domingo también cuenta (aunque no haya registro ese día).
function armarSetsPorObra(contadas) {
  const sets = {};
  contadas.forEach((d) => { (sets[d.obraId] = sets[d.obraId] || new Set()).add(d.fecha); });
  return sets;
}

function semanaLunesSabadoCompleta(set, domingoISO) {
  for (let i = 1; i <= 6; i++) if (!set.has(addDiasISO(domingoISO, -i))) return false;
  return true;
}

// Domingos del periodo que cuentan por la regla y que no tienen registro propio.
function calcularDominicales(sets, inicio, fin) {
  const lista = [];
  for (let iso = inicio; iso <= fin; iso = addDiasISO(iso, 1)) {
    if (new Date(iso + "T00:00:00").getDay() !== 0) continue;
    Object.keys(sets).forEach((obraId) => {
      if (!sets[obraId].has(iso) && semanaLunesSabadoCompleta(sets[obraId], iso)) lista.push({ obraId: Number(obraId), fecha: iso });
    });
  }
  return lista;
}

let diasContadasTodasActuales = [];
let diasDominicalesActuales = [];

async function toggleDiaBitacora(ids, nuevoValor) {
  const todas = await getAllFromStore("bitacora");
  for (const id of ids) {
    const e = todas.find((x) => x.id === id);
    if (e) { e.cuentaComoDia = nuevoValor; await saveEntry(e); }
  }
  showToast(nuevoValor ? "El día vuelve a contar" : "Día marcado como no trabajado");
  filtrarYRenderDias();
  renderEntryList();
}

async function filtrarYRenderDias() {
  const modoTodas = diasScope === "todas";
  const todas = await getDiasUnificados(modoTodas);
  const filtradasTodas = todas.filter((d) => d.fecha >= diasInicio && d.fecha <= diasFin);
  const filtradas = filtradasTodas.filter((d) => d.cuenta);
  const excluidos = filtradasTodas.length - filtradas.length;
  diasFiltradasActuales = filtradas;
  diasContadasTodasActuales = todas.filter((d) => d.cuenta);
  diasDominicalesActuales = calcularDominicales(armarSetsPorObra(diasContadasTodasActuales), diasInicio, diasFin);
  const totalConDominicales = filtradas.length + diasDominicalesActuales.length;

  let obraNombreMap = {};
  if (modoTodas) {
    const obras = await getAllObras();
    obras.forEach((o) => { obraNombreMap[o.id] = o.nombre; });
  }

  const porObra = {};
  if (modoTodas) {
    filtradas.forEach((d) => {
      const nombre = obraNombreMap[d.obraId] || "Obra eliminada";
      porObra[nombre] = (porObra[nombre] || 0) + 1;
    });
  }
  const desgloseObras = Object.entries(porObra).map(([nombre, n]) => `${n} en ${nombre}`).join(" · ");

  document.getElementById("diasStats").innerHTML = `
    <div class="stat-row">
      <div class="stat-box"><div class="num">${totalConDominicales}</div><div class="label">DÍAS TRABAJADOS EN EL PERIODO</div></div>
    </div>
    ${diasDominicalesActuales.length ? `<p class="backup-note" style="margin: -6px 0 14px;">Incluye ${filtradas.length} día${filtradas.length === 1 ? "" : "s"} registrado${filtradas.length === 1 ? "" : "s"} + ${diasDominicalesActuales.length} dominical${diasDominicalesActuales.length === 1 ? "" : "es"} (domingo que cuenta por haber trabajado de lunes a sábado).</p>` : ""}
    ${modoTodas && desgloseObras ? `<p class="backup-note" style="margin: -6px 0 14px;">${desgloseObras}</p>` : ""}
    ${excluidos ? `<p class="backup-note" style="margin: -6px 0 14px;">${excluidos} día${excluidos > 1 ? "s" : ""} de Bitácora marcado${excluidos > 1 ? "s" : ""} como "No cuenta" (no suma${excluidos > 1 ? "n" : ""} aquí ni en el Excel).</p>` : ""}`;

  const listEl = document.getElementById("diasList");
  if (!filtradasTodas.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="big">📅</div>
        <p>No hay días registrados en este periodo.<br>Toca el botón + para registrar uno.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtradasTodas.map((d) => renderDiaCard(d, obraNombreMap[d.obraId])).join("");
  listEl.querySelectorAll(".entry-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  listEl.querySelectorAll("[data-action='edit-dia']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openEditDiaModal(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='delete-dia']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); handleDeleteDia(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='toggle-dia-bitacora']").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleDiaBitacora(btn.dataset.ids.split(",").map(Number), btn.dataset.cuenta === "1");
    });
  });
}

function renderDiaCard(d, obraNombre) {
  const meta = TIPOS_DIA.find((t) => t.value === d.tipo) || TIPOS_DIA[0];
  const deBitacora = d.origen === "bitacora";
  const acciones = deBitacora
    ? `<button class="btn ${d.cuenta ? "btn-danger" : "btn-primary"}" data-action="toggle-dia-bitacora" data-ids="${d.entryIds.join(",")}" data-cuenta="${d.cuenta ? "0" : "1"}">${d.cuenta ? "Marcar como NO trabajado" : "Volver a contar este día"}</button>`
    : `<button class="btn btn-secondary" data-action="edit-dia" data-id="${d.id}">Editar</button>
       <button class="btn btn-danger" data-action="delete-dia" data-id="${d.id}">Eliminar</button>`;
  return `
  <div class="entry ${d.cuenta ? "" : "dia-excluido"}" data-id="${d.id}">
    <div class="entry-head">
      <div>
        <div class="entry-date">${formatFechaLarga(d.fecha)}</div>
        <div class="entry-meta">${capitalizar(nombreDiaSemana(d.fecha))}${obraNombre ? " · " + escapeHtml(obraNombre) : ""}${deBitacora ? " · 📖 Bitácora" : ""}</div>
      </div>
      <div style="text-align:right;">
        <span class="chip ${d.cuenta ? meta.cls : ""}" style="pointer-events:none; padding:5px 10px; font-size:0.72rem;">${d.cuenta ? d.tipo : "No cuenta"}</span>
        <span class="entry-caret">▾</span>
      </div>
    </div>
    <div class="entry-body">
      ${d.descripcion ? `<div class="entry-block"><div class="k">${deBitacora ? "Actividades de la bitácora" : "Qué se hizo (solo visible en la app)"}</div><div class="v">${escapeHtml(d.descripcion)}</div></div>` : ""}
      ${deBitacora ? `<p class="backup-note">Este día viene de tu Bitácora. Para cambiar su contenido, edítalo allá.</p>` : ""}
      <div class="entry-actions">${acciones}</div>
    </div>
  </div>`;
}

async function handleDeleteDia(id) {
  if (!confirm("¿Eliminar este día registrado?")) return;
  await deleteDia(id);
  showToast("Día eliminado");
  filtrarYRenderDias();
}

document.getElementById("diasInicioInput").addEventListener("change", (e) => { diasInicio = e.target.value; filtrarYRenderDias(); });
document.getElementById("diasFinInput").addEventListener("change", (e) => { diasFin = e.target.value; filtrarYRenderDias(); });
document.querySelectorAll("#diasScopeChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#diasScopeChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente"));
    chip.classList.add("selected", "sel-presente");
    diasScope = chip.dataset.value;
    filtrarYRenderDias();
  });
});

// ---------- Días trabajados: modal ----------
const diaModal = document.getElementById("diaModal");
const diaForm = document.getElementById("diaForm");
let editingDiaId = null;
let editingDiaObraId = null;

function openNewDiaModal() {
  editingDiaId = null;
  editingDiaObraId = null;
  diaForm.reset();
  document.getElementById("diaModalTitle").textContent = "Nuevo día trabajado";
  document.getElementById("d-fecha").value = new Date().toISOString().slice(0, 10);
  document.querySelectorAll("#diaTipoChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente", "sel-incapacidad", "sel-pedido", "sel-permiso"));
  const primero = document.querySelector("#diaTipoChips .chip");
  primero.classList.add("selected", "sel-presente");
  diaModal.classList.add("open");
}

async function openEditDiaModal(id) {
  const d = await getDia(id);
  if (!d) return;
  editingDiaId = id;
  editingDiaObraId = d.obraId;
  document.getElementById("diaModalTitle").textContent = "Editar día trabajado";
  document.getElementById("d-fecha").value = d.fecha;
  document.getElementById("d-descripcion").value = d.descripcion || "";
  document.querySelectorAll("#diaTipoChips .chip").forEach((c) => {
    c.classList.remove("selected", "sel-presente", "sel-incapacidad", "sel-pedido", "sel-permiso");
    if (c.dataset.value === d.tipo) {
      const meta = TIPOS_DIA.find((t) => t.value === d.tipo);
      c.classList.add("selected", meta ? meta.cls : "sel-presente");
    }
  });
  diaModal.classList.add("open");
}

function closeDiaModal() { diaModal.classList.remove("open"); }
document.getElementById("btnNewDia").addEventListener("click", openNewDiaModal);
document.getElementById("closeDiaModal").addEventListener("click", closeDiaModal);
diaModal.addEventListener("click", (e) => { if (e.target === diaModal) closeDiaModal(); });

document.querySelectorAll("#diaTipoChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#diaTipoChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente", "sel-incapacidad", "sel-pedido", "sel-permiso"));
    const meta = TIPOS_DIA.find((t) => t.value === chip.dataset.value);
    chip.classList.add("selected", meta ? meta.cls : "sel-presente");
  });
});

diaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipo = document.querySelector("#diaTipoChips .chip.selected")?.dataset.value || "Obra";
  const dia = {
    obraId: editingDiaId ? editingDiaObraId : currentObraId,
    fecha: document.getElementById("d-fecha").value,
    tipo,
    descripcion: document.getElementById("d-descripcion").value.trim(),
  };
  if (editingDiaId) dia.id = editingDiaId;
  await saveDia(dia);
  closeDiaModal();
  showToast("Día guardado");
  filtrarYRenderDias();
});

// ---------- Días trabajados: reporte en Excel (estilo calendario, igual al de Nómina) ----------
document.getElementById("btnReporteExcel").addEventListener("click", async () => {
  if (!diasFiltradasActuales.length && !diasDominicalesActuales.length) { showToast("No hay días en este periodo para exportar"); return; }
  if (typeof ExcelJS === "undefined") { showToast("No se pudo cargar el generador de Excel"); return; }

  const btn = document.getElementById("btnReporteExcel");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando…";

  try {
    const modoTodas = diasScope === "todas";
    const obraNombre = document.getElementById("projectName").textContent;
    const obras = await getAllObras();
    const nombreDeObra = {};
    obras.forEach((o) => { nombreDeObra[o.id] = o.nombre; });

    const setsPorObra = armarSetsPorObra(diasContadasTodasActuales);
    // Una fila por obra que tenga días en el periodo (en "Esta obra" es una sola).
    const idsObras = [...new Set([...diasFiltradasActuales.map((d) => d.obraId), ...diasDominicalesActuales.map((d) => d.obraId)])]
      .sort((a, b) => (nombreDeObra[a] || "").localeCompare(nombreDeObra[b] || ""));

    function valorDia(obraId, iso) {
      const set = setsPorObra[obraId] || new Set();
      if (new Date(iso + "T00:00:00").getDay() === 0) return set.has(iso) || semanaLunesSabadoCompleta(set, iso);
      return set.has(iso);
    }

    const bloques = dividirEnBloques(diasInicio, diasFin);
    const COL_FIJAS = 2; // #, OBRA
    const AZUL = "FF16324F", VERDE = "FF3D7A4D", NARANJA = "FFE07B39";
    const borde = { top: { style: "thin", color: { argb: "FFDDDDDD" } }, left: { style: "thin", color: { argb: "FFDDDDDD" } }, bottom: { style: "thin", color: { argb: "FFDDDDDD" } }, right: { style: "thin", color: { argb: "FFDDDDDD" } } };
    const relleno = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Residente de Obra";
    wb.created = new Date();
    const ws = wb.addWorksheet("Calendario");

    ws.getCell("A1").value = `Reporte de días trabajados — ${modoTodas ? "Todas las obras" : obraNombre}`;
    ws.getCell("A1").font = { bold: true, size: 13, color: { argb: AZUL } };
    ws.getCell("A2").value = `Periodo: ${formatFechaLarga(diasInicio)} — ${formatFechaLarga(diasFin)}`;
    ws.getCell("A2").font = { size: 10, color: { argb: "FF5B6960" } };
    let filaActual = 4;
    const totalesGenerales = {};
    let maxCols = 0;

    bloques.forEach((bloque, idxBloque) => {
      const dias = [];
      for (let d = bloque.inicio; d <= bloque.fin; d = addDiasISO(d, 1)) dias.push(d);
      const numColsDias = dias.length;
      const colTotalBloque = COL_FIJAS + numColsDias + 1;
      const esUltimoBloque = idxBloque === bloques.length - 1;
      const totalCols = esUltimoBloque ? colTotalBloque + 1 : colTotalBloque;
      maxCols = Math.max(maxCols, totalCols);

      // Título del bloque (mes o rango de meses)
      ws.mergeCells(filaActual, COL_FIJAS + 1, filaActual, COL_FIJAS + numColsDias);
      const tituloCell = ws.getCell(filaActual, COL_FIJAS + 1);
      tituloCell.value = tituloBloqueCalendario(bloque.inicio, bloque.fin);
      tituloCell.font = { bold: true, size: 12 };
      tituloCell.alignment = { horizontal: "center" };

      // Letras de día de la semana
      const filaLetras = filaActual + 1;
      ws.getCell(filaLetras, 1).value = "#";
      ws.getCell(filaLetras, 2).value = "OBRA";
      ws.getCell(filaLetras, colTotalBloque).value = "TOTAL DÍAS";
      if (esUltimoBloque) ws.getCell(filaLetras, colTotalBloque + 1).value = "TOTAL GENERAL";
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(filaLetras, c);
        if (c <= COL_FIJAS || c > COL_FIJAS + numColsDias) {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = relleno(AZUL);
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        }
      }
      ws.getRow(filaLetras).height = 30;
      dias.forEach((iso, i) => {
        const dow = new Date(iso + "T00:00:00").getDay();
        const cell = ws.getCell(filaLetras, COL_FIJAS + 1 + i);
        cell.value = LETRA_DIA_SEMANA[dow];
        cell.font = { bold: true, color: { argb: dow === 0 ? "FFFFFFFF" : AZUL } };
        cell.alignment = { horizontal: "center" };
        if (dow === 0) cell.fill = relleno(NARANJA);
      });

      // Números del día
      const filaNums = filaActual + 2;
      dias.forEach((iso, i) => {
        const dow = new Date(iso + "T00:00:00").getDay();
        const cell = ws.getCell(filaNums, COL_FIJAS + 1 + i);
        cell.value = parseInt(iso.split("-")[2], 10);
        cell.font = { bold: true, color: { argb: dow === 0 ? "FFFFFFFF" : "FF1C2620" } };
        cell.alignment = { horizontal: "center" };
        if (dow === 0) cell.fill = relleno(NARANJA);
      });

      // Una fila por obra
      idsObras.forEach((obraId, idxO) => {
        const fila = filaActual + 3 + idxO;
        ws.getCell(fila, 1).value = idxO + 1;
        ws.getCell(fila, 2).value = nombreDeObra[obraId] || "Obra eliminada";
        let totalBloque = 0;
        dias.forEach((iso, i) => {
          const dow = new Date(iso + "T00:00:00").getDay();
          const trabajo = valorDia(obraId, iso);
          if (trabajo) totalBloque++;
          const cell = ws.getCell(fila, COL_FIJAS + 1 + i);
          if (dow === 0) {
            cell.value = trabajo ? 1 : 0;
            cell.fill = relleno("FFF4C9A8");
            cell.font = { color: { argb: "FF8A4A1E" } };
          } else if (trabajo) {
            cell.value = 1;
            cell.fill = relleno("FFBEE3EF");
            cell.font = { bold: true, color: { argb: "FF0F5068" } };
          }
          cell.alignment = { horizontal: "center" };
          cell.border = borde;
        });
        const totalCell = ws.getCell(fila, colTotalBloque);
        totalCell.value = totalBloque;
        totalCell.font = { bold: true };
        totalCell.alignment = { horizontal: "center" };
        totalesGenerales[obraId] = (totalesGenerales[obraId] || 0) + totalBloque;
        if (esUltimoBloque) {
          const tg = ws.getCell(fila, colTotalBloque + 1);
          tg.value = totalesGenerales[obraId];
          tg.font = { bold: true, color: { argb: VERDE } };
          tg.alignment = { horizontal: "center" };
        }
        ws.getCell(fila, 2).border = borde;
        ws.getCell(fila, 1).border = borde;
        ws.getCell(fila, 1).alignment = { horizontal: "center" };
      });

      // Fila TOTAL cuando hay más de una obra
      let filasUsadas = idsObras.length;
      if (idsObras.length > 1) {
        const filaT = filaActual + 3 + idsObras.length;
        ws.getCell(filaT, 2).value = "TOTAL";
        let suma = 0;
        idsObras.forEach((obraId) => dias.forEach((iso) => { if (valorDia(obraId, iso)) suma++; }));
        const tc = ws.getCell(filaT, colTotalBloque);
        tc.value = suma;
        if (esUltimoBloque) {
          const tgc = ws.getCell(filaT, colTotalBloque + 1);
          tgc.value = idsObras.reduce((a, id) => a + (totalesGenerales[id] || 0), 0);
          tgc.font = { bold: true, color: { argb: VERDE } };
          tgc.alignment = { horizontal: "center" };
        }
        for (let c = 1; c <= totalCols; c++) {
          const cell = ws.getCell(filaT, c);
          cell.border = { top: { style: "medium", color: { argb: AZUL } } };
          if (c === 2 || c === colTotalBloque) cell.font = { bold: true };
          if (c === colTotalBloque) cell.alignment = { horizontal: "center" };
        }
        filasUsadas++;
      }
      filaActual = filaActual + 3 + filasUsadas + 2;
    });

    ws.getCell(filaActual, 1).value = "Celeste = día trabajado (1). Los domingos (naranja) valen 1 cuando se trabajó de lunes a sábado de esa semana. Los días marcados \"No cuenta\" no se incluyen.";
    ws.getCell(filaActual, 1).font = { italic: true, size: 9, color: { argb: "FF5B6960" } };
    ws.getColumn(1).width = 4;
    ws.getColumn(2).width = 26;
    for (let c = COL_FIJAS + 1; c <= maxCols; c++) ws.getColumn(c).width = 6;
    // Las columnas de totales son más anchas (están al final de cada bloque: 28 días, o menos en el último)
    for (let c = COL_FIJAS + 1; c <= maxCols; c++) {
      const v = ws.getCell(5, c).value;
      if (typeof v === "string" && v.startsWith("TOTAL")) ws.getColumn(c).width = 12;
    }
    ws.getColumn(COL_FIJAS + 29).width = Math.max(ws.getColumn(COL_FIJAS + 29).width || 6, 12);
    ws.getColumn(COL_FIJAS + 30).width = Math.max(ws.getColumn(COL_FIJAS + 30).width || 6, 14);

    // ---- Hoja 2: detalle (fecha, día, obra, tipo) ----
    const wd = wb.addWorksheet("Detalle");
    wd.columns = [{ width: 16 }, { width: 18 }, { width: 26 }, { width: 24 }];
    wd.mergeCells("A1:D1");
    wd.getCell("A1").value = "Detalle de días trabajados";
    wd.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    wd.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    wd.getCell("A1").fill = relleno(AZUL);
    wd.getRow(1).height = 26;
    wd.addRow([]);
    const enc = wd.addRow(["Fecha", "Día de la semana", "Obra", "Tipo de actividad"]);
    enc.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = relleno(VERDE);
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    const filasDetalle = [
      ...diasFiltradasActuales.map((d) => ({ fecha: d.fecha, obraId: d.obraId, tipo: d.tipo || "—" })),
      ...diasDominicalesActuales.map((d) => ({ fecha: d.fecha, obraId: d.obraId, tipo: "Dominical (trabajó L–S)" })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha) || (nombreDeObra[a.obraId] || "").localeCompare(nombreDeObra[b.obraId] || ""));
    filasDetalle.forEach((f) => {
      const row = wd.addRow([formatFechaLarga(f.fecha), capitalizar(nombreDiaSemana(f.fecha)), nombreDeObra[f.obraId] || "—", f.tipo]);
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { horizontal: "center" };
      });
    });
    wd.addRow([]);
    const totRow = wd.addRow(["Total días", "", "", filasDetalle.length]);
    totRow.font = { bold: true };
    wd.views = [{ state: "frozen", ySplit: 3 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseNombre = modoTodas ? "todas-las-obras" : obraNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    a.download = `dias-trabajados-${baseNombre}-${diasInicio}_a_${diasFin}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Reporte Excel descargado");
  } catch (err) {
    console.error(err);
    showToast("No se pudo generar el Excel");
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

// ---------- Tareas / pendientes ----------
const PRIORIDADES_TAREA = [
  { value: "Alta", cls: "sel-ausente" },
  { value: "Media", cls: "sel-pedido" },
  { value: "Baja", cls: "sel-permiso" },
];

let tareasScope = "actual"; // "actual" | "todas"
let tareasFiltro = "pendientes"; // "todas" | "pendientes" | "completadas"

function calcularUrgencia(tarea) {
  if (tarea.estado === "completada") return "completada";
  const hoy = new Date().toISOString().slice(0, 10);
  if (tarea.fechaLimite < hoy) return "vencida";
  const anticipacion = tarea.diasAnticipacion ?? 2;
  const limite = new Date(tarea.fechaLimite + "T00:00:00");
  const hoyDate = new Date(hoy + "T00:00:00");
  const diffDias = Math.round((limite - hoyDate) / 86400000);
  if (diffDias <= anticipacion) return "proxima";
  return "normal";
}

async function renderTareasScreen() {
  const modoTodas = tareasScope === "todas";
  const todas = await getAllTareas(modoTodas);

  let obraNombreMap = {};
  if (modoTodas) {
    const obras = await getAllObras();
    obras.forEach((o) => { obraNombreMap[o.id] = o.nombre; });
  }

  const vencidas = todas.filter((t) => calcularUrgencia(t) === "vencida");
  const proximas = todas.filter((t) => calcularUrgencia(t) === "proxima");
  document.getElementById("tareasStats").innerHTML = `
    <div class="stat-row">
      <div class="stat-box" style="border-left-color: var(--orange);"><div class="num" style="color:var(--orange-dark);">${vencidas.length}</div><div class="label">VENCIDAS</div></div>
      <div class="stat-box" style="border-left-color: #2E6E8E;"><div class="num" style="color:#2E6E8E;">${proximas.length}</div><div class="label">PRÓXIMAS A VENCER</div></div>
    </div>`;

  const filtradas = todas.filter((t) => {
    if (tareasFiltro === "pendientes") return t.estado !== "completada";
    if (tareasFiltro === "completadas") return t.estado === "completada";
    return true;
  });

  const listEl = document.getElementById("tareasList");
  if (!filtradas.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="big">✅</div>
        <p>No hay tareas ${tareasFiltro === "completadas" ? "completadas" : "pendientes"} para mostrar.<br>Toca el botón + para crear una.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtradas.map((t) => renderTareaCard(t, obraNombreMap[t.obraId])).join("");
  listEl.querySelectorAll(".entry-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  listEl.querySelectorAll("[data-action='edit-tarea']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openEditTareaModal(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='delete-tarea']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); handleDeleteTarea(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='toggle-tarea']").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const t = await getTarea(parseInt(btn.dataset.id));
      t.estado = t.estado === "completada" ? "pendiente" : "completada";
      await saveTarea(t);
      renderTareasScreen();
    });
  });
}

function renderTareaCard(t, obraNombre) {
  const urgencia = calcularUrgencia(t);
  const prioMeta = PRIORIDADES_TAREA.find((p) => p.value === t.prioridad) || PRIORIDADES_TAREA[1];
  const urgenciaBorde = urgencia === "vencida" ? "var(--orange)" : urgencia === "proxima" ? "#2E6E8E" : urgencia === "completada" ? "var(--ink-soft)" : "var(--turf)";
  const urgenciaTexto = urgencia === "vencida" ? "⚠ Vencida" : urgencia === "proxima" ? "⏰ Próxima a vencer" : urgencia === "completada" ? "✓ Completada" : "";

  return `
  <div class="entry item-card" data-id="${t.id}" style="border-left-color:${urgenciaBorde};">
    <div class="entry-head">
      <div>
        <div class="entry-date" style="${urgencia === "completada" ? "text-decoration:line-through; color:var(--ink-soft);" : ""}">${escapeHtml(t.titulo)}</div>
        <div class="entry-meta">Límite: ${formatFechaLarga(t.fechaLimite)}${obraNombre ? " · " + escapeHtml(obraNombre) : ""}${urgenciaTexto ? " · " + urgenciaTexto : ""}</div>
      </div>
      <div style="text-align:right;">
        <span class="chip ${prioMeta.cls}" style="pointer-events:none; padding:5px 10px; font-size:0.72rem;">${t.prioridad}</span>
        <span class="entry-caret">▾</span>
      </div>
    </div>
    <div class="entry-body">
      ${t.descripcion ? `<div class="entry-block"><div class="k">Descripción</div><div class="v">${escapeHtml(t.descripcion)}</div></div>` : ""}
      <div class="entry-actions">
        <button class="btn btn-primary" data-action="toggle-tarea" data-id="${t.id}">${t.estado === "completada" ? "↺ Marcar pendiente" : "✓ Marcar completada"}</button>
        <button class="btn btn-secondary" data-action="edit-tarea" data-id="${t.id}">Editar</button>
        <button class="btn btn-danger" data-action="delete-tarea" data-id="${t.id}">Eliminar</button>
      </div>
    </div>
  </div>`;
}

async function handleDeleteTarea(id) {
  if (!confirm("¿Eliminar esta tarea?")) return;
  await deleteTarea(id);
  showToast("Tarea eliminada");
  renderTareasScreen();
}

document.querySelectorAll("#tareasScopeChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#tareasScopeChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente"));
    chip.classList.add("selected", "sel-presente");
    tareasScope = chip.dataset.value;
    renderTareasScreen();
  });
});

document.querySelectorAll("#tareasFiltroChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#tareasFiltroChips .chip").forEach((c) => c.classList.remove("selected", "sel-incapacidad"));
    chip.classList.add("selected", "sel-incapacidad");
    tareasFiltro = chip.dataset.value;
    renderTareasScreen();
  });
});

// ---------- Tareas: modal ----------
const tareaModal = document.getElementById("tareaModal");
const tareaForm = document.getElementById("tareaForm");
let editingTareaId = null;
let editingTareaObraId = null;

function openNewTareaModal() {
  editingTareaId = null;
  editingTareaObraId = null;
  tareaForm.reset();
  document.getElementById("tareaModalTitle").textContent = "Nueva tarea";
  document.getElementById("t-fechaLimite").value = new Date().toISOString().slice(0, 10);
  document.getElementById("t-anticipacion").value = 2;
  document.querySelectorAll("#tareaPrioridadChips .chip").forEach((c) => c.classList.remove("selected", "sel-ausente", "sel-pedido", "sel-permiso"));
  const media = document.querySelector("#tareaPrioridadChips .chip[data-value='Media']");
  media.classList.add("selected", "sel-pedido");
  tareaModal.classList.add("open");
}

async function openEditTareaModal(id) {
  const t = await getTarea(id);
  if (!t) return;
  editingTareaId = id;
  editingTareaObraId = t.obraId;
  document.getElementById("tareaModalTitle").textContent = "Editar tarea";
  document.getElementById("t-titulo").value = t.titulo;
  document.getElementById("t-descripcion").value = t.descripcion || "";
  document.getElementById("t-fechaLimite").value = t.fechaLimite;
  document.getElementById("t-anticipacion").value = t.diasAnticipacion ?? 2;
  document.querySelectorAll("#tareaPrioridadChips .chip").forEach((c) => {
    c.classList.remove("selected", "sel-ausente", "sel-pedido", "sel-permiso");
    if (c.dataset.value === t.prioridad) {
      const meta = PRIORIDADES_TAREA.find((p) => p.value === t.prioridad);
      c.classList.add("selected", meta.cls);
    }
  });
  tareaModal.classList.add("open");
}

function closeTareaModal() { tareaModal.classList.remove("open"); }
document.getElementById("btnNewTarea").addEventListener("click", openNewTareaModal);
document.getElementById("closeTareaModal").addEventListener("click", closeTareaModal);
tareaModal.addEventListener("click", (e) => { if (e.target === tareaModal) closeTareaModal(); });

document.querySelectorAll("#tareaPrioridadChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#tareaPrioridadChips .chip").forEach((c) => c.classList.remove("selected", "sel-ausente", "sel-pedido", "sel-permiso"));
    const meta = PRIORIDADES_TAREA.find((p) => p.value === chip.dataset.value);
    chip.classList.add("selected", meta.cls);
  });
});

tareaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prioridad = document.querySelector("#tareaPrioridadChips .chip.selected")?.dataset.value || "Media";
  const tarea = {
    obraId: editingTareaId ? editingTareaObraId : currentObraId,
    titulo: document.getElementById("t-titulo").value.trim(),
    descripcion: document.getElementById("t-descripcion").value.trim(),
    fechaLimite: document.getElementById("t-fechaLimite").value,
    diasAnticipacion: parseInt(document.getElementById("t-anticipacion").value) || 0,
    prioridad,
    estado: "pendiente",
  };
  if (editingTareaId) {
    tarea.id = editingTareaId;
    const existente = await getTarea(editingTareaId);
    tarea.estado = existente.estado;
  }
  await saveTarea(tarea);
  closeTareaModal();
  showToast("Tarea guardada");
  renderTareasScreen();
  renderInicioTareasBanner();
});

// ---------- Tareas: banner en Inicio + notificaciones ----------
async function renderInicioTareasBanner() {
  const todas = await getAllTareas(true); // siempre across todas las obras para el resumen de Inicio
  const vencidas = todas.filter((t) => calcularUrgencia(t) === "vencida");
  const proximas = todas.filter((t) => calcularUrgencia(t) === "proxima");
  const el = document.getElementById("inicioTareasBanner");
  if (!vencidas.length && !proximas.length) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="low-stock-banner" style="cursor:pointer;" id="inicioTareasBannerClick">
      ${vencidas.length ? `⚠ Tienes <b>${vencidas.length}</b> tarea${vencidas.length > 1 ? "s" : ""} vencida${vencidas.length > 1 ? "s" : ""}.` : ""}
      ${proximas.length ? ` ⏰ <b>${proximas.length}</b> próxima${proximas.length > 1 ? "s" : ""} a vencer.` : ""}
      <span style="text-decoration:underline;">Ver pendientes →</span>
    </div>`;
  document.getElementById("inicioTareasBannerClick").addEventListener("click", () => goToScreen("tareas"));
}

async function checkYNotificarTareas() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const ultimaNotif = await getSetting("ultimaNotificacionTareasFecha");
  if (ultimaNotif === hoyISO) return; // ya se notificó hoy

  const todas = await getAllTareas(true);
  const vencidas = todas.filter((t) => calcularUrgencia(t) === "vencida");
  const proximas = todas.filter((t) => calcularUrgencia(t) === "proxima");
  if (!vencidas.length && !proximas.length) return;

  const partes = [];
  if (vencidas.length) partes.push(`${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""}`);
  if (proximas.length) partes.push(`${proximas.length} próxima${proximas.length > 1 ? "s" : ""} a vencer`);

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification("Residente de Obra — Pendientes", {
        body: `Tienes ${partes.join(" y ")}.`,
        icon: "icon-192.png",
        badge: "icon-192.png",
      });
    } else {
      new Notification("Residente de Obra — Pendientes", { body: `Tienes ${partes.join(" y ")}.` });
    }
    await setSetting("ultimaNotificacionTareasFecha", hoyISO);
  } catch (err) { console.error("Notificación:", err); }
}

async function renderNotifSettings() {
  const status = document.getElementById("notifStatus");
  const btn = document.getElementById("btnActivarNotif");
  if (!("Notification" in window)) { status.textContent = "Tu navegador no soporta notificaciones."; btn.style.display = "none"; return; }
  if (Notification.permission === "granted") {
    status.textContent = "✓ Notificaciones activadas — se avisa una vez al día si tienes tareas vencidas o próximas a vencer.";
    status.style.color = "var(--turf-dark)";
    btn.style.display = "none";
  } else if (Notification.permission === "denied") {
    status.textContent = "Notificaciones bloqueadas desde el navegador. Puedes activarlas desde los ajustes de sitio de Chrome.";
    status.style.color = "var(--orange-dark)";
    btn.style.display = "none";
  } else {
    status.textContent = "Sin activar. La app te avisa (dentro de la app) igual, pero con notificaciones también aparece en tu bandeja de notificaciones.";
    status.style.color = "var(--ink-soft)";
    btn.style.display = "inline-flex";
  }
}

document.getElementById("btnActivarNotif").addEventListener("click", async () => {
  const permiso = await Notification.requestPermission();
  await renderNotifSettings();
  if (permiso === "granted") {
    showToast("Notificaciones activadas");
    checkYNotificarTareas();
  }
});

// ---------- Herramientas: conversor de unidades ----------
const UNIDADES = {
  longitud: {
    label: "Longitud",
    unidades: {
      mm: { label: "Milímetros (mm)", factor: 0.001 },
      cm: { label: "Centímetros (cm)", factor: 0.01 },
      m: { label: "Metros (m)", factor: 1 },
      km: { label: "Kilómetros (km)", factor: 1000 },
      pulg: { label: "Pulgadas (in)", factor: 0.0254 },
      pie: { label: "Pies (ft)", factor: 0.3048 },
      yarda: { label: "Yardas (yd)", factor: 0.9144 },
    },
  },
  area: {
    label: "Área",
    unidades: {
      cm2: { label: "Centímetros² (cm²)", factor: 0.0001 },
      m2: { label: "Metros² (m²)", factor: 1 },
      ha: { label: "Hectáreas (ha)", factor: 10000 },
      pie2: { label: "Pies² (ft²)", factor: 0.092903 },
      pulg2: { label: "Pulgadas² (in²)", factor: 0.00064516 },
    },
  },
  volumen: {
    label: "Volumen",
    unidades: {
      ml: { label: "Mililitros (ml)", factor: 0.000001 },
      l: { label: "Litros (L)", factor: 0.001 },
      m3: { label: "Metros³ (m³)", factor: 1 },
      pie3: { label: "Pies³ (ft³)", factor: 0.0283168 },
      gal: { label: "Galones (gal US)", factor: 0.00378541 },
    },
  },
  peso: {
    label: "Peso",
    unidades: {
      g: { label: "Gramos (g)", factor: 0.001 },
      kg: { label: "Kilogramos (kg)", factor: 1 },
      arroba: { label: "Arrobas", factor: 12.5 },
      ton: { label: "Toneladas (t)", factor: 1000 },
      lb: { label: "Libras (lb)", factor: 0.453592 },
    },
  },
};

let convCategoria = "longitud";

function renderConvCategorias() {
  const el = document.getElementById("convCategorias");
  el.innerHTML = Object.entries(UNIDADES).map(([key, cat]) =>
    `<div class="chip ${key === convCategoria ? "selected sel-incapacidad" : ""}" data-cat="${key}">${cat.label}</div>`
  ).join("");
  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      convCategoria = chip.dataset.cat;
      renderConvCategorias();
      renderConvUnidades();
      calcularConversion();
    });
  });
}

function renderConvUnidades() {
  const unidades = UNIDADES[convCategoria].unidades;
  const fromSel = document.getElementById("convFrom");
  const toSel = document.getElementById("convTo");
  const options = Object.entries(unidades).map(([key, u]) => `<option value="${key}">${u.label}</option>`).join("");
  fromSel.innerHTML = options;
  toSel.innerHTML = options;
  const keys = Object.keys(unidades);
  fromSel.value = keys[0];
  toSel.value = keys.length > 1 ? keys[1] : keys[0];
}

function calcularConversion() {
  const valor = parseFloat(document.getElementById("convValor").value);
  const resultEl = document.getElementById("convResultado");
  if (isNaN(valor)) { resultEl.textContent = "—"; return; }
  const unidades = UNIDADES[convCategoria].unidades;
  const fromU = unidades[document.getElementById("convFrom").value];
  const toU = unidades[document.getElementById("convTo").value];
  const enBase = valor * fromU.factor;
  const resultado = enBase / toU.factor;
  const formateado = Math.abs(resultado) >= 1000 ? resultado.toLocaleString("es-CO", { maximumFractionDigits: 3 }) : (Math.round(resultado * 100000) / 100000).toString();
  resultEl.textContent = formateado;
}

document.getElementById("convValor").addEventListener("input", calcularConversion);
document.getElementById("convFrom").addEventListener("change", calcularConversion);
document.getElementById("convTo").addEventListener("change", calcularConversion);
document.getElementById("convSwap").addEventListener("click", () => {
  const fromSel = document.getElementById("convFrom");
  const toSel = document.getElementById("convTo");
  const tmp = fromSel.value;
  fromSel.value = toSel.value;
  toSel.value = tmp;
  calcularConversion();
});

// ---------- Lista de bitácora ----------
async function renderEntryList() {
  const entries = await getAllEntries();
  const el = document.getElementById("entryList");

  if (!entries.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="big">📋</div>
        <p>Todavía no tienes registros.<br>Toca el botón + para crear el primero.</p>
      </div>`;
    return;
  }

  el.innerHTML = entries.map((entry) => renderEntryCard(entry)).join("");

  el.querySelectorAll(".entry-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  el.querySelectorAll("[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openEditModal(parseInt(btn.dataset.id)); });
  });
  el.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); handleDelete(parseInt(btn.dataset.id)); });
  });
  el.querySelectorAll("[data-action='print']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); printEntry(parseInt(btn.dataset.id)); });
  });
}

function formatPersonalEntry(entry) {
  if (Array.isArray(entry.personalDetalle)) {
    const total = entry.personalTotal ?? entry.personalDetalle.reduce((s, d) => s + d.cantidad, 0);
    return { total, detalleTexto: entry.personalDetalle.length ? formatPersonalDetalle(entry.personalDetalle) : null };
  }
  if (entry.personal != null) return { total: entry.personal, detalleTexto: null }; // registro antiguo, sin desglose
  return { total: "-", detalleTexto: null };
}

function renderEntryCard(entry) {
  const photos = (entry.fotos || [])
    .map((src) => `<div class="photo-thumb"><img src="${src}"></div>`)
    .join("");
  const pr = formatPersonalEntry(entry);

  return `
  <div class="entry" data-id="${entry.id}">
    <div class="entry-head">
      <div>
        <div class="entry-date">${formatFechaCompleta(entry.fecha)}</div>
        <div class="entry-meta">${formatClima(entry.clima)} · ${pr.total} personas en obra</div>
      </div>
      <span class="entry-caret">▾</span>
    </div>
    <div class="entry-body">
      ${entry.cuentaComoDia === false ? `<div class="entry-block"><div class="v" style="color:var(--accent,#E07B39);">⚠ Este día NO cuenta como día trabajado.</div></div>` : ""}
      ${formatHorarioEntry(entry) ? `<div class="entry-block"><div class="k">Horario de trabajo</div><div class="v">${formatHorarioEntry(entry)}</div></div>` : ""}
      ${Array.isArray(entry.clima) && entry.clima.some((c) => c.desde && c.hasta) ? `<div class="entry-block"><div class="k">Clima</div><div class="v">${formatClima(entry.clima, true)}</div></div>` : ""}
      ${pr.detalleTexto ? `<div class="entry-block"><div class="k">Personal en obra</div><div class="v">${pr.detalleTexto} — Total: ${pr.total}</div></div>` : ""}
      ${entry.actividades ? `<div class="entry-block"><div class="k">Actividades</div><div class="v">${escapeHtml(entry.actividades)}</div></div>` : ""}
      <div class="entry-block"><div class="k">Maquinaria y equipos</div><div class="v">${escapeHtml(formatMaquinariaEntry(entry))}</div></div>
      ${formatMaterialesEntry(entry) ? `<div class="entry-block"><div class="k">Materiales recibidos</div><div class="v">${formatMaterialesEntry(entry)}</div></div>` : ""}
      ${entry.incidentes ? `<div class="entry-block"><div class="k">Incidentes / observaciones</div><div class="v">${escapeHtml(entry.incidentes)}</div></div>` : ""}
      ${photos ? `<div class="entry-block"><div class="k">Fotos</div><div class="photo-grid">${photos}</div></div>` : ""}
      <div class="entry-actions">
        <button class="btn btn-secondary" data-action="edit" data-id="${entry.id}">Editar</button>
        <button class="btn btn-secondary" data-action="print" data-id="${entry.id}">Imprimir</button>
        <button class="btn btn-danger" data-action="delete" data-id="${entry.id}">Eliminar</button>
      </div>
    </div>
  </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function handleDelete(id) {
  if (!confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) return;
  const entradas = await getAllEntries();
  const previo = entradas.find((e) => e.id === id);
  if (previo && (previo.materialesRecibidos || []).length &&
      confirm("Este registro sumó materiales al Inventario. ¿Quieres también restarlos del Inventario?\n\nAceptar = restar del inventario\nCancelar = dejar el inventario como está")) {
    await revertirMatRec(previo.materialesRecibidos);
  }
  await deleteEntry(id);
  showToast("Registro eliminado");
  renderEntryList();
  renderStats();
}

// ---------- Imprimir un registro ----------
async function printEntry(id) {
  const entries = await getAllEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const photos = (entry.fotos || []).map((src) => `<img src="${src}" style="width:100%;max-width:260px;margin:6px 6px 0 0;border:1px solid #ccc;">`).join("");

  document.getElementById("print-area").innerHTML = `
    <h2 style="font-family:sans-serif;">Bitácora de obra — ${formatFechaCompleta(entry.fecha)}</h2>
    ${formatHorarioEntry(entry) ? `<p style="font-family:sans-serif;"><b>Horario de trabajo:</b> ${formatHorarioEntry(entry)}</p>` : ""}
    <p style="font-family:sans-serif;"><b>Clima:</b> ${formatClima(entry.clima, true)} &nbsp; <b>Personal en obra:</b> ${(() => { const pr = formatPersonalEntry(entry); return pr.detalleTexto ? `${pr.detalleTexto} — Total: ${pr.total}` : pr.total; })()}</p>
    <p style="font-family:sans-serif;"><b>Actividades realizadas:</b><br>${(entry.actividades || "-").replace(/\n/g,"<br>")}</p>
    <p style="font-family:sans-serif;"><b>Maquinaria y equipos:</b><br>${escapeHtml(formatMaquinariaEntry(entry))}</p>
    <p style="font-family:sans-serif;"><b>Materiales recibidos:</b><br>${formatMaterialesEntry(entry) || "-"}</p>
    <p style="font-family:sans-serif;"><b>Incidentes / observaciones:</b><br>${(entry.incidentes || "-").replace(/\n/g,"<br>")}</p>
    <div>${photos}</div>
  `;
  window.print();
}

// ---------- Inventario: renderizado ----------
async function renderItemList() {
  const items = await getAllItems();
  const listEl = document.getElementById("itemList");
  const bannerEl = document.getElementById("lowStockBanner");

  const lowItems = items.filter((it) => it.minimo != null && it.minimo !== "" && it.stock <= parseFloat(it.minimo));
  bannerEl.innerHTML = lowItems.length
    ? `<div class="low-stock-banner">⚠ ${lowItems.length} material${lowItems.length > 1 ? "es" : ""} por debajo del stock mínimo: ${lowItems.map((i) => i.nombre).join(", ")}.</div>`
    : "";

  if (!items.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="big">🧱</div>
        <p>Todavía no tienes materiales registrados.<br>Toca el botón + para agregar el primero.</p>
      </div>`;
    renderCategoriaInvManageList();
  renderUnidadInvManageList();
    return;
  }

  const categorias = await getAllCategoriasInventario();
  const nombresCategorias = categorias.map((c) => c.nombre);
  const sinCategoria = items.filter((it) => !it.categoria || !nombresCategorias.includes(it.categoria));
  const grupos = nombresCategorias.map((nombre) => ({ nombre, items: items.filter((it) => it.categoria === nombre) })).filter((g) => g.items.length);
  if (sinCategoria.length) grupos.push({ nombre: "Sin categoría", items: sinCategoria });

  const seccionesHtml = await Promise.all(grupos.map(async (g) => {
    const cardsHtml = await Promise.all(g.items.map(renderItemCard));
    return `<div class="asistencia-group-title">${escapeHtml(g.nombre)}</div>${cardsHtml.join("")}`;
  }));
  listEl.innerHTML = seccionesHtml.join("");

  listEl.querySelectorAll(".item-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  listEl.querySelectorAll("[data-action='edit-item']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openEditItemModal(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='delete-item']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); handleDeleteItem(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='add-mov']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openMovModal(parseInt(btn.dataset.id)); });
  });
  renderCategoriaInvManageList();
  renderUnidadInvManageList();
}

async function renderItemCard(item) {
  const isLow = item.minimo != null && item.minimo !== "" && item.stock <= parseFloat(item.minimo);
  const movs = await getMovsForItem(item.id);
  const movRows = movs.length
    ? movs.slice(0, 15).map((m) => `
        <div class="mov-row">
          <div>
            <span class="mov-type ${m.tipo}">${m.tipo === "entrada" ? "⬇ Entrada" : "⬆ Salida"} · ${m.cantidad} ${item.unidad}</span>
            ${m.nota ? `<div class="mov-nota">${escapeHtml(m.nota)}</div>` : ""}
          </div>
          <div class="mov-date">${formatFechaLarga(m.fecha)}</div>
        </div>`).join("")
    : `<div class="mov-nota" style="padding:8px 0;">Sin movimientos registrados todavía.</div>`;

  return `
  <div class="item-card ${isLow ? "low-stock" : ""}" data-id="${item.id}">
    <div class="item-head">
      <div>
        <div class="item-name">${escapeHtml(item.nombre)}</div>
        <div class="item-sub">Mínimo: ${item.minimo != null && item.minimo !== "" ? item.minimo + " " + item.unidad : "sin definir"}</div>
        ${isLow ? `<span class="low-badge">Bajo stock</span>` : ""}
      </div>
      <div style="text-align:right;">
        <div class="item-stock-tag">${item.stock} ${item.unidad}</div>
        <span class="entry-caret">▾</span>
      </div>
    </div>
    <div class="item-body">
      <div class="entry-actions" style="margin-bottom:14px;">
        <button class="btn btn-primary" data-action="add-mov" data-id="${item.id}">+ Movimiento</button>
        <button class="btn btn-secondary" data-action="edit-item" data-id="${item.id}">Editar</button>
        <button class="btn btn-danger" data-action="delete-item" data-id="${item.id}">Eliminar</button>
      </div>
      <div class="entry-block">
        <div class="k">Historial de movimientos</div>
        ${movRows}
      </div>
    </div>
  </div>`;
}

async function handleDeleteItem(id) {
  if (!confirm("¿Eliminar este material y todo su historial de movimientos?")) return;
  await deleteItem(id);
  showToast("Material eliminado");
  renderItemList();
}

// ---------- Inventario: gestionar categorías ----------
async function renderCategoriaInvManageList() {
  const categorias = await getAllCategoriasInventario();
  const el = document.getElementById("categoriaInvManageList");
  if (!categorias.length) { el.innerHTML = `<div class="backup-note">Aún no hay categorías definidas.</div>`; return; }

  el.innerHTML = categorias.map((c) => `
    <div class="manage-row" data-id="${c.id}">
      <div class="worker-name" style="font-size:0.9rem;">${escapeHtml(c.nombre)}</div>
      <div class="entry-actions" style="margin:0;">
        <button class="btn btn-secondary" data-action="edit-catinv" data-id="${c.id}" style="padding:6px 9px; font-size:0.76rem;">Editar</button>
        <button class="btn btn-danger" data-action="delete-catinv" data-id="${c.id}" style="padding:6px 9px; font-size:0.76rem;">Eliminar</button>
      </div>
    </div>`).join("");

  el.querySelectorAll("[data-action='edit-catinv']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cat = await getCategoriaInventario(parseInt(btn.dataset.id));
      const nuevo = prompt("Nuevo nombre de la categoría:", cat.nombre);
      if (nuevo && nuevo.trim()) {
        cat.nombre = nuevo.trim();
        await saveCategoriaInventario(cat);
        renderItemList();
      }
    });
  });
  el.querySelectorAll("[data-action='delete-catinv']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta categoría? Los materiales que ya la tengan asignada conservan el nombre, pero quedarán agrupados en \"Sin categoría\" hasta que los edites.")) return;
      await deleteCategoriaInventario(parseInt(btn.dataset.id));
      showToast("Categoría eliminada");
      renderItemList();
    });
  });
}

document.getElementById("btnAgregarCategoriaInv").addEventListener("click", async () => {
  const input = document.getElementById("categoriaInv-nombre");
  const nombre = input.value.trim();
  if (!nombre) { showToast("Escribe el nombre de la categoría"); return; }
  await saveCategoriaInventario({ nombre, obraId: currentObraId });
  input.value = "";
  showToast("Categoría guardada");
  renderItemList();
});

// ---------- Inventario: gestionar unidades ----------
async function renderUnidadInvManageList() {
  const unidades = await getAllUnidadesInventario();
  const el = document.getElementById("unidadInvManageList");
  if (!unidades.length) { el.innerHTML = `<div class="backup-note">Aún no hay unidades definidas.</div>`; return; }

  el.innerHTML = unidades.map((u) => `
    <div class="manage-row" data-id="${u.id}">
      <div class="worker-name" style="font-size:0.9rem;">${escapeHtml(u.nombre)}</div>
      <div class="entry-actions" style="margin:0;">
        <button class="btn btn-secondary" data-action="edit-unidinv" data-id="${u.id}" style="padding:6px 9px; font-size:0.76rem;">Editar</button>
        <button class="btn btn-danger" data-action="delete-unidinv" data-id="${u.id}" style="padding:6px 9px; font-size:0.76rem;">Eliminar</button>
      </div>
    </div>`).join("");

  el.querySelectorAll("[data-action='edit-unidinv']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = await getUnidadInventario(parseInt(btn.dataset.id));
      const nuevo = prompt("Nuevo nombre de la unidad:", u.nombre);
      if (nuevo && nuevo.trim()) {
        u.nombre = nuevo.trim();
        await saveUnidadInventario(u);
        renderItemList();
      }
    });
  });
  el.querySelectorAll("[data-action='delete-unidinv']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta unidad? Los materiales que ya la tengan asignada conservan el nombre tal cual.")) return;
      await deleteUnidadInventario(parseInt(btn.dataset.id));
      showToast("Unidad eliminada");
      renderItemList();
    });
  });
}

document.getElementById("btnAgregarUnidadInv").addEventListener("click", async () => {
  const input = document.getElementById("unidadInv-nombre");
  const nombre = input.value.trim();
  if (!nombre) { showToast("Escribe el nombre de la unidad"); return; }
  await saveUnidadInventario({ nombre, obraId: currentObraId });
  input.value = "";
  showToast("Unidad guardada");
  renderItemList();
});


// ---------- Inventario: modal material ----------
const itemModal = document.getElementById("itemModal");
const itemForm = document.getElementById("itemForm");

async function populateCategoriaInventarioSelect(selectedValue) {
  const categorias = await getAllCategoriasInventario();
  const sel = document.getElementById("i-categoria");
  sel.innerHTML = categorias.map((c) => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>`).join("");
  if (selectedValue && [...sel.options].some((o) => o.value === selectedValue)) {
    sel.value = selectedValue;
  } else if (selectedValue) {
    const opt = document.createElement("option");
    opt.value = selectedValue;
    opt.textContent = selectedValue + " (fuera de lista)";
    sel.appendChild(opt);
    sel.value = selectedValue;
  }
}

async function populateUnidadInventarioSelect(selectedValue) {
  const unidades = await getAllUnidadesInventario();
  const sel = document.getElementById("i-unidad");
  sel.innerHTML = unidades.map((u) => `<option value="${escapeHtml(u.nombre)}">${escapeHtml(u.nombre)}</option>`).join("");
  if (selectedValue && [...sel.options].some((o) => o.value === selectedValue)) {
    sel.value = selectedValue;
  } else if (selectedValue) {
    const opt = document.createElement("option");
    opt.value = selectedValue;
    opt.textContent = selectedValue + " (fuera de lista)";
    sel.appendChild(opt);
    sel.value = selectedValue;
  }
}

function openNewItemModal() {
  editingItemId = null;
  itemForm.reset();
  document.getElementById("itemModalTitle").textContent = "Nuevo material";
  populateCategoriaInventarioSelect();
  populateUnidadInventarioSelect();
  itemModal.classList.add("open");
}

async function openEditItemModal(id) {
  const item = await getItem(id);
  if (!item) return;
  editingItemId = id;
  document.getElementById("itemModalTitle").textContent = "Editar material";
  document.getElementById("i-nombre").value = item.nombre;
  await populateCategoriaInventarioSelect(item.categoria || "");
  await populateUnidadInventarioSelect(item.unidad || "");
  document.getElementById("i-stock").value = item.stock;
  document.getElementById("i-minimo").value = item.minimo ?? "";
  itemModal.classList.add("open");
}

function closeItemModal() { itemModal.classList.remove("open"); }
document.getElementById("btnNewItem").addEventListener("click", openNewItemModal);
document.getElementById("closeItemModal").addEventListener("click", closeItemModal);
itemModal.addEventListener("click", (e) => { if (e.target === itemModal) closeItemModal(); });

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const item = {
    obraId: currentObraId,
    nombre: document.getElementById("i-nombre").value.trim(),
    categoria: document.getElementById("i-categoria").value,
    unidad: document.getElementById("i-unidad").value,
    stock: parseFloat(document.getElementById("i-stock").value) || 0,
    minimo: document.getElementById("i-minimo").value !== "" ? parseFloat(document.getElementById("i-minimo").value) : null,
  };
  if (editingItemId) item.id = editingItemId;
  await saveItem(item);
  closeItemModal();
  showToast("Material guardado");
  renderItemList();
});

// ---------- Inventario: modal movimiento ----------
const movModal = document.getElementById("movModal");
const movForm = document.getElementById("movForm");

function openMovModal(itemId) {
  movTargetItemId = itemId;
  movForm.reset();
  document.getElementById("m-fecha").value = new Date().toISOString().slice(0, 10);
  document.querySelectorAll("#movTipoChips .chip").forEach((c) => c.classList.toggle("selected", c.dataset.value === "entrada"));
  movModal.classList.add("open");
}
function closeMovModal() { movModal.classList.remove("open"); }
document.getElementById("closeMovModal").addEventListener("click", closeMovModal);
movModal.addEventListener("click", (e) => { if (e.target === movModal) closeMovModal(); });

document.querySelectorAll("#movTipoChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#movTipoChips .chip").forEach((c) => c.classList.remove("selected"));
    chip.classList.add("selected");
  });
});

movForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipo = document.querySelector("#movTipoChips .chip.selected")?.dataset.value || "entrada";
  const cantidad = parseFloat(document.getElementById("m-cantidad").value) || 0;
  const item = await getItem(movTargetItemId);
  if (!item) return;

  if (tipo === "salida" && cantidad > item.stock) {
    if (!confirm(`Esto dejará el stock en negativo (tienes ${item.stock} ${item.unidad}). ¿Continuar de todos modos?`)) return;
  }

  await addMov({
    itemId: movTargetItemId,
    tipo,
    cantidad,
    fecha: document.getElementById("m-fecha").value,
    nota: document.getElementById("m-nota").value.trim(),
  });

  item.stock = tipo === "entrada" ? item.stock + cantidad : item.stock - cantidad;
  await saveItem(item);

  closeMovModal();
  showToast("Movimiento guardado");
  renderItemList();
});

// ---------- Asistencia: estado ----------
let asistenciaFecha = new Date().toISOString().slice(0, 10);
const ESTADOS = [
  { value: "presente", label: "Presente", cls: "sel-presente" },
  { value: "ausente", label: "Ausente", cls: "sel-ausente" },
  { value: "incapacidad", label: "Incapacidad", cls: "sel-incapacidad" },
  { value: "permiso", label: "Permiso", cls: "sel-permiso" },
];

function shiftAsistenciaFecha(days) {
  const d = new Date(asistenciaFecha + "T00:00:00");
  d.setDate(d.getDate() + days);
  asistenciaFecha = d.toISOString().slice(0, 10);
  renderAsistenciaScreen();
}

async function renderAsistenciaScreen() {
  document.getElementById("asistenciaFechaInput").value = asistenciaFecha;
  document.getElementById("asistenciaFechaLabel").textContent = formatFechaLarga(asistenciaFecha);

  const [workers, registros] = await Promise.all([getAllWorkers(), getAsistenciaForFecha(asistenciaFecha)]);
  const regMap = {};
  registros.forEach((r) => { regMap[r.workerId] = r; });

  const presentes = registros.filter((r) => r.estado === "presente").length;
  document.getElementById("asistenciaStats").innerHTML = `
    <div class="stat-row">
      <div class="stat-box"><div class="num">${presentes}</div><div class="label">PRESENTES HOY</div></div>
      <div class="stat-box"><div class="num">${workers.length}</div><div class="label">TOTAL PERSONAL</div></div>
    </div>`;

  const listEl = document.getElementById("workerAttendanceList");
  if (!workers.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="big">👷</div>
        <p>Todavía no tienes personal registrado.<br>Toca el botón + para agregar el primero.</p>
      </div>`;
  } else {
    const cargos = await getAllCargos();
    const categoriaPorCargo = {};
    cargos.forEach((c) => { categoriaPorCargo[c.nombre] = c.categoria; });
    const profesionales = workers.filter((w) => (categoriaPorCargo[w.cargo] || "mano_obra") === "profesional");
    const manoObra = workers.filter((w) => (categoriaPorCargo[w.cargo] || "mano_obra") !== "profesional");

    const seccion = (titulo, lista) => !lista.length ? "" : `
      <div class="asistencia-group-title">${titulo}</div>
      ${lista.map((w) => renderWorkerRow(w, regMap[w.id])).join("")}`;

    listEl.innerHTML = seccion("🎓 Profesional / Técnico", profesionales) + seccion("👷 Mano de obra", manoObra);

    listEl.querySelectorAll(".estado-chip").forEach((chip) => {
      chip.addEventListener("click", async () => {
        const workerId = parseInt(chip.dataset.workerId);
        const estado = chip.dataset.value;
        const row = chip.closest(".worker-row");
        const horasExtra = parseFloat(row.querySelector(".horas-extra-input").value) || 0;
        row.querySelectorAll(".estado-chip").forEach((c) => c.classList.remove("selected", "sel-presente", "sel-ausente", "sel-incapacidad", "sel-permiso"));
        const meta = ESTADOS.find((e) => e.value === estado);
        chip.classList.add("selected", meta.cls);
        await upsertAsistencia({ workerId, fecha: asistenciaFecha, estado, horasExtra });
        renderAsistenciaScreen();
      });
    });

    listEl.querySelectorAll(".horas-extra-input").forEach((input) => {
      input.addEventListener("change", async () => {
        const workerId = parseInt(input.dataset.workerId);
        const row = input.closest(".worker-row");
        const selectedChip = row.querySelector(".estado-chip.selected");
        const estado = selectedChip ? selectedChip.dataset.value : null;
        if (!estado) { showToast("Marca primero el estado del día"); input.value = ""; return; }
        await upsertAsistencia({ workerId, fecha: asistenciaFecha, estado, horasExtra: parseFloat(input.value) || 0 });
      });
    });
  }

  renderWorkerManageList(workers);
  renderCargoManageList();
}

function renderWorkerRow(worker, registro) {
  const chips = ESTADOS.map((e) => {
    const isSel = registro && registro.estado === e.value;
    return `<div class="chip estado-chip ${isSel ? "selected " + e.cls : ""}" data-value="${e.value}" data-worker-id="${worker.id}">${e.label}</div>`;
  }).join("");

  return `
  <div class="worker-row" data-id="${worker.id}">
    <div class="worker-row-top">
      <div>
        <div class="worker-name">${escapeHtml(worker.nombre)}</div>
        ${worker.cargo ? `<div class="worker-cargo">${escapeHtml(worker.cargo)}</div>` : ""}
      </div>
      ${worker.telefono ? `<a href="tel:${escapeHtml(worker.telefono.replace(/\s+/g, ""))}" class="icon-btn" style="text-decoration:none; display:flex; align-items:center; justify-content:center;" title="Llamar">📞</a>` : ""}
    </div>
    <div class="chip-select" style="margin-top:8px;">${chips}</div>
    <div class="field" style="margin-top:10px; margin-bottom:0;">
      <label>Horas extra ese día</label>
      <input type="number" class="horas-extra-input" min="0" step="any" placeholder="0" value="${registro && registro.horasExtra ? registro.horasExtra : ""}" data-worker-id="${worker.id}">
    </div>
  </div>`;
}

// ---------- Asistencia: gestionar personal ----------
function renderWorkerManageList(workers) {
  const el = document.getElementById("workerManageList");
  if (!workers.length) { el.innerHTML = `<div class="backup-note">Aún no hay trabajadores registrados.</div>`; return; }
  el.innerHTML = workers.map((w) => `
    <div class="manage-row" data-id="${w.id}">
      <div>
        <div class="worker-name">${escapeHtml(w.nombre)}</div>
        ${w.cargo ? `<div class="worker-cargo">${escapeHtml(w.cargo)}</div>` : ""}
        ${w.telefono ? `<div class="worker-cargo"><a href="tel:${escapeHtml(w.telefono.replace(/\s+/g, ""))}" style="color:var(--turf-dark); text-decoration:none;">📞 ${escapeHtml(w.telefono)}</a></div>` : ""}
        <div class="worker-cargo">${w.valorDia ? formatCOP(w.valorDia) + "/día" : "Sin valor/día"}${w.valorHoraExtra ? " · " + formatCOP(w.valorHoraExtra) + "/h.extra" : ""}</div>
      </div>
      <div class="entry-actions" style="margin:0;">
        <button class="btn btn-secondary" data-action="edit-worker" data-id="${w.id}">Editar</button>
        <button class="btn btn-danger" data-action="delete-worker" data-id="${w.id}">Eliminar</button>
      </div>
    </div>`).join("");

  el.querySelectorAll("[data-action='edit-worker']").forEach((btn) => {
    btn.addEventListener("click", () => openEditWorkerModal(parseInt(btn.dataset.id)));
  });
  el.querySelectorAll("[data-action='delete-worker']").forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteWorker(parseInt(btn.dataset.id)));
  });
}

async function handleDeleteWorker(id) {
  if (!confirm("¿Eliminar este trabajador y todo su historial de asistencia?")) return;
  await deleteWorker(id);
  showToast("Trabajador eliminado");
  renderAsistenciaScreen();
}

// ---------- Asistencia: gestionar cargos ----------
async function renderCargoManageList() {
  const cargos = await getAllCargos();
  const el = document.getElementById("cargoManageList");
  if (!cargos.length) { el.innerHTML = `<div class="backup-note">Aún no hay cargos definidos.</div>`; return; }

  const grupo = (label, lista) => !lista.length ? "" : `
    <div class="worker-cargo" style="margin: 10px 0 4px; font-weight:600;">${label}</div>
    ${lista.map((c) => `
      <div class="manage-row" data-id="${c.id}" style="padding:9px 0;">
        <div class="worker-name" style="font-size:0.9rem;">${escapeHtml(c.nombre)}</div>
        <div class="entry-actions" style="margin:0;">
          <button class="btn btn-secondary" data-action="edit-cargo" data-id="${c.id}" style="padding:6px 9px; font-size:0.76rem;">Editar</button>
          <button class="btn btn-danger" data-action="delete-cargo" data-id="${c.id}" style="padding:6px 9px; font-size:0.76rem;">Eliminar</button>
        </div>
      </div>`).join("")}`;

  el.innerHTML =
    grupo("Profesional / Técnico", cargos.filter((c) => c.categoria === "profesional")) +
    grupo("Mano de obra", cargos.filter((c) => c.categoria === "mano_obra"));

  el.querySelectorAll("[data-action='edit-cargo']").forEach((btn) => {
    btn.addEventListener("click", () => openEditCargoForm(parseInt(btn.dataset.id)));
  });
  el.querySelectorAll("[data-action='delete-cargo']").forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteCargo(parseInt(btn.dataset.id)));
  });
}

let editingCargoId = null;

document.querySelectorAll("#cargoCategoriaChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#cargoCategoriaChips .chip").forEach((c) => c.classList.remove("selected", "sel-incapacidad", "sel-presente"));
    chip.classList.add("selected", chip.dataset.value === "profesional" ? "sel-incapacidad" : "sel-presente");
  });
});

async function openEditCargoForm(id) {
  const cargo = await getCargo(id);
  if (!cargo) return;
  editingCargoId = id;
  document.getElementById("cargo-nombre").value = cargo.nombre;
  document.getElementById("cargo-plural").value = cargo.nombrePlural || "";
  document.querySelectorAll("#cargoCategoriaChips .chip").forEach((c) => {
    c.classList.remove("selected", "sel-incapacidad", "sel-presente");
    if (c.dataset.value === cargo.categoria) c.classList.add("selected", cargo.categoria === "profesional" ? "sel-incapacidad" : "sel-presente");
  });
  document.getElementById("btnAgregarCargo").textContent = "Guardar cambios del cargo";
  document.getElementById("cargo-nombre").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleDeleteCargo(id) {
  if (!confirm("¿Eliminar este cargo de la lista? El personal que ya lo tenga asignado conserva el nombre, pero ya no aparecerá para elegir en trabajadores nuevos.")) return;
  await deleteCargo(id);
  showToast("Cargo eliminado");
  renderCargoManageList();
}

document.getElementById("btnAgregarCargo").addEventListener("click", async () => {
  const nombre = document.getElementById("cargo-nombre").value.trim();
  if (!nombre) { showToast("Escribe el nombre del cargo"); return; }
  const categoria = document.querySelector("#cargoCategoriaChips .chip.selected")?.dataset.value || "mano_obra";
  const cargo = {
    obraId: currentObraId,
    nombre,
    nombrePlural: document.getElementById("cargo-plural").value.trim(),
    categoria,
  };
  if (editingCargoId) cargo.id = editingCargoId;
  await saveCargo(cargo);
  editingCargoId = null;
  document.getElementById("btnAgregarCargo").textContent = "+ Agregar cargo";
  document.getElementById("cargo-nombre").value = "";
  document.getElementById("cargo-plural").value = "";
  showToast("Cargo guardado");
  renderCargoManageList();
});

// ---------- Asistencia: modal trabajador ----------
const workerModal = document.getElementById("workerModal");
const workerForm = document.getElementById("workerForm");

async function populateCargoSelect(selectedValue) {
  const cargos = await getAllCargos();
  const sel = document.getElementById("w-cargo");
  const profesionales = cargos.filter((c) => c.categoria === "profesional");
  const manoObra = cargos.filter((c) => c.categoria === "mano_obra");
  const buildOptions = (list) => list.map((c) => `<option value="${c.nombre}">${escapeHtml(c.nombre)}</option>`).join("");
  sel.innerHTML =
    (profesionales.length ? `<optgroup label="Profesional / Técnico">${buildOptions(profesionales)}</optgroup>` : "") +
    (manoObra.length ? `<optgroup label="Mano de obra">${buildOptions(manoObra)}</optgroup>` : "");
  if (selectedValue && [...sel.options].some((o) => o.value === selectedValue)) {
    sel.value = selectedValue;
  } else if (selectedValue) {
    // Cargo antiguo en texto libre que ya no coincide con la lista: se agrega igual para no perder el dato.
    const opt = document.createElement("option");
    opt.value = selectedValue;
    opt.textContent = selectedValue + " (fuera de lista)";
    sel.appendChild(opt);
    sel.value = selectedValue;
  }
}

async function openNewWorkerModal() {
  editingWorkerId = null;
  workerForm.reset();
  document.getElementById("workerModalTitle").textContent = "Nuevo trabajador";
  await populateCargoSelect();
  workerModal.classList.add("open");
}

async function openEditWorkerModal(id) {
  const w = await getWorker(id);
  if (!w) return;
  editingWorkerId = id;
  document.getElementById("workerModalTitle").textContent = "Editar trabajador";
  document.getElementById("w-nombre").value = w.nombre;
  await populateCargoSelect(w.cargo || "");
  document.getElementById("w-telefono").value = w.telefono || "";
  document.getElementById("w-valorDia").value = w.valorDia ?? "";
  document.getElementById("w-valorHoraExtra").value = w.valorHoraExtra ?? "";
  workerModal.classList.add("open");
}

function closeWorkerModal() { workerModal.classList.remove("open"); }
document.getElementById("btnNewWorker").addEventListener("click", openNewWorkerModal);
document.getElementById("closeWorkerModal").addEventListener("click", closeWorkerModal);
workerModal.addEventListener("click", (e) => { if (e.target === workerModal) closeWorkerModal(); });

workerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const worker = {
    obraId: currentObraId,
    nombre: document.getElementById("w-nombre").value.trim(),
    cargo: document.getElementById("w-cargo").value,
    telefono: document.getElementById("w-telefono").value.trim(),
    valorDia: document.getElementById("w-valorDia").value !== "" ? parseFloat(document.getElementById("w-valorDia").value) : null,
    valorHoraExtra: document.getElementById("w-valorHoraExtra").value !== "" ? parseFloat(document.getElementById("w-valorHoraExtra").value) : null,
  };
  if (editingWorkerId) worker.id = editingWorkerId;
  await saveWorker(worker);
  closeWorkerModal();
  showToast("Trabajador guardado");
  renderAsistenciaScreen();
});

document.getElementById("asistenciaFechaInput").addEventListener("change", (e) => {
  asistenciaFecha = e.target.value;
  renderAsistenciaScreen();
});
document.getElementById("asistenciaPrev").addEventListener("click", () => shiftAsistenciaFecha(-1));
document.getElementById("asistenciaNext").addEventListener("click", () => shiftAsistenciaFecha(1));

// ---------- Pedidos de material ----------
const ESTADOS_PEDIDO = [
  { value: "pendiente", label: "Pendiente", cls: "sel-ausente" },
  { value: "aprobado", label: "Aprobado", cls: "sel-incapacidad" },
  { value: "pedido", label: "Pedido", cls: "sel-pedido" },
  { value: "recibido", label: "Recibido", cls: "sel-presente" },
  { value: "cancelado", label: "Cancelado", cls: "sel-permiso" },
];

async function renderPedidosScreen() {
  const pedidos = await getAllPedidos();
  const pendientes = pedidos.filter((p) => ["pendiente", "aprobado", "pedido"].includes(p.estado)).length;

  document.getElementById("pedidosStats").innerHTML = `
    <div class="stat-row">
      <div class="stat-box"><div class="num">${pendientes}</div><div class="label">EN TRÁMITE</div></div>
      <div class="stat-box"><div class="num">${pedidos.length}</div><div class="label">TOTAL REGISTRADOS</div></div>
    </div>`;

  const listEl = document.getElementById("pedidosList");
  if (!pedidos.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="big">📦</div>
        <p>Todavía no tienes pedidos registrados.<br>Toca el botón + para crear el primero.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = pedidos.map(renderPedidoCard).join("");

  listEl.querySelectorAll(".entry-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  listEl.querySelectorAll("[data-action='edit-pedido']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openEditPedidoModal(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='delete-pedido']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); handleDeletePedido(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll(".estado-pedido-chip").forEach((chip) => {
    chip.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await handleEstadoPedidoChange(parseInt(chip.dataset.id), chip.dataset.value);
    });
  });
}

function renderPedidoCard(p) {
  const meta = ESTADOS_PEDIDO.find((e) => e.value === p.estado) || ESTADOS_PEDIDO[0];
  const chips = ESTADOS_PEDIDO.map((e) => `<div class="chip estado-pedido-chip ${p.estado === e.value ? "selected " + e.cls : ""}" data-value="${e.value}" data-id="${p.id}">${e.label}</div>`).join("");

  return `
  <div class="entry" data-id="${p.id}">
    <div class="entry-head">
      <div>
        <div class="entry-date">${escapeHtml(p.material)}</div>
        <div class="entry-meta">${p.cantidad} ${escapeHtml(p.unidad || "")} · ${formatFechaLarga(p.fechaSolicitud)}${p.proveedor ? " · " + escapeHtml(p.proveedor) : ""}</div>
      </div>
      <div style="text-align:right;">
        <span class="chip ${meta.cls}" style="pointer-events:none; padding:5px 10px; font-size:0.72rem;">${meta.label}</span>
      </div>
    </div>
    <div class="entry-body">
      ${p.fechaNecesaria ? `<div class="entry-block"><div class="k">Se necesita para</div><div class="v">${formatFechaLarga(p.fechaNecesaria)}</div></div>` : ""}
      ${p.nota ? `<div class="entry-block"><div class="k">Observaciones</div><div class="v">${escapeHtml(p.nota)}</div></div>` : ""}
      <div class="entry-block">
        <div class="k">Estado</div>
        <div class="chip-select" style="margin-top:6px;">${chips}</div>
      </div>
      <div class="entry-actions">
        <button class="btn btn-secondary" data-action="edit-pedido" data-id="${p.id}">Editar</button>
        <button class="btn btn-danger" data-action="delete-pedido" data-id="${p.id}">Eliminar</button>
      </div>
    </div>
  </div>`;
}

async function handleEstadoPedidoChange(id, estado) {
  const pedido = await getPedido(id);
  if (!pedido) return;
  const yaEstabaRecibido = pedido.estado === "recibido";
  pedido.estado = estado;
  await savePedido(pedido);

  if (estado === "recibido" && !yaEstabaRecibido) {
    const items = await getAllItems();
    const match = items.find((it) => it.nombre.trim().toLowerCase() === pedido.material.trim().toLowerCase());
    if (match) {
      if (confirm(`"${pedido.material}" existe en tu inventario. ¿Registrar una entrada de ${pedido.cantidad} ${match.unidad} recibida de este pedido?`)) {
        await addMov({ itemId: match.id, tipo: "entrada", cantidad: pedido.cantidad, fecha: new Date().toISOString().slice(0, 10), nota: `Recibido de pedido${pedido.proveedor ? " — " + pedido.proveedor : ""}` });
        match.stock += pedido.cantidad;
        await saveItem(match);
        showToast("Entrada registrada en inventario");
      }
    } else {
      showToast(`"${pedido.material}" no está en tu inventario todavía`);
    }
  }
  renderPedidosScreen();
}

async function handleDeletePedido(id) {
  if (!confirm("¿Eliminar este pedido?")) return;
  await deletePedido(id);
  showToast("Pedido eliminado");
  renderPedidosScreen();
}

// ---------- Pedidos: modal ----------
const pedidoModal = document.getElementById("pedidoModal");
const pedidoForm = document.getElementById("pedidoForm");
let editingPedidoId = null;

function openNewPedidoModal() {
  editingPedidoId = null;
  pedidoForm.reset();
  document.getElementById("pedidoModalTitle").textContent = "Nuevo pedido";
  document.getElementById("p-fechaSolicitud").value = new Date().toISOString().slice(0, 10);
  pedidoModal.classList.add("open");
}

async function openEditPedidoModal(id) {
  const p = await getPedido(id);
  if (!p) return;
  editingPedidoId = id;
  document.getElementById("pedidoModalTitle").textContent = "Editar pedido";
  document.getElementById("p-material").value = p.material;
  document.getElementById("p-cantidad").value = p.cantidad;
  document.getElementById("p-unidad").value = p.unidad || "";
  document.getElementById("p-proveedor").value = p.proveedor || "";
  document.getElementById("p-fechaSolicitud").value = p.fechaSolicitud;
  document.getElementById("p-fechaNecesaria").value = p.fechaNecesaria || "";
  document.getElementById("p-nota").value = p.nota || "";
  pedidoModal.classList.add("open");
}

function closePedidoModal() { pedidoModal.classList.remove("open"); }
document.getElementById("btnNewPedido").addEventListener("click", openNewPedidoModal);
document.getElementById("closePedidoModal").addEventListener("click", closePedidoModal);
pedidoModal.addEventListener("click", (e) => { if (e.target === pedidoModal) closePedidoModal(); });

pedidoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pedido = {
    obraId: currentObraId,
    material: document.getElementById("p-material").value.trim(),
    cantidad: parseFloat(document.getElementById("p-cantidad").value) || 0,
    unidad: document.getElementById("p-unidad").value.trim(),
    proveedor: document.getElementById("p-proveedor").value.trim(),
    fechaSolicitud: document.getElementById("p-fechaSolicitud").value,
    fechaNecesaria: document.getElementById("p-fechaNecesaria").value || null,
    nota: document.getElementById("p-nota").value.trim(),
    estado: editingPedidoId ? undefined : "pendiente",
  };
  if (editingPedidoId) {
    pedido.id = editingPedidoId;
    const existing = await getPedido(editingPedidoId);
    pedido.estado = existing.estado;
  }
  await savePedido(pedido);
  closePedidoModal();
  showToast("Pedido guardado");
  renderPedidosScreen();
});

// ---------- Caja menor: renderizado ----------
async function renderCajaScreen() {
  const movs = await getAllCajaMovs();

  const saldo = movs.reduce((s, m) => s + (m.tipo === "ingreso" ? m.valor : -m.valor), 0);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const movsMes = movs.filter((m) => m.fecha.startsWith(ym));
  const ingresosMes = movsMes.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.valor, 0);
  const gastosMes = movsMes.filter((m) => m.tipo === "gasto").reduce((s, m) => s + m.valor, 0);

  document.getElementById("cajaSaldoCard").innerHTML = `
    <div class="saldo-card ${saldo < 0 ? "negative" : "positive"}">
      <div class="saldo-label">SALDO ACTUAL</div>
      <div class="saldo-num">${formatCOP(saldo)}</div>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="num">${formatCOP(ingresosMes)}</div><div class="label">INGRESOS DEL MES</div></div>
      <div class="stat-box"><div class="num">${formatCOP(gastosMes)}</div><div class="label">GASTOS DEL MES</div></div>
    </div>`;

  const listEl = document.getElementById("cajaList");
  if (!movs.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="big">🧾</div>
        <p>Todavía no tienes movimientos de caja menor.<br>Toca el botón + para registrar el primero.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = movs.map(renderCajaCard).join("");

  listEl.querySelectorAll(".entry-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  listEl.querySelectorAll("[data-action='edit-caja']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openEditCajaModal(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='delete-caja']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); handleDeleteCaja(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='print-caja']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); printCajaMov(parseInt(btn.dataset.id)); });
  });
}

function renderCajaCard(mov) {
  const colorClass = mov.tipo === "ingreso" ? "entrada" : "salida";
  const signo = mov.tipo === "ingreso" ? "+" : "−";
  const photos = (mov.fotos || []).map((src) => `<div class="photo-thumb"><img src="${src}"></div>`).join("");

  return `
  <div class="entry" data-id="${mov.id}">
    <div class="entry-head">
      <div>
        <div class="entry-date">${escapeHtml(mov.concepto)}</div>
        <div class="entry-meta"><span class="mov-type ${colorClass}">${mov.tipo === "ingreso" ? "⬇ Ingreso" : "⬆ Gasto"}</span> · ${formatFechaLarga(mov.fecha)}</div>
      </div>
      <div style="text-align:right;">
        <div class="item-stock-tag" style="color:${mov.tipo === "ingreso" ? "var(--turf-dark)" : "var(--orange-dark)"};">${signo} ${formatCOP(mov.valor)}</div>
        <span class="entry-caret">▾</span>
      </div>
    </div>
    <div class="entry-body">
      ${mov.nota ? `<div class="entry-block"><div class="k">Nota</div><div class="v">${escapeHtml(mov.nota)}</div></div>` : ""}
      ${photos ? `<div class="entry-block"><div class="k">Foto de la factura</div><div class="photo-grid">${photos}</div></div>` : ""}
      <div class="entry-actions">
        <button class="btn btn-secondary" data-action="edit-caja" data-id="${mov.id}">Editar</button>
        <button class="btn btn-secondary" data-action="print-caja" data-id="${mov.id}">Imprimir</button>
        <button class="btn btn-danger" data-action="delete-caja" data-id="${mov.id}">Eliminar</button>
      </div>
    </div>
  </div>`;
}

async function handleDeleteCaja(id) {
  if (!confirm("¿Eliminar este movimiento de caja menor?")) return;
  await deleteCajaMov(id);
  showToast("Movimiento eliminado");
  renderCajaScreen();
}

async function printCajaMov(id) {
  const movs = await getAllCajaMovs();
  const mov = movs.find((m) => m.id === id);
  if (!mov) return;
  const photos = (mov.fotos || []).map((src) => `<img src="${src}" style="width:100%;max-width:320px;margin:6px 6px 0 0;border:1px solid #ccc;">`).join("");
  document.getElementById("print-area").innerHTML = `
    <h2 style="font-family:sans-serif;">Caja menor — ${mov.tipo === "ingreso" ? "Ingreso" : "Gasto"}</h2>
    <p style="font-family:sans-serif;"><b>Fecha:</b> ${formatFechaLarga(mov.fecha)}</p>
    <p style="font-family:sans-serif;"><b>Concepto:</b> ${escapeHtml(mov.concepto)}</p>
    <p style="font-family:sans-serif;"><b>Valor:</b> ${formatCOP(mov.valor)}</p>
    ${mov.nota ? `<p style="font-family:sans-serif;"><b>Nota:</b> ${escapeHtml(mov.nota)}</p>` : ""}
    <div>${photos}</div>
  `;
  window.print();
}

// ---------- Caja menor: modal ----------
const cajaModal = document.getElementById("cajaModal");
const cajaForm = document.getElementById("cajaForm");
let currentCajaPhotos = [];
let editingCajaId = null;

function openNewCajaModal() {
  editingCajaId = null;
  currentCajaPhotos = [];
  cajaForm.reset();
  document.getElementById("cajaModalTitle").textContent = "Nuevo movimiento";
  document.getElementById("c-fecha").value = new Date().toISOString().slice(0, 10);
  document.querySelectorAll("#cajaTipoChips .chip").forEach((c) => c.classList.toggle("selected", c.dataset.value === "gasto"));
  document.querySelectorAll("#cajaTipoChips .chip").forEach((c) => c.classList.remove("sel-presente","sel-ausente"));
  document.querySelector("#cajaTipoChips .chip[data-value='gasto']").classList.add("selected", "sel-ausente");
  renderCajaPhotoGrid();
  cajaModal.classList.add("open");
}

async function openEditCajaModal(id) {
  const movs = await getAllCajaMovs();
  const mov = movs.find((m) => m.id === id);
  if (!mov) return;
  editingCajaId = id;
  currentCajaPhotos = [...(mov.fotos || [])];
  document.getElementById("cajaModalTitle").textContent = "Editar movimiento";
  document.getElementById("c-fecha").value = mov.fecha;
  document.getElementById("c-concepto").value = mov.concepto;
  document.getElementById("c-valor").value = mov.valor;
  document.getElementById("c-nota").value = mov.nota || "";
  document.querySelectorAll("#cajaTipoChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente", "sel-ausente"));
  const sel = document.querySelector(`#cajaTipoChips .chip[data-value='${mov.tipo}']`);
  sel.classList.add("selected", mov.tipo === "ingreso" ? "sel-presente" : "sel-ausente");
  renderCajaPhotoGrid();
  cajaModal.classList.add("open");
}

function closeCajaModal() { cajaModal.classList.remove("open"); }
document.getElementById("btnNewCaja").addEventListener("click", openNewCajaModal);
document.getElementById("closeCajaModal").addEventListener("click", closeCajaModal);
cajaModal.addEventListener("click", (e) => { if (e.target === cajaModal) closeCajaModal(); });

document.querySelectorAll("#cajaTipoChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#cajaTipoChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente", "sel-ausente"));
    chip.classList.add("selected", chip.dataset.value === "ingreso" ? "sel-presente" : "sel-ausente");
  });
});

function renderCajaPhotoGrid() {
  const grid = document.getElementById("cajaPhotoGrid");
  grid.innerHTML = currentCajaPhotos
    .map((src, i) => `
      <div class="photo-thumb">
        <img src="${src}">
        <button type="button" class="remove-photo" data-idx="${i}">✕</button>
      </div>`)
    .join("") + `
      <div class="add-photo-btn" id="cajaTakePhotoBtn" title="Tomar foto">📷</div>
      <div class="add-photo-btn" id="cajaGalleryBtn" title="Elegir de galería">🖼</div>`;

  grid.querySelector("#cajaTakePhotoBtn").addEventListener("click", () => document.getElementById("cajaPhotoCamera").click());
  grid.querySelector("#cajaGalleryBtn").addEventListener("click", () => document.getElementById("cajaPhotoGallery").click());
  grid.querySelectorAll(".remove-photo").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentCajaPhotos.splice(parseInt(btn.dataset.idx), 1);
      renderCajaPhotoGrid();
    });
  });
}

async function handleCajaPhotoFiles(fileList) {
  const files = Array.from(fileList);
  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      currentCajaPhotos.push(compressed);
    } catch (err) { console.error(err); }
  }
  renderCajaPhotoGrid();
}

document.getElementById("cajaPhotoCamera").addEventListener("change", (e) => { handleCajaPhotoFiles(e.target.files); e.target.value = ""; });
document.getElementById("cajaPhotoGallery").addEventListener("change", (e) => { handleCajaPhotoFiles(e.target.files); e.target.value = ""; });

cajaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipo = document.querySelector("#cajaTipoChips .chip.selected")?.dataset.value || "gasto";
  const mov = {
    obraId: currentObraId,
    tipo,
    fecha: document.getElementById("c-fecha").value,
    concepto: document.getElementById("c-concepto").value.trim(),
    valor: parseFloat(document.getElementById("c-valor").value) || 0,
    nota: document.getElementById("c-nota").value.trim(),
    fotos: currentCajaPhotos,
  };
  if (editingCajaId) mov.id = editingCajaId;
  await saveCajaMov(mov);
  closeCajaModal();
  showToast("Movimiento guardado");
  renderCajaScreen();
});

// ---------- Maquinaria: renderizado ----------
function ensureMaqReporteDefaults() {
  const ini = document.getElementById("maqReporteInicio");
  const fin = document.getElementById("maqReporteFin");
  if (!ini.value) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    ini.value = first.toISOString().slice(0, 10);
  }
  if (!fin.value) fin.value = new Date().toISOString().slice(0, 10);
}

async function renderEquipoList() {
  ensureMaqReporteDefaults();
  const equipos = await getAllEquipos();
  const listEl = document.getElementById("equipoList");

  const withUsos = await Promise.all(equipos.map(async (eq) => {
    const usos = await getUsosForEquipo(eq.id);
    const horasTotales = usos.reduce((s, u) => s + (u.horas || 0), 0);
    return { eq, usos, horasTotales };
  }));

  const horasMes = withUsos.reduce((s, x) => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return s + x.usos.filter((u) => u.fecha.startsWith(ym)).reduce((s2, u) => s2 + (u.horas || 0), 0);
  }, 0);
  document.getElementById("maquinariaStats").innerHTML = `
    <div class="stat-row">
      <div class="stat-box"><div class="num">${horasMes}</div><div class="label">HORAS ESTE MES</div></div>
      <div class="stat-box"><div class="num">${equipos.length}</div><div class="label">EQUIPOS REGISTRADOS</div></div>
    </div>`;

  if (!equipos.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="big">🚜</div>
        <p>Todavía no tienes maquinaria registrada.<br>Toca el botón + para agregar el primer equipo.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = withUsos.map(({ eq, usos, horasTotales }) => renderEquipoCard(eq, usos, horasTotales)).join("");

  listEl.querySelectorAll(".item-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  listEl.querySelectorAll("[data-action='edit-equipo']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openEditEquipoModal(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='delete-equipo']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); handleDeleteEquipo(parseInt(btn.dataset.id)); });
  });
  listEl.querySelectorAll("[data-action='add-uso']").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); openUsoModal(parseInt(btn.dataset.id)); });
  });
}

function formatUsoMetodoDetalle(u) {
  if (u.metodo === "horometro" && u.horometroInicial != null && u.horometroFinal != null) {
    return `Horómetro: ${u.horometroInicial} → ${u.horometroFinal}`;
  }
  if (u.metodo === "horas_reloj" && u.horaInicio && u.horaFin) {
    return `${u.horaInicio} — ${u.horaFin}`;
  }
  return "";
}

function renderEquipoCard(eq, usos, horasTotales) {
  const costoTotal = eq.tarifaHora ? horasTotales * eq.tarifaHora : null;
  const usoRows = usos.length
    ? usos.slice(0, 15).map((u) => {
        const metodoDetalle = formatUsoMetodoDetalle(u);
        return `
        <div class="mov-row">
          <div>
            <span class="mov-type entrada">${u.horas} h${u.operador ? " · " + escapeHtml(u.operador) : ""}</span>
            ${metodoDetalle ? `<div class="mov-nota">${escapeHtml(metodoDetalle)}</div>` : ""}
            ${u.nota ? `<div class="mov-nota">${escapeHtml(u.nota)}</div>` : ""}
          </div>
          <div class="mov-date">${formatFechaLarga(u.fecha)}</div>
        </div>`;
      }).join("")
    : `<div class="mov-nota" style="padding:8px 0;">Sin usos registrados todavía.</div>`;

  return `
  <div class="item-card" data-id="${eq.id}">
    <div class="item-head">
      <div>
        <div class="item-name">${escapeHtml(eq.nombre)}</div>
        <div class="item-sub">${eq.tipo ? escapeHtml(eq.tipo) : "Sin tipo"}${eq.tarifaHora ? " · " + formatCOP(eq.tarifaHora) + "/h" : ""}</div>
      </div>
      <div style="text-align:right;">
        <div class="item-stock-tag">${horasTotales} h</div>
        ${costoTotal != null ? `<div class="worker-cargo">${formatCOP(costoTotal)}</div>` : ""}
        <span class="entry-caret">▾</span>
      </div>
    </div>
    <div class="item-body">
      <div class="entry-actions" style="margin-bottom:14px;">
        <button class="btn btn-primary" data-action="add-uso" data-id="${eq.id}">+ Registrar uso</button>
        <button class="btn btn-secondary" data-action="edit-equipo" data-id="${eq.id}">Editar</button>
        <button class="btn btn-danger" data-action="delete-equipo" data-id="${eq.id}">Eliminar</button>
      </div>
      <div class="entry-block">
        <div class="k">Historial de uso</div>
        ${usoRows}
      </div>
    </div>
  </div>`;
}

async function handleDeleteEquipo(id) {
  if (!confirm("¿Eliminar este equipo y todo su historial de uso?")) return;
  await deleteEquipo(id);
  showToast("Equipo eliminado");
  renderEquipoList();
}

// ---------- Maquinaria: modal equipo ----------
const equipoModal = document.getElementById("equipoModal");
const equipoForm = document.getElementById("equipoForm");
let editingEquipoId = null;

function openNewEquipoModal() {
  editingEquipoId = null;
  equipoForm.reset();
  document.getElementById("equipoModalTitle").textContent = "Nuevo equipo";
  equipoModal.classList.add("open");
}

async function openEditEquipoModal(id) {
  const eq = await getEquipo(id);
  if (!eq) return;
  editingEquipoId = id;
  document.getElementById("equipoModalTitle").textContent = "Editar equipo";
  document.getElementById("eq-nombre").value = eq.nombre;
  document.getElementById("eq-tipo").value = eq.tipo || "";
  document.getElementById("eq-tarifa").value = eq.tarifaHora ?? "";
  equipoModal.classList.add("open");
}

function closeEquipoModal() { equipoModal.classList.remove("open"); }
document.getElementById("btnNewEquipo").addEventListener("click", openNewEquipoModal);
document.getElementById("closeEquipoModal").addEventListener("click", closeEquipoModal);
equipoModal.addEventListener("click", (e) => { if (e.target === equipoModal) closeEquipoModal(); });

equipoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const eq = {
    obraId: currentObraId,
    nombre: document.getElementById("eq-nombre").value.trim(),
    tipo: document.getElementById("eq-tipo").value.trim(),
    tarifaHora: document.getElementById("eq-tarifa").value !== "" ? parseFloat(document.getElementById("eq-tarifa").value) : null,
  };
  if (editingEquipoId) eq.id = editingEquipoId;
  await saveEquipo(eq);
  closeEquipoModal();
  showToast("Equipo guardado");
  renderEquipoList();
});

// ---------- Maquinaria: modal uso ----------
const usoModal = document.getElementById("usoModal");
const usoForm = document.getElementById("usoForm");
let usoTargetEquipoId = null;

let metodoUsoActual = "directo";

function setMetodoUsoFields(metodo) {
  metodoUsoActual = metodo;
  document.getElementById("usoDirectoWrap").style.display = metodo === "directo" ? "block" : "none";
  document.getElementById("usoHorometroWrap").style.display = metodo === "horometro" ? "flex" : "none";
  document.getElementById("usoRelojWrap").style.display = metodo === "horas_reloj" ? "flex" : "none";
  document.getElementById("usoCalculadoWrap").style.display = metodo === "directo" ? "none" : "block";
  if (metodo !== "directo") actualizarHorasCalculadasUso();
}

function actualizarHorasCalculadasUso() {
  const box = document.getElementById("usoCalculadoBox");
  let horas = null;
  if (metodoUsoActual === "horometro") {
    const ini = parseFloat(document.getElementById("u-horometroInicial").value);
    const fin = parseFloat(document.getElementById("u-horometroFinal").value);
    if (!isNaN(ini) && !isNaN(fin)) {
      if (fin < ini) { box.innerHTML = `⚠ El horómetro final no puede ser menor al inicial.`; return; }
      horas = Math.round((fin - ini) * 100) / 100;
    }
  } else if (metodoUsoActual === "horas_reloj") {
    const ini = document.getElementById("u-horaInicio").value;
    const fin = document.getElementById("u-horaFin").value;
    if (ini && fin) {
      const [ih, im] = ini.split(":").map(Number);
      const [fh, fm] = fin.split(":").map(Number);
      let mins = (fh * 60 + fm) - (ih * 60 + im);
      if (mins < 0) { box.innerHTML = `⚠ La hora de fin no puede ser antes que la de inicio.`; return; }
      horas = Math.round((mins / 60) * 100) / 100;
    }
  }
  box.innerHTML = horas != null ? `<strong>${horas} h</strong>` : "Completa los datos para calcular";
}

document.querySelectorAll("#metodoUsoChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#metodoUsoChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente"));
    chip.classList.add("selected", "sel-presente");
    setMetodoUsoFields(chip.dataset.value);
  });
});
["u-horometroInicial", "u-horometroFinal", "u-horaInicio", "u-horaFin"].forEach((id) => {
  document.getElementById(id).addEventListener("input", actualizarHorasCalculadasUso);
});

function openUsoModal(equipoId) {
  usoTargetEquipoId = equipoId;
  usoForm.reset();
  document.getElementById("u-fecha").value = new Date().toISOString().slice(0, 10);
  document.querySelectorAll("#metodoUsoChips .chip").forEach((c) => c.classList.remove("selected", "sel-presente"));
  document.querySelector("#metodoUsoChips .chip[data-value='directo']").classList.add("selected", "sel-presente");
  setMetodoUsoFields("directo");
  usoModal.classList.add("open");
}
function closeUsoModal() { usoModal.classList.remove("open"); }
document.getElementById("closeUsoModal").addEventListener("click", closeUsoModal);
usoModal.addEventListener("click", (e) => { if (e.target === usoModal) closeUsoModal(); });

usoForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  let horas = null;
  const uso = {
    equipoId: usoTargetEquipoId,
    fecha: document.getElementById("u-fecha").value,
    metodo: metodoUsoActual,
    operador: document.getElementById("u-operador").value.trim(),
    nota: document.getElementById("u-nota").value.trim(),
  };

  if (metodoUsoActual === "directo") {
    horas = parseFloat(document.getElementById("u-horas").value);
    if (isNaN(horas) || horas < 0) { showToast("Ingresa las horas trabajadas"); return; }
  } else if (metodoUsoActual === "horometro") {
    const ini = parseFloat(document.getElementById("u-horometroInicial").value);
    const fin = parseFloat(document.getElementById("u-horometroFinal").value);
    if (isNaN(ini) || isNaN(fin)) { showToast("Completa los dos horómetros"); return; }
    if (fin < ini) { showToast("El horómetro final no puede ser menor al inicial"); return; }
    horas = Math.round((fin - ini) * 100) / 100;
    uso.horometroInicial = ini;
    uso.horometroFinal = fin;
  } else if (metodoUsoActual === "horas_reloj") {
    const ini = document.getElementById("u-horaInicio").value;
    const fin = document.getElementById("u-horaFin").value;
    if (!ini || !fin) { showToast("Completa la hora de inicio y de fin"); return; }
    const [ih, im] = ini.split(":").map(Number);
    const [fh, fm] = fin.split(":").map(Number);
    const mins = (fh * 60 + fm) - (ih * 60 + im);
    if (mins < 0) { showToast("La hora de fin no puede ser antes que la de inicio"); return; }
    horas = Math.round((mins / 60) * 100) / 100;
    uso.horaInicio = ini;
    uso.horaFin = fin;
  }

  uso.horas = horas;
  await addUso(uso);
  closeUsoModal();
  showToast("Uso registrado");
  renderEquipoList();
});

// ---------- Maquinaria: reporte de horas en Excel ----------
document.getElementById("btnReporteMaquinariaExcel").addEventListener("click", async () => {
  const inicio = document.getElementById("maqReporteInicio").value;
  const fin = document.getElementById("maqReporteFin").value;
  if (!inicio || !fin) { showToast("Elige el rango de fechas"); return; }
  if (typeof ExcelJS === "undefined") { showToast("No se pudo cargar el generador de Excel"); return; }

  const btn = document.getElementById("btnReporteMaquinariaExcel");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando…";

  try {
    const obraNombre = document.getElementById("projectName").textContent;
    const equipos = await getAllEquipos();

    // Arma el detalle (uso por uso, dentro del rango) y el resumen por equipo.
    const detalle = [];
    const resumen = [];
    for (const eq of equipos) {
      const usos = (await getUsosForEquipo(eq.id)).filter((u) => u.fecha >= inicio && u.fecha <= fin);
      if (!usos.length) continue;
      const horasEquipo = usos.reduce((s, u) => s + (u.horas || 0), 0);
      const costoEquipo = eq.tarifaHora ? horasEquipo * eq.tarifaHora : null;
      resumen.push({ nombre: eq.nombre, tipo: eq.tipo || "—", horas: horasEquipo, costo: costoEquipo });
      usos.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((u) => {
        const metodoDetalle = formatUsoMetodoDetalle(u);
        const notaCompleta = [metodoDetalle, u.nota].filter(Boolean).join(" — ");
        detalle.push({ equipo: eq.nombre, fecha: u.fecha, operador: u.operador || "—", horas: u.horas, nota: notaCompleta });
      });
    }

    if (!detalle.length) { showToast("No hay usos de maquinaria en este periodo"); btn.disabled = false; btn.textContent = originalLabel; return; }

    const totalHoras = resumen.reduce((s, r) => s + r.horas, 0);
    const totalCosto = resumen.reduce((s, r) => s + (r.costo || 0), 0);
    const hayCostos = resumen.some((r) => r.costo != null);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Residente de Obra";
    wb.created = new Date();
    const ws = wb.addWorksheet("Maquinaria");
    const numColsResumen = hayCostos ? 4 : 3;
    const numColsDetalle = 5;
    const numCols = Math.max(numColsResumen, numColsDetalle);
    const lastCol = String.fromCharCode(64 + numCols); // A=65

    ws.columns = new Array(numCols).fill(0).map((_, i) => ({ width: i === 0 ? 24 : 16 }));

    // ---- Encabezado ----
    ws.mergeCells(`A1:${lastCol}1`);
    ws.getCell("A1").value = "Reporte de maquinaria — Horas trabajadas";
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16324F" } };
    ws.getRow(1).height = 26;

    ws.mergeCells(`A2:${lastCol}2`);
    ws.getCell("A2").value = `Obra: ${obraNombre}`;
    ws.getCell("A2").font = { bold: true, size: 11 };
    ws.mergeCells(`A3:${lastCol}3`);
    ws.getCell("A3").value = `Periodo: ${formatFechaLarga(inicio)} — ${formatFechaLarga(fin)}`;
    ws.getCell("A3").font = { size: 10, color: { argb: "FF5B6960" } };
    ws.mergeCells(`A4:${lastCol}4`);
    ws.getCell("A4").value = `Generado: ${formatFechaLarga(new Date().toISOString().slice(0, 10))}`;
    ws.getCell("A4").font = { size: 9, italic: true, color: { argb: "FF5B6960" } };

    // ---- Resumen por equipo ----
    ws.addRow([]);
    const tituloResumenRow = ws.addRow(["Resumen por equipo"]);
    ws.mergeCells(`A${tituloResumenRow.number}:${lastCol}${tituloResumenRow.number}`);
    tituloResumenRow.font = { bold: true, size: 12, color: { argb: "FF16324F" } };

    const encResumen = hayCostos ? ["Equipo", "Tipo", "Horas", "Costo estimado"] : ["Equipo", "Tipo", "Horas"];
    const headerResumenRow = ws.addRow(encResumen);
    headerResumenRow.eachCell((cell, colNumber) => {
      if (colNumber > numColsResumen) return;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3D7A4D" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    resumen.forEach((r) => {
      const fila = hayCostos ? [r.nombre, r.tipo, r.horas, r.costo != null ? formatCOP(r.costo) : "—"] : [r.nombre, r.tipo, r.horas];
      const row = ws.addRow(fila);
      row.eachCell((cell, colNumber) => {
        if (colNumber > numColsResumen) return;
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { horizontal: colNumber === 1 ? "left" : "center" };
      });
    });

    const totalResumenFila = hayCostos ? ["Total general", "", totalHoras, formatCOP(totalCosto)] : ["Total general", "", totalHoras];
    const totalResumenRow = ws.addRow(totalResumenFila);
    totalResumenRow.font = { bold: true };
    ws.mergeCells(`A${totalResumenRow.number}:B${totalResumenRow.number}`);

    // ---- Detalle de usos ----
    ws.addRow([]);
    const tituloDetalleRow = ws.addRow(["Detalle de usos registrados"]);
    ws.mergeCells(`A${tituloDetalleRow.number}:${lastCol}${tituloDetalleRow.number}`);
    tituloDetalleRow.font = { bold: true, size: 12, color: { argb: "FF16324F" } };

    const headerDetalleRow = ws.addRow(["Equipo", "Fecha", "Operador", "Horas", "Nota"]);
    headerDetalleRow.eachCell((cell, colNumber) => {
      if (colNumber > numColsDetalle) return;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16324F" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    detalle.forEach((d) => {
      const row = ws.addRow([d.equipo, formatFechaLarga(d.fecha), d.operador, d.horas, d.nota]);
      row.eachCell((cell, colNumber) => {
        if (colNumber > numColsDetalle) return;
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { horizontal: colNumber === 1 || colNumber === 5 ? "left" : "center" };
      });
    });

    ws.views = [{ state: "frozen", ySplit: 6 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = obraNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    a.download = `maquinaria-${slug}-${inicio}_a_${fin}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Reporte Excel descargado");
  } catch (err) {
    console.error(err);
    showToast("No se pudo generar el Excel");
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

// ---------- Nómina ----------
let nominaInicio, nominaFin;

function defaultNominaRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  nominaInicio = first.toISOString().slice(0, 10);
  nominaFin = now.toISOString().slice(0, 10);
}

async function renderNominaScreen() {
  if (!nominaInicio) defaultNominaRange();
  document.getElementById("nominaInicioInput").value = nominaInicio;
  document.getElementById("nominaFinInput").value = nominaFin;
  await calcularYRenderNomina();
  renderPagosHistorial();
}

async function calcularYRenderNomina() {
  const [workers, registros] = await Promise.all([getAllWorkers(), getAsistenciaRange(nominaInicio, nominaFin)]);

  const filas = workers.map((w) => {
    const regs = registros.filter((r) => r.workerId === w.id);
    const diasPresente = regs.filter((r) => r.estado === "presente").length;
    const diasAusente = regs.filter((r) => r.estado === "ausente").length;
    const horasExtra = regs.reduce((sum, r) => sum + (r.horasExtra || 0), 0);
    const pagoBase = diasPresente * (w.valorDia || 0);
    const pagoExtra = horasExtra * (w.valorHoraExtra || 0);
    return { workerId: w.id, nombre: w.nombre, cargo: w.cargo || "", diasPresente, diasAusente, horasExtra, valorDia: w.valorDia || 0, valorHoraExtra: w.valorHoraExtra || 0, pagoBase, pagoExtra, total: pagoBase + pagoExtra };
  });

  window._nominaFilas = filas;
  const totalGeneral = filas.reduce((s, f) => s + f.total, 0);

  document.getElementById("nominaResumen").innerHTML = `
    <div class="stat-row">
      <div class="stat-box"><div class="num">${formatCOP(totalGeneral)}</div><div class="label">TOTAL DEL PERIODO</div></div>
      <div class="stat-box"><div class="num">${filas.length}</div><div class="label">TRABAJADORES</div></div>
    </div>`;

  const el = document.getElementById("nominaList");
  if (!filas.length) {
    el.innerHTML = `<div class="empty-state"><div class="big">💵</div><p>Registra trabajadores y su asistencia para calcular la nómina.</p></div>`;
    return;
  }
  if (filas.every((f) => !f.valorDia && !f.valorHoraExtra)) {
    el.innerHTML = `<div class="low-stock-banner">⚠ Ningún trabajador tiene valor/día definido todavía. Edítalos desde "Gestionar personal" en Asistencia para que la nómina calcule montos.</div>` + el.innerHTML;
  }

  el.innerHTML = filas.map((f) => `
    <div class="entry" data-id="${f.workerId}">
      <div class="entry-head">
        <div>
          <div class="entry-date">${escapeHtml(f.nombre)}</div>
          <div class="entry-meta">${f.diasPresente} días · ${f.horasExtra}h extra</div>
        </div>
        <div style="text-align:right;">
          <div class="item-stock-tag">${formatCOP(f.total)}</div>
          <span class="entry-caret">▾</span>
        </div>
      </div>
      <div class="entry-body">
        <div class="entry-block"><div class="k">Días presente</div><div class="v">${f.diasPresente} × ${formatCOP(f.valorDia)} = ${formatCOP(f.pagoBase)}</div></div>
        <div class="entry-block"><div class="k">Horas extra</div><div class="v">${f.horasExtra} × ${formatCOP(f.valorHoraExtra)} = ${formatCOP(f.pagoExtra)}</div></div>
        <div class="entry-block"><div class="k">Días ausente en el periodo</div><div class="v">${f.diasAusente}</div></div>
        <div class="entry-block"><div class="k">Total a pagar</div><div class="v" style="font-weight:600;color:var(--turf-dark);">${formatCOP(f.total)}</div></div>
      </div>
    </div>`).join("");

  el.querySelectorAll(".entry-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
}

document.getElementById("nominaInicioInput").addEventListener("change", (e) => { nominaInicio = e.target.value; calcularYRenderNomina(); });
document.getElementById("nominaFinInput").addEventListener("change", (e) => { nominaFin = e.target.value; calcularYRenderNomina(); });

document.getElementById("btnRegistrarPago").addEventListener("click", async () => {
  const filas = window._nominaFilas || [];
  if (!filas.length) return;
  const totalGeneral = filas.reduce((s, f) => s + f.total, 0);
  if (!confirm(`¿Registrar este pago de nómina por ${formatCOP(totalGeneral)} para el periodo ${formatFechaLarga(nominaInicio)} – ${formatFechaLarga(nominaFin)}? Quedará guardado como historial.`)) return;

  await savePago({
    obraId: currentObraId,
    fechaInicio: nominaInicio,
    fechaFin: nominaFin,
    fechaRegistro: new Date().toISOString().slice(0, 10),
    detalle: filas,
    totalGeneral,
  });
  showToast("Pago registrado en el historial");
  renderPagosHistorial();
});

document.getElementById("btnImprimirNomina").addEventListener("click", () => {
  const filas = window._nominaFilas || [];
  const rows = filas.map((f) => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ccc;">${f.nombre}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;">${f.diasPresente}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;">${f.horasExtra}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;">${formatCOP(f.pagoBase)}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;">${formatCOP(f.pagoExtra)}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;"><b>${formatCOP(f.total)}</b></td>
    </tr>`).join("");
  const totalGeneral = filas.reduce((s, f) => s + f.total, 0);

  document.getElementById("print-area").innerHTML = `
    <h2 style="font-family:sans-serif;">Nómina — ${formatFechaLarga(nominaInicio)} a ${formatFechaLarga(nominaFin)}</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:0.85rem;width:100%;">
      <thead><tr>
        <th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">Trabajador</th>
        <th style="padding:4px 8px;border:1px solid #ccc;">Días</th>
        <th style="padding:4px 8px;border:1px solid #ccc;">H. extra</th>
        <th style="padding:4px 8px;border:1px solid #ccc;">Pago base</th>
        <th style="padding:4px 8px;border:1px solid #ccc;">Pago extra</th>
        <th style="padding:4px 8px;border:1px solid #ccc;">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-family:sans-serif;margin-top:10px;"><b>Total general: ${formatCOP(totalGeneral)}</b></p>
  `;
  window.print();
});

// ---------- Nómina: reporte calendario de asistencia (Excel) ----------
const MESES_MAYUS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const LETRA_DIA_SEMANA = ["D", "L", "M", "M", "J", "V", "S"]; // índice = Date.getDay(), 0=domingo

function addDiasISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dividirEnBloques(inicio, fin) {
  const bloques = [];
  let cursor = inicio;
  while (cursor <= fin) {
    const finBloque = addDiasISO(cursor, 27) > fin ? fin : addDiasISO(cursor, 27);
    bloques.push({ inicio: cursor, fin: finBloque });
    cursor = addDiasISO(finBloque, 1);
  }
  return bloques;
}

function tituloBloqueCalendario(inicio, fin) {
  const mesIni = MESES_MAYUS[parseInt(inicio.split("-")[1], 10) - 1];
  const mesFin = MESES_MAYUS[parseInt(fin.split("-")[1], 10) - 1];
  return mesIni === mesFin ? mesIni : `${mesIni}-${mesFin}`;
}

document.getElementById("btnReporteCalendarioExcel").addEventListener("click", async () => {
  if (typeof ExcelJS === "undefined") { showToast("No se pudo cargar el generador de Excel"); return; }
  const btn = document.getElementById("btnReporteCalendarioExcel");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando…";

  try {
    const workers = await getAllWorkers();
    if (!workers.length) { showToast("No tienes personal registrado"); return; }

    // Trae asistencia con una semana extra de colchón antes del inicio, para poder
    // evaluar la regla del domingo aunque el periodo empiece a mitad de semana.
    const fechaColchon = addDiasISO(nominaInicio, -7);
    const registros = await getAsistenciaRange(fechaColchon, nominaFin);
    const asistMap = new Map();
    registros.forEach((r) => asistMap.set(`${r.workerId}_${r.fecha}`, r.estado));

    function trabajoEseDia(workerId, fechaISO) {
      const dow = new Date(fechaISO + "T00:00:00").getDay();
      if (dow !== 0) return asistMap.get(`${workerId}_${fechaISO}`) === "presente";
      // Domingo: cuenta solo si Lunes a Sábado de esa semana están completos.
      for (let i = 1; i <= 6; i++) {
        const iso = addDiasISO(fechaISO, -i);
        if (asistMap.get(`${workerId}_${iso}`) !== "presente") return false;
      }
      return true;
    }

    const bloques = dividirEnBloques(nominaInicio, nominaFin);
    const obraNombre = document.getElementById("projectName").textContent;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Residente de Obra";
    wb.created = new Date();
    const ws = wb.addWorksheet("Calendario asistencia");

    const COL_FIJAS = 3; // #, Nombre, Cargo
    const totalesGenerales = {}; // workerId -> suma de todos los bloques

    // ---- Encabezado general ----
    ws.getCell("A1").value = `Reporte de asistencia — ${obraNombre}`;
    ws.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF16324F" } };
    ws.getCell("A2").value = `Periodo: ${formatFechaLarga(nominaInicio)} — ${formatFechaLarga(nominaFin)}`;
    ws.getCell("A2").font = { size: 10, color: { argb: "FF5B6960" } };
    let filaActual = 4;

    bloques.forEach((bloque, idxBloque) => {
      const dias = [];
      let d = bloque.inicio;
      while (d <= bloque.fin) { dias.push(d); d = addDiasISO(d, 1); }
      const numColsDias = dias.length;
      const colTotalBloque = COL_FIJAS + numColsDias + 1;
      const esUltimoBloque = idxBloque === bloques.length - 1;
      const totalCols = esUltimoBloque ? colTotalBloque + 1 : colTotalBloque;

      // Título del bloque (mes o rango de meses), centrado sobre las columnas de días
      const filaTitulo = filaActual;
      ws.mergeCells(filaTitulo, COL_FIJAS + 1, filaTitulo, COL_FIJAS + numColsDias);
      const tituloCell = ws.getCell(filaTitulo, COL_FIJAS + 1);
      tituloCell.value = tituloBloqueCalendario(bloque.inicio, bloque.fin);
      tituloCell.font = { bold: true, size: 12 };
      tituloCell.alignment = { horizontal: "center" };

      // Fila de letras de día de la semana
      const filaLetras = filaActual + 1;
      ws.getCell(filaLetras, 1).value = "#";
      ws.getCell(filaLetras, 2).value = "NOMBRE";
      ws.getCell(filaLetras, 3).value = "CARGO";
      dias.forEach((iso, i) => {
        const dow = new Date(iso + "T00:00:00").getDay();
        const cell = ws.getCell(filaLetras, COL_FIJAS + 1 + i);
        cell.value = LETRA_DIA_SEMANA[dow];
        cell.font = { bold: true, color: { argb: dow === 0 ? "FFFFFFFF" : "FF16324F" } };
        cell.alignment = { horizontal: "center" };
        if (dow === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE07B39" } };
      });
      ws.getCell(filaLetras, COL_FIJAS + numColsDias + 1).value = "TOTAL DÍAS";
      if (esUltimoBloque) ws.getCell(filaLetras, COL_FIJAS + numColsDias + 2).value = "TOTAL GENERAL";
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(filaLetras, c);
        cell.font = cell.font || { bold: true };
        if (c <= COL_FIJAS || c > COL_FIJAS + numColsDias) {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16324F" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      }

      // Fila de números del día
      const filaNums = filaActual + 2;
      dias.forEach((iso, i) => {
        const dow = new Date(iso + "T00:00:00").getDay();
        const cell = ws.getCell(filaNums, COL_FIJAS + 1 + i);
        cell.value = parseInt(iso.split("-")[2], 10);
        cell.font = { bold: true, color: { argb: dow === 0 ? "FFFFFFFF" : "FF1C2620" } };
        cell.alignment = { horizontal: "center" };
        if (dow === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE07B39" } };
      });

      // Filas de trabajadores
      workers.forEach((w, idxW) => {
        const fila = filaActual + 3 + idxW;
        ws.getCell(fila, 1).value = idxW + 1;
        ws.getCell(fila, 2).value = w.nombre;
        ws.getCell(fila, 3).value = w.cargo || "";
        let totalBloque = 0;
        dias.forEach((iso, i) => {
          const dow = new Date(iso + "T00:00:00").getDay();
          const trabajo = trabajoEseDia(w.id, iso);
          if (trabajo) totalBloque++;
          const cell = ws.getCell(fila, COL_FIJAS + 1 + i);
          if (dow === 0) {
            cell.value = trabajo ? 1 : 0;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4C9A8" } };
            cell.font = { color: { argb: "FF8A4A1E" } };
          } else if (trabajo) {
            cell.value = 1;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBEE3EF" } };
            cell.font = { bold: true, color: { argb: "FF0F5068" } };
          }
          cell.alignment = { horizontal: "center" };
          cell.border = { top: { style: "thin", color: { argb: "FFDDDDDD" } }, left: { style: "thin", color: { argb: "FFDDDDDD" } }, bottom: { style: "thin", color: { argb: "FFDDDDDD" } }, right: { style: "thin", color: { argb: "FFDDDDDD" } } };
        });
        const totalCell = ws.getCell(fila, COL_FIJAS + numColsDias + 1);
        totalCell.value = totalBloque;
        totalCell.font = { bold: true };
        totalCell.alignment = { horizontal: "center" };

        totalesGenerales[w.id] = (totalesGenerales[w.id] || 0) + totalBloque;
        if (esUltimoBloque) {
          const tgCell = ws.getCell(fila, COL_FIJAS + numColsDias + 2);
          tgCell.value = totalesGenerales[w.id];
          tgCell.font = { bold: true, color: { argb: "FF3D7A4D" } };
          tgCell.alignment = { horizontal: "center" };
        }
      });

      filaActual = filaActual + 3 + workers.length + 2; // espacio entre bloques
    });

    ws.getColumn(1).width = 4;
    ws.getColumn(2).width = 22;
    ws.getColumn(3).width = 16;
    for (let c = COL_FIJAS + 1; c <= ws.columnCount; c++) {
      if (!ws.getColumn(c).width) ws.getColumn(c).width = 6;
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = obraNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    a.download = `calendario-asistencia-${slug}-${nominaInicio}_a_${nominaFin}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Reporte calendario descargado");
  } catch (err) {
    console.error(err);
    showToast("No se pudo generar el Excel");
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

async function renderPagosHistorial() {
  const pagos = await getAllPagos();
  const el = document.getElementById("pagosHistorialList");
  if (!pagos.length) { el.innerHTML = `<div class="backup-note">Todavía no has registrado ningún pago de nómina.</div>`; return; }

  el.innerHTML = pagos.map((p) => `
    <div class="entry" data-id="${p.id}">
      <div class="entry-head">
        <div>
          <div class="entry-date">${formatFechaLarga(p.fechaInicio)} – ${formatFechaLarga(p.fechaFin)}</div>
          <div class="entry-meta">Registrado ${formatFechaLarga(p.fechaRegistro)} · ${p.detalle.length} trabajadores</div>
        </div>
        <div style="text-align:right;">
          <div class="item-stock-tag">${formatCOP(p.totalGeneral)}</div>
          <span class="entry-caret">▾</span>
        </div>
      </div>
      <div class="entry-body">
        ${p.detalle.map((f) => `<div class="mov-row"><span>${escapeHtml(f.nombre)}</span><span>${formatCOP(f.total)}</span></div>`).join("")}
        <div class="entry-actions">
          <button class="btn btn-danger" data-action="delete-pago" data-id="${p.id}">Eliminar del historial</button>
        </div>
      </div>
    </div>`).join("");

  el.querySelectorAll(".entry-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });
  el.querySelectorAll("[data-action='delete-pago']").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm("¿Eliminar este registro de pago del historial?")) return;
      await deletePago(parseInt(btn.dataset.id));
      renderPagosHistorial();
    });
  });
}

// ---------- Almacenamiento persistente y recordatorio de respaldo ----------
// Le pide a Chrome que NO borre los datos de este sitio automáticamente si el
// teléfono se queda con poco espacio. No es garantía absoluta, pero reduce
// mucho el riesgo. Además, un simple desinstalar/reinstalar de la app SIGUE
// borrando los datos — por eso el recordatorio de respaldo de abajo es clave.
async function setupAlmacenamientoPersistente() {
  const el = document.getElementById("storagePersistStatus");
  if (!el) return;
  if (!(navigator.storage && navigator.storage.persist)) {
    el.textContent = "Tu navegador no soporta esta protección.";
    return;
  }
  try {
    let persisted = await navigator.storage.persisted();
    if (!persisted) persisted = await navigator.storage.persist();
    el.textContent = persisted
      ? "✓ Activado — Chrome evitará borrar los datos de esta app aunque el teléfono se quede sin espacio."
      : "No se pudo activar todavía. Suele activarse solo después de usar la app varios días seguidos, o si la agregas a la pantalla de inicio.";
    el.style.color = persisted ? "var(--turf-dark)" : "var(--ink-soft)";
  } catch (err) {
    el.textContent = "No se pudo verificar.";
  }
}

async function renderBackupReminder() {
  const el = document.getElementById("inicioBackupBanner");
  if (!el) return;
  const ultima = await getSetting("ultimoBackupFecha");
  const hoy = new Date();
  let dias = null;
  if (ultima) {
    dias = Math.round((hoy - new Date(ultima + "T00:00:00")) / 86400000);
  }
  // Solo molesta si de verdad hay algo que perder.
  const hayDatos = (await getAllEntries()).length > 0 || (await getAllItems()).length > 0 || (await getAllWorkers()).length > 0;
  if (!hayDatos) { el.innerHTML = ""; return; }

  if (ultima === null) {
    el.innerHTML = `<div class="low-stock-banner" style="cursor:pointer;" id="backupBannerClick">⚠ Nunca has hecho una copia de seguridad. Tus datos viven solo en este teléfono — si se desinstala la app o se pierde el celular, se pierden. <span style="text-decoration:underline;">Hacer copia ahora →</span></div>`;
  } else if (dias >= 7) {
    el.innerHTML = `<div class="low-stock-banner" style="cursor:pointer;" id="backupBannerClick">⚠ Tu última copia de seguridad fue hace ${dias} días. <span style="text-decoration:underline;">Hacer una copia nueva →</span></div>`;
  } else {
    el.innerHTML = "";
    return;
  }
  document.getElementById("backupBannerClick").addEventListener("click", () => {
    document.getElementById("btnExport").scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("btnExport").click();
  });
}

// ---------- Configuración de IA (Inicio) ----------
async function renderAiSettings() {
  const key = await getSetting("geminiApiKey");
  const input = document.getElementById("geminiKeyInput");
  const status = document.getElementById("geminiKeyStatus");
  input.value = key || "";
  status.textContent = key
    ? "✓ IA activada — el botón ✨ Mejorar usará redacción con inteligencia artificial."
    : "Sin clave configurada — el botón ✨ Mejorar hará una limpieza básica de texto.";
  status.style.color = key ? "var(--turf-dark)" : "var(--ink-soft)";
}

document.getElementById("btnGuardarGeminiKey").addEventListener("click", async () => {
  const val = document.getElementById("geminiKeyInput").value.trim();
  if (!val) { showToast("Pega tu clave primero"); return; }
  await setSetting("geminiApiKey", val);
  showToast("Clave guardada");
  renderAiSettings();
});

document.getElementById("btnBorrarGeminiKey").addEventListener("click", async () => {
  if (!confirm("¿Quitar la clave de IA? El botón Mejorar volverá a la limpieza básica.")) return;
  await setSetting("geminiApiKey", "");
  document.getElementById("geminiKeyInput").value = "";
  showToast("Clave eliminada");
  renderAiSettings();
});

// ---------- Bitácora: materiales recibidos (conectado al Inventario) ----------
let currentMatRec = [];      // filas del formulario: {itemId?, nombre, unidad, categoria, cantidad, nuevo?, movId?}
let originalMatRec = [];     // filas con las que se abrió el registro (para no duplicar al editar)
let originalMatRecSig = "";

function fmtCantidad(n) { return String(Math.round(n * 100) / 100); }

function firmaMatRec(filas, fecha) {
  return filas.map((r) => `${r.itemId ? "i" + r.itemId : "n:" + r.nombre.toLowerCase()}|${r.cantidad}`).join(";") + "@" + fecha;
}

function formatMaterialesEntry(entry) {
  const partes = [];
  (entry.materialesRecibidos || []).forEach((r) => {
    partes.push(`${fmtCantidad(r.cantidad)} ${escapeHtml(r.unidad || "")} de ${escapeHtml(r.nombre)}`.replace("  ", " "));
  });
  if (entry.materiales) partes.push(escapeHtml(entry.materiales).replace(/\n/g, "<br>"));
  return partes.length ? partes.join("<br>") : null;
}

function renderMatRecList() {
  const el = document.getElementById("matRecList");
  el.innerHTML = currentMatRec.map((r, i) => `
    <div class="matrec-row">
      <div><b>${fmtCantidad(r.cantidad)}</b> ${escapeHtml(r.unidad || "")} · ${escapeHtml(r.nombre)}${r.nuevo ? '<span class="nuevo-tag">NUEVO</span>' : ""}</div>
      <button type="button" data-i="${i}" aria-label="Quitar">✕</button>
    </div>`).join("");
  el.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => {
    currentMatRec.splice(parseInt(b.dataset.i, 10), 1);
    renderMatRecList();
  }));
}

function getMov(id) {
  return new Promise((resolve, reject) => {
    const req = tx("inv_movs", "readonly").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}
function deleteMov(id) {
  return new Promise((resolve, reject) => {
    const req = tx("inv_movs", "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// Deshace lo que un registro sumó al inventario (borra el movimiento y resta el stock).
async function revertirMatRec(filas) {
  for (const r of filas || []) {
    if (!r.movId) continue;
    const mov = await getMov(r.movId);
    if (!mov) continue;
    await deleteMov(r.movId);
    const item = await getItem(mov.itemId);
    if (item) { item.stock = item.stock - mov.cantidad; await saveItem(item); }
  }
}

// Crea los materiales nuevos, registra las entradas y devuelve las filas ya con itemId/movId.
async function aplicarMatRec(filas, fecha) {
  const resultado = [];
  const creados = {};
  const existentes = await getAllItems();
  for (const r of filas) {
    let item = r.itemId ? await getItem(r.itemId) : null;
    if (!item) {
      const clave = r.nombre.trim().toLowerCase();
      item = creados[clave] || existentes.find((it) => it.nombre.trim().toLowerCase() === clave) || null;
    }
    if (!item) {
      const cats = await getAllCategoriasInventario();
      item = { obraId: currentObraId, nombre: r.nombre.trim(), categoria: r.categoria || (cats[0] && cats[0].nombre) || "", unidad: r.unidad || "", stock: 0, minimo: null };
      item.id = await saveItem(item);
    }
    creados[item.nombre.trim().toLowerCase()] = item;
    const movId = await addMov({ itemId: item.id, tipo: "entrada", cantidad: r.cantidad, fecha, nota: "Recibido — registro de Bitácora" });
    const fresco = await getItem(item.id);
    fresco.stock = fresco.stock + r.cantidad;
    await saveItem(fresco);
    resultado.push({ itemId: item.id, nombre: item.nombre, unidad: item.unidad, categoria: item.categoria, cantidad: r.cantidad, movId });
  }
  return resultado;
}

const matRecModal = document.getElementById("matRecModal");

async function llenarSelectLista(selId, lista, valor) {
  const sel = document.getElementById(selId);
  sel.innerHTML = lista.map((x) => `<option value="${escapeHtml(x.nombre)}">${escapeHtml(x.nombre)}</option>`).join("");
  if (valor) sel.value = valor;
}

async function openMatRecModal() {
  const items = await getAllItems();
  const sel = document.getElementById("mr-item");
  const porCat = {};
  items.forEach((it) => { (porCat[it.categoria || "Sin categoría"] = porCat[it.categoria || "Sin categoría"] || []).push(it); });
  sel.innerHTML = `<option value="">— Elige un material del inventario —</option><option value="__nuevo__">➕ Material nuevo (no está en el inventario)</option>` +
    Object.keys(porCat).sort().map((cat) => `<optgroup label="${escapeHtml(cat)}">${porCat[cat].map((it) => `<option value="${it.id}">${escapeHtml(it.nombre)} (${escapeHtml(it.unidad || "")})</option>`).join("")}</optgroup>`).join("");
  await llenarSelectLista("mr-categoria", await getAllCategoriasInventario());
  await llenarSelectLista("mr-unidad", await getAllUnidadesInventario());
  document.getElementById("mr-nombre").value = "";
  document.getElementById("mr-cantidad").value = "";
  sel.value = items.length ? "" : "__nuevo__";
  actualizarMatRecModal();
  matRecModal.classList.add("open");
}

async function actualizarMatRecModal() {
  const v = document.getElementById("mr-item").value;
  document.getElementById("mrNuevoBox").style.display = v === "__nuevo__" ? "block" : "none";
  let u = "";
  if (v && v !== "__nuevo__") { const it = await getItem(parseInt(v, 10)); u = it ? `(${it.unidad || ""})` : ""; }
  document.getElementById("mrUnidadTxt").textContent = u;
}

document.getElementById("btnAddMatRec").addEventListener("click", openMatRecModal);
document.getElementById("closeMatRecModal").addEventListener("click", () => matRecModal.classList.remove("open"));
matRecModal.addEventListener("click", (e) => { if (e.target === matRecModal) matRecModal.classList.remove("open"); });
document.getElementById("mr-item").addEventListener("change", actualizarMatRecModal);

document.getElementById("btnMrAgregar").addEventListener("click", async () => {
  const v = document.getElementById("mr-item").value;
  const cantidad = parseFloat(document.getElementById("mr-cantidad").value);
  if (!v) { showToast("Elige un material o crea uno nuevo"); return; }
  if (!(cantidad > 0)) { showToast("Escribe la cantidad recibida"); return; }
  if (v === "__nuevo__") {
    const nombre = document.getElementById("mr-nombre").value.trim();
    if (!nombre) { showToast("Escribe el nombre del material"); return; }
    const existentes = await getAllItems();
    const igual = existentes.find((it) => it.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (igual) {
      currentMatRec.push({ itemId: igual.id, nombre: igual.nombre, unidad: igual.unidad, categoria: igual.categoria, cantidad });
      showToast(`"${igual.nombre}" ya estaba en tu inventario; se usó ese`);
    } else {
      currentMatRec.push({ nombre, unidad: document.getElementById("mr-unidad").value, categoria: document.getElementById("mr-categoria").value, cantidad, nuevo: true });
    }
  } else {
    const it = await getItem(parseInt(v, 10));
    currentMatRec.push({ itemId: it.id, nombre: it.nombre, unidad: it.unidad, categoria: it.categoria, cantidad });
  }
  renderMatRecList();
  matRecModal.classList.remove("open");
});

// ---------- Modal: nuevo / editar registro de bitácora ----------
const modal = document.getElementById("entryModal");
const form = document.getElementById("entryForm");

function openNewModal() {
  editingId = null;
  currentPhotos = [];
  currentMatRec = [];
  originalMatRec = [];
  originalMatRecSig = "";
  renderMatRecList();
  form.reset();
  document.getElementById("modalTitle").textContent = "Nuevo registro";
  document.getElementById("f-fecha").value = new Date().toISOString().slice(0, 10);
  resetClimaFields();
  resetAiUndo();
  renderPhotoGrid();
  actualizarResumenesFecha();
  getSetting("horarioPorDefecto").then((hp) => {
    document.getElementById("f-horario-desde").value = (hp && hp.desde) || "";
    document.getElementById("f-horario-hasta").value = (hp && hp.hasta) || "";
    document.getElementById("f-horario-descanso").value = ((hp && hp.descansoMin != null ? hp.descansoMin : DESCANSO_DEFECTO_MIN) / 60);
    actualizarHorarioTotal();
  });
  document.getElementById("f-cuenta-dia").checked = true;
  modal.classList.add("open");
}

async function openEditModal(id) {
  const entries = await getAllEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  editingId = id;
  currentPhotos = [...(entry.fotos || [])];
  originalMatRec = (entry.materialesRecibidos || []).map((r) => ({ ...r }));
  currentMatRec = originalMatRec.map((r) => ({ ...r }));
  originalMatRecSig = firmaMatRec(originalMatRec, entry.fecha);
  renderMatRecList();
  document.getElementById("modalTitle").textContent = "Editar registro";
  document.getElementById("f-fecha").value = entry.fecha;
  document.getElementById("f-actividades").value = entry.actividades || "";
  document.getElementById("f-materiales").value = entry.materiales || "";
  document.getElementById("f-incidentes").value = entry.incidentes || "";
  setClimaFields(entry.clima);
  document.getElementById("f-horario-desde").value = entry.horarioDesde || "";
  document.getElementById("f-horario-hasta").value = entry.horarioHasta || "";
  document.getElementById("f-horario-descanso").value = (entry.horarioDescansoMin != null ? entry.horarioDescansoMin : DESCANSO_DEFECTO_MIN) / 60;
  actualizarHorarioTotal();
  document.getElementById("f-cuenta-dia").checked = entry.cuentaComoDia !== false;
  resetAiUndo();
  renderPhotoGrid();
  actualizarResumenesFecha();
  modal.classList.add("open");
}

// ---------- Bitácora: personal automático desde Asistencia ----------
async function computePersonalResumen(fecha) {
  if (!fecha) return { detalle: [], total: 0 };
  const [workers, registros, cargos] = await Promise.all([getAllWorkers(), getAsistenciaForFecha(fecha), getAllCargos()]);
  const cargoMap = {};
  cargos.forEach((c) => { cargoMap[c.nombre] = c; });
  const presentesIds = new Set(registros.filter((r) => r.estado === "presente").map((r) => r.workerId));
  const counts = {};
  workers.forEach((w) => {
    if (presentesIds.has(w.id)) {
      const key = w.cargo || "Sin cargo";
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  const ordenCargos = cargos.map((c) => c.nombre).filter((n) => counts[n]);
  const extras = Object.keys(counts).filter((n) => !ordenCargos.includes(n));
  const detalle = [...ordenCargos, ...extras].map((nombre) => ({
    cargo: nombre,
    cargoPlural: (cargoMap[nombre] && cargoMap[nombre].nombrePlural) || nombre,
    cantidad: counts[nombre],
  }));
  const total = detalle.reduce((s, d) => s + d.cantidad, 0);
  return { detalle, total };
}

function formatPersonalDetalle(detalle) {
  return detalle.map((d) => `${d.cantidad} ${d.cantidad === 1 ? d.cargo : d.cargoPlural}`).join(", ");
}

let personalResumenActual = { detalle: [], total: 0 };

async function actualizarPersonalResumen() {
  const fecha = document.getElementById("f-fecha").value;
  const box = document.getElementById("personalResumenBox");
  if (!fecha) { box.textContent = "Elige una fecha primero"; personalResumenActual = { detalle: [], total: 0 }; return; }
  personalResumenActual = await computePersonalResumen(fecha);
  box.innerHTML = personalResumenActual.detalle.length
    ? `${formatPersonalDetalle(personalResumenActual.detalle)}<br><strong>Total: ${personalResumenActual.total}</strong>`
    : `Nadie marcado como "Presente" en Asistencia para esta fecha. <a href="#" id="linkIrAsistencia" style="color:var(--turf-dark);">Ir a Asistencia →</a>`;
  const link = document.getElementById("linkIrAsistencia");
  if (link) link.addEventListener("click", (e) => { e.preventDefault(); closeModal(); goToScreen("asistencia"); });
}

// ---------- Bitácora: maquinaria automática desde Maquinaria ----------
async function computeMaquinariaResumen(fecha) {
  if (!fecha) return { detalle: [] };
  const equipos = await getAllEquipos();
  const detalle = [];
  for (const eq of equipos) {
    const usos = await getUsosForEquipo(eq.id);
    const usosDelDia = usos.filter((u) => u.fecha === fecha);
    if (usosDelDia.length) {
      const horas = usosDelDia.reduce((s, u) => s + (u.horas || 0), 0);
      detalle.push({ equipo: eq.nombre, horas });
    }
  }
  return { detalle };
}

function formatMaquinariaDetalle(detalle) {
  return detalle.map((d) => `${d.equipo} (${d.horas}h)`).join(", ");
}

function formatMaquinariaEntry(entry) {
  if (Array.isArray(entry.maquinariaDetalle)) {
    return entry.maquinariaDetalle.length ? formatMaquinariaDetalle(entry.maquinariaDetalle) : "No se utilizó maquinaria";
  }
  return entry.maquinaria || "No se utilizó maquinaria"; // registro antiguo: texto libre o nada
}

let maquinariaResumenActual = { detalle: [] };

async function actualizarMaquinariaResumen() {
  const fecha = document.getElementById("f-fecha").value;
  const box = document.getElementById("maquinariaResumenBox");
  if (!fecha) { box.textContent = "Elige una fecha primero"; maquinariaResumenActual = { detalle: [] }; return; }
  maquinariaResumenActual = await computeMaquinariaResumen(fecha);
  box.innerHTML = maquinariaResumenActual.detalle.length
    ? formatMaquinariaDetalle(maquinariaResumenActual.detalle)
    : `No se utilizó maquinaria (no hay usos registrados en Maquinaria para esta fecha). <a href="#" id="linkIrMaquinaria" style="color:var(--turf-dark);">Ir a Maquinaria →</a>`;
  const link = document.getElementById("linkIrMaquinaria");
  if (link) link.addEventListener("click", (e) => { e.preventDefault(); closeModal(); goToScreen("maquinaria"); });
}

// ---------- Bitácora: actualiza fecha, personal y maquinaria juntos ----------
function actualizarResumenesFecha() {
  const fecha = document.getElementById("f-fecha").value;
  document.getElementById("fechaCompletaPreview").textContent = fecha ? formatFechaCompleta(fecha) : "";
  actualizarPersonalResumen();
  actualizarMaquinariaResumen();
}
document.getElementById("f-fecha").addEventListener("change", actualizarResumenesFecha);

function resetAiUndo() {
  document.getElementById("aiUndoActividades").style.display = "none";
  document.getElementById("aiUndoIncidentes").style.display = "none";
}

// ---------- Horas: utilidades ----------
function minutosEntre(desde, hasta) {
  if (!desde || !hasta) return null;
  const [h1, m1] = desde.split(":").map(Number);
  const [h2, m2] = hasta.split(":").map(Number);
  const min = (h2 * 60 + m2) - (h1 * 60 + m1);
  return min > 0 ? min : null;
}

function formatDuracionMin(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function formatDuracionHoras(horas) { return formatDuracionMin(Math.round(horas * 60)); }

function formatHora12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suf = h >= 12 ? "p. m." : "a. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suf}`;
}

// Muestra la duración calculada (o un aviso) junto a un par de horas.
function pintarDuracion(el, desde, hasta, legacyHoras) {
  if (desde && hasta) {
    const min = minutosEntre(desde, hasta);
    if (min === null) { el.textContent = "⚠ La hora final debe ser después de la inicial"; el.classList.add("error"); return; }
    el.classList.remove("error");
    el.textContent = "= " + formatDuracionMin(min);
  } else if (legacyHoras != null) {
    el.classList.remove("error");
    el.textContent = `(antes registrado: ${formatDuracionHoras(legacyHoras)})`;
  } else {
    el.classList.remove("error");
    el.textContent = "";
  }
}

// ---------- Clima (selección múltiple con horario) ----------
function actualizarDuracionClima(row) {
  pintarDuracion(row.querySelector(".clima-duracion"), row.querySelector(".clima-desde").value, row.querySelector(".clima-hasta").value,
    row.dataset.horasLegacy !== undefined && row.dataset.horasLegacy !== "" ? parseFloat(row.dataset.horasLegacy) : null);
}

function resetClimaFields() {
  document.querySelectorAll(".clima-row").forEach((row) => {
    row.querySelector(".clima-toggle").checked = false;
    row.querySelector(".clima-horario").classList.remove("visible");
    row.querySelector(".clima-desde").value = "";
    row.querySelector(".clima-hasta").value = "";
    row.querySelector(".clima-duracion").textContent = "";
    row.querySelector(".clima-duracion").classList.remove("error");
    delete row.dataset.horasLegacy;
  });
}

// Acepta el formato nuevo ({tipo, desde, hasta, horas}), el intermedio ({tipo, horas})
// y el viejo (string simple), para que las bitácoras anteriores se sigan viendo bien.
function setClimaFields(clima) {
  resetClimaFields();
  if (!clima) return;
  const lista = Array.isArray(clima) ? clima : [{ tipo: clima, horas: null }];
  lista.forEach((c) => {
    const row = document.querySelector(`.clima-row[data-value="${c.tipo}"]`);
    if (!row) return;
    row.querySelector(".clima-toggle").checked = true;
    row.querySelector(".clima-horario").classList.add("visible");
    if (c.desde) row.querySelector(".clima-desde").value = c.desde;
    if (c.hasta) row.querySelector(".clima-hasta").value = c.hasta;
    if (!c.desde && c.horas != null) row.dataset.horasLegacy = c.horas;
    actualizarDuracionClima(row);
  });
}

function getClimaFromForm() {
  const lista = [];
  document.querySelectorAll(".clima-row").forEach((row) => {
    if (!row.querySelector(".clima-toggle").checked) return;
    const desde = row.querySelector(".clima-desde").value || null;
    const hasta = row.querySelector(".clima-hasta").value || null;
    const min = minutosEntre(desde, hasta);
    let horas = null;
    if (min !== null) horas = Math.round((min / 60) * 100) / 100;
    else if (!desde && !hasta && row.dataset.horasLegacy) horas = parseFloat(row.dataset.horasLegacy);
    lista.push({ tipo: row.dataset.value, desde, hasta, horas });
  });
  return lista;
}

// Devuelve el nombre del primer clima con horas mal puestas (o null si todo está bien).
function climaConHorasInvalidas() {
  for (const row of document.querySelectorAll(".clima-row")) {
    if (!row.querySelector(".clima-toggle").checked) continue;
    const d = row.querySelector(".clima-desde").value, h = row.querySelector(".clima-hasta").value;
    if ((d && !h) || (!d && h) || (d && h && minutosEntre(d, h) === null)) return row.dataset.value;
  }
  return null;
}

// detallado = false → "Lluvia (2 h 30 min)"; true → "Lluvia: 2:00 p. m. a 4:30 p. m. (2 h 30 min)"
function formatClima(clima, detallado) {
  if (!clima) return "Sin clima";
  const lista = Array.isArray(clima) ? clima : [{ tipo: clima, horas: null }];
  if (!lista.length) return "Sin clima";
  return lista.map((c) => {
    const dur = c.horas != null ? ` (${formatDuracionHoras(c.horas)})` : "";
    if (detallado && c.desde && c.hasta) return `${c.tipo}: ${formatHora12(c.desde)} a ${formatHora12(c.hasta)}${dur}`;
    return c.tipo + dur;
  }).join(detallado ? "<br>" : ", ");
}

const DESCANSO_DEFECTO_MIN = 120; // desayuno + almuerzo

function minutosTrabajados(desde, hasta, descansoMin) {
  const bruto = minutosEntre(desde, hasta);
  if (bruto === null) return null;
  const neto = bruto - (descansoMin || 0);
  return neto > 0 ? neto : null;
}

function formatHorarioEntry(entry) {
  if (!entry.horarioDesde || !entry.horarioHasta) return null;
  // Registros guardados antes de existir el campo de descanso usan el descanso normal (2 h).
  const descanso = entry.horarioDescansoMin != null ? entry.horarioDescansoMin : DESCANSO_DEFECTO_MIN;
  const neto = minutosTrabajados(entry.horarioDesde, entry.horarioHasta, descanso);
  const rango = `${formatHora12(entry.horarioDesde)} a ${formatHora12(entry.horarioHasta)}`;
  if (neto === null) return rango;
  return `${rango} (${formatDuracionMin(neto)} de trabajo${descanso ? ", descontando " + formatDuracionMin(descanso) + " de descanso" : ""})`;
}

document.querySelectorAll(".clima-toggle").forEach((chk) => {
  chk.addEventListener("change", () => {
    const row = chk.closest(".clima-row");
    row.querySelector(".clima-horario").classList.toggle("visible", chk.checked);
    if (!chk.checked) {
      row.querySelector(".clima-desde").value = "";
      row.querySelector(".clima-hasta").value = "";
      delete row.dataset.horasLegacy;
      actualizarDuracionClima(row);
    }
  });
});
document.querySelectorAll(".clima-desde, .clima-hasta").forEach((inp) => {
  inp.addEventListener("input", () => actualizarDuracionClima(inp.closest(".clima-row")));
});

// ---------- Horario de trabajo (jornada del día) ----------
function descansoMinDelForm() {
  const v = parseFloat(document.getElementById("f-horario-descanso").value);
  return isNaN(v) || v < 0 ? 0 : Math.round(v * 60);
}

function actualizarHorarioTotal() {
  const el = document.getElementById("horarioTotal");
  const desde = document.getElementById("f-horario-desde").value;
  const hasta = document.getElementById("f-horario-hasta").value;
  el.classList.remove("error");
  if (!desde || !hasta) { el.textContent = ""; return; }
  const bruto = minutosEntre(desde, hasta);
  if (bruto === null) { el.textContent = "⚠ La hora de salida debe ser después de la entrada"; el.classList.add("error"); return; }
  const desc = descansoMinDelForm();
  const neto = minutosTrabajados(desde, hasta, desc);
  if (neto === null) { el.textContent = "⚠ El descanso es mayor o igual que la jornada"; el.classList.add("error"); return; }
  el.textContent = desc
    ? `Jornada ${formatDuracionMin(bruto)} − descanso ${formatDuracionMin(desc)} = ${formatDuracionMin(neto)} de trabajo`
    : `= ${formatDuracionMin(neto)} de trabajo`;
}
document.getElementById("f-horario-descanso").addEventListener("input", actualizarHorarioTotal);
document.getElementById("f-horario-desde").addEventListener("input", actualizarHorarioTotal);
document.getElementById("f-horario-hasta").addEventListener("input", actualizarHorarioTotal);

function closeModal() { modal.classList.remove("open"); }

document.getElementById("btnNewEntry").addEventListener("click", openNewModal);
document.getElementById("closeModal").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

// ---------- Fotos en el formulario ----------
function renderPhotoGrid() {
  const grid = document.getElementById("photoGrid");
  grid.innerHTML = currentPhotos
    .map(
      (src, i) => `
      <div class="photo-thumb">
        <img src="${src}">
        <button type="button" class="remove-photo" data-idx="${i}">✕</button>
      </div>`
    )
    .join("") + `
      <div class="add-photo-btn" id="takePhotoBtn" title="Tomar foto">📷</div>
      <div class="add-photo-btn" id="galleryPhotoBtn" title="Elegir de galería">🖼</div>`;

  grid.querySelector("#takePhotoBtn").addEventListener("click", () => document.getElementById("photoCamera").click());
  grid.querySelector("#galleryPhotoBtn").addEventListener("click", () => document.getElementById("photoGallery").click());
  grid.querySelectorAll(".remove-photo").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPhotos.splice(parseInt(btn.dataset.idx), 1);
      renderPhotoGrid();
    });
  });
}

async function handleBitacoraPhotoFiles(fileList) {
  const files = Array.from(fileList);
  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      currentPhotos.push(compressed);
    } catch (err) { console.error(err); }
  }
  renderPhotoGrid();
}

document.getElementById("photoCamera").addEventListener("change", (e) => { handleBitacoraPhotoFiles(e.target.files); e.target.value = ""; });
document.getElementById("photoGallery").addEventListener("change", (e) => { handleBitacoraPhotoFiles(e.target.files); e.target.value = ""; });

// ---------- Guardar formulario ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const climaMalo = climaConHorasInvalidas();
  if (climaMalo) { alert(`Revisa las horas del clima "${climaMalo}": pon hora de inicio y final, y que la final sea después de la inicial.`); return; }
  const hDesde = document.getElementById("f-horario-desde").value || null;
  const hHasta = document.getElementById("f-horario-hasta").value || null;
  if ((hDesde && !hHasta) || (!hDesde && hHasta) || (hDesde && hHasta && minutosEntre(hDesde, hHasta) === null)) {
    alert("Revisa el horario de trabajo: pon hora de entrada y de salida, y que la salida sea después de la entrada."); return;
  }
  const hDescanso = descansoMinDelForm();
  if (hDesde && hHasta && minutosTrabajados(hDesde, hHasta, hDescanso) === null) {
    alert("El descanso es mayor o igual que la jornada. Revisa las horas o el descanso."); return;
  }

  const fechaSeleccionada = document.getElementById("f-fecha").value;
  const resumenFinal = await computePersonalResumen(fechaSeleccionada);
  const maquinariaFinal = await computeMaquinariaResumen(fechaSeleccionada);

  // Inventario: solo se toca si cambió la lista de materiales o la fecha (así no se duplica al editar).
  let filasMat;
  if (editingId && firmaMatRec(currentMatRec, fechaSeleccionada) === originalMatRecSig) {
    filasMat = originalMatRec;
  } else {
    await revertirMatRec(originalMatRec);
    filasMat = await aplicarMatRec(currentMatRec, fechaSeleccionada);
  }

  const entry = {
    obraId: currentObraId,
    fecha: fechaSeleccionada,
    materialesRecibidos: filasMat,
    personalDetalle: resumenFinal.detalle,
    personalTotal: resumenFinal.total,
    horarioDesde: hDesde,
    horarioHasta: hHasta,
    horarioDescansoMin: hDesde && hHasta ? hDescanso : null,
    horarioHoras: hDesde && hHasta ? Math.round((minutosTrabajados(hDesde, hHasta, hDescanso) / 60) * 100) / 100 : null, // horas netas (sin descanso)
    cuentaComoDia: document.getElementById("f-cuenta-dia").checked,
    clima: getClimaFromForm(),
    actividades: document.getElementById("f-actividades").value.trim(),
    maquinariaDetalle: maquinariaFinal.detalle,
    materiales: document.getElementById("f-materiales").value.trim(),
    incidentes: document.getElementById("f-incidentes").value.trim(),
    fotos: currentPhotos,
  };
  if (editingId) entry.id = editingId;

  await saveEntry(entry);
  if (hDesde && hHasta) await setSetting("horarioPorDefecto", { desde: hDesde, hasta: hHasta, descansoMin: hDescanso });
  closeModal();
  showToast("Registro guardado");
  renderEntryList();
  renderStats();
});

// ---------- Copia de seguridad ----------
const BACKUP_STORES = ["obras", "bitacora", "inv_items", "inv_movs", "personal", "asistencia", "nomina_pagos", "maq_equipos", "maq_usos", "caja_movs", "pedidos", "dias_trabajados", "cargos", "tareas", "categorias_inventario", "unidades_inventario"];

document.getElementById("btnExport").addEventListener("click", async () => {
  const data = { exportado: new Date().toISOString() };
  for (const store of BACKUP_STORES) {
    data[store] = await getAllFromStore(store);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `residente-obra-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  await setSetting("ultimoBackupFecha", new Date().toISOString().slice(0, 10));
  renderBackupReminder();
  showToast("Copia descargada");
});

document.getElementById("btnImport").addEventListener("click", () => document.getElementById("importFile").click());

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const storesPresent = BACKUP_STORES.filter((s) => Array.isArray(data[s]) && data[s].length);
      if (!storesPresent.length) throw new Error("Formato inválido");
      const totalRegistros = storesPresent.reduce((sum, s) => sum + data[s].length, 0);
      if (!confirm(`Se restaurarán ${totalRegistros} registros de esta copia (conservando sus fechas e IDs originales). Úsalo idealmente en un teléfono nuevo o vacío para evitar mezclar datos. ¿Continuar?`)) return;
      await restaurarDatos(data);
    } catch (err) {
      alert("No se pudo leer el archivo. Verifica que sea una copia de seguridad válida.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});


// Restaura un objeto de copia (de archivo o de la nube) sobre la base local.
async function restaurarDatos(data) {
  const storesPresent = BACKUP_STORES.filter((s) => Array.isArray(data[s]) && data[s].length);
  if (!storesPresent.length) throw new Error("Formato inválido");
  for (const store of storesPresent) {
    for (const record of data[store]) {
      await putIntoStore(store, record);
    }
  }
  showToast("Copia restaurada");
  const obras = await getAllObras();
  if (!obras.find((o) => o.id === currentObraId)) currentObraId = obras[0]?.id ?? currentObraId;
  await setSetting("obraActualId", currentObraId);
  await setSetting("ultimoBackupFecha", new Date().toISOString().slice(0, 10));
  await updateHeaderObraName();
  renderStats();
  renderEntryList();
  renderBackupReminder();
}

// ---------- Respaldo en la nube (Firebase por API REST, sin librerías) ----------
// Estructura en Firestore: respaldos/{uid}/meta/actual  y  respaldos/{uid}/partes/{lote}_{n}
// La copia se corta en trozos de 300.000 caracteres (límite de Firestore: 1 MB por campo).
const NUBE_TROZO = 300000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nubeToken = null, nubeTokenExp = 0, nubeOcupado = false;

function nubeEstado(msg, ok) {
  const el = document.getElementById("nubeStatus");
  el.textContent = msg || "";
  el.style.color = ok === true ? "var(--turf-dark)" : ok === false ? "var(--accent, #E07B39)" : "var(--ink-soft)";
}

function nubeErrorAuth(code) {
  const c = String(code || "");
  if (c.includes("EMAIL_EXISTS")) return "Ese correo ya tiene cuenta. Usa Iniciar sesión.";
  if (c.includes("INVALID_LOGIN") || c.includes("INVALID_PASSWORD") || c.includes("EMAIL_NOT_FOUND")) return "Correo o contraseña incorrectos.";
  if (c.includes("WEAK_PASSWORD")) return "La contraseña debe tener al menos 6 caracteres.";
  if (c.includes("INVALID_EMAIL")) return "El correo no es válido.";
  if (c.includes("OPERATION_NOT_ALLOWED")) return "Falta activar 'Correo electrónico/contraseña' en Authentication (paso 2).";
  if (c.includes("TOO_MANY")) return "Demasiados intentos. Espera unos minutos.";
  if (c.includes("API key")) return "La clave de la configuración no es válida. Revisa el paso 5.";
  return "No se pudo completar (" + c + ").";
}

async function nubeAuth(modo, email, password) {
  const cfg = await getSetting("nubeConfig");
  const endpoint = modo === "crear" ? "signUp" : "signInWithPassword";
  let r;
  try {
    r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${cfg.apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
  } catch (e) { throw new Error("Sin conexión a internet."); }
  const j = await r.json();
  if (!r.ok) throw new Error(nubeErrorAuth(j.error && j.error.message));
  nubeToken = j.idToken;
  nubeTokenExp = Date.now() + (parseInt(j.expiresIn, 10) - 120) * 1000;
  await setSetting("nubeSesion", { email: j.email, refreshToken: j.refreshToken, uid: j.localId });
}

async function nubeGetToken(forzar) {
  if (!forzar && nubeToken && Date.now() < nubeTokenExp) return nubeToken;
  const cfg = await getSetting("nubeConfig");
  const ses = await getSetting("nubeSesion");
  if (!cfg || !ses) throw new Error("Inicia sesión primero.");
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(ses.refreshToken)
  });
  const j = await r.json();
  if (!r.ok) throw new Error("La sesión venció. Inicia sesión de nuevo.");
  nubeToken = j.id_token;
  nubeTokenExp = Date.now() + (parseInt(j.expires_in, 10) - 120) * 1000;
  if (j.refresh_token && j.refresh_token !== ses.refreshToken) {
    await setSetting("nubeSesion", { ...ses, refreshToken: j.refresh_token });
  }
  return nubeToken;
}

async function nubeFS(method, ruta, body, query) {
  const cfg = await getSetting("nubeConfig");
  const ses = await getSetting("nubeSesion");
  if (!cfg || !ses) throw new Error("Inicia sesión primero.");
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/respaldos/${ses.uid}/${ruta}${query || ""}`;
  let forzar = false;
  for (let i = 0; i < 4; i++) {
    let r;
    try {
      r = await fetch(url, {
        method,
        headers: { Authorization: "Bearer " + (await nubeGetToken(forzar)), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      if (i === 3) throw new Error("Se perdió la conexión a internet.");
      await sleep(1000 * (i + 1));
      continue;
    }
    if (r.status === 401) { forzar = true; continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
    if (r.status === 404 && method === "GET") return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 403) throw new Error("Permiso denegado. Revisa que hayas publicado las reglas (paso 4).");
      if (r.status === 404) throw new Error("No se encontró la base de datos. Revisa el paso 3 (crear Firestore).");
      throw new Error((j.error && j.error.message) || "Error " + r.status);
    }
    return j;
  }
  throw new Error("No se pudo completar. Intenta de nuevo con mejor señal.");
}

async function nubePool(total, simultaneos, fn, onProgreso) {
  let sig = 0, hechos = 0, fallo = null;
  const obreros = Array.from({ length: Math.min(simultaneos, total) }, async () => {
    while (!fallo) {
      const i = sig++;
      if (i >= total) return;
      try { await fn(i); hechos++; onProgreso && onProgreso(hechos, total); }
      catch (e) { fallo = e; }
    }
  });
  await Promise.all(obreros);
  if (fallo) throw fallo;
}

async function nubeConPantalla(fn) {
  if (nubeOcupado) return;
  nubeOcupado = true;
  let wl = null;
  try { wl = navigator.wakeLock ? await navigator.wakeLock.request("screen") : null; } catch (e) {}
  ["btnNubeSubir", "btnNubeBajar"].forEach((id) => (document.getElementById(id).disabled = true));
  try { await fn(); }
  catch (e) { nubeEstado("✗ " + e.message, false); }
  finally {
    nubeOcupado = false;
    ["btnNubeSubir", "btnNubeBajar"].forEach((id) => (document.getElementById(id).disabled = false));
    try { if (wl) await wl.release(); } catch (e) {}
    renderNube();
  }
}

async function nubeSubir() {
  nubeEstado("Preparando copia…");
  const data = { exportado: new Date().toISOString() };
  let registros = 0;
  for (const store of BACKUP_STORES) {
    data[store] = await getAllFromStore(store);
    registros += data[store].length;
  }
  const json = JSON.stringify(data);
  const mb = new Blob([json]).size / 1048576;
  const partes = Math.ceil(json.length / NUBE_TROZO);
  if (mb > 8 && !confirm(`La copia pesa unos ${mb.toFixed(1)} MB (por las fotos). Conviene usar WiFi y no cerrar la app mientras sube. ¿Continuar?`)) {
    nubeEstado("");
    return;
  }
  const lote = Date.now().toString(36);
  await nubePool(partes, 4, async (i) => {
    await nubeFS("PATCH", `partes/${lote}_${i}`, {
      fields: { d: { stringValue: json.slice(i * NUBE_TROZO, (i + 1) * NUBE_TROZO) }, n: { integerValue: String(i) } }
    });
  }, (h, t) => nubeEstado(`Subiendo… ${Math.round((h / t) * 100)}% (no cierres la app)`));
  // El meta se escribe al final: si algo falla antes, la copia anterior sigue intacta.
  await nubeFS("PATCH", "meta/actual", {
    fields: {
      lote: { stringValue: lote }, partes: { integerValue: String(partes) },
      fecha: { stringValue: new Date().toISOString() }, mb: { doubleValue: Math.round(mb * 10) / 10 },
      registros: { integerValue: String(registros) }
    }
  });
  // Limpieza de la copia anterior (y de subidas incompletas).
  try {
    let token = "";
    do {
      const lista = await nubeFS("GET", "partes", null, "?pageSize=300&mask.fieldPaths=n" + (token ? "&pageToken=" + encodeURIComponent(token) : ""));
      token = lista && lista.nextPageToken || "";
      const viejos = ((lista && lista.documents) || []).map((d) => d.name.split("/").pop()).filter((id) => !id.startsWith(lote + "_"));
      await nubePool(viejos.length, 4, (i) => nubeFS("DELETE", "partes/" + viejos[i]));
    } while (token);
  } catch (e) { /* no es grave: solo ocupa espacio */ }
  const hoy = new Date().toISOString().slice(0, 10);
  await setSetting("nubeUltimaFecha", new Date().toISOString());
  await setSetting("ultimoBackupFecha", hoy);
  renderBackupReminder();
  nubeEstado(`✓ Copia guardada en la nube (${mb.toFixed(1)} MB, ${registros} registros).`, true);
}

async function nubeBajar() {
  nubeEstado("Buscando copia…");
  const meta = await nubeFS("GET", "meta/actual");
  if (!meta || !meta.fields) { nubeEstado("Todavía no hay ninguna copia en la nube.", false); return; }
  const f = meta.fields;
  const lote = f.lote.stringValue, partes = parseInt(f.partes.integerValue, 10);
  const cuando = new Date(f.fecha.stringValue).toLocaleString("es-CO");
  const mb = f.mb ? (f.mb.doubleValue ?? f.mb.integerValue) : "?";
  if (!confirm(`Copia del ${cuando} (${mb} MB). Se mezclará con los datos de este teléfono: lo que hayas borrado después de esa copia puede reaparecer, y lo que cambió se sobrescribe con la versión de la copia. ¿Restaurar?`)) { nubeEstado(""); return; }
  const trozos = new Array(partes);
  await nubePool(partes, 4, async (i) => {
    const d = await nubeFS("GET", `partes/${lote}_${i}`);
    if (!d || !d.fields) throw new Error("Falta la parte " + (i + 1) + " de la copia. Guarda una copia nueva desde el otro teléfono.");
    trozos[i] = d.fields.d.stringValue;
  }, (h, t) => nubeEstado(`Descargando… ${Math.round((h / t) * 100)}%`));
  const data = JSON.parse(trozos.join(""));
  nubeEstado("Restaurando…");
  await restaurarDatos(data);
  nubeEstado("✓ Copia restaurada desde la nube.", true);
}

async function renderNube() {
  const cfg = await getSetting("nubeConfig");
  const ses = await getSetting("nubeSesion");
  document.getElementById("nubeConfigBox").style.display = cfg ? "none" : "block";
  document.getElementById("nubeLoginBox").style.display = cfg && !ses ? "block" : "none";
  document.getElementById("nubeSesionBox").style.display = cfg && ses ? "block" : "none";
  if (cfg && ses) {
    const ult = await getSetting("nubeUltimaFecha");
    document.getElementById("nubeSesionInfo").textContent = `✓ Conectado como ${ses.email}. ` +
      (ult ? "Última copia en la nube desde este teléfono: " + new Date(ult).toLocaleString("es-CO") + "." : "Aún no has guardado ninguna copia desde este teléfono.");
  }
}

document.getElementById("btnNubeCopiarReglas").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(document.getElementById("nubeReglas").textContent); showToast("Reglas copiadas"); }
  catch (e) { showToast("Mantén presionado el texto para copiarlo"); }
});

document.getElementById("btnNubeGuardarConfig").addEventListener("click", async () => {
  const txt = document.getElementById("nubeConfigInput").value;
  const key = txt.match(/["']?apiKey["']?\s*:\s*["']([^"']+)["']/);
  const pid = txt.match(/["']?projectId["']?\s*:\s*["']([^"']+)["']/);
  if (!key || !pid) { nubeEstado("✗ No encontré apiKey y projectId en lo que pegaste. Copia el bloque firebaseConfig completo.", false); return; }
  await setSetting("nubeConfig", { apiKey: key[1], projectId: pid[1] });
  document.getElementById("nubeConfigInput").value = "";
  nubeEstado("✓ Configuración guardada. Ahora crea tu cuenta o inicia sesión.", true);
  renderNube();
});

document.getElementById("btnNubeQuitarConfig").addEventListener("click", async () => {
  if (!confirm("¿Borrar la configuración de Firebase de este teléfono? Tus copias en la nube NO se borran.")) return;
  await setSetting("nubeConfig", null);
  await setSetting("nubeSesion", null);
  nubeToken = null;
  nubeEstado("");
  renderNube();
});

async function nubeLogin(modo) {
  const email = document.getElementById("nubeEmail").value.trim();
  const pass = document.getElementById("nubePass").value;
  if (!email || !pass) { nubeEstado("✗ Escribe correo y contraseña.", false); return; }
  nubeEstado("Conectando…");
  try {
    await nubeAuth(modo, email, pass);
    document.getElementById("nubePass").value = "";
    nubeEstado(modo === "crear" ? "✓ Cuenta creada y sesión iniciada." : "✓ Sesión iniciada.", true);
    renderNube();
  } catch (e) { nubeEstado("✗ " + e.message, false); }
}
document.getElementById("btnNubeEntrar").addEventListener("click", () => nubeLogin("entrar"));
document.getElementById("btnNubeCrear").addEventListener("click", () => nubeLogin("crear"));

document.getElementById("btnNubeOlvide").addEventListener("click", async () => {
  const email = document.getElementById("nubeEmail").value.trim();
  if (!email) { nubeEstado("✗ Escribe tu correo arriba y vuelve a tocar.", false); return; }
  const cfg = await getSetting("nubeConfig");
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${cfg.apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(nubeErrorAuth(j.error && j.error.message));
    nubeEstado("✓ Te enviamos un correo para cambiar la contraseña (revisa también spam).", true);
  } catch (e) { nubeEstado("✗ " + e.message, false); }
});

document.getElementById("btnNubeSalir").addEventListener("click", async () => {
  await setSetting("nubeSesion", null);
  nubeToken = null;
  nubeEstado("Sesión cerrada. Tus copias siguen en la nube.");
  renderNube();
});
document.getElementById("btnNubeSubir").addEventListener("click", () => nubeConPantalla(nubeSubir));
document.getElementById("btnNubeBajar").addEventListener("click", () => nubeConPantalla(nubeBajar));

// ---------- Inicio ----------
(async function init() {
  db = await openDB();
  await ensureObraSetup();
  renderRoadmap();
  renderStats();
  renderEntryList();
  document.getElementById("btnNewEntry").style.display = "none";
  setupAiButton("aiBtnActividades", "f-actividades", "aiUndoActividades");
  setupAiButton("aiBtnIncidentes", "f-incidentes", "aiUndoIncidentes");
  await renderAiSettings();
  await renderInicioTareasBanner();
  await renderNotifSettings();
  await setupAlmacenamientoPersistente();
  await renderBackupReminder();
  await renderNube();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error("SW error:", err));
  }
  checkYNotificarTareas();
})();
