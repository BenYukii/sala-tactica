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
const state = {
  limit: 6,
  categoria: '',
  ultimoFoco: null,
  apiDisponible: false,
  accessToken: null,
  user: null,
  cart: new Map()
};

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
      ${state.apiDisponible ? `<button class="btn-ghost add-to-order" type="button" data-add-id="${escapeHtml(producto.id)}">Añadir al pedido</button>` : ''}
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
    const addButton = event.target.closest('.add-to-order');
    if (addButton) {
      const product = catalogo.find((item) => String(item.id) === String(addButton.dataset.addId));
      if (product) {
        const quantity = (state.cart.get(product.id) || 0) + 1;
        state.cart.set(product.id, quantity);
        addButton.textContent = `Añadido (${quantity})`;
        if (state.accessToken) renderCart();
      }
      return;
    }
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

function addAccountSection(container, title, records, formatRecord) {
  const section = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.append(heading);

  if (!records.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No hay registros para mostrar.';
    section.append(empty);
  } else {
    const list = document.createElement('ul');
    records.forEach((record) => {
      const item = document.createElement('li');
      item.textContent = formatRecord(record);
      list.append(item);
    });
    section.append(list);
  }
  container.append(section);
}

function renderCart() {
  const overview = document.getElementById('account-overview');
  const existing = overview.querySelector('[data-cart-section]');
  if (existing) existing.remove();
  if (!state.accessToken) return;

  const section = document.createElement('section');
  section.dataset.cartSection = 'true';
  const heading = document.createElement('h3');
  heading.textContent = 'Tu selección';
  section.append(heading);
  const selectedProducts = [...state.cart.entries()];
  if (!selectedProducts.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Aún no has añadido platos desde el menú.';
    section.append(empty);
  } else {
    const list = document.createElement('ul');
    selectedProducts.forEach(([productId, quantity]) => {
      const product = catalogo.find((item) => Number(item.id) === Number(productId));
      if (!product) return;
      const item = document.createElement('li');
      item.textContent = `${quantity} × ${product.nombre} — $${Number(product.precio) * quantity}`;
      list.append(item);
    });
    section.append(list);
    const button = document.createElement('button');
    button.className = 'btn-primary';
    button.type = 'button';
    button.textContent = 'Crear pedido';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + state.accessToken
          },
          body: JSON.stringify({
            items: selectedProducts.map(([product_id, quantity]) => ({ product_id, quantity }))
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo crear el pedido');
        state.cart.clear();
        await cargarDashboardGraphql();
        await cargarPagos();
        document.getElementById('account-status').textContent = `Pedido #${result.order.id} creado. Puedes pagarlo con Webpay simulado.`;
      } catch (error) {
        document.getElementById('account-status').textContent = error.message;
        button.disabled = false;
      }
    });
    section.append(button);
  }
  overview.prepend(section);
}

async function cargarDashboardGraphql() {
  const status = document.getElementById('account-status');
  const overview = document.getElementById('account-overview');
  status.textContent = 'Consultando el menú y tus pedidos…';

  const response = await fetch(`${API_BASE}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.accessToken}`
    },
    body: JSON.stringify({
      query: `query Dashboard($limit: Int!) {
        dashboard(limit: $limit) {
          menu { id nombre precio }
          orders { id status total items { nombre quantity unit_price } }
        }
      }`,
      variables: { limit: 6 }
    })
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data?.dashboard) {
    throw new Error(result.errors?.[0]?.message || 'No se pudo cargar el panel de cuenta');
  }

  const dashboard = result.data.dashboard;
  overview.replaceChildren();
  addAccountSection(
    overview,
    'Menú actual',
    dashboard.menu,
    (product) => `${product.nombre} — $${product.precio}`
  );
  addAccountSection(
    overview,
    'Mis pedidos',
    dashboard.orders,
    (order) => `Pedido #${order.id}: ${order.status} — $${order.total} (${order.items
      .map((item) => `${item.quantity} × ${item.nombre}`)
      .join(', ')})`
  );
  renderCart();
  status.textContent = 'Información actualizada desde GraphQL.';
}

