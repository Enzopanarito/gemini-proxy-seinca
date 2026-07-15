const DOCS = [
  ['01', 'Control documental', 'Índice de entrega', 'Relación de documentos, revisiones y páginas.', '1Bcj7V59afMCXICGGPwL-7vfmircg7f3-'],
  ['02', 'Resumen ejecutivo', 'Dossier ejecutivo', 'Alcance, inversión, plazo, riesgos y ruta de aprobación.', '1w5gyygDTzk_4NLO7gKRzvVk_lg--ipuZ'],
  ['03', 'Documento económico', 'Presupuesto, APU y cómputos métricos', '48 partidas, análisis unitarios y trazabilidad de cantidades.', '1AGFoyQOhE5-qc8Uz_vOlx5XnEPEaO2Ue'],
  ['04', 'Documento técnico', 'Memoria descriptiva e informe técnico', 'Justificación integral del alcance, metodología y monto.', '12T2Wz7Ji8JvsqgdtQJolPeBZvM0TxIFK'],
  ['05', 'Anexo técnico', 'Cómputos métricos', 'Fórmulas, mediciones y niveles de certeza por partida.', '1gNANfC8OJhgb9gwvBEKRqKAvnWxrwOnQ'],
  ['06', 'Control de acabados', 'Aprobación de acabados', 'Porcelanato, revestimientos, pinturas, luminarias y paisajismo.', '1mkuniCmJhhVjpB3s2wBhF1aIcy9hNASj'],
  ['07', 'Control contractual', 'Acta de aceptación', 'Documento para formalizar la aceptación de la propuesta.', '1ptAIFm4U6U3ajVgY8edcyrVPJiEttbSU']
];

const PLANS = [
  ['P00', 'Presentación del proyecto', 'hero', '1d0Uk9tBzM96bXZov34C0fb0T2ifhC6c-'],
  ['P01', 'Planta general', 'planta', '1keFABVLuOirLPQ_OXh63wq8vA9aRlIpe'],
  ['P02', 'Planta de techo', 'techo', '1Wb641QTvAFNAn67vuOceSdZeS2q7Odhw'],
  ['P03', 'Replanteo, piso y luminarias', 'luces', '18Sn0W2JUKofsbC3U0FrNA5zO1dCZhT-j'],
  ['P04', 'Cortes A-A y B-B', 'planta', '1KMU8AzvL7rh-oYFj30uBoAcKNcksLjTq'],
  ['P05', 'Revestimientos', 'render', '1tuKJBKQYZnNdIGJNdVPH7gHaP_X5F6-F']
];

const CAPTIONS = [
  'Proyecto Onix 512: presentación ejecutiva desarrollada por Seinca para la Familia Rivas.',
  'Una propuesta integral que combina arquitectura, funcionalidad y una estética contemporánea.',
  'El expediente reúne 48 partidas, APU, cómputos métricos, planos y criterios de acabados.',
  'La ejecución se organiza en un plazo estimado de 10 a 12 semanas.',
  'Las decisiones técnicas y los riesgos se validan antes de iniciar la obra.',
  'Seinca: ingeniería, control y calidad para convertir el proyecto en realidad.'
];

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const mediaUrl = key => `/api/onix-media?key=${encodeURIComponent(key)}&v=20`;
const ASSETS = {
  logo: mediaUrl('logo'),
  hero: mediaUrl('hero'),
  render: mediaUrl('render'),
  planta: mediaUrl('planta'),
  luces: mediaUrl('luces'),
  techo: mediaUrl('techo'),
  audio: mediaUrl('audio')
};
const driveView = id => `https://drive.google.com/file/d/${id}/view?usp=sharing`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;

