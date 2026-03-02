document.addEventListener('DOMContentLoaded', () => {
    console.log('Shopify-style Store Loaded');

    // Add interactivity to product cards
    const productCards = document.querySelectorAll('.product-card');
    
    productCards.forEach(card => {
        card.addEventListener('click', () => {
            const title = card.querySelector('.product-title').innerText;
            alert(`Opening details for ${title} (Demo)`);
        });
    });

    const buttons = document.querySelectorAll('.add-to-cart-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            btn.innerText = 'Added!';
            setTimeout(() => {
                btn.innerText = 'Add to Cart';
            }, 2000);
        });
    });
});
