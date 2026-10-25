import { useEffect, useRef } from 'react';
import './PlanetJumping.css';

const BASE = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P';
const MARS_BG = `${BASE}/3c83091e-4046-4fd6-adbb-2edb728be79a.mp4`;
const TO_EARTH = `${BASE}/fc3ded42-e845-41f3-a830-5cab512d79cd.mp4`;
const TO_VENUS = `${BASE}/b30f64d9-1637-477a-83df-d0fc6461a422.mp4`;
const TO_MARS = `${BASE}/5fc5651c-3b5d-4171-b507-87f7e635d1b4.mp4`;
const MERCURY = `${BASE}/d6fb8b6b-c15e-4aaa-9cf7-45bbb5e33372.jpg`;
const LOGO = `${BASE}/eb7e0f53-50cd-4af5-abc4-8b9a52cdc01b.svg`;

const planets = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

interface PlanetState {
  name: string;
  next: string;
  number: string;
  portal?: string;
  image?: string;
  background: string;
  facts: [string, string][];
}

const states: Record<string, PlanetState> = {
  mars: {
    name: 'Mars',
    next: 'Earth',
    number: '[03]',
    portal: TO_EARTH,
    background: 'mars-background',
    facts: [
      ['Distance:', 'About 228 million km (1.5 astronomical units).'],
      ['Year:', 'One Martian year is equal to 687 Earth days.'],
      ['Temperature:', 'Around -60 °C, dropping to -125 °C at the poles in winter.'],
      ['Atmosphere:', 'Very thin, consisting of 95% carbon dioxide, with frequent dust storms.']
    ]
  },
  earth: {
    name: 'Earth',
    next: 'Venus',
    number: '[02]',
    portal: TO_VENUS,
    background: 'earth-background',
    facts: [
      ['Distance:', '149.6 million km from the Sun.'],
      ['Year:', '365.25 Earth days.'],
      ['Temperature:', 'Average surface temperature around 15 °C.'],
      ['Atmosphere:', 'Mostly nitrogen and oxygen, supporting life and liquid water.']
    ]
  },
  venus: {
    name: 'Venus',
    next: 'Mercury',
    number: '[06]',
    image: MERCURY,
    background: 'venus-background',
    facts: [
      ['Distance:', '108.2 million km from the Sun.'],
      ['Year:', '225 Earth days.'],
      ['Temperature:', 'Around 465 °C — the hottest planet in the Solar System.'],
      ['Atmosphere:', 'Extremely dense, mostly carbon dioxide, with clouds of sulfuric acid.']
    ]
  }
};