function buildCards() {
  const docGrid = $('#doc-grid');
  const planGrid = $('#plan-grid');

  docGrid.innerHTML = DOCS.map(doc => `
    <article class="doc-card reveal">
      <span class="doc-no">${doc[0]}</span>
      <small>${doc[1]}</small>
      <h3>${doc[2]}</h3>
      <p>${doc[3]}</p>
      <div class="doc-actions">
        <a href="${driveView(doc[4])}" target="_blank" rel="noopener">Abrir ↗</a>
        <a href="${driveDownload(doc[4])}" target="_blank" rel="noopener">Descargar ↓</a>
      </div>
    </article>`).join('');

  planGrid.innerHTML = PLANS.map(plan => `
    <article class="plan-card reveal">
      <img data-asset="${plan[2]}" alt="Vista previa: ${plan[1]}" loading="lazy">
      <div>
        <small>${plan[0]}</small>
        <h3>${plan[1]}</h3>
        <div class="plan-actions">
          <a href="${driveView(plan[3])}" target="_blank" rel="noopener">Abrir plano ↗</a>
          <a href="${driveDownload(plan[3])}" target="_blank" rel="noopener">Descargar ↓</a>
        </div>
      </div>
    </article>`).join('');
}

function hydrateAssets() {
  $$('img[data-asset]').forEach(image => {
    image.src = ASSETS[image.dataset.asset] || '';
  });
  $$('img[data-logo]').forEach(image => {
    image.src = ASSETS.logo;
  });
}

function initReveal() {
  const elements = $$('.reveal');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(element => element.classList.add('in'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  elements.forEach(element => observer.observe(element));
}

function initNav() {
  const menu = $('#menu');
  const nav = $('#nav');
  if (!menu || !nav) return;

  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });

  $$('#nav a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  }));

  const sections = $$('main section[id]');
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      $$('#nav a').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: '-35% 0px -55%' });

  sections.forEach(section => observer.observe(section));
}

