let currentTaskId; // To store the ID of the task being edited
let userName = ''; // Store the user's name globally
let userCPF = '';  // Store the user's CPF globally

// Global variable for socket connection (if not already defined in your chat code)
const socket = io();

// Function to show a popup notification
function showNotification(message, type = 'success', duration = 5000) {
    const container = document.getElementById('notification-container');
    
    // Create notification element
    const notification = document.createElement('div');
    notification.classList.add('notification', type);
    
    // Add message
    const messageSpan = document.createElement('span');
    messageSpan.classList.add('message');
    messageSpan.textContent = message;
    notification.appendChild(messageSpan);
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('close-btn');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => closeNotification(notification));
    notification.appendChild(closeBtn);
    
    // Append to container
    container.appendChild(notification);
    
    // Auto-close after duration
    if (duration > 0) {
        setTimeout(() => closeNotification(notification), duration);
    }
}

// Function to close a notification
function closeNotification(notification) {
    notification.style.animation = 'slideOut 0.3s ease-in-out';
    notification.addEventListener('animationend', () => {
        notification.remove();
    });
}

document.addEventListener('DOMContentLoaded', function() {
    fetch('/user-data')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch user data');
            }
            return response.json();
        })
        .then(data => {
            userName = data.name; // Store name globally
            userCPF = data.cpf;  // Store CPF globally

            // Call other initial functions after user data is set, if needed
        })
        .catch(error => {
            console.error('Error fetching user data:', error.message);
            showNotification(error.message, 'error');
        });
});

