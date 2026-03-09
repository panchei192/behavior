
// ============================================================
//  SHOPIFY STOREFRONT API CONFIG
// ============================================================
const SHOPIFY_DOMAIN = "behavior-8904.myshopify.com";
const STOREFRONT_TOKEN = "6531e4695468c2ee8668a947cf2b51dc";
const API_VERSION = "2024-01";
const API_URL = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;

// ============================================================
//  BOT PROTECTION LAYER
// ============================================================

/** 1. HEADLESS / BOT BROWSER DETECTION
 *  Checks multiple signals that real browsers expose but headless/
 *  automated bots often lack or spoof poorly. */
function isLikelyBot() {
  const nav = navigator;
  const signals = [
    // No plugins at all (most headless browsers)
    nav.plugins.length === 0,
    // WebDriver automation flag (Selenium, Playwright, Puppeteer default)
    !!nav.webdriver,
    // Missing language preference
    !nav.language || nav.language === "",
    // Suspiciously tiny viewport used by some bots
    window.outerWidth === 0 && window.outerHeight === 0,
    // No touch events AND screen size is 0 (headless)
    typeof TouchEvent === "undefined" && screen.width === 0,
  ];
  // If 2 or more signals fire, treat as bot
  return signals.filter(Boolean).length >= 2;
}

/** 2. SESSION-BASED RATE LIMITER
 *  Tracks how many API calls have been made this session.
 *  Hard-blocks if the limit is exceeded (bots spam requests). */
const RATE_LIMIT = {
  maxCalls: 20,          // max API calls per session
  windowMs: 10 * 60 * 1000, // 10-minute sliding window
  storageKey: "_rl",
};

function isRateLimited() {
  const now = Date.now();
  let data = JSON.parse(sessionStorage.getItem(RATE_LIMIT.storageKey) || "[]");
  // Drop entries outside the current window
  data = data.filter(ts => now - ts < RATE_LIMIT.windowMs);
  if (data.length >= RATE_LIMIT.maxCalls) return true;
  data.push(now);
  sessionStorage.setItem(RATE_LIMIT.storageKey, JSON.stringify(data));
  return false;
}

/** 3. PRODUCT CACHE — avoids hitting Shopify API on every page load.
 *  Version suffix invalidates old caches when query changes. */
const CACHE_KEY = "_bhv_products_v2";   // bumped: now fetches 10 imgs + descriptionHtml
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCachedProducts() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function setCachedProducts(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { }
}

/** 4. DEBOUNCE — prevents rapid repeated calls (checkout spam, etc.) */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ============================================================
//  CART STATE
// ============================================================
let cart = []; // { variantId, title, price, quantity, image }

// ============================================================
//  GRAPHQL HELPER
// ============================================================
async function shopifyFetch(query, variables = {}) {
  // Block bots before they even reach the network
  if (isLikelyBot()) {
    console.warn("[Protection] Automated client detected — request blocked.");
    throw new Error("Access denied");
  }
  // Block sessions that are hammering the API
  if (isRateLimited()) {
    console.warn("[Protection] Rate limit exceeded — request blocked.");
    throw new Error("Too many requests. Please wait a moment.");
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

// ============================================================
//  FETCH PRODUCTS FROM SHOPIFY
// ============================================================
const PRODUCTS_QUERY = `
  {
    products(first: 12) {
      edges {
        node {
          id
          title
          descriptionHtml
          images(first: 10) {
            edges { node { url altText } }
          }
          variants(first: 1) {
            edges {
              node {
                id
                price { amount currencyCode }
                availableForSale
              }
            }
          }
        }
      }
    }
  }
`;

async function loadProducts() {
  const grid = document.querySelector(".product-grid");
  if (!grid) return;

  // ── Early bot block: don't even render for bots ──
  if (isLikelyBot()) {
    grid.innerHTML = `<p class="no-products">Verificando acceso...</p>`;
    return;
  }

  // ── Try cache first to avoid unnecessary API calls ──
  const cached = getCachedProducts();
  if (cached) {
    console.log("[Cache] Serving products from cache.");
    renderProducts(grid, cached);
    return;
  }

  // Show loading skeletons only when actually fetching
  grid.innerHTML = Array(6)
    .fill(0)
    .map(
      () => `
      <div class="product-card skeleton-card">
        <div class="product-image-wrapper skeleton-img"></div>
        <div class="product-info">
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>`
    )
    .join("");

  try {
    const data = await shopifyFetch(PRODUCTS_QUERY);
    const products = data?.data?.products?.edges ?? [];

    if (products.length === 0) {
      grid.innerHTML = `<p class="no-products">No se encontraron productos. Verificá tu Storefront Token.</p>`;
      return;
    }

    // Save to cache so next visits don't hit the API
    setCachedProducts(products);
    renderProducts(grid, products);
  } catch (err) {
    console.error("Shopify fetch error:", err);
    grid.innerHTML = `<p class="no-products">Error al cargar productos. Revisá la consola para más detalles.</p>`;
  }
}

// ============================================================
//  RENDER PRODUCTS (shared by live fetch & cache)
// ============================================================
function renderProducts(grid, products) {
  grid.innerHTML = products
    .map(({ node }) => {
      const img = node.images.edges[0]?.node;
      const variant = node.variants.edges[0]?.node;
      const price = parseFloat(variant?.price?.amount ?? 0).toFixed(2);
      const currency = variant?.price?.currencyCode ?? "USD";
      const available = variant?.availableForSale ?? false;
      const variantId = variant?.id ?? "";

      // Embed all product data as JSON for the modal
      const productData = JSON.stringify({
        title: node.title,
        descriptionHtml: node.descriptionHtml ?? "",
        images: node.images.edges.map(e => ({ url: e.node.url, alt: e.node.altText })),
        price,
        currency,
        available,
        variantId,
      }).replace(/"/g, "&quot;");

      return `
        <div class="product-card" data-product="${productData}">
          <div class="product-image-wrapper">
            <img
              src="${img?.url ?? "fotos/placeholder.jpg"}"
              alt="${img?.altText ?? node.title}"
              loading="lazy"
            >
            <div class="add-to-cart-overlay">
              <button
                class="add-to-cart-btn btn"
                ${!available ? "disabled" : ""}
                style="width:100%; padding: 0.8rem; border:none;"
              >
                ${available ? "Add to Cart" : "Sold Out"}
              </button>
            </div>
          </div>
          <div class="product-info">
            <h3 class="product-title">${node.title}</h3>
            <p class="product-price">${currency} $${price}</p>
          </div>
        </div>`;
    })
    .join("");

  attachCardListeners();
}

// ============================================================
//  ATTACH CARD BUTTON EVENTS
// ============================================================
function attachCardListeners() {
  // "Add to Cart" button — stop event so the card click doesn't also fire
  document.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".product-card");
      const p = JSON.parse(card.dataset.product.replace(/&quot;/g, '"'));

      addToCart({ variantId: p.variantId, title: p.title, price: p.price, image: p.images[0]?.url ?? "" });

      btn.textContent = "✓ Added!";
      btn.style.background = "#2d6a4f";
      setTimeout(() => {
        btn.textContent = "Add to Cart";
        btn.style.background = "";
      }, 2000);
    });
  });

  // Clicking anywhere on the card opens the product modal
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => {
      const p = JSON.parse(card.dataset.product.replace(/&quot;/g, '"'));
      openProductModal(p);
    });
  });
}


