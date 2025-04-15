document.addEventListener('DOMContentLoaded', async () => {
    const productList = document.getElementById('product-list');
    const totalPointsElement = document.getElementById('total-points');
    const rescueButton = document.querySelector('.btn-rescue');
    const printArea = document.getElementById('print-area');
    const printButton = document.getElementById('printBtn');
    const closeButton = document.getElementById('closeBtn');
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmRescueBtn = document.getElementById('confirm-rescue-btn');
    const cancelRescueBtn = document.getElementById('cancel-rescue-btn');
    const errorMessage = document.createElement('div');
    errorMessage.style.color = 'red';
    errorMessage.style.textAlign = 'center';
    errorMessage.style.fontWeight = 'bold';
    document.querySelector('.container').appendChild(errorMessage);

    let userPoints = 0;
    let totalPoints = 0;
    let selectedProducts = [];
    let products = [];

    function showNotification(message, type = 'success') {
        const notification = document.getElementById('notification-popup');
        const messageSpan = document.getElementById('notification-message');
        const closeBtn = document.getElementById('close-notification');
    
        messageSpan.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
    
        const timeout = setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    
        closeBtn.onclick = () => {
            notification.style.display = 'none';
            clearTimeout(timeout);
        };
    }

    function updateTotalPointsDisplay() {
        totalPointsElement.textContent = `${totalPoints}`;
    }

    function showPrintModal() {
        printArea.style.display = 'flex';
    }

    function closePrintModal() {
        printArea.style.display = 'none';
    }

    function showConfirmationModal() {
        const confirmationProductsList = document.getElementById('confirmation-products');
        confirmationProductsList.innerHTML = '';
        
        selectedProducts.forEach(productId => {
            const product = products.find(p => p.id === productId);
            if (product) {
                const listItem = document.createElement('li');
                listItem.textContent = `${product.name} - ${product.points} pontos`;
                confirmationProductsList.appendChild(listItem);
            }
        });

        document.getElementById('confirmation-total-points').textContent = totalPoints;
        confirmationModal.style.display = 'flex';
    }

    function closeConfirmationModal() {
        confirmationModal.style.display = 'none';
    }

    async function fetchUserPoints() {
        const cpf = localStorage.getItem('userCpf');
        if (!cpf) {
            console.error('User CPF is not available. Redirecting to login...');
            window.location.href = 'login-turismo.html';
            return;
        }

        try {
            const response = await fetch(`/api/user-turismo-points?cpf=${cpf}`);
            if (!response.ok) throw new Error('Failed to fetch user points');
            
            const data = await response.json();
            userPoints = data.points;
            document.getElementById('display-user-points').textContent = `${userPoints}`;
        } catch (error) {
            console.error('Error fetching user points:', error);
            errorMessage.textContent = 'Erro ao carregar os pontos do usuário. Tente novamente mais tarde.';
        }
    }

    function addProductToList(product) {
        const listItem = document.createElement('li');
        listItem.className = 'product-item';
    
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'product-checkbox';
        checkbox.disabled = product.quantity === 0; // Disable if out of stock
    
        const checkIcon = document.createElement('div');
        checkIcon.className = 'check-icon';
        checkIcon.textContent = '✔';
    
        const productInfo = document.createElement('div');
        productInfo.className = 'product-info';
    
        const productName = document.createElement('span');
        productName.className = 'product-name';
        productName.textContent = `${product.name} (Quantidade: ${product.quantity})`; // Show quantity
    
        const productPoints = document.createElement('span');
        productPoints.className = 'product-points';
        productPoints.textContent = `${product.points} pontos`;
    
        const productImage = document.createElement('img');
        productImage.src = product.image;
        productImage.alt = product.name;
        productImage.className = 'product-image';
    
        productInfo.appendChild(productName);
        productInfo.appendChild(productPoints);
        productInfo.appendChild(productImage);
    
        listItem.appendChild(checkbox);
        listItem.appendChild(checkIcon);
        listItem.appendChild(productInfo);
    
        if (product.quantity === 0) {
            listItem.classList.add('out-of-stock'); // Optional: style out-of-stock items
        }

        listItem.addEventListener('click', () => {
            if (product.quantity > 0) { // Only allow selection if in stock
                checkbox.checked = !checkbox.checked;
                listItem.classList.toggle('selected', checkbox.checked);
    
                if (checkbox.checked) {
                    selectedProducts.push(product.id);
                    totalPoints += product.points;
                } else {
                    selectedProducts = selectedProducts.filter(id => id !== product.id);
                    totalPoints -= product.points;
                }
    
                updateTotalPointsDisplay();
                updateRescueButtonState();
            }
        });
    
        productList.appendChild(listItem);
    }

    async function fetchProducts() {
        try {
            const response = await fetch('/api/products');
            if (!response.ok) throw new Error('Failed to fetch products');
            products = await response.json();
            productList.innerHTML = ''; // Clear existing list
            products.forEach(product => addProductToList(product));
        } catch (error) {
            console.error('Error fetching products:', error);
            errorMessage.textContent = 'Erro ao carregar os produtos. Tente novamente mais tarde.';
        }
    }

    function updateRescueButtonState() {
        if (totalPoints > userPoints) {
            errorMessage.textContent = 'Você não tem pontos suficientes para este resgate.';
            rescueButton.disabled = true;
        } else {
            errorMessage.textContent = '';
            rescueButton.disabled = selectedProducts.length === 0;
        }
    }

    rescueButton.addEventListener('click', () => {
        if (selectedProducts.length > 0 && totalPoints <= userPoints) {
            showConfirmationModal();
        }
    });

    confirmRescueBtn.addEventListener('click', async () => {
        const cpf = localStorage.getItem('userCpf');
        if (!cpf) {
            console.error('User CPF is not available. Redirecting to login...');
            window.location.href = 'login-turismo.html';
            return;
        }

        try {
            const response = await fetch('/api/rescue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ cpf, products: selectedProducts }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to complete rescue');
            }

            showNotification('Resgate realizado com sucesso!', 'success');

            const rescuedProductsList = document.getElementById('rescued-products');
            rescuedProductsList.innerHTML = '';

            selectedProducts.forEach(productId => {
                const product = products.find(p => p.id === productId);
                if (product) {
                    const listItem = document.createElement('li');
                    listItem.textContent = `${product.name} - ${product.points} pontos`;
                    rescuedProductsList.appendChild(listItem);
                }
            });

            closeConfirmationModal();
            showPrintModal();

            selectedProducts = [];
            totalPoints = 0; // Reset total points
            updateTotalPointsDisplay();
            await fetchUserPoints(); // Refresh user points
            await fetchProducts(); // Refresh product list with updated quantities
            updateRescueButtonState();
        } catch (error) {
            console.error('Error processing rescue:', error);
            showNotification(error.message || 'Erro ao realizar o resgate. Tente novamente mais tarde.', 'error');
            closeConfirmationModal();
        }
    });

    cancelRescueBtn.addEventListener('click', closeConfirmationModal);

    printButton.addEventListener('click', async () => {
        const printContents = document.getElementById('print-area').innerHTML;
        const originalContents = document.body.innerHTML;

        document.body.innerHTML = printContents;
        window.print();
        document.body.innerHTML = originalContents;

        window.location.reload();
    });

    closeButton.addEventListener('click', closePrintModal);

    await fetchUserPoints();
    await fetchProducts();
    updateTotalPointsDisplay();
    updateRescueButtonState();
});

document.getElementById('log-out').addEventListener('click', async () => {
    try {
        const response = await fetch('/logout-turismo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const result = await response.json();
            window.location.href = '/login-turismo.html';
        } else {
            const error = await response.json();
            showNotification(error.error, 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Ocorreu um erro ao fazer logout. Tente novamente.', 'error');
    }
});
