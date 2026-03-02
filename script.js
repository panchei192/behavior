
// ============================================================
//  SHOPIFY STOREFRONT API CONFIG
//  👉 Reemplazá estos 2 valores con los tuyos de Shopify
// ============================================================
const SHOPIFY_DOMAIN = "behavior-8904.myshopify.com";
const STOREFRONT_TOKEN = "6531e4695468c2ee8668a947cf2b51dc";
const API_VERSION = "2024-01";
const API_URL = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;

// ============================================================
//  CART STATE
// ============================================================
let cart = []; // { variantId, title, price, quantity, image }

// ============================================================
//  GRAPHQL HELPER
// ============================================================
async function shopifyFetch(query, variables = {}) {
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
          description
          images(first: 1) {
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

    // Show loading skeletons
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

        grid.innerHTML = products
            .map(({ node }) => {
                const img = node.images.edges[0]?.node;
                const variant = node.variants.edges[0]?.node;
                const price = parseFloat(variant?.price?.amount ?? 0).toFixed(2);
                const currency = variant?.price?.currencyCode ?? "USD";
                const available = variant?.availableForSale ?? false;
                const variantId = variant?.id ?? "";

                return `
        <div class="product-card" data-variant-id="${variantId}" data-title="${node.title}" data-price="${price}" data-image="${img?.url ?? ""}">
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
    } catch (err) {
        console.error("Shopify fetch error:", err);
        grid.innerHTML = `<p class="no-products">Error al cargar productos. Revisá la consola para más detalles.</p>`;
    }
}

// ============================================================
//  ATTACH CARD BUTTON EVENTS
// ============================================================
function attachCardListeners() {
    document.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const card = btn.closest(".product-card");
            const variantId = card.dataset.variantId;
            const title = card.dataset.title;
            const price = card.dataset.price;
            const image = card.dataset.image;

            addToCart({ variantId, title, price, image });

            btn.textContent = "✓ Added!";
            btn.style.background = "#2d6a4f";
            setTimeout(() => {
                btn.textContent = "Add to Cart";
                btn.style.background = "";
            }, 2000);
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

    // Checkout button
    document.getElementById("checkout-btn")?.addEventListener("click", initiateCheckout);
});
