// La Nonna: frontend conectado al API Gateway, con respaldo local.
const API_BASE = window.location.origin.startsWith('http')
  ? `${window.location.origin}/api`
  : null;

const MENU_FALLBACK = [
  { id: 'f1', nombre: 'Lasagna alla Nonna', descripcion: 'Ragú lento, bechamel, doce capas y bordes dorados.', precio: 18, categoria: 'Horneado' },
  { id: 'f2', nombre: 'Tagliatelle al Ragù', descripcion: 'Cintas hechas a mano con un ragú de cinco horas.', precio: 16, categoria: 'Pasta fresca' },
  { id: 'f3', nombre: 'Ravioli di Zucca', descripcion: 'Zapallo asado, mantequilla dorada, salvia y parmesano.', precio: 17, categoria: 'Pasta fresca' },
  { id: 'f4', nombre: 'Cannelloni Spinaci', descripcion: 'Ricotta y espinaca horneadas en tomate y crema.', precio: 16, categoria: 'Horneado' },
  { id: 'f5', nombre: 'Fettuccine Alfredo', descripcion: 'Mantequilla, parmesano y pimienta recién molida.', precio: 15, categoria: 'Clasico' },
  { id: 'f6', nombre: 'Pan de Ajo al Horno', descripcion: 'Pan dorado con mantequilla de ajo y hierbas.', precio: 7, categoria: 'Para compartir' },
  { id: 'f7', nombre: 'Gnocchi al Pomodoro', descripcion: 'Gnocchi de papa con tomate, albahaca y pecorino.', precio: 15, categoria: 'Pasta fresca' },
  { id: 'f8', nombre: 'Melanzane alla Parmigiana', descripcion: 'Berenjena, salsa de tomate y quesos gratinados.', precio: 14, categoria: 'Horneado' },
  { id: 'f9', nombre: 'Spaghetti Cacio e Pepe', descripcion: 'Pecorino romano y pimienta negra recién molida.', precio: 14, categoria: 'Clasico' },
  { id: 'f10', nombre: 'Burrata de la Casa', descripcion: 'Burrata, tomates asados, albahaca y focaccia.', precio: 11, categoria: 'Para compartir' },
  { id: 'f11', nombre: 'Tiramisú', descripcion: 'Café, mascarpone, cacao y bizcochos suaves.', precio: 8, categoria: 'Postre' },
  { id: 'f12', nombre: 'Panna Cotta', descripcion: 'Vainilla, frutos rojos y crocante de almendras.', precio: 7, categoria: 'Postre' }
];

let catalogo = MENU_FALLBACK;
const state = { limit: 6, categoria: '', ultimoFoco: null, apiDisponible: false };

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function productosLocales() {
  const filtrados = state.categoria
    ? catalogo.filter((producto) => producto.categoria === state.categoria)
    : catalogo;
  return filtrados.slice(0, state.limit);
}

function renderMenu(productos) {
  const grid = document.getElementById('menu-grid');
  if (!productos || !productos.length) {
    grid.innerHTML = '<article class="dish empty-state"><h3>Sin resultados</h3><p>No hay platos en esta categoría por ahora.</p></article>';
    return;
  }
  grid.innerHTML = productos.map((producto) => `
    <article class="dish">
      <span class="tag">${escapeHtml(producto.categoria)}</span>
      <h3>${escapeHtml(producto.nombre)}</h3>
      <p>${escapeHtml(producto.descripcion)}</p>
      <span class="price">$${escapeHtml(producto.precio)}</span>
      <button class="detail-link" type="button" data-id="${escapeHtml(producto.id)}">Ver detalle</button>
    </article>`).join('');
}

function setStatus(texto) {
  document.getElementById('menu-status').textContent = texto;
}

function actualizarBotonMas(cantidad) {
  const totalLocal = state.categoria
    ? catalogo.filter((producto) => producto.categoria === state.categoria).length
    : catalogo.length;
  document.getElementById('btn-more').hidden = cantidad >= totalLocal;
}

function cargarMenu() {
  setStatus('Cargando la carta…');
  const productos = productosLocales();
  renderMenu(productos);
  actualizarBotonMas(productos.length);
  setStatus(productos.length
    ? `Mostrando ${productos.length} platos ${state.apiDisponible ? 'desde la API REST.' : 'desde el respaldo local.'}`
    : 'No hay platos en esta categoría por ahora.');
}

