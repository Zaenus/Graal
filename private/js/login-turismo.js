document.addEventListener('DOMContentLoaded', () => {
    const logBtn = document.getElementById('btn-login');
    const usernameInput = document.getElementById('username');

    // Add event listener to the login button
    logBtn.addEventListener('click', login);

    // Add event listener to format CPF input
    usernameInput.addEventListener('input', formatCPF);

    // Back to Check-In
    const backToCheckin = document.getElementById('back-to-checkin');
    backToCheckin.addEventListener('click', () => {
        window.location.href = '/check-in';
    });
});

async function login() {
    const usernameInput = document.getElementById('username');
    const password = document.getElementById('password').value.trim();
    const errorMessage = document.getElementById('error-message');

    // Remove formatting from CPF before sending
    const username = usernameInput.value.replace(/\D/g, ''); // Removes all non-numeric characters

    try {
        const response = await fetch('/login-turismo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ cpf: username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            // Save user CPF to localStorage
            localStorage.setItem('userCpf', username);

            // Redirect to the resgate page
            window.location.href = '/resgate';
        } else {
            errorMessage.style.display = 'block';
            errorMessage.textContent = data.error;
        }
    } catch (error) {
        errorMessage.style.display = 'block';
        errorMessage.textContent = 'Erro ao conectar com o servidor!';
    }
}

// Function to format CPF
function formatCPF(event) {
    let input = event.target;
    let value = input.value.replace(/\D/g, ''); // Remove all non-numeric characters

    if (value.length <= 3) {
        input.value = value;
    } else if (value.length <= 6) {
        input.value = value.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    } else if (value.length <= 9) {
        input.value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    } else if (value.length <= 11) {
        input.value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    } else {
        input.value = value.slice(0, 14); // Limit to 11 digits + formatting
    }
}

