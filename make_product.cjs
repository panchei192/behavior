const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf-8');

html = html.replace('href="#products"', 'href="index.html#products"').replace('href="#products"', 'href="index.html#products"');
html = html.replace('href="#" class="logo"', 'href="index.html" class="logo"');
html = html.replace('<title>BEHAVIOR - statement knitwear</title>', '<title>BEHAVIOR - Product Detail</title>');

const heroStart = html.indexOf('<!-- Hero Section -->');
const mainEnd = html.indexOf('</main>') + '</main>'.length;
if (heroStart !== -1 && mainEnd !== -1) {
    const replacement = `
    <style>
      .product-page-layout { display: flex; gap: 4rem; margin-bottom: 2rem; align-items: flex-start; }
      .product-page-layout .pm-gallery { flex: 1; padding: 0; background: transparent; display: flex; flex-direction: column; gap: 1rem; position: sticky; top: 100px; }
      .product-page-layout .pm-main-img-wrap { background: var(--secondary-background); border-radius: 4px; aspect-ratio: 3/4; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .product-page-layout .pm-main-img { width: 100%; height: 100%; object-fit: cover; }
      .product-page-layout .pm-thumbs { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; }
      .product-page-layout .pm-thumb { width: 60px; height: 80px; object-fit: cover; cursor: pointer; opacity: 0.6; transition: opacity 0.2s, border 0.2s; border: 1px solid transparent; }
      .product-page-layout .pm-thumb:hover, .product-page-layout .pm-thumb.active { opacity: 1; border-color: var(--primary-color); }
      .product-page-layout .pm-info { flex: 1; padding: 0; display: flex; flex-direction: column; }
      .product-page-layout .pm-title { font-family: var(--font-heading); margin-bottom: 0.8rem; font-size: 2.5rem; font-weight: 500;}
      .product-page-layout .pm-price { font-size: 1.3rem; margin-bottom: 2rem; color: var(--text-light); }
      .product-page-layout .pm-options { margin-bottom: 2rem; }
      .product-page-layout .pm-description { font-size: 0.95rem; color: var(--text-light); line-height: 1.8; margin-bottom: 2.5rem; }
      .product-page-layout .pm-add-to-cart { width: 100%; padding: 1.2rem; font-size: 0.95rem; }
      
      @media (max-width: 768px) {
         .product-page-layout { flex-direction: column; gap: 2rem; }
         .product-page-layout .pm-gallery { position: static; }
      }
    </style>
    <!-- Single Product Content -->
    <main id="single-product-container" class="container" style="padding: 4rem 0; min-height: 50vh;">
        <p class="no-products">Cargando producto...</p>
    </main>
    `;
    html = html.substring(0, heroStart) + replacement + html.substring(mainEnd);
}

html = html.replace(/<!-- Product Detail Modal -->[\s\S]*?<script src="script\.js"><\/script>/, '<script src="script.js"></script>');

fs.writeFileSync('product.html', html, 'utf-8');
console.log('product.html created success!');
