document.addEventListener('DOMContentLoaded', function() {
    const root = document.querySelector('[data-tools-index]');

    if (!root) {
        return;
    }

    const buttons = Array.from(root.querySelectorAll('[data-tool-category]'));
    const items = Array.from(root.querySelectorAll('[data-tool-item]'));
    const search = root.querySelector('[data-tools-search]');
    const empty = root.querySelector('[data-tools-empty]');
    let activeCategory = 'all';
    let query = '';

    function applyFilters() {
        let visible = 0;

        items.forEach(function(item) {
            const categoryMatch = activeCategory === 'all' || item.dataset.toolCategory === activeCategory;
            const searchMatch = !query || item.dataset.toolSearch.includes(query);
            const show = categoryMatch && searchMatch;
            item.hidden = !show;
            if (show) visible += 1;
        });

        if (empty) {
            empty.hidden = visible > 0;
        }
    }

    buttons.forEach(function(button) {
        button.addEventListener('click', function() {
            activeCategory = button.dataset.toolCategory;
            buttons.forEach(function(candidate) {
                const active = candidate === button;
                candidate.classList.toggle('is-active', active);
                candidate.setAttribute('aria-pressed', String(active));
            });
            applyFilters();
        });
    });

    if (search) {
        search.addEventListener('input', function() {
            query = search.value.trim().toLowerCase();
            applyFilters();
        });
    }
});