function initLightbox() {
  const modal = $('#lightbox');
  const image = $('#lightbox-img');
  const caption = $('#lightbox-caption');
  if (!modal || !image || !caption) return;

  $$('[data-lightbox-key]').forEach(button => button.addEventListener('click', () => {
    const source = ASSETS[button.dataset.lightboxKey];
    if (!source) {
      showToast('La vista no está disponible.');
      return;
    }
    image.src = source;
    image.alt = button.dataset.caption || '';
    caption.textContent = button.dataset.caption || '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }));

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
  };

  $('[data-close]')?.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
}

function initPresentation() {
  const modal = $('#presentation');
  if (!modal) return;

  const cinema = $('.cinema', modal);
  const scenes = $$('.scene', modal);
  const chapterDots = $$('.chapter-bar i', modal);
  const playButton = $('#play-pause');
  const replayButton = $('#replay');
  const progress = $('#progress');
  const progressTrack = $('.progress');
  const time = $('#time');
  const caption = $('#caption');
  const captionsButton = $('#captions-toggle');
  const audioButton = $('#audio-toggle');
  const fullscreenButton = $('#fullscreen-toggle');
  const audio = new Audio(ASSETS.audio);

  audio.preload = 'metadata';
  let captionsEnabled = true;
  let muted = false;
  let currentScene = -1;
  const fallbackDuration = 30.984;
  const sceneStarts = [0, 5.285, 7.677, 16.358, 21.284, 27.678];

  const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const duration = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;

  const sceneFor = currentTime => {
    let index = 0;
    for (let i = 0; i < sceneStarts.length; i += 1) {
      if (currentTime >= sceneStarts[i]) index = i;
    }
    return Math.min(index, scenes.length - 1);
  };

  const render = () => {
    const total = duration();
    const current = Math.min(audio.currentTime || 0, total);
    const index = sceneFor(current);

    if (index !== currentScene) {
      scenes.forEach((scene, sceneIndex) => scene.classList.toggle('active', sceneIndex === index));
      chapterDots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex <= index));
      currentScene = index;
    }

    const percent = Math.min(100, (current / total) * 100);
    progress.style.width = `${percent}%`;
    progressTrack?.setAttribute('aria-valuenow', String(Math.round(percent)));
    time.textContent = `${formatTime(current)} / ${formatTime(total)}`;
    caption.textContent = captionsEnabled ? CAPTIONS[index] : '';
    playButton.textContent = audio.paused ? 'Reproducir' : 'Pausar';
  };

  const start = async () => {
    try {
      await audio.play();
      render();
    } catch (error) {
      console.error('ONIX_AUDIO_PLAY_ERROR', error);
      showToast('Pulsa nuevamente “Reproducir” para activar el audio.');
    }
  };

  const pause = () => {
    audio.pause();
    render();
  };

  const open = () => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    audio.currentTime = 0;
    currentScene = -1;
    render();
    start();
  };

  const close = async () => {
    audio.pause();
    audio.currentTime = 0;
    currentScene = -1;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (error) { console.warn('ONIX_FULLSCREEN_EXIT_ERROR', error); }
    }
    render();
  };

  const seekFromPointer = clientX => {
    if (!progressTrack) return;
    const rect = progressTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration();
    render();
  };

  audio.addEventListener('loadedmetadata', render);
  audio.addEventListener('durationchange', render);
  audio.addEventListener('timeupdate', render);
  audio.addEventListener('play', render);
  audio.addEventListener('pause', render);
  audio.addEventListener('ended', () => {
    render();
    playButton.textContent = 'Reproducir';
  });
  audio.addEventListener('error', () => {
    console.error('ONIX_AUDIO_LOAD_ERROR', audio.error);
    showToast('No fue posible cargar el audio de la presentación.');
  });

  $$('[data-presentation]').forEach(button => button.addEventListener('click', open));
  $('[data-close-presentation]')?.addEventListener('click', close);
  playButton?.addEventListener('click', () => audio.paused ? start() : pause());
  replayButton?.addEventListener('click', () => {
    audio.currentTime = 0;
    currentScene = -1;
    render();
    start();
  });

  captionsButton?.addEventListener('click', () => {
    captionsEnabled = !captionsEnabled;
    captionsButton.setAttribute('aria-pressed', String(captionsEnabled));
    caption.hidden = !captionsEnabled;
    render();
  });

  audioButton?.addEventListener('click', () => {
    muted = !muted;
    audio.muted = muted;
    audioButton.setAttribute('aria-pressed', String(!muted));
    audioButton.textContent = muted ? 'Audio: silenciado' : 'Audio: activo';
  });

  fullscreenButton?.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await cinema.requestFullscreen();
        fullscreenButton.textContent = 'Salir de pantalla completa';
      } else {
        await document.exitFullscreen();
        fullscreenButton.textContent = 'Pantalla completa';
      }
    } catch (error) {
      console.warn('ONIX_FULLSCREEN_ERROR', error);
      showToast('La pantalla completa no está disponible en este navegador.');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
  });

  progressTrack?.addEventListener('click', event => seekFromPointer(event.clientX));
  progressTrack?.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') {
      audio.currentTime = Math.min(duration(), audio.currentTime + 3);
      render();
    }
    if (event.key === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 3);
      render();
    }
  });

  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') close();
    if (event.code === 'Space' && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      playButton?.click();
    }
  });

  render();
}

function validateAssets() {
  $$('img').forEach(image => image.addEventListener('error', () => {
    image.classList.add('asset-error');
    console.error('ONIX_ASSET_UNAVAILABLE', image.currentSrc || image.src);
  }));
}

function initDownloads() {
  $$('.doc-actions a:last-child, .plan-actions a:last-child').forEach(link => link.addEventListener('click', () => {
    showToast('Descarga iniciada desde la entrega oficial.');
  }));
}

function showToast(text) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

buildCards();
hydrateAssets();
initReveal();
initNav();
initLightbox();
initPresentation();
validateAssets();
initDownloads();
