const eyeIcon = document.querySelector(".form-item i");
const passwordInput = document.getElementById('password');

document.addEventListener('DOMContentLoaded', () => {
  const cpfInput = document.getElementById('cpf');
  const rememberCheckbox = document.getElementById('rememberMeCheckbox');

  const savedCPF = localStorage.getItem('rememberedCPF');
  if (savedCPF) {
    cpfInput.value = savedCPF;
    rememberCheckbox.checked = true;
    formatCPF({ target: cpfInput });
  }

  cpfInput.addEventListener('input', formatCPF);
});

document.getElementById('login-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const cpfInput = document.getElementById('cpf');
  const password = document.getElementById('password').value;
  const rememberCheckbox = document.getElementById('rememberMeCheckbox');

  const cpf = cpfInput.value.replace(/\D/g, '');

  if (rememberCheckbox.checked) {
    localStorage.setItem('rememberedCPF', cpfInput.value);
  } else {
    localStorage.removeItem('rememberedCPF');
  }

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, password })
    });

    const result = await response.json();
    if (response.ok) {
      window.location.href = result.redirect || '/home'; // Use server-provided redirect
    } else {
      alert(result.message || 'Invalid CPF or password');
    }
  } catch (error) {
    console.error('Error during login:', error);
    alert('Login failed. Check connection.');
  }
});

function formatCPF(event) {
  let input = event.target;
  let value = input.value.replace(/\D/g, '');
  if (value.length <= 3) {
    input.value = value;
  } else if (value.length <= 6) {
    input.value = value.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  } else if (value.length <= 9) {
    input.value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  } else if (value.length <= 11) {
    input.value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  } else {
    input.value = value.slice(0, 14);
  }
}

eyeIcon.addEventListener("click", () => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  eyeIcon.className = `fa-solid fa-eye${passwordInput.type === "password" ? "" : "-slash"}`;
});