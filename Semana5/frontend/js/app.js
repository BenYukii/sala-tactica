// Frontend La Nonna — cliente GraphQL (Clase 10: frontend agregador / BFF).
// Pide solo los campos que muestra la carta (evita overfetching) y usa
// limit + categoria como paginacion/filtro simple.

// Mismo origen cuando Express sirve el frontend (http://localhost:4000/);
// fallback a localhost si alguien abre el archivo con file://.
const GRAPHQL_URL = window.location.origin.startsWith('http')
  ? `${window.location.origin}/graphql`
  : 'http://localhost:4000/graphql';

// Respaldo estatico: se muestra solo si la API no esta corriendo.
const MENU_FALLBACK = [
  { id: 'f1', nombre: 'Lasagna alla Nonna', descripcion: 'Ragú lento, bechamel, doce capas, horneada hasta dorar los bordes.', precio: 18, categoria: 'La insignia' },
  { id: 'f2', nombre: 'Tagliatelle al Ragù', descripcion: 'Cintas hechas a mano con un ragú de cinco horas.', precio: 16, categoria: 'Pasta fresca' },
  { id: 'f3', nombre: 'Ravioli di Zucca', descripcion: 'Zapallo asado, mantequilla dorada, salvia y parmesano.', precio: 17, categoria: 'Pasta fresca' },
  { id: 'f4', nombre: 'Cannelloni Spinaci', descripcion: 'Ricotta y espinaca enrolladas, horneadas en tomate y crema.', precio: 16, categoria: 'Horneado' },
  { id: 'f5', nombre: 'Fettuccine Alfredo', descripcion: 'Mantequilla, parmesano y pimienta recién molida.', precio: 15, categoria: 'Clásico' },
  { id: 'f6', nombre: 'Pan de Ajo al Horno', descripcion: 'Horneado hasta dorar, pincelado con mantequilla de hierbas.', precio: 7, categoria: 'Para compartir' }
];

const state = { limit: 6, categoria: '', usandoApi: false };

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function gql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// Query 1: lista (con paginacion por limit y filtro por categoria)
async function fetchMenu() {
  const query = `
    query GetProductos($limit: Int, $categoria: String) {
      getProductos(limit: $limit, categoria: $categoria) {
        id nombre descripcion precio categoria
      }
    }`;
  const data = await gql(query, { limit: state.limit, categoria: state.categoria || null });
  return data.getProductos;
}

// Query 2: detalle por id (valida nulos como pide la lista de comprobacion)
async function fetchDetalle(id) {
  // Si es item del respaldo estatico, no hay nada que pedir a la API.
  if (String(id).startsWith('f')) return MENU_FALLBACK.find((p) => p.id === id) || null;
  const query = `
    query GetProducto($id: ID!) {
      getProductoById(id: $id) { id nombre descripcion precio categoria }
    }`;
  const data = await gql(query, { id });
  return data.getProductoById || null;
}

function renderMenu(productos) {
  const grid = document.getElementById('menu-grid');
  if (!productos || !productos.length) {
    grid.innerHTML = '<div class="dish"><h3>Sin resultados</h3><p>No hay platos en esta categoria por ahora.</p></div>';
    return;
  }
  grid.innerHTML = productos.map((p) => `
    <div class="dish">
      <span class="tag">${escapeHtml(p.categoria)}</span>
      <h3>${escapeHtml(p.nombre)}</h3>
      <p>${escapeHtml(p.descripcion)}</p>
      <span class="price">$${escapeHtml(p.precio)}</span>
      <button class="detail-link" data-id="${escapeHtml(p.id)}">Ver detalle</button>
    </div>`).join('');
}

function setStatus(texto) {
  document.getElementById('menu-status').textContent = texto;
}

async function cargarMenu() {
  setStatus('Cargando la carta…');
  try {
    const productos = await fetchMenu();
    if (!productos || !productos.length) {
      // Categoria vacia en API: se muestra vacio, no el respaldo.
      state.usandoApi = true;
      renderMenu([]);
      setStatus(state.categoria ? 'Sin platos en esta categoria (datos en vivo).' : 'Sin platos por ahora (datos en vivo).');
      return;
    }
    state.usandoApi = true;
    renderMenu(productos);
    setStatus(`Carta en vivo desde MySQL via GraphQL (${productos.length} platos).`);
  } catch (err) {
    console.log('API no disponible, se muestra el menu estatico.', err);
    state.usandoApi = false;
    const filtrados = state.categoria
      ? MENU_FALLBACK.filter((p) => p.categoria === state.categoria)
      : MENU_FALLBACK.slice(0, state.limit);
    renderMenu(filtrados);
    setStatus('Mostrando carta de respaldo (inicia la API con npm run dev para ver datos en vivo).');
  }
}

async function verDetalle(id) {
  const backdrop = document.getElementById('modal-backdrop');
  const body = document.getElementById('modal-body');
  body.innerHTML = '<p>Cargando…</p>';
  backdrop.classList.add('open');
  try {
    const p = await fetchDetalle(id);
    if (!p) {
      body.innerHTML = '<h3>Plato no encontrado</h3><p>El id no existe en la base de datos.</p>';
      return;
    }
    body.innerHTML = `
      <span class="tag">${escapeHtml(p.categoria)}</span>
      <h3>${escapeHtml(p.nombre)}</h3>
      <p>${escapeHtml(p.descripcion)}</p>
      <span class="price">$${escapeHtml(p.precio)}</span>`;
  } catch (err) {
    body.innerHTML = '<h3>No se pudo cargar el detalle</h3><p>Revisa que la API este corriendo.</p>';
  }
}

function initFiltros() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.categoria = btn.dataset.categoria || '';
      state.limit = 6;
      cargarMenu();
    });
  });
  document.getElementById('btn-more').addEventListener('click', () => {
    // Paginacion simple: el backend acepta entre 1 y 50 (ver Producto.js).
    if (state.limit >= 50) return;
    state.limit += 6;
    cargarMenu();
  });
  document.getElementById('menu-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.detail-link');
    if (btn) verDetalle(btn.dataset.id);
  });
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('modal-backdrop').classList.remove('open');
  });
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') e.target.classList.remove('open');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFiltros();
  cargarMenu();
});
