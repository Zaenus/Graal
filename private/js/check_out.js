document.addEventListener('DOMContentLoaded', () => {
    const apiUrl = '/get-active-check-ins';
  
    const openPopupBtn = document.getElementById('open-create-user-popup');
    const closePopupBtn = document.getElementById('close-create-user-popup');
    const createUserPopup = document.getElementById('create-user-popup');
    const createUserForm = document.getElementById('create-user-form');
    const listUserPopup = document.getElementById('list-user-popup');
    const listUserPopupBtn = document.getElementById('open-list-user-popup');
    const closeListUserPopupBtn = document.getElementById('close-list-user-popup');
    const usersTurismoTableBody = document.getElementById('users-turismo-tbody');
    const checkOutTimerPopup = document.getElementById('check-out-timer-popup');
    const closeCheckOutTimerBtn = document.getElementById('close-check-out-timer');
    const timerDisplay = document.getElementById('timer-display');
    const manualCheckOutBtn = document.getElementById('manual-check-out-btn');
  
    let timerInterval;
  
    // Notification function
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
  
    // Function to update table
    function updateTable(activeCheckIns) {
      const tbody = document.getElementById('active-check-ins-tbody');
      const thead = document.getElementById('active-check-ins-thead');
      tbody.innerHTML = '';
  
      if (!activeCheckIns || activeCheckIns.length === 0) {
        thead.style.display = 'none';
      } else {
        thead.style.display = 'table-header-group';
        activeCheckIns.forEach(user => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${user.cpf}</td>
            <td>${user.name}</td>
            <td>${user.last_check_in}</td>
            <td>
              <button class="view-timer-btn" data-cpf="${user.cpf}" data-checkin="${user.last_check_in}">
                <i class='bx bx-search'></i>
              </button>
            </td>
          `;
          tbody.appendChild(row);
        });
  
        const viewTimerBtns = document.querySelectorAll('.view-timer-btn');
        viewTimerBtns.forEach(btn => {
          btn.removeEventListener('click', openTimerPopup);
          btn.addEventListener('click', openTimerPopup);
        });
      }
    }
  
    // Function to fetch active check-ins
    function fetchActiveCheckIns() {
      axios.get(apiUrl)
        .then(response => {
          console.log('Fetched active check-ins:', response.data);
          updateTable(response.data);
        })
        .catch(error => {
          console.error('Error fetching active check-ins:', error);
          showNotification('Erro ao carregar check-ins ativos', 'error');
        });
    }
  
    // Initial fetch and polling
    fetchActiveCheckIns();
    setInterval(fetchActiveCheckIns, 5000);
  
    // Format time function
    function formatTime(seconds) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  
    // Open timer popup (no auto check-out)
    function openTimerPopup(event) {
      const cpf = event.target.closest('button').dataset.cpf;
      const checkInTime = new Date(event.target.closest('button').dataset.checkin).getTime() / 1000;
      const currentTime = Math.floor(Date.now() / 1000);
      let elapsedSeconds = currentTime - checkInTime;
  
      console.log(`Timer opened for CPF ${cpf}: last_check_in=${event.target.closest('button').dataset.checkin}, initial_elapsed=${elapsedSeconds}`);
  
      checkOutTimerPopup.style.display = 'flex';
      manualCheckOutBtn.dataset.cpf = cpf;
  
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        elapsedSeconds++;
        const timeInCycle = elapsedSeconds % 1800;
        const progressPercentage = Math.min((timeInCycle / 1800) * 100, 100);
  
        timerDisplay.textContent = `Tempo: ${formatTime(elapsedSeconds)}`;
        const circularProgress = checkOutTimerPopup.querySelector('.circular-progress');
        const progressValue = checkOutTimerPopup.querySelector('.progress-value');
        progressValue.textContent = `${Math.round(progressPercentage)}%`;
        circularProgress.style.background = `conic-gradient(#695CFE ${progressPercentage * 3.6}deg, #ededed 0deg)`;
      }, 1000);
  
      // Initial display
      const initialTimeInCycle = elapsedSeconds % 1800;
      const initialProgress = (initialTimeInCycle / 1800) * 100;
      timerDisplay.textContent = `Tempo: ${formatTime(elapsedSeconds)}`;
      const circularProgress = checkOutTimerPopup.querySelector('.circular-progress');
      const progressValue = checkOutTimerPopup.querySelector('.progress-value');
      progressValue.textContent = `${Math.round(initialProgress)}%`;
      circularProgress.style.background = `conic-gradient(#695CFE ${initialProgress * 3.6}deg, #ededed 0deg)`;
    }
  
    // Handle check-out (manual only)
    async function handleCheckOut(cpf) {
      try {
        const response = await fetch('/check-out-turismo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpf }),
        });
  
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Erro ao realizar check-out');
        }
  
        const data = await response.json();
        showNotification(data.message, 'success');
        checkOutTimerPopup.style.display = 'none';
        clearInterval(timerInterval);
        fetchActiveCheckIns();
      } catch (error) {
        console.error('Error checking out:', error);
        showNotification(error.message, 'error');
      }
    }
  
    // Popup event listeners
    openPopupBtn.addEventListener('click', () => createUserPopup.style.display = 'flex');
    closePopupBtn.addEventListener('click', () => createUserPopup.style.display = 'none');
    closeListUserPopupBtn.addEventListener('click', () => listUserPopup.style.display = 'none');
    createUserPopup.addEventListener('click', (event) => {
      if (event.target === createUserPopup) createUserPopup.style.display = 'none';
    });
    closeCheckOutTimerBtn.addEventListener('click', () => {
      checkOutTimerPopup.style.display = 'none';
      clearInterval(timerInterval);
    });
    manualCheckOutBtn.addEventListener('click', () => {
      console.log(`Manual check-out triggered for CPF ${manualCheckOutBtn.dataset.cpf}`);
      handleCheckOut(manualCheckOutBtn.dataset.cpf);
    });
  
    // Handle form submission
    createUserForm.addEventListener('submit', async (event) => {
      event.preventDefault();
  
      const name = document.getElementById('user-name').value;
      const cpf = document.getElementById('user-cpf').value;
      const matricula = document.getElementById('user-matricula').value;
      const empresa = document.getElementById('user-empresa').value;
      const password = document.getElementById('user-password').value;
      const profile = document.getElementById('user-profile').value;
  
      try {
        const response = await fetch('/create-user-turismo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, cpf, matricula, empresa, password, profile }),
        });
  
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
  
        showNotification(result.message || 'Usuário criado com sucesso!', 'success');
        createUserForm.reset();
        createUserPopup.style.display = 'none';
        fetchActiveCheckIns();
      } catch (error) {
        console.error('Error creating user:', error);
        showNotification(error.message || 'Erro ao criar usuário', 'error');
      }
    });
  
    // List users popup
    if (listUserPopupBtn) {
      listUserPopupBtn.addEventListener('click', async () => {
        try {
          const response = await fetch('/get-users-turismo');
          if (!response.ok) throw new Error('Failed to fetch users.');
  
          const data = await response.json();
          const users = Array.isArray(data) ? data : data.users;
  
          usersTurismoTableBody.innerHTML = '';
          users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
              <td>${user.cpf}</td>
              <td>${user.name}</td>
              <td>${user.enterprise}</td>
              <td>${user.profile}</td>
            `;
            usersTurismoTableBody.appendChild(row);
          });
  
          const totalUsersElement = document.getElementById('total-users-count');
          totalUsersElement.textContent = `Total de Usuários: ${users.length}`;
          listUserPopup.style.display = 'flex';
  
          window.onclick = function(event) {
            if (event.target == listUserPopup) listUserPopup.style.display = 'none';
          };
        } catch (error) {
          console.error('Error fetching users:', error);
          showNotification('Erro ao carregar a lista de usuários', 'error');
        }
      });
    } else {
      console.error('listUserPopupBtn not found in DOM');
    }
  });