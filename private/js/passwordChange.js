const createPw = document.querySelector("#create_pw"),
    confirmPw = document.querySelector("#confirm_pw"),
    pwShow = document.querySelector(".show"),
    alertIcon = document.querySelector(".error"),
    alertText = document.querySelector(".alert .text"), // Updated selector
    submitBtn = document.querySelector("#button");

let userCpf;

// Toggle show/hide password
pwShow.addEventListener("click", () => {
    if ((createPw.type === "password") && (confirmPw.type === "password")) {
        createPw.type = "text";
        confirmPw.type = "text";
        pwShow.classList.replace("fa-eye-slash", "fa-eye");
    } else {
        createPw.type = "password";
        confirmPw.type = "password";
        pwShow.classList.replace("fa-eye", "fa-eye-slash");
    }
});

// Validate password length and enable confirm field
createPw.addEventListener("input", () => {
    let val = createPw.value.trim();
    if (val.length >= 8) {
        confirmPw.removeAttribute("disabled");
        submitBtn.removeAttribute("disabled");
        submitBtn.classList.add("active");
        alertText.style.color = "#a6a6a6";
        alertText.innerText = "Senhas devem coincidir";
        alertIcon.style.display = "none";  // Hide the alert icon
        console.log("Password length is valid");
    } else {
        confirmPw.setAttribute("disabled", true);
        submitBtn.setAttribute("disabled", true);
        submitBtn.classList.remove("active");
        confirmPw.value = "";
        alertText.style.color = "#a6a6a6";
        alertText.innerText = "Entre com pelo menos 8 caracteres";
        alertIcon.style.display = "none"; // Hide the alert icon
        console.log("Password length is too short");
    }
});

// Check if passwords match on input in confirm password field
confirmPw.addEventListener("input", () => {
    if (createPw.value === confirmPw.value) {
        alertText.innerText = "Senhas coincidem";
        alertIcon.style.display = "none";
        alertText.style.color = "#4070F4"; // Blue for success
        console.log("Passwords match");
    } else {
        alertText.innerText = "Senhas não coincidem";
        alertIcon.style.display = "block";
        alertText.style.color = "#D93025"; // Red for mismatch
        console.log("Passwords do not match");
    }
});

document.addEventListener('DOMContentLoaded', function() {
    fetch('/user-data')
        .then(response => {
            // Check if the response is ok (status 200-299)
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('Access Denied: You do not have permission to access this resource.');
                } else {
                    throw new Error('Failed to fetch user data');
                }
            }
            return response.json(); // Parse JSON if response is ok
        })
        .then(data => {
            document.querySelector('.user-name').textContent = data.name;
            userCpf = data.cpf;  // Store CPF globally for use later
        })
        .catch(error => {
            // Handle the error and display a message to the user
            console.error('Error fetching user data:', error.message);
            alert(error.message); // Optionally show an alert or a message on the page
        });
});  

submitBtn.addEventListener("click", async () => {
    const createPassword = createPw.value;

    if(createPw.value === confirmPw.value){
        try {
            const response = await axios.post('/change-password', {
                cpf: userCpf,  // Make sure CPF is correctly included
                password: createPassword
            });
    
            if (response.data.success) {
                section.classList.add("active");
            } else {
                console.error("Erro ao alterar a senha:", response.data.message);
                alert(response.data.message);
            }
        } catch (error) {
            console.error("Erro:", error);
        }
    }else {
        alertText.innerText = "Senhas não coincidem";
        alertIcon.style.display = "block";
        alertText.style.color = "#D93025"; // Red for mismatch
        console.log("Passwords do not match");
    }
    
});

const section = document.querySelector("section"),
overlay = document.querySelector(".overlay"),
closeBtn = document.querySelector(".close-btn");

overlay.addEventListener("click", () =>
section.classList.remove("active")
);
closeBtn.addEventListener("click", () => {
    section.classList.remove("active");
    location.reload(); // This will reload the page
});