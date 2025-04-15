document.addEventListener('DOMContentLoaded', () => {
    const checkInBtn = document.getElementById('check-in-btn');
    const loginRedirect = document.getElementById('login-redirect');
    const checkInPopup = document.getElementById('check-in-popup');
    const checkInForm = document.getElementById('check-in-form');
    const closeCheckInBtn = document.getElementById('close-check-in');
    const messageDiv = document.getElementById('check-in-message');

    // Open Check-In Popup
    checkInBtn.addEventListener('click', () => {
        checkInPopup.style.display = 'flex';
        messageDiv.textContent = ''; // Clear previous messages
    });

    // Close Check-In Popup
    closeCheckInBtn.addEventListener('click', () => {
        checkInPopup.style.display = 'none';
    });

    // Handle Check-In Form Submission
    checkInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cpf = document.getElementById('cpf').value.trim();

        try {
            const response = await fetch('/check-in-turismo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ cpf }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                messageDiv.textContent = data.message;
                messageDiv.className = 'message success';
                setTimeout(() => {
                    checkInPopup.style.display = 'none';
                    checkInForm.reset();
                }, 2000); // Close after 2 seconds
            } else {
                messageDiv.textContent = data.message || 'Erro ao fazer check-in';
                messageDiv.className = 'message error';
            }
        } catch (error) {
            console.error('Error during check-in:', error);
            messageDiv.textContent = 'Erro ao conectar ao servidor';
            messageDiv.className = 'message error';
        }
    });

    // Redirect to Login Page
    loginRedirect.addEventListener('click', () => {
        window.location.href = '/login-turismo';
    });
});