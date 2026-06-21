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
            
            // Get the comma-separated string and split it into an array
            const categoriesAttr = item.getAttribute('data-categories') || '';
            const itemCategories = categoriesAttr.split(',');

            const matchesSearch = title.includes(searchTerm) || desc.includes(searchTerm);
            
            // Check if the array includes the selected category, or if 'all' is selected
            const matchesCategory = (selectedCategory === 'all') || itemCategories.includes(selectedCategory);

            if (matchesSearch && matchesCategory) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    if (searchInput && categoryFilter) {
        searchInput.addEventListener('input', filterList);
        categoryFilter.addEventListener('change', filterList);
    }
});
