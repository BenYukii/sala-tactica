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

  const htmlFuente = '<!DOCTYPE html><html><head><title>Documento externo</title></head>' +
    '<body><h1>Titulo principal</h1><ul id="lista"><li>Uno</li><li>Dos</li><li>Tres</li></ul></body></html>';

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlFuente, 'text/html');

  console.log('Documento parseado con DOMParser');
  console.log('Titulo del documento:', doc.title);
  console.log('Items de lista:', doc.getElementsByTagName('li').length);
  console.log('H1 antes:', doc.getElementsByTagName('h1')[0].textContent);

  doc.getElementsByTagName('h1')[0].textContent = 'Titulo actualizado';
  const itemNuevo = doc.createElement('li');
  itemNuevo.textContent = 'Cuatro';
  doc.getElementById('lista').appendChild(itemNuevo);

  console.log('H1 despues:', doc.getElementsByTagName('h1')[0].textContent);
  console.log('Items de lista despues:', doc.getElementsByTagName('li').length);

  const responseAPI = {
    "status": 200,
    "message": "Categorias obtenidas",
    "data": [
      { "id": "1", "nombre": "Estrategia" },
      { "id": "2", "nombre": "Operadores" },
      { "id": "3", "nombre": "Mapas" },
      { "id": "4", "nombre": "Esports" }
    ]
  };

  let cmbCategoria = document.getElementById("cmbCategoria");
  responseAPI.data.forEach((cat) => {
    let optionAux = document.createElement("option");
    optionAux.setAttribute("value", cat.id);
    optionAux.innerText = cat.nombre;
    cmbCategoria.appendChild(optionAux);
  });
  console.log(responseAPI.message + ':', cmbCategoria.options.length);
});