async function cargarPagos() {
  const overview = document.getElementById('account-overview');
  const [ordersResponse, paymentsResponse] = await Promise.all([
    fetch(`${API_BASE}/orders`, {
      headers: { Authorization: 'Bearer ' + state.accessToken }
    }),
    fetch(`${API_BASE}/payments`, {
      headers: { Authorization: 'Bearer ' + state.accessToken }
    })
  ]);
  const [orders, payments] = await Promise.all([ordersResponse.json(), paymentsResponse.json()]);
  if (!ordersResponse.ok || !paymentsResponse.ok) {
    throw new Error(orders.error || payments.error || 'No se pudieron cargar los pagos');
  }

  const section = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = 'Webpay simulado (prueba)';
  const note = document.createElement('p');
  note.textContent = 'Proveedor ficticio para la entrega: no es una integración oficial de Webpay y no procesa cargos reales.';
  section.append(heading, note);

  orders.filter((order) => order.user_id === state.user.id && order.status === 'pending').forEach((order) => {
    const row = document.createElement('p');
    const label = document.createElement('span');
    label.textContent = `Pedido #${order.id} — $${order.total} `;
    const button = document.createElement('button');
    button.className = 'btn-ghost';
    button.type = 'button';
    button.textContent = 'Pagar con Webpay simulado';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch(`${API_BASE}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + state.accessToken,
            'Idempotency-Key': crypto.randomUUID()
          },
          body: JSON.stringify({ order_id: order.id })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo procesar el pago de prueba');
        await cargarDashboardGraphql();
        await cargarPagos();
      } catch (error) {
        document.getElementById('account-status').textContent = error.message;
        button.disabled = false;
      }
    });
    row.append(label, button);
    section.append(row);
  });

  if (payments.length) {
    const list = document.createElement('ul');
    payments.forEach((payment) => {
      const item = document.createElement('li');
      item.textContent = `Pago #${payment.id} (${payment.provider}), pedido #${payment.order_id}: ${payment.status} — ${payment.currency} ${payment.amount}`;
      list.append(item);
    });
    section.append(list);
  }

  const existing = overview.querySelector('[data-payment-section]');
  if (existing) existing.remove();
  section.dataset.paymentSection = 'true';
  overview.append(section);
}

function initAccount() {
  const form = document.getElementById('account-login');
  const registration = document.getElementById('account-register');
  const registrationForm = document.getElementById('client-register-form');
  const dashboard = document.getElementById('account-dashboard');
  const status = document.getElementById('account-status');

  registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = registrationForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = 'Creando cuenta…';
    try {
      const response = await fetch(`${API_BASE}/clients/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(registrationForm).entries()))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo crear la cuenta');
      state.accessToken = result.access_token;
      state.user = result.user;
      registrationForm.reset();
      document.getElementById('account-greeting').textContent = `Sesión iniciada como ${state.user.full_name}.`;
      form.hidden = true;
      registration.hidden = true;
      dashboard.hidden = false;
      await cargarDashboardGraphql();
      await cargarPagos();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const credentials = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = 'Iniciando sesión…';

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión');

      state.accessToken = result.access_token;
      state.user = result.user;
      form.reset();
      document.getElementById('account-greeting').textContent = `Sesión iniciada como ${state.user.full_name}.`;
      form.hidden = true;
      registration.hidden = true;
      dashboard.hidden = false;
      await cargarDashboardGraphql();
      await cargarPagos();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('account-refresh').addEventListener('click', async () => {
    try {
      await cargarDashboardGraphql();
      await cargarPagos();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  document.getElementById('account-logout').addEventListener('click', async () => {
    let logoutError;
    try {
      const response = await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.accessToken}` }
      });
      if (!response.ok) throw new Error('No se pudo invalidar la sesión en el servidor');
    } catch (error) {
      logoutError = error;
    } finally {
      state.accessToken = null;
      state.user = null;
      dashboard.hidden = true;
      form.hidden = false;
      registration.hidden = false;
      form.reset();
      registrationForm.reset();
      document.getElementById('account-overview').replaceChildren();
      status.textContent = logoutError
        ? `Se cerró la sesión local, pero no se pudo invalidar en el servidor: ${logoutError.message}`
        : 'Sesión cerrada.';
    }
  });
}

document.addEventListener('components:loaded', () => {
  initMenu();
  initAccount();
  initReservationForm();
  cargarCatalogo();
}, { once: true });
