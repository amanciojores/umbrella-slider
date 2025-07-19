class UmbrellaCarousel {
  constructor(carousel) {
    this.carousel = carousel;
    this.track = carousel.querySelector(".umbrella__list");
    this.originalSlides = Array.from(this.track.children);
    this.prevBtn = carousel.querySelector(".umbrella__prev");
    this.nextBtn = carousel.querySelector(".umbrella__next");
    this.paginationContainer = carousel.querySelector(".umbrella__pagination");
    this.breakpoints = this.getBreakpoints();

    // Performance optimizations
    this.rafId = null;
    this.resizeTimeout = null;
    this.intersectionObserver = null;
    this.lazyImages = new Set();

    this.init();
  }

  getBreakpoints() {
    try {
      return this.carousel.dataset.breakpoints
        ? JSON.parse(this.carousel.dataset.breakpoints)
        : {};
    } catch (e) {
      console.error("Invalid breakpoints JSON", e);
      return {};
    }
  }

  getResponsiveSettings() {
    const defaultSettings = {
      itemsPerPage: parseInt(this.carousel.dataset.itemsPerPage) || 1,
      pagesPerMove: parseInt(this.carousel.dataset.pagesPerMove) || 1,
      autoplay: true,
      delay: 3000,
      sliderType: this.carousel.dataset.sliderType || "loop",
      pagination: this.carousel.dataset.pagination === "true",
      syncBanners: this.carousel.dataset.syncBanners === "true",
      lazyLoad: this.carousel.dataset.lazyLoad === "true",
    };

    try {
      const autoplayData = JSON.parse(this.carousel.dataset.autoplay || "{}");

      if (autoplayData && Object.keys(autoplayData).length > 0) {
        defaultSettings.autoplay = autoplayData.autoPlay === true;

        if (autoplayData.delay)
          defaultSettings.delay = parseInt(autoplayData.delay);
      }
    } catch (e) {
      console.error("Invalid autoplay JSON", e);
    }

    const filtered = Object.entries(this.breakpoints)
      .filter(([bp]) => window.innerWidth <= parseInt(bp))
      .map(([, s]) => s);

    return filtered.length
      ? { ...defaultSettings, ...filtered[0] }
      : defaultSettings;
  }

  init() {
    this.settings = this.getResponsiveSettings();
    this.index =
      this.settings.sliderType === "loop" ? this.settings.pagesPerMove : 0;
    this.slideWidth = 100 / this.settings.itemsPerPage;
    this.cloneCount =
      this.settings.sliderType === "loop"
        ? Math.max(this.settings.pagesPerMove, this.settings.itemsPerPage)
        : 0;

    this.updateSliderTypeClass();
    this.setupSlides();
    this.setupPagination();
    this.addEventListeners();
    this.updateNavigationVisibility();

    this.setupLazyLoading();

    // Force visibility update to load initial images
    if (this.settings.lazyLoad) {
      if (this.settings.sliderType === "fade") {
        this.updateFadeVisibility();
      } else {
        this.updateVisibility();
      }
    }

    this.setupIntersectionObserver();

    if (this.settings.syncBanners) this.setupBannerSync();
    if (this.settings.autoplay) this.startAutoplay();
  }

  updateSliderTypeClass() {
    this.carousel.classList.remove(
      "umbrella--fade",
      "umbrella--slide",
      "umbrella--loop"
    );
    this.carousel.classList.add(`umbrella--${this.settings.sliderType}`);
  }

  setupSlides() {
    this.track.innerHTML = "";
    this.originalSlides.forEach((slide) => {
      slide.style.opacity = "1";
      this.track.appendChild(slide);
    });

    if (this.settings.sliderType === "loop") {
      for (let i = 0; i < this.cloneCount; i++) {
        const cloneFirst =
          this.originalSlides[i % this.originalSlides.length].cloneNode(true);
        const cloneLast =
          this.originalSlides[
            this.originalSlides.length - 1 - (i % this.originalSlides.length)
          ].cloneNode(true);

        // Prevent duplicate IDs
        cloneFirst.removeAttribute("id");
        cloneLast.removeAttribute("id");

        cloneFirst.dataset.clone = cloneLast.dataset.clone = "true";
        this.track.appendChild(cloneFirst);
        this.track.insertBefore(cloneLast, this.track.firstChild);
      }
    }

    this.slides = Array.from(this.track.children);
    this.track.style.width = `${this.slides.length * this.slideWidth}%`;
    this.slides.forEach((slide) => {
      slide.style.width = `${this.slideWidth}%`;
      slide.style.position = "";
      slide.style.top = "";
      slide.style.left = "";
      slide.style.zIndex = "";
      slide.classList.remove("umbrella__slide__visible");
      slide.style.transition =
        this.settings.sliderType === "fade" ? "opacity 0.5s ease" : "";
    });

    if (this.settings.sliderType === "fade") {
      this.updateFadeVisibility();
    } else {
      this.updateCarouselPosition();
      this.updateVisibility();
    }
  }

  updateCarousel() {
    if (this.settings.sliderType === "fade") {
      this.updateFadeVisibility();
      this.syncActiveBanner();
      return;
    }

    if (this.settings.sliderType === "slide") {
      this.clampIndexForSlideType();
    }

    this.rafId = requestAnimationFrame(() => {
      this.track.style.transition = "transform 0.5s ease-in-out";
      this.updateCarouselPosition();

      this.track.addEventListener(
        "transitionend",
        () => {
          if (this.settings.sliderType === "loop") {
            if (this.index <= 0) {
              this.index = this.slides.length - this.cloneCount * 2;
            } else if (this.index >= this.slides.length - this.cloneCount) {
              this.index = this.cloneCount;
            }
            this.track.style.transition = "none";
            this.updateCarouselPosition();
          }
          this.updateVisibility();
          this.syncActiveBanner();
        },
        { once: true }
      );

      this.updatePagination();
    });
  }

  updateCarouselPosition() {
    this.track.style.transform = `translate3d(-${
      this.index * this.slideWidth
    }%, 0, 0)`;
  }

  clampIndexForSlideType() {
    const maxIndex = this.slides.length - this.settings.itemsPerPage;
    this.index = Math.max(0, Math.min(this.index, maxIndex));
  }

  updateVisibility() {
    this.slides.forEach((slide, i) => {
      const isVisible =
        i >= this.index && i < this.index + this.settings.itemsPerPage;
      slide.setAttribute("aria-hidden", !isVisible);
      slide.classList.toggle("umbrella__slide__visible", isVisible);

      if (isVisible && this.settings.lazyLoad) {
        this.loadSlideImages(slide);
      }
    });
  }

  updateFadeVisibility() {
    this.slides.forEach((slide, i) => {
      const isActive = i === this.index;
      slide.style.opacity = isActive ? "1" : "0";
      slide.style.zIndex = isActive ? "1" : "0";
      slide.classList.toggle("umbrella__slide__visible", isActive);

      if (isActive && this.settings.lazyLoad) {
        this.loadSlideImages(slide);
      }
    });
    this.updatePagination();
  }

  setupPagination() {
    if (!this.settings.pagination || !this.paginationContainer) return;

    this.paginationBullets = Array.from(
      this.paginationContainer.querySelectorAll(".umbrella__pagination__bullet")
    );

    if (this.paginationBullets.length === 0) {
      const pageCount = Math.ceil(
        this.originalSlides.length / this.settings.pagesPerMove
      );

      for (let i = 0; i < pageCount; i++) {
        const btn = document.createElement("button");
        btn.className = "umbrella__pagination__bullet";
        btn.setAttribute("aria-label", `Go to slide ${i + 1}`);
        btn.dataset.index = i;
        this.paginationContainer.appendChild(btn);
        this.paginationBullets.push(btn);
      }
    } else {
      this.paginationBullets.forEach((btn, i) => {
        btn.dataset.index = i;
      });
    }

    this.paginationContainer.addEventListener("click", (e) => {
      const bullet = e.target.closest(".umbrella__pagination__bullet");
      if (!bullet) return;

      const i = parseInt(bullet.dataset.index);
      this.index =
        this.settings.sliderType === "fade"
          ? i
          : this.cloneCount + i * this.settings.pagesPerMove;
      this.updateCarousel();
      this.stopAutoplay();
    });

    this.updatePagination();
  }

  updatePagination() {
    if (!this.paginationBullets) return;
    const currentIndex =
      this.settings.sliderType === "fade"
        ? this.index
        : Math.floor(
            (this.index - this.cloneCount) / this.settings.pagesPerMove
          );
    this.paginationBullets.forEach((btn, i) =>
      btn.classList.toggle("active", i === currentIndex)
    );
  }

  startAutoplay() {
    this.stopAutoplay();
    this.autoplayInterval = setInterval(() => {
      if (this.settings.sliderType === "fade") {
        this.index = (this.index + 1) % this.slides.length;
      } else {
        this.index += this.settings.pagesPerMove;
        if (
          this.settings.sliderType === "slide" &&
          this.index > this.slides.length - this.settings.itemsPerPage
        ) {
          this.index = 0;
        }
      }
      this.updateCarousel();
    }, this.settings.delay);
  }

  stopAutoplay() {
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
  }

  loadVisibleImages() {
    if (!this.settings.lazyLoad) return;

    const visibleSlides =
      this.settings.sliderType === "fade"
        ? [this.slides[this.index]]
        : this.slides.slice(
            this.index,
            this.index + this.settings.itemsPerPage
          );

    visibleSlides.forEach((slide) => {
      const images = slide.querySelectorAll("img[data-src]");
      images.forEach((img) => {
        if (this.lazyImages.has(img)) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          this.lazyImages.delete(img);

          img.classList.add("lazy-loading");
          img.addEventListener(
            "load",
            () => {
              img.classList.remove("lazy-loading");
              img.classList.add("lazy-loaded");
            },
            { once: true }
          );
        }
      });
    });
  }

  updateNavigationVisibility() {
    const shouldHideNavigation =
      this.settings.sliderType === "slide" &&
      this.originalSlides.length <= this.settings.itemsPerPage;

    if (this.prevBtn) {
      this.prevBtn.style.display = shouldHideNavigation ? "none" : "";
    }

    if (this.nextBtn) {
      this.nextBtn.style.display = shouldHideNavigation ? "none" : "";
    }

    if (this.paginationContainer) {
      this.paginationContainer.style.display = shouldHideNavigation
        ? "none"
        : "";
    }
  }

  addEventListeners() {
    this.prevBtn?.addEventListener("click", () => {
      if (this.settings.sliderType === "fade") {
        this.index = (this.index - 1 + this.slides.length) % this.slides.length;
      } else {
        this.index -= this.settings.pagesPerMove;
      }
      this.updateCarousel();
      this.stopAutoplay();
    });

    this.nextBtn?.addEventListener("click", () => {
      if (this.settings.sliderType === "fade") {
        this.index = (this.index + 1) % this.slides.length;
      } else {
        this.index += this.settings.pagesPerMove;
      }
      this.updateCarousel();
      this.stopAutoplay();
    });

    this.carousel.setAttribute("tabindex", "0");
    this.carousel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") this.nextBtn?.click();
      if (e.key === "ArrowLeft") this.prevBtn?.click();
    });

    let startX = 0;
    this.carousel.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
      },
      { passive: true }
    );

    this.carousel.addEventListener(
      "touchend",
      (e) => {
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;
        if (Math.abs(diff) > 50) {
          if (diff > 0) {
            this.nextBtn?.click();
          } else {
            this.prevBtn?.click();
          }
        }
      },
      { passive: true }
    );

    this.handleResize = this.debounce(() => {
      const newSettings = this.getResponsiveSettings();
      const needsReset =
        newSettings.itemsPerPage !== this.settings.itemsPerPage ||
        newSettings.sliderType !== this.settings.sliderType ||
        newSettings.pagesPerMove !== this.settings.pagesPerMove;

      this.settings = newSettings;
      this.slideWidth = 100 / this.settings.itemsPerPage;
      this.cloneCount =
        this.settings.sliderType === "loop"
          ? Math.max(this.settings.pagesPerMove, this.settings.itemsPerPage)
          : 0;

      if (needsReset) {
        this.index =
          this.settings.sliderType === "loop" ? this.settings.pagesPerMove : 0;
        this.updateSliderTypeClass();

        this.setupSlides();
        this.setupPagination();
        this.setupLazyLoading();

        if (this.settings.lazyLoad) {
          this.loadVisibleImages();
        }
      } else {
        this.updateSliderTypeClass();
        this.slideWidth = 100 / this.settings.itemsPerPage;
        this.track.style.width = `${this.slides.length * this.slideWidth}%`;
        this.slides.forEach((slide) => {
          slide.style.width = `${this.slideWidth}%`;
        });

        requestAnimationFrame(() => {
          if (this.settings.sliderType === "fade") {
            this.updateFadeVisibility();
          } else {
            this.updateCarouselPosition();
            this.updateVisibility();
          }
        });
      }

      this.updateNavigationVisibility();
    }, 200);

    window.addEventListener("resize", this.handleResize, { passive: true });
  }

  debounce(fn, delay) {
    return (...args) => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => fn(...args), delay);
    };
  }

  setupIntersectionObserver() {
    if (!("IntersectionObserver" in window)) return;

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (this.settings.autoplay && !this.autoplayInterval) {
              this.startAutoplay();
            }
          } else {
            if (this.autoplayInterval) {
              this.stopAutoplay();
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    this.intersectionObserver.observe(this.carousel);
  }

  setupLazyLoading() {
    const images = this.carousel.querySelectorAll("img[data-src]");

    if (this.settings.lazyLoad) {
      // Lazy loading enabled - add to tracking set
      images.forEach((img) => {
        this.lazyImages.add(img);
        // Optional: Add loading state class
        img.classList.add("lazy-load-pending");
      });
    } else {
      // Lazy loading disabled - immediately load images
      images.forEach((img) => {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        // Remove any lazy-loading classes if present
        img.classList.remove("lazy-load-pending", "lazy-loading");
        img.classList.add("lazy-load-complete");
      });
      this.lazyImages.clear(); // Clear any tracked images
    }
  }

  loadSlideImages(slide) {
    const images = slide.querySelectorAll("img[data-src]");
    images.forEach((img) => {
      if (this.lazyImages.has(img)) {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        this.lazyImages.delete(img);

        img.classList.add("lazy-loading");
        img.addEventListener(
          "load",
          () => {
            img.classList.remove("lazy-loading");
            img.classList.add("lazy-loaded");
          },
          { once: true }
        );
      }
    });
  }

  setupBannerSync() {
    // Component-scoped banner selection
    const bannerContainer = this.carousel.closest(".umbrella-banner");
    if (!bannerContainer) return;

    const banners = bannerContainer.querySelectorAll(".banner-card");
    const isFade = this.settings.sliderType === "fade";
    banners.forEach((banner, index) => {
      const handler = () => {
        this.index = isFade
          ? index
          : this.settings.sliderType === "loop"
          ? this.cloneCount + index * this.settings.pagesPerMove
          : index;
        this.updateCarousel();
        if (!isFade) this.stopAutoplay();
      };
      const eventType = isFade ? "mouseenter" : "click";
      banner.addEventListener(eventType, handler, { passive: true });
    });
  }

  syncActiveBanner() {
    if (!this.settings.syncBanners) return;

    // Component-scoped banner selection
    const bannerContainer = this.carousel.closest(".umbrella-banner");
    if (!bannerContainer) return;

    const banners = bannerContainer.querySelectorAll(".banner-card");
    const visibleSlideIndex =
      this.settings.sliderType === "fade"
        ? this.index
        : (this.index - this.cloneCount + this.originalSlides.length) %
          this.originalSlides.length;

    banners.forEach((banner, index) => {
      banner.classList.toggle("active", index === visibleSlideIndex);
    });
  }

  destroy() {
    this.stopAutoplay();
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }

    window.removeEventListener("resize", this.handleResize);

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    this.lazyImages.clear();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.umbrellaCarousels = {};

  document.querySelectorAll(".umbrella__slider").forEach((el, i) => {
    const id = el.id || `carousel-${i}`;
    el.id = id;
    window.umbrellaCarousels[id] = new UmbrellaCarousel(el);
  });

  document.querySelectorAll(".umbrella-banner").forEach((root) => {
    root.querySelectorAll("*").forEach((el) => {
      for (const attr of el.attributes) {
        if (!attr.name.startsWith("data-on")) continue;

        const eventName = attr.name.slice(7).toLowerCase();
        const code = attr.value;

        if (eventName && typeof el[`on${eventName}`] !== "undefined") {
          el.addEventListener(
            eventName,
            (e) => {
              try {
                // Safer execution with strict mode
                new Function(
                  "event",
                  `"use strict"; try { ${code} } catch(err) { 
                    console.warn("Event handler error:", err); 
                  }`
                ).call(el, e);
              } catch (err) {
                console.warn(`Error in data-on${eventName}:`, err);
              }
            },
            { passive: false }
          );
        }
      }
    });
  });
});

window.cleanupUmbrellaCarousels = () => {
  if (
    window.umbrellaCarousels &&
    typeof window.umbrellaCarousels === "object"
  ) {
    Object.values(window.umbrellaCarousels).forEach((carousel) => {
      if (carousel && typeof carousel.destroy === "function") {
        carousel.destroy();
      }
    });
    window.umbrellaCarousels = {};
  }
};