// ============================================================
//  CART LOGIC
// ============================================================
function addToCart(item) {
  const existing = cart.find((c) => c.variantId === item.variantId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  updateCartUI();
  openCart();
}

function removeFromCart(variantId) {
  cart = cart.filter((c) => c.variantId !== variantId);
  updateCartUI();
}

function updateCartUI() {
  const total = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartCount = document.getElementById("cart-count");
  if (cartCount) cartCount.textContent = total;

  const cartItems = document.getElementById("cart-items");
  const cartTotal = document.getElementById("cart-total");

  if (!cartItems) return;

  if (cart.length === 0) {
    cartItems.innerHTML = `<p class="cart-empty">Tu carrito está vacío.</p>`;
    if (cartTotal) cartTotal.textContent = "$0.00";
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.title}" class="cart-item-img">
        <div class="cart-item-details">
          <p class="cart-item-title">${item.title}</p>
          <p class="cart-item-price">$${item.price} × ${item.quantity}</p>
        </div>
        <button class="cart-item-remove" data-id="${item.variantId}">✕</button>
      </div>`
    )
    .join("");

  // Remove buttons
  cartItems.querySelectorAll(".cart-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeFromCart(btn.dataset.id));
  });

  const totalAmount = cart
    .reduce((acc, item) => acc + parseFloat(item.price) * item.quantity, 0)
    .toFixed(2);
  if (cartTotal) cartTotal.textContent = `$${totalAmount}`;
}

function openCart() {
  document.getElementById("cart-sidebar")?.classList.add("open");
  document.getElementById("cart-overlay")?.classList.add("open");
}

function closeCart() {
  document.getElementById("cart-sidebar")?.classList.remove("open");
  document.getElementById("cart-overlay")?.classList.remove("open");
}

// ============================================================
//  CHECKOUT — creates Shopify checkout & redirects
// ============================================================
const CHECKOUT_MUTATION = `
  mutation checkoutCreate($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      checkout { webUrl }
      checkoutUserErrors { message field }
    }
  }
`;

async function initiateCheckout() {
  if (cart.length === 0) return;

  const checkoutBtn = document.getElementById("checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.textContent = "Procesando...";
    checkoutBtn.disabled = true;
  }

  try {
    const lineItems = cart.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));

    const data = await shopifyFetch(CHECKOUT_MUTATION, {
      input: { lineItems },
    });

    const errors = data?.data?.checkoutCreate?.checkoutUserErrors ?? [];
    if (errors.length > 0) {
      alert("Error: " + errors.map((e) => e.message).join(", "));
      return;
    }

    const webUrl = data?.data?.checkoutCreate?.checkout?.webUrl;
    if (webUrl) {
      window.location.href = webUrl;
    } else {
      throw new Error("No checkout URL returned");
    }
  } catch (err) {
    console.error("Checkout error:", err);
    alert("Error al procesar el checkout. Intentá de nuevo.");
  } finally {
    if (checkoutBtn) {
      checkoutBtn.textContent = "Checkout";
      checkoutBtn.disabled = false;
    }
  }
}

// ============================================================
//  PRODUCT DETAIL MODAL
// ============================================================

let _currentProductModal = null; // tracks open product data

function openProductModal(p) {
  _currentProductModal = p;
  const overlay = document.getElementById("product-modal-overlay");
  if (!overlay) return;

  // --- Gallery ---
  const mainImg = overlay.querySelector(".pm-main-img");
  const thumbsWrap = overlay.querySelector(".pm-thumbs");

  // Set first image and build thumbnails
  const firstImg = p.images[0] ?? { url: "", alt: p.title };
  mainImg.src = firstImg.url;
  mainImg.alt = firstImg.alt || p.title;

  thumbsWrap.innerHTML = p.images.map((img, i) => `
    <img src="${img.url}" alt="${img.alt || p.title}"
         class="pm-thumb ${i === 0 ? 'active' : ''}"
         data-idx="${i}">
  `).join("");

  // Thumbnail click switches main image
  thumbsWrap.querySelectorAll(".pm-thumb").forEach(t => {
    t.addEventListener("click", () => {
      const idx = +t.dataset.idx;
      mainImg.src = p.images[idx].url;
      mainImg.alt = p.images[idx].alt || p.title;
      thumbsWrap.querySelectorAll(".pm-thumb").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
    });
  });

  // --- Info ---
  overlay.querySelector(".pm-title").textContent = p.title;
  overlay.querySelector(".pm-price").textContent = `${p.currency} $${p.price}`;
  overlay.querySelector(".pm-description").innerHTML = p.descriptionHtml || "<p>Sin descripci\u00f3n.</p>";

  // --- Add to Cart button ---
  const cartBtn = overlay.querySelector(".pm-add-to-cart");
  cartBtn.textContent = p.available ? "Add to Cart" : "Sold Out";
  cartBtn.disabled = !p.available;
  cartBtn.onclick = () => {
    addToCart({ variantId: p.variantId, title: p.title, price: p.price, image: p.images[0]?.url ?? "" });
    cartBtn.textContent = "\u2713 Added!";
    cartBtn.style.background = "#2d6a4f";
    cartBtn.style.borderColor = "#2d6a4f";
    setTimeout(() => {
      cartBtn.textContent = "Add to Cart";
      cartBtn.style.background = "";
      cartBtn.style.borderColor = "";
    }, 2000);
  };

  // --- Open with animation ---
  overlay.style.display = "flex";
  requestAnimationFrame(() => overlay.classList.add("open"));
  document.body.style.overflow = "hidden";
}

function closeProductModal() {
  const overlay = document.getElementById("product-modal-overlay");
  if (!overlay) return;
  overlay.classList.remove("open");
  overlay.addEventListener("transitionend", () => {
    overlay.style.display = "none";
    document.body.style.overflow = "";
  }, { once: true });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("BEHAVIOR Store — Shopify Storefront API connected");

  // Load products from Shopify
  loadProducts();

  // Cart toggle (header icon)
  document.getElementById("cart-icon")?.addEventListener("click", openCart);
  document.getElementById("cart-overlay")?.addEventListener("click", closeCart);
  document.getElementById("cart-close-btn")?.addEventListener("click", closeCart);

  // Checkout button — debounced to prevent spam clicks
  const debouncedCheckout = debounce(initiateCheckout, 600);
  document.getElementById("checkout-btn")?.addEventListener("click", debouncedCheckout);

  // ============================================================
  //  ABOUT US MODAL
  // ============================================================
  const aboutOverlay = document.getElementById("about-modal-overlay");
  const aboutOpenBtn = document.getElementById("about-open-btn");
  const aboutCloseBtn = document.getElementById("about-close-btn");

  function openAbout() {
    aboutOverlay.style.display = "flex";
    requestAnimationFrame(() => aboutOverlay.classList.add("open"));
    document.body.style.overflow = "hidden";
  }

  function closeAbout() {
    aboutOverlay.classList.remove("open");
    aboutOverlay.addEventListener("transitionend", () => {
      aboutOverlay.style.display = "none";
      document.body.style.overflow = "";
    }, { once: true });
  }

  aboutOpenBtn?.addEventListener("click", openAbout);
  aboutCloseBtn?.addEventListener("click", closeAbout);
  aboutOverlay?.addEventListener("click", (e) => { if (e.target === aboutOverlay) closeAbout(); });

  // ============================================================
  //  PRODUCT MODAL — close controls
  // ============================================================
  const productOverlay = document.getElementById("product-modal-overlay");
  document.getElementById("product-modal-close")?.addEventListener("click", closeProductModal);
  productOverlay?.addEventListener("click", (e) => { if (e.target === productOverlay) closeProductModal(); });

  // Escape closes whichever modal is open
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (aboutOverlay?.classList.contains("open")) closeAbout();
    if (productOverlay?.classList.contains("open")) closeProductModal();
  });
});
