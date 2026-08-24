document.addEventListener('DOMContentLoaded', function () {

  const articulos = document.querySelectorAll('article.post-card');
  console.log('Articulos encontrados:', articulos.length);

  articulos.forEach(function (articulo) {
    const titulo = articulo.querySelector('h2').textContent.trim();
    const enlace = articulo.querySelector('h2 a').getAttribute('href');
    console.log('- ' + titulo + ' -> ' + enlace);
  });

  const arbol = [];
  function recorrerArbol(nodo, nivel) {
    if (nodo.nodeType === Node.ELEMENT_NODE) {
      arbol.push('  '.repeat(nivel) + '<' + nodo.tagName.toLowerCase() + '>');
    }
    nodo.childNodes.forEach(function (hijo) {
      recorrerArbol(hijo, nodo.nodeType === Node.ELEMENT_NODE ? nivel + 1 : nivel);
    });
  }
  recorrerArbol(document.documentElement, 0);
  console.log(arbol.join('\n'));

  const totalElementos = document.getElementsByTagName('*').length;
  console.log('Total de nodos elemento:', totalElementos);

  const heroTitle = document.querySelector('.hero-title');
  const tituloOriginal = heroTitle.textContent;
  heroTitle.textContent = 'Nuevas guias y analisis cada semana';
  console.log('Titulo anterior: ' + tituloOriginal);
  console.log('Titulo actual: ' + heroTitle.textContent);

  const nuevaCard = document.createElement('article');
  nuevaCard.className = 'post-card';

  const meta = document.createElement('p');
  meta.className = 'post-meta';
  meta.textContent = 'Noticias · 24 ago 2026';

  const h2 = document.createElement('h2');
  const link = document.createElement('a');
  link.href = '#';
  link.style.color = 'var(--text)';
  link.style.textDecoration = 'none';
  link.textContent = 'Preparacion de utilidades antes de ejecutar';

  h2.appendChild(link);

  const parrafo = document.createElement('p');
  parrafo.textContent = 'Coordina drones y granadas con tu equipo antes de entrar al sitio.';

  const leerMas = document.createElement('a');
  leerMas.href = '#';
  leerMas.textContent = 'Leer mas →';

  nuevaCard.appendChild(meta);
  nuevaCard.appendChild(h2);
  nuevaCard.appendChild(parrafo);
  nuevaCard.appendChild(leerMas);

  document.querySelector('section[aria-label]').appendChild(nuevaCard);
});
