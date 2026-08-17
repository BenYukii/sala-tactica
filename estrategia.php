<?php
$titulo  = 'Estrategia — Sala Táctica';
$seccion = 'estrategia';
include 'header.php';
?>

<header class="container-fluid hero-banner py-5">
  <div class="container">
    <p class="eyebrow mb-2">Estrategia · Rainbow Six Siege</p>
    <h1 class="hero-title">Guías de estrategia</h1>
    <p class="mt-2" style="max-width:600px; color:var(--muted)">Rotaciones, gestión de utilidad y decisiones por ronda.</p>
  </div>
</header>

<main class="container">
  <div class="row">

    <section class="col-xs-12 col-sm-8 col-lg-9" aria-label="Artículos de estrategia">

      <article class="post-card">
        <p class="post-meta">Estrategia · 10 ago 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">Cómo leer el mapa antes del primer pick</a></h2>
        <p>Priorizar sitios de defensa según spawns rivales cambia toda la ronda.</p>
        <a href="#">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Estrategia · 28 jul 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">El valor de la utilidad en el 10-segundo</a></h2>
        <p>Qué conservar para la ejecución final y qué gastar temprano sin remordimiento.</p>
        <a href="#">Leer más →</a>
      </article>

      <article class="post-card">
        <p class="post-meta">Estrategia · 20 jul 2026</p>
        <h2><a href="#" style="color:var(--text); text-decoration:none">Defensa agresiva: cuándo salir del sitio</a></h2>
        <p>Retomar el control del mapa exterior ronda a ronda sin perder la planta.</p>
        <a href="#">Leer más →</a>
      </article>

    </section>

    <?php include 'sidebar.php'; ?>
  </div>
</main>

<?php include 'footer.php'; ?>