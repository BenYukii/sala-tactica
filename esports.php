<?php
$titulo  = 'Esports — Sala Táctica';
$seccion = 'esports';
include 'header.php';
?>

<header class="container py-5">
  <p class="eyebrow mb-2">Esports · Rainbow Six Siege</p>
  <h1 class="hero-title">Esports</h1>
  <p class="mt-2" style="max-width:600px; color:var(--muted)">Resultados, formatos y análisis de la escena competitiva.</p>
</header>

<main class="container">
  <div class="row">

    <section class="col-xs-12 col-sm-8 col-lg-9" aria-label="Artículos de esports">

      <article class="post-card">
        <p class="post-meta">Esports · 30 jul 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">Así se jugó el último major</a></h2>
        <p>Los picks más repetidos y las ejecuciones que definieron las finales.</p>
        <a href="#">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Esports · 15 jul 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">El meta de la liga: qué pickearon los pro</a></h2>
        <p>Comparativa de composiciones por mapa entre los equipos del top 8.</p>
        <a href="#">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Esports · 5 jul 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">Calendario de la temporada</a></h2>
        <p>Fechas de los próximos torneos, formatos y cómo verlos en vivo.</p>
        <a href="#">Leer más →</a>
      </article>

    </section>

    <?php include 'sidebar.php'; ?>
  </div>
</main>

<?php include 'footer.php'; ?>