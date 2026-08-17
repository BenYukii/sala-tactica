<?php
$titulo  = 'Sala Táctica — Blog de Rainbow Six Siege';
$seccion = 'inicio';
include 'header.php';
?>

<header class="container py-5">
  <p class="eyebrow mb-2">Estrategia · Rainbow Six Siege</p>
  <h1 class="hero-title">Guías y análisis para jugar en equipo</h1>
  <p class="mt-2" style="max-width:600px; color:var(--muted)">Rotaciones, refuerzos y lectura de mapa explicados sin relleno.</p>
</header>

<main class="container">
  <div class="row">

    <!-- Contenido principal: 12/12 móvil, 8/12 tablet, 9/12 escritorio -->
    <section class="col-xs-12 col-sm-8 col-lg-9" aria-label="Artículos">

      <article class="post-card">
        <p class="post-meta">Estrategia · 10 ago 2026</p>
        <h2><a href="estrategia.php" style="color:var(--text); text-decoration:none">Cómo leer el mapa antes del primer pick</a></h2>
        <p>Priorizar sitios de defensa según spawns rivales cambia toda la ronda.</p>
        <a href="estrategia.php">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Operadores · 6 ago 2026</p>
        <h2><a href="operadores.php" style="color:var(--text); text-decoration:none">Roles de entrada: cuándo usar breachers duros</a></h2>
        <p>No todos los sitios necesitan una apertura agresiva desde el inicio.</p>
        <a href="operadores.php">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Mapas · 2 ago 2026</p>
        <h2><a href="mapas.php" style="color:var(--text); text-decoration:none">Rotaciones clave en la planta baja</a></h2>
        <p>Las líneas de flanco y los pasajes internos que definen las rondas de defensa.</p>
        <a href="mapas.php">Leer más →</a>
      </article>

      <!-- Estado: carga -->
      <div class="post-card" aria-hidden="true">
        <div class="skeleton mb-2" style="height:12px; width:25%"></div>
        <div class="skeleton mb-2" style="height:20px; width:65%"></div>
        <div class="skeleton" style="height:12px; width:90%"></div>
      </div>

      <!-- Estado: vacío -->
      <div class="post-card text-center py-4">
        <h2 class="h6">No hay más artículos en esta categoría</h2>
        <p class="mb-0" style="color:var(--muted)">Prueba con otra categoría en la barra lateral.</p>
      </div>

      <!-- Estado: error -->
      <div class="post-card text-center py-4" style="border-left-color:#C0392B">
        <h2 class="h6" style="color:#E57373">No se pudieron cargar los artículos</h2>
        <button class="btn btn-outline-light btn-sm mt-2">Reintentar</button>
      </div>

    </section>

    <?php include 'sidebar.php'; ?>
  </div>
</main>

<?php include 'footer.php'; ?>