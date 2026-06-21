document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const listItems = document.querySelectorAll('.list-item');

    function filterList() {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedCategory = categoryFilter.value;

        listItems.forEach(item => {
            const title = item.getAttribute('data-title') || '';
            const desc = item.getAttribute('data-desc') || '';
            const category = item.getAttribute('data-category') || '';

            const matchesSearch = title.includes(searchTerm) || desc.includes(searchTerm);
            const matchesCategory = (selectedCategory === 'all') || (category === selectedCategory);

            // Show item if it matches both the text search AND the category filter
            if (matchesSearch && matchesCategory) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Trigger the filter function whenever the user types or changes the dropdown
    if (searchInput && categoryFilter) {
        searchInput.addEventListener('input', filterList);
        categoryFilter.addEventListener('change', filterList);
    }
});