export default function HomePage() {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    let current = 'mars';
    let busy = false;
    let transitionActive = false;
    let expansion = 0;
    let maskScale = 0;
    let canvasOpacity = 1;
    let rotX = 0;
    let rotY = 0;
    let targetX = 0;
    let targetY = 0;
    let hasFrozenFrame = false;
    let lastTime = performance.now();
    let isFirstRender = true;

    // Cursor state
    let mouseX = -100;
    let mouseY = -100;
    let orbitX = -100;
    let orbitY = -100;
    let cursorVisible = false;
    let cursorEnter = false;

    const mainEl = containerRef.current;
    if (!mainEl) return;

    const portalCanvas = mainEl.querySelector('#portal-canvas') as HTMLCanvasElement;
    const sceneCanvas = mainEl.querySelector('#scene-canvas') as HTMLCanvasElement;
    const portalCtx = portalCanvas?.getContext('2d');
    const sceneCtx = sceneCanvas?.getContext('2d');

    const preloader = mainEl.querySelector('#preloader') as HTMLDivElement;
    const preloaderVideo = mainEl.querySelector('#preloader-video') as HTMLVideoElement;
    const preloaderCount = mainEl.querySelector('#preloader-count') as HTMLDivElement;
    const preloaderValue = mainEl.querySelector('#preloader-value') as HTMLSpanElement;
    const floatingLogo = mainEl.querySelector('#floating-logo') as HTMLImageElement;

    const portalBtn = mainEl.querySelector('#portal') as HTMLButtonElement;
    const portalVideo = mainEl.querySelector('#portal-video') as HTMLVideoElement;
    const portalImage = mainEl.querySelector('#portal-image') as HTMLImageElement;
    const transitionVideo = mainEl.querySelector('#transition-video') as HTMLVideoElement;

    const planetTitle = mainEl.querySelector('#planet-title') as HTMLHeadingElement;
    const nextName = mainEl.querySelector('#next-name') as HTMLElement;
    const nextNumber = mainEl.querySelector('#next-number') as HTMLElement;
    const factsEl = mainEl.querySelector('#facts') as HTMLElement;
    const planetList = mainEl.querySelector('.planet-list') as HTMLElement;

    const customCursor = mainEl.querySelector('.custom-cursor') as HTMLDivElement;
    const cursorOrbit = mainEl.querySelector('.cursor-orbit') as HTMLSpanElement;
    const cursorDot = mainEl.querySelector('.cursor-dot') as HTMLSpanElement;

    // Pause + rewind all background videos
    const bgVideos = mainEl.querySelectorAll('.background') as NodeListOf<HTMLVideoElement>;
    bgVideos.forEach(v => {
      v.pause();
      v.currentTime = 0;
    });

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const animateValue = (setter: (v: number) => void, duration: number) => {
      return new Promise<void>(resolve => {
        const start = performance.now();
        const frame = (now: number) => {
          if (!active) return;
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / duration);
          setter(easeInOutCubic(progress));
          if (progress < 1) {
            requestAnimationFrame(frame);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });
    };

    const resizeCanvas = () => {
      if (!portalCanvas || !sceneCanvas) return;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;

      portalCanvas.width = w * d;
      portalCanvas.height = h * d;
      portalCanvas.style.width = `${w}px`;
      portalCanvas.style.height = `${h}px`;
      portalCtx?.setTransform(d, 0, 0, d, 0, 0);

      if (!hasFrozenFrame) {
        sceneCanvas.width = w * d;
        sceneCanvas.height = h * d;
        sceneCanvas.style.width = `${w}px`;
        sceneCanvas.style.height = `${h}px`;
        sceneCtx?.setTransform(d, 0, 0, d, 0, 0);
      }
    };

    const drawCover = (ctx: CanvasRenderingContext2D, media: HTMLVideoElement | HTMLImageElement) => {
      const isVid = media instanceof HTMLVideoElement;
      const mw = isVid ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth;
      const mh = isVid ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight;
      if (!mw || !mh) return;

      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const scale = Math.max(sw / mw, sh / mh);
      const dw = mw * scale;
      const dh = mh * scale;
      const dx = (sw - dw) / 2;
      const dy = (sh - dh) / 2;

      try {
        ctx.drawImage(media, dx, dy, dw, dh);
      } catch (err) {
        // ignore media decoding glitches
      }
    };

    const drawShade = (ctx: CanvasRenderingContext2D) => {
      const sh = window.innerHeight;
      const sw = window.innerWidth;
      const grad = ctx.createLinearGradient(0, sh * 0.52, 0, sh);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, sh * 0.52, sw, sh * 0.48);
    };

    const render = () => {
      const state = states[current];
      if (!state) return;

      mainEl.setAttribute('data-planet', current);
      if (planetTitle) planetTitle.textContent = state.name.toUpperCase();
      if (nextName) nextName.textContent = state.next;
      if (nextNumber) nextNumber.textContent = state.number;
      if (portalBtn) portalBtn.setAttribute('aria-label', `Travel to ${state.next}`);

      // Build facts
      if (factsEl) {
        factsEl.innerHTML = state.facts
          .map(
            ([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`
          )
          .join('');
      }

      // Build planet-list
      if (planetList) {
        planetList.innerHTML = planets
          .map(p => `<span class="planet-item${p.toLowerCase() === current ? ' active' : ''}">${p}</span>`)
          .join('');

        if (!isFirstRender) {
          planetList.classList.remove('is-switching');
          void planetList.offsetWidth;
          planetList.classList.add('is-switching');
        }
      }

      // Background video visibility
      bgVideos.forEach(v => {
        if (v.id === state.background) {
          v.classList.add('is-visible');
          v.play().catch(() => {});
        } else {
          v.classList.remove('is-visible');
          v.pause();
        }
      });

      // Portal media
      if (state.image) {
        if (portalImage) {
          portalImage.src = state.image;
          portalImage.style.visibility = 'hidden';
        }
        if (portalVideo) {
          portalVideo.style.visibility = 'hidden';
          portalVideo.pause();
        }
      } else if (state.portal) {
        if (portalVideo) {
          if (portalVideo.src !== state.portal) {
            portalVideo.src = state.portal;
            portalVideo.load();
          }
          portalVideo.play().catch(() => {});
        }
      }

      isFirstRender = false;
    };

    const revealMask = async () => {
      mainEl.classList.remove('mask-revealing');
      void mainEl.offsetWidth;
      mainEl.classList.add('mask-revealing');
      maskScale = 0;
      await animateValue(v => {
        maskScale = v;
      }, 1050);
    };

    const revealPlanetContent = () => {
      mainEl.classList.remove('content-revealing');
      void mainEl.offsetWidth;
      mainEl.classList.add('content-revealing');
    };

    const startExperience = async () => {
      const state = states[current];
      if (state.portal && portalVideo) {
        await new Promise<void>(res => {
          if (portalVideo.readyState >= 2) return res();
          const onCanPlay = () => {
            portalVideo.removeEventListener('canplay', onCanPlay);
            res();
          };
          portalVideo.addEventListener('canplay', onCanPlay);
          setTimeout(res, 1200);
        });
      }
      await revealMask();
      document.body.classList.add('intro-ready');
      setTimeout(() => {
        if (active) revealPlanetContent();
      }, 850);
    };

    const runPreloader = () => {
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (preloaderValue) preloaderValue.textContent = '100';
        if (preloaderCount) preloaderCount.classList.add('is-leaving');
        if (floatingLogo) floatingLogo.classList.add('is-docked');
        if (preloader) preloader.classList.add('is-background');
        document.body.classList.add('preload-complete');

        startExperience();

        setTimeout(() => {
          if (preloaderCount && preloaderCount.parentNode) {
            preloaderCount.style.display = 'none';
          }
        }, 750);

        setTimeout(() => {
          if (floatingLogo) floatingLogo.classList.add('is-settled');
        }, 2000);
      };

      if (!preloaderVideo) {
        finish();
        return;
      }

      const updateCount = () => {
        if (finished || !active) return;
        if (preloaderVideo.duration) {
          const pct = Math.min(100, Math.round((preloaderVideo.currentTime / preloaderVideo.duration) * 100));
          if (preloaderValue) preloaderValue.textContent = String(pct);
        }
        if (!preloaderVideo.paused && !preloaderVideo.ended) {
          requestAnimationFrame(updateCount);
        }
      };

      const startPlayback = () => {
        if (preloaderVideo.duration) {
          preloaderVideo.playbackRate = Math.max(0.25, preloaderVideo.duration / 3);
        }
        preloaderVideo
          .play()
          .then(() => {
            requestAnimationFrame(updateCount);
          })
          .catch(() => {
            finish();
          });
      };

      if (preloaderVideo.readyState >= 1) {
        startPlayback();
      } else {
        preloaderVideo.addEventListener('loadedmetadata', startPlayback, { once: true });
      }

      preloaderVideo.addEventListener('ended', finish, { once: true });
      setTimeout(() => {
        if (!finished) finish();
      }, 4500);
    };

    const travel = async () => {
      if (busy || current === 'venus') return;
      busy = true;
      targetX = 0;
      targetY = 0;

      const next = current === 'mars' ? 'earth' : 'venus';
      const state = states[current];

      if (!transitionVideo) {
        busy = false;
        return;
      }

      transitionVideo.src = state.portal || '';
      transitionVideo.load();
      mainEl.classList.add('is-loading');

      await new Promise<void>(res => {
        let done = false;
        const cleanup = () => {
          if (done) return;
          done = true;
          transitionVideo.removeEventListener('canplaythrough', onReady);
          transitionVideo.removeEventListener('error', onReady);
          res();
        };
        const onReady = () => cleanup();
        transitionVideo.addEventListener('canplaythrough', onReady);
        transitionVideo.addEventListener('error', onReady);
        setTimeout(cleanup, 1600);
      });

      mainEl.classList.remove('is-loading', 'content-revealing', 'mask-revealing');
      mainEl.classList.add('is-transitioning');

      transitionVideo.currentTime = 0;
      transitionVideo.playbackRate = 1.3;
      canvasOpacity = 1;
      transitionActive = true;

      try {
        await transitionVideo.play();
      } catch (e) {
        // Ignored
      }

      await animateValue(v => {
        expansion = v;
      }, 1100);

      await new Promise<void>(res => {
        transitionVideo.addEventListener('ended', () => res(), { once: true });
        setTimeout(res, 3500);
      });

      // Freeze frame onto sceneCanvas
      if (sceneCtx && sceneCanvas) {
        const d = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        sceneCanvas.width = w * d;
        sceneCanvas.height = h * d;
        sceneCtx.setTransform(d, 0, 0, d, 0, 0);
        sceneCtx.clearRect(0, 0, w, h);
        drawCover(sceneCtx, transitionVideo);
        hasFrozenFrame = true;
      }

      current = next;
      mainEl.classList.add('is-committing');
      render();

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      transitionActive = false;
      expansion = 0;
      maskScale = 0;
      canvasOpacity = 1;
      mainEl.classList.remove('is-transitioning', 'is-committing');

      const maskReveal = revealMask();
      setTimeout(() => {
        if (active) revealPlanetContent();
      }, 100);

      await maskReveal;
      hasFrozenFrame = false;

      setTimeout(() => {
        transitionVideo.removeAttribute('src');
        transitionVideo.load();
        busy = false;
      }, 450);
    };

    // Draw loop
    const draw = (now: number) => {
      if (!active) return;
      const dt = Math.min(40, now - lastTime);
      lastTime = now;

      if (!busy) {
        rotX += (targetX - rotX) * Math.min(1, dt * 0.009);
        rotY += (targetY - rotY) * Math.min(1, dt * 0.009);
      } else {
        rotX += (0 - rotX) * Math.min(1, dt * 0.015);
        rotY += (0 - rotY) * Math.min(1, dt * 0.015);
      }

      if (portalCtx && portalCanvas && portalBtn) {
        const sw = window.innerWidth;
        const sh = window.innerHeight;

        portalCtx.clearRect(0, 0, sw, sh);

        if (hasFrozenFrame && sceneCanvas) {
          portalCtx.drawImage(sceneCanvas, 0, 0, sw, sh);
          drawShade(portalCtx);
        }

        const rect = portalBtn.getBoundingClientRect();
        const rectCx = rect.left + rect.width / 2;
        const rectCy = rect.top + rect.height / 2;
        const e = expansion;

        const cx = rectCx + (sw / 2 - rectCx) * e;
        const cy = rectCy + (sh / 2 - rectCy) * e;

        const baseW = rect.width + (sw - rect.width) * e;
        const baseH = rect.height + (sh - rect.height) * e;
        const scale = e > 0 ? 1 : maskScale;
        const w = baseW * scale;
        const h = baseH * scale;

        const r = 90 * (1 - e) * scale;
        const rx = rotX * (1 - e);
        const ry = rotY * (1 - e);

        if (w > 1 && h > 1) {
          const clampedR = Math.min(r, w / 2, h / 2);
          const points: [number, number][] = [];

          const arcRanges = [
            { ox: w / 2 - clampedR, oy: -h / 2 + clampedR, start: -Math.PI / 2, end: 0 },
            { ox: w / 2 - clampedR, oy: h / 2 - clampedR, start: 0, end: Math.PI / 2 },
            { ox: -w / 2 + clampedR, oy: h / 2 - clampedR, start: Math.PI / 2, end: Math.PI },
            { ox: -w / 2 + clampedR, oy: -h / 2 + clampedR, start: Math.PI, end: Math.PI * 1.5 }
          ];

          for (const arc of arcRanges) {
            for (let i = 0; i <= 10; i++) {
              const ang = arc.start + (arc.end - arc.start) * (i / 10);
              points.push([arc.ox + clampedR * Math.cos(ang), arc.oy + clampedR * Math.sin(ang)]);
            }
          }

          // Projection
          const ax = (rx * Math.PI) / 180;
          const ay = (ry * Math.PI) / 180;
          const cosAx = Math.cos(ax);
          const sinAx = Math.sin(ax);
          const cosAy = Math.cos(ay);
          const sinAy = Math.sin(ay);
          const focal = 850;

          const projPoints: [number, number][] = points.map(([x, y]) => {
            const xx = x * cosAy;
            const yy = y * cosAx;
            const z = x * sinAy - y * sinAx;
            const p = focal / (focal + z);
            return [cx + xx * p, cy + yy * p];
          });

          portalCtx.save();
          portalCtx.globalAlpha = canvasOpacity;
          portalCtx.beginPath();
          if (projPoints.length > 0) {
            portalCtx.moveTo(projPoints[0][0], projPoints[0][1]);
            for (let i = 1; i < projPoints.length; i++) {
              portalCtx.lineTo(projPoints[i][0], projPoints[i][1]);
            }
          }
          portalCtx.closePath();
          portalCtx.clip();

          portalCtx.fillStyle = '#030303';
          portalCtx.fillRect(0, 0, sw, sh);

          const curState = states[current];
          if (transitionActive && transitionVideo) {
            drawCover(portalCtx, transitionVideo);
          } else if (curState?.image && portalImage) {
            drawCover(portalCtx, portalImage);
          } else if (portalVideo) {
            drawCover(portalCtx, portalVideo);
          }

          if (transitionActive) {
            drawShade(portalCtx);
          }
          portalCtx.restore();
        }
      }

      requestAnimationFrame(draw);
    };

    // Cursor loop
    const cursorLoop = () => {
      if (!active) return;
      orbitX += (mouseX - orbitX) * 0.2;
      orbitY += (mouseY - orbitY) * 0.2;

      if (customCursor) {
        if (cursorVisible) {
          customCursor.classList.add('is-visible');
        } else {
          customCursor.classList.remove('is-visible');
        }
        if (cursorEnter) {
          customCursor.classList.add('is-enter');
        } else {
          customCursor.classList.remove('is-enter');
        }
      }

      if (cursorDot) {
        cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      }
      if (cursorOrbit) {
        cursorOrbit.style.transform = `translate3d(${orbitX}px, ${orbitY}px, 0) translate(-50%, -50%)${
          cursorEnter ? ' scale(1.16)' : ''
        }`;
      }

      requestAnimationFrame(cursorLoop);
    };

    const onPointerMove = (e: PointerEvent) => {
      cursorVisible = true;
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!busy) {
        targetY = (e.clientX / window.innerWidth - 0.5) * 37.4;
        targetX = (e.clientY / window.innerHeight - 0.5) * -33;
      }
    };

    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
      cursorVisible = false;
    };

    const onPortalEnter = () => {
      cursorEnter = true;
    };

    const onPortalLeave = () => {
      cursorEnter = false;
    };

    const onPortalClick = () => {
      travel();
    };

    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerleave', onPointerLeave);

    if (portalBtn) {
      portalBtn.addEventListener('pointerenter', onPortalEnter);
      portalBtn.addEventListener('pointerleave', onPortalLeave);
      portalBtn.addEventListener('click', onPortalClick);
    }

    resizeCanvas();
    render();
    requestAnimationFrame(draw);
    requestAnimationFrame(cursorLoop);
    runPreloader();

    return () => {
      active = false;
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      if (portalBtn) {
        portalBtn.removeEventListener('pointerenter', onPortalEnter);
        portalBtn.removeEventListener('pointerleave', onPortalLeave);
        portalBtn.removeEventListener('click', onPortalClick);
      }
      document.body.classList.remove('preload-complete', 'intro-ready');
    };
  }, []);

  return (
    <main ref={containerRef} className="experience" data-planet="mars">
      <div className="backgrounds" aria-hidden="true">
        <video id="mars-background" className="background is-visible" src={MARS_BG} muted playsInline preload="auto" />
        <video id="earth-background" className="background" src={TO_EARTH} muted playsInline preload="auto" />
        <video id="venus-background" className="background" src={TO_VENUS} muted playsInline preload="auto" />
      </div>

      <div className="preloader" id="preloader" aria-label="Loading Mars">
        <video id="preloader-video" src={TO_MARS} muted playsInline preload="auto" />
        <div className="preloader-shade" />
      </div>

      <img className="floating-logo" id="floating-logo" src={LOGO} alt="Ubernatural" />

      <div className="preloader-count" id="preloader-count" aria-live="polite">
        <span id="preloader-value">0</span>
        <span className="percent">%</span>
      </div>

      <canvas id="scene-canvas" className="scene-canvas" aria-hidden="true" />
      <div className="shade" aria-hidden="true" />

      <header className="header chrome">
        <div className="header-actions">
          <nav className="nav" aria-label="Primary navigation">
            <a className="active" href="#about">
              About
            </a>
            <a href="#explore">Explore</a>
            <a href="#planets">Planets</a>
          </nav>
          <button className="menu" type="button" onClick={() => (window.location.href = '/dashboard')}>
            Menu
          </button>
        </div>
      </header>

      <aside className="planet-list chrome" aria-label="Planets" />

      <canvas id="portal-canvas" className="portal-canvas" aria-hidden="true" />

      <section className="portal-wrap chrome" aria-label="Next destination">
        <div className="portal-heading">
          <span>Next:</span>
          <span>
            <span id="next-number">[03]</span> <strong id="next-name">Earth</strong>
          </span>
        </div>
        <button className="portal" id="portal" type="button" aria-label="Travel to Earth">
          <video id="portal-video" src={TO_EARTH} muted playsInline preload="auto" />
          <img id="portal-image" src={MERCURY} alt="Mercury" />
        </button>
      </section>

      <section className="planet-content chrome" aria-live="polite">
        <h1 id="planet-title">MARS</h1>
        <dl id="facts" />
      </section>

      <div className="transition-layer" aria-hidden="true">
        <video id="transition-video" muted playsInline preload="auto" />
      </div>

      <div className="loading" aria-hidden="true">
        Preparing orbit…
      </div>

      <div className="custom-cursor" aria-hidden="true">
        <span className="cursor-orbit" />
        <span className="cursor-dot" />
        <span className="cursor-label">Enter</span>
      </div>
    </main>
  );
}