document.getElementById('addTaskBtn').addEventListener('click', function (e) {
    e.preventDefault(); // Prevent any default behavior

    // Collect form data
    const date = document.getElementById('date').value;
    const setor = document.getElementById('setor').value;
    const obs = document.getElementById('obs').value;
    const files = document.getElementById('attachments').files; // Get the files

    if (!date || !setor || !obs) {
        showNotification('Por favor, preencha todos os campos obrigatórios.', 'error');
        return;
    }

    // Get the current time
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    const dateTime = `${date} às ${currentTime}`;

    // Create FormData object to send text and files
    const formData = new FormData();
    formData.append('date', dateTime);
    formData.append('setor', setor);
    formData.append('obs', obs);
    formData.append('name', userName);
    for (let i = 0; i < files.length; i++) {
        formData.append('attachments', files[i]); // Add each file
    }

    // Send a POST request to the /create-task route
    fetch('/create-task', {
        method: 'POST',
        body: formData, // No headers, FormData sets Content-Type automatically
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro na resposta do servidor');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showNotification(data.message, 'success');
                // Reset the form
                document.getElementById('date').value = '';
                document.getElementById('setor').value = '';
                document.getElementById('obs').value = '';
                document.getElementById('attachments').value = ''; // Clear file input

                // Emit a chat message
                socket.emit('send_message', `Chamado aberto para o setor "${setor}" por ${userName}`, userName);

                // Close the popup and reload tasks
                document.getElementById('popup').style.display = 'none';
                fetchTasks('aberto');
            } else {
                showNotification('Erro: ' + data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error creating task:', error);
            showNotification('Erro ao criar chamado: ' + error.message, 'error');
        });
});

// Close popup when close button is clicked
document.getElementById('close-popup').addEventListener('click', function () {
    document.getElementById('popup').style.display = 'none';
});

// Open the popup for adding a new task
document.getElementById('open-btn').addEventListener('click', function () {
    document.getElementById('popup').style.display = 'block';
});

// Fetch tasks based on situation
function fetchTasks(situation) {
    fetch(`/tasks?situation=${situation}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro ao buscar tarefas');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                populateTable(data.data);
            } else {
                throw new Error(data.message);
            }
        })
        .catch(error => {
            console.error('Error fetching tasks:', error);
            showNotification('Erro ao carregar tarefas: ' + error.message, 'error');
        });
}

function populateTable(tasks) {
    const tableBody = document.getElementById('report-table').getElementsByTagName('tbody')[0];
    tableBody.innerHTML = ''; // Clear existing rows

    if (!Array.isArray(tasks) || tasks.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6">Nenhum chamado encontrado.</td></tr>';
        return;
    }

    tasks.forEach(task => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = task.date || '';
        row.insertCell(1).textContent = task.sector || '';
        row.insertCell(2).textContent = task.name || '';
        row.insertCell(3).textContent = task.situation || '';

        // Add attachment count with link
        const attachments = task.attachments ? JSON.parse(task.attachments) : [];
        const attachmentCell = row.insertCell(4);
        if (attachments.length > 0) {
            const link = document.createElement('a');
            link.href = `/${attachments[0]}`; // Open the first attachment
            link.textContent = `${attachments.length} anexo(s)`;
            link.target = '_blank'; // Open in new tab
            link.style.color = '#4070f4'; // Match your theme
            link.style.textDecoration = 'underline';
            attachmentCell.appendChild(link);
        } else {
            attachmentCell.textContent = 'Nenhum';
        }

        // View button for editing task
        const viewButton = document.createElement('button');
        viewButton.classList.add('view-btn');
        viewButton.setAttribute('data-id', task.id);
        const icon = document.createElement('i');
        icon.classList.add('uil', 'uil-search-alt', 'icon');
        viewButton.appendChild(icon);
        viewButton.addEventListener('click', () => openEditPopup(task.id));
        row.insertCell(5).appendChild(viewButton);
    });
}

// Event listener for filter button
document.getElementById('filter-btn').addEventListener('click', () => {
    const situationSelect = document.getElementById('database');
    const selectedSituation = situationSelect.value === 'abertos' ? 'aberto' :
        situationSelect.value === 'pendentes' ? 'pendente' :
            'finalizado'; // Adjust according to your database values
    fetchTasks(selectedSituation);
});

// Initial fetch for 'aberto' tasks
fetchTasks('aberto');

function openEditPopup(taskId) {
    const popupEdit = document.getElementById('popupEdit');
    const obsEdit = document.getElementById('obsEdit');
    const situationEdit = document.getElementById('situationEdit');
    const answerEdit = document.getElementById('answerEdit');
    currentTaskId = taskId;

    let attachmentsContainer = document.getElementById('attachmentsContainer');
    if (!attachmentsContainer) {
        attachmentsContainer = document.createElement('div');
        attachmentsContainer.id = 'attachmentsContainer';
        attachmentsContainer.style.marginTop = '20px';
        popupEdit.querySelector('.popup-content').appendChild(attachmentsContainer);
    }

    fetch(`/task/${taskId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(task => {
            if (task.success) {
                obsEdit.value = task.data.obs;
                situationEdit.value = task.data.situation;
                answerEdit.value = task.data.answer || '';

                const attachments = task.data.attachments ? JSON.parse(task.data.attachments) : [];
                attachmentsContainer.innerHTML = '<h2>Anexos:</h2>';
                if (attachments.length === 0) {
                    attachmentsContainer.innerHTML += '<p>Nenhum anexo.</p>';
                } else {
                    attachments.forEach(filePath => {
                        const fileLink = document.createElement('a');
                        fileLink.href = `/${filePath}`;
                        fileLink.textContent = filePath.split('/').pop();
                        fileLink.target = '_blank';
                        fileLink.style.display = 'block';
                        fileLink.style.margin = '5px 0';
                        attachmentsContainer.appendChild(fileLink);
                    });
                }

                popupEdit.style.display = 'block';
            } else {
                showNotification(task.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error fetching task:', error);
            showNotification('Erro ao buscar tarefa: ' + error.message, 'error');
        });
}

// Editing functionality
document.addEventListener('DOMContentLoaded', () => {
    const popupEdit = document.getElementById('popupEdit');
    const obsEdit = document.getElementById('obsEdit'); // Element to display observation
    const situationEdit = document.getElementById('situationEdit'); // Element for situation selection
    const answerEdit = document.getElementById('answerEdit');
    const closePopupEdit = document.getElementById('close-popupEdit');
    const saveBtn = document.querySelector('.saveEditBtn');

    // Close edit popup
    closePopupEdit.addEventListener('click', () => {
        popupEdit.style.display = 'none';
    });

    // Save updated situation
    saveBtn.addEventListener('click', () => {
        const updatedSituation = situationEdit.value;
        const updatedAnswer = answerEdit.value;
        
        fetch(`/update-task/${currentTaskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                situation: updatedSituation,
                answer: updatedAnswer
             })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                // Emit a chat message indicating a new task was opened for a specific sector
                socket.emit('send_message', `Chamado respondido por ${userName}`, userName);
                fetchTasks('aberto'); // Reload tasks
                popupEdit.style.display = 'none'; // Close the popup
                showNotification('Tarefa atualizada com sucesso', 'success');
            } else {
                showNotification(result.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Erro ao atualizar tarefa: ' + error.message, 'error');
        });
        
    });
});

// Add a click event listener to the answerEdit textarea
document.getElementById('answerEdit').addEventListener('click', () => {
    const answerEdit = document.getElementById('answerEdit');
    answerEdit.readOnly = false; // Allow editing
    answerEdit.focus(); // Focus on the answer textarea
});