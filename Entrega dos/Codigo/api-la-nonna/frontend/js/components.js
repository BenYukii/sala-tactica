async function loadComponents() {
  const slots = [...document.querySelectorAll('[data-component]')];

  try {
    await Promise.all(slots.map(async (slot) => {
      const name = slot.dataset.component;
      const response = await fetch(`components/${name}.html`);
      if (!response.ok) throw new Error(`No se pudo cargar el componente ${name}`);
      slot.innerHTML = await response.text();
      slot.removeAttribute('data-component');
    }));
    document.dispatchEvent(new CustomEvent('components:loaded'));
  } catch (error) {
    document.body.innerHTML = `
      <main class="component-error">
        <h1>No se pudo cargar la interfaz</h1>
        <p>${error.message}. Ejecuta el proyecto con <strong>npm start</strong>.</p>
      </main>`;
  }
}

loadComponents();