async function cargarCatalogo() {
  if (!API_BASE) {
    cargarMenu();
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/productos?limit=50`);
    if (!response.ok) throw new Error('La API no esta disponible');
    const productos = await response.json();
    if (!Array.isArray(productos)) throw new Error('Respuesta de API invalida');
    catalogo = productos;
    state.apiDisponible = true;
  } catch (error) {
    catalogo = MENU_FALLBACK;
    state.apiDisponible = false;
  }
  cargarMenu();
}

function cerrarDetalle() {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  if (state.ultimoFoco) state.ultimoFoco.focus();
}

function verDetalle(id, botonOrigen) {
  const backdrop = document.getElementById('modal-backdrop');
  const body = document.getElementById('modal-body');
  state.ultimoFoco = botonOrigen;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  backdrop.querySelector('.modal').focus();
  const producto = catalogo.find((item) => String(item.id) === String(id));
  if (!producto) {
    body.innerHTML = '<h3 id="modal-title">Plato no encontrado</h3><p>El plato solicitado no está disponible.</p>';
    return;
  }
  body.innerHTML = `
    <span class="tag">${escapeHtml(producto.categoria)}</span>
    <h3 id="modal-title">${escapeHtml(producto.nombre)}</h3>
    <p>${escapeHtml(producto.descripcion)}</p>
    <span class="price">$${escapeHtml(producto.precio)}</span>`;
}

function initMenu() {
  document.querySelectorAll('.filter-btn').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((otro) => {
        otro.classList.remove('active');
        otro.setAttribute('aria-pressed', 'false');
      });
      boton.classList.add('active');
      boton.setAttribute('aria-pressed', 'true');
      state.categoria = boton.dataset.categoria || '';
      state.limit = 6;
      cargarMenu();
    });
  });
  document.getElementById('btn-more').addEventListener('click', () => {
    if (state.limit < 50) {
      state.limit += 6;
      cargarMenu();
    }
  });
  document.getElementById('menu-grid').addEventListener('click', (event) => {
    const boton = event.target.closest('.detail-link');
    if (boton) verDetalle(boton.dataset.id, boton);
  });
  document.getElementById('modal-close').addEventListener('click', cerrarDetalle);
  document.getElementById('modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'modal-backdrop') cerrarDetalle();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('modal-backdrop').classList.contains('open')) {
      cerrarDetalle();
    }
  });
}

function fechaLocalParaInput(fecha) {
  const ajustada = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return ajustada.toISOString().slice(0, 16);
}

function mostrarError(campo, mensaje) {
  const error = document.getElementById(`${campo.name}-error`);
  campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  campo.setAttribute('aria-describedby', error.id);
  error.textContent = mensaje;
  return !mensaje;
}

function validarCampo(campo) {
  const valor = campo.value.trim();
  if (campo.name === 'name') {
    if (!valor) return mostrarError(campo, 'Ingresa tu nombre completo.');
    if (valor.length < 2) return mostrarError(campo, 'El nombre debe tener al menos 2 caracteres.');
  }
  if (campo.name === 'email') {
    if (!valor) return mostrarError(campo, 'Ingresa tu correo electrónico.');
    if (!campo.validity.valid) return mostrarError(campo, 'Ingresa un correo con formato válido.');
  }
  if (campo.name === 'people') {
    const personas = Number(valor);
    if (!valor) return mostrarError(campo, 'Indica el número de personas.');
    if (!Number.isInteger(personas) || personas < 1 || personas > 12) {
      return mostrarError(campo, 'La reserva debe ser para entre 1 y 12 personas.');
    }
  }
  if (campo.name === 'datetime') {
    if (!valor) return mostrarError(campo, 'Selecciona una fecha y hora.');
    if (new Date(valor).getTime() <= Date.now()) {
      return mostrarError(campo, 'La fecha de reserva debe ser futura.');
    }
  }
  return mostrarError(campo, '');
}

async function enviarReserva(datos) {
  if (!state.apiDisponible || !API_BASE) return false;
  const response = await fetch(`${API_BASE}/reservas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No se pudo registrar la reserva');
  return true;
}

function mostrarConfirmacion(datos, enviadaAlServidor) {
  const form = document.getElementById('reservation-form');
  const result = document.getElementById('reservation-result');
  const fecha = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'long', timeStyle: 'short', hour12: false
  }).format(new Date(datos.datetime));
  result.replaceChildren();
  const titulo = document.createElement('h3');
  titulo.textContent = 'Solicitud recibida';
  const mensaje = document.createElement('p');
  mensaje.textContent = `${datos.name}, registramos tu solicitud para ${datos.people} persona${datos.people === '1' ? '' : 's'} el ${fecha}. Enviaremos la confirmación a ${datos.email}.`;
  const nota = document.createElement('p');
  nota.textContent = enviadaAlServidor
    ? 'La solicitud fue validada y registrada por la API REST.'
    : 'Modo local: la solicitud fue validada, pero no se guardó en un servidor.';
  const otra = document.createElement('button');
  otra.type = 'button';
  otra.className = 'btn-ghost';
  otra.textContent = 'Hacer otra solicitud';
  otra.addEventListener('click', () => {
    result.hidden = true;
    form.hidden = false;
    form.reset();
    document.getElementById('reservation-name').focus();
  });
  result.append(titulo, mensaje, nota, otra);
  form.hidden = true;
  result.hidden = false;
}

function initReservationForm() {
  const form = document.getElementById('reservation-form');
  const campos = [...form.querySelectorAll('input[required]')];
  document.getElementById('reservation-datetime').min = fechaLocalParaInput(new Date());
  campos.forEach((campo) => {
    campo.addEventListener('blur', () => validarCampo(campo));
    campo.addEventListener('input', () => {
      if (campo.getAttribute('aria-invalid') === 'true') validarCampo(campo);
    });
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const validos = campos.map(validarCampo);
    if (validos.includes(false)) {
      campos.find((campo) => campo.getAttribute('aria-invalid') === 'true').focus();
      return;
    }
    const datos = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Enviando…';
    try {
      const enviadaAlServidor = await enviarReserva(datos);
      mostrarConfirmacion(datos, enviadaAlServidor);
    } catch (error) {
      const result = document.getElementById('reservation-result');
      result.hidden = false;
      result.textContent = error.message;
      result.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Solicitar mesa';
    }
  });
}

document.addEventListener('components:loaded', () => {
  initMenu();
  initReservationForm();
  cargarCatalogo();
}, { once: true });
