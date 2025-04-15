document.getElementById('product-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(event.target);

    try {
        const response = await axios.post('/register-product', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        document.getElementById('response-message').textContent = response.data.message;
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    } catch (error) {
        console.error(error);
        document.getElementById('response-message').textContent = 'Failed to register product.';
    }
});

document.getElementById('manage-products-button').addEventListener('click', () => {
    const popup = document.getElementById('product-management-popup');
    popup.style.display = 'block';
    fetchProducts();
});

document.getElementById('close-popup-button').addEventListener('click', () => {
    const popup = document.getElementById('product-management-popup');
    popup.style.display = 'none';
});

document.getElementById('close-edit-popup').addEventListener('click', () => {
    document.getElementById('edit-product-popup').style.display = 'none';
});

function fetchProducts() {
    fetch('/api/products')
        .then((response) => response.json())
        .then((products) => {
            const tableBody = document.querySelector('#product-table tbody');
            tableBody.innerHTML = '';

            products.forEach((product) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${product.name}</td>
                    <td>${product.points}</td>
                    <td>${product.quantity}</td>
                    <td>
                        <button class="edit-button" data-id="${product.id}">Edit</button>
                        <button class="delete-button" data-id="${product.id}">Delete</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });

            attachActionListeners();
        })
        .catch((error) => console.error('Error fetching products:', error));
}

function attachActionListeners() {
    document.querySelectorAll('.edit-button').forEach((button) => {
        button.addEventListener('click', (event) => {
            const id = event.target.dataset.id;
            editProduct(id);
        });
    });

    document.querySelectorAll('.delete-button').forEach((button) => {
        button.addEventListener('click', (event) => {
            const id = event.target.dataset.id;
            deleteProduct(id);
        });
    });
}

function editProduct(id) {
    // Fetch current product data
    fetch(`/api/products`)
        .then((response) => response.json())
        .then((products) => {
            const product = products.find((p) => p.id === parseInt(id));
            if (!product) throw new Error('Product not found');

            // Populate the edit modal
            const editPopup = document.getElementById('edit-product-popup');
            document.getElementById('edit-name').value = product.name;
            document.getElementById('edit-cost').value = product.points;
            document.getElementById('edit-quantity').value = product.quantity;
            editPopup.style.display = 'block';

            // Handle form submission
            const editForm = document.getElementById('edit-product-form');
            editForm.onsubmit = async (event) => {
                event.preventDefault();
                const formData = new FormData(editForm);
                const updatedProduct = {
                    name: formData.get('name'),
                    cost: formData.get('cost'),
                    quantity: parseInt(formData.get('quantity')),
                };

                try {
                    const response = await fetch(`/api/products/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedProduct),
                    });
                    if (!response.ok) throw new Error('Failed to update product');
                    editPopup.style.display = 'none';
                    fetchProducts(); // Refresh the table
                } catch (error) {
                    console.error('Error editing product:', error);
                    document.getElementById('response-message').textContent = 'Failed to update product.';
                }
            };
        })
        .catch((error) => console.error('Error fetching product for edit:', error));
}

function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        fetch(`/api/products/${id}`, {
            method: 'DELETE',
        })
            .then(fetchProducts)
            .catch((error) => console.error('Error deleting product:', error));
    }
}
