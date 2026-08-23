const header = document.querySelector('[data-header]');
const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');

const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  });
});

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('[data-slider]').forEach((slider) => {
  const slides = [...slider.querySelectorAll('[data-slide]')];
  const dots = [...slider.querySelectorAll('[data-slide-to]')];
  const previous = slider.querySelector('[data-slide-prev]');
  const next = slider.querySelector('[data-slide-next]');
  const interval = Number(slider.dataset.autoplay) || 6500;
  let activeSlide = 0;
  let autoplay;
  let slideRequest = 0;

  const prepareSlide = async (index) => {
    const slide = slides[(index + slides.length) % slides.length];
    const image = slide?.querySelector('img');

    if (!image || (image.complete && image.naturalWidth > 0)) return true;

    image.loading = 'eager';

    try {
      await image.decode();
    } catch {
      // decode() may reject before a delayed network request finishes.
    }

    return image.complete && image.naturalWidth > 0;
  };

  const showSlide = async (index) => {
    if (!slides.length) return;
    const targetSlide = (index + slides.length) % slides.length;
    const request = ++slideRequest;
    const ready = await prepareSlide(targetSlide);

    // Keep the current photo visible until the next one is fully decoded.
    if (!ready || request !== slideRequest) return;

    activeSlide = targetSlide;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeSlide;
      slide.classList.toggle('active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });

    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeSlide;
      dot.classList.toggle('active', active);
      if (active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });

    // Preload the next photo during the complete display interval.
    void prepareSlide(activeSlide + 1);
  };

  const stopAutoplay = () => window.clearInterval(autoplay);
  const startAutoplay = () => {
    stopAutoplay();
    if (!reduceMotion && slides.length > 1) {
      autoplay = window.setInterval(() => void showSlide(activeSlide + 1), interval);
    }
  };

  previous?.addEventListener('click', () => {
    void showSlide(activeSlide - 1);
    startAutoplay();
  });

  next?.addEventListener('click', () => {
    void showSlide(activeSlide + 1);
    startAutoplay();
  });

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      void showSlide(Number(dot.dataset.slideTo));
      startAutoplay();
    });
  });

  slider.addEventListener('mouseenter', stopAutoplay);
  slider.addEventListener('mouseleave', startAutoplay);
  slider.addEventListener('focusin', stopAutoplay);
  slider.addEventListener('focusout', startAutoplay);
  slider.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') void showSlide(activeSlide - 1);
    if (event.key === 'ArrowRight') void showSlide(activeSlide + 1);
  });

  void showSlide(0);
  void prepareSlide(1);
  startAutoplay();
});
