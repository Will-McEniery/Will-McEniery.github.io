// Search box, category dropdown and clickable tags for the Projects / Research lists.
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const emptyState = document.getElementById('no-results');
    const listItems = document.querySelectorAll('.list-item');
    if (!searchInput || !categoryFilter) return;

    function filterList() {
        const terms = searchInput.value.toLowerCase().split(/\s+/).filter(Boolean);
        const selectedCategory = categoryFilter.value;
        let shown = 0;

        listItems.forEach(item => {
            const text = item.dataset.search || '';
            const categories = (item.dataset.categories || '').split('|');
            const matchesSearch = terms.every(term => text.includes(term));
            const matchesCategory = selectedCategory === 'all' || categories.includes(selectedCategory);
            item.hidden = !(matchesSearch && matchesCategory);
            if (!item.hidden) shown++;
        });

        if (emptyState) emptyState.hidden = shown > 0;
    }

    searchInput.addEventListener('input', filterList);
    categoryFilter.addEventListener('change', filterList);

    // Clicking a tag filters by it; clicking the active tag clears the filter.
    document.querySelectorAll('.item-list .tag[data-category]').forEach(tag => {
        tag.addEventListener('click', () => {
            const category = tag.dataset.category;
            categoryFilter.value = categoryFilter.value === category ? 'all' : category;
            filterList();
        });
    });
});
