<?php
$titulo  = 'Mapas — Sala Táctica';
$seccion = 'mapas';
include 'header.php';
?>

<header class="container-fluid hero-banner py-5">
  <div class="container">
    <p class="eyebrow mb-2">Mapas · Rainbow Six Siege</p>
    <h1 class="hero-title">Mapas</h1>
    <p class="mt-2" style="max-width:600px; color:var(--muted)">Zonas clave, rotaciones y verticalidad por mapa.</p>
  </div>
</header>

<main class="container">
  <div class="row">

    <section class="col-xs-12 col-sm-8 col-lg-9" aria-label="Artículos de mapas">

      <article class="post-card">
        <p class="post-meta">Mapas · 2 ago 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">Rotaciones clave en la planta baja</a></h2>
        <p>Las líneas de flanco y los pasajes internos que definen las rondas de defensa.</p>
        <a href="#">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Mapas · 19 jul 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">Verticalidad: jugar por arriba con estilo</a></h2>
        <p>Cuándo romper el piso y qué cubre el equipo mientras el dúo presiona desde arriba.</p>
        <a href="#">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Mapas · 8 jul 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">Los ángulos muertos que nadie mira</a></h2>
        <p>Puntos de observación poco usados que dan ventaja de información en pick y ban.</p>
        <a href="#">Leer más →</a>
      </article>

    </section>

    <?php include 'sidebar.php'; ?>
  </div>
</main>

<?php include 'footer.php'; ?>