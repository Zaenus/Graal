let showerStates = Array(10).fill(false);
let timerIntervals = Array(10).fill(null);
let showerTimers = Array(10).fill(0);
let delayTimers = Array(10).fill(null); // For 1-minute delay

function createButtons() {
  const buttonsDiv = document.getElementById('buttons');
  for (let i = 1; i <= 10; i++) {
    const triggerButton = document.createElement('button');
    triggerButton.id = `shower-trigger-${i}`;
    triggerButton.className = 'shower-button';
    triggerButton.innerHTML = `<i class="fa-solid fa-shower"></i> ${i}`;
    triggerButton.onclick = () => openModal(i);
    buttonsDiv.appendChild(triggerButton);

    const modal = document.createElement('div');
    modal.id = `modal-${i}`;
    modal.className = 'modal';
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.innerHTML = `<h3><i class="fa-solid fa-shower"></i> ${i}</h3>`;

    const closeButton = document.createElement('span');
    closeButton.className = 'close-button';
    closeButton.innerHTML = '×';
    closeButton.onclick = () => closeModal(i);
    modalContent.appendChild(closeButton);

    const timerDisplay = document.createElement('p');
    timerDisplay.id = `timer-${i}`;
    timerDisplay.className = 'timer-display';
    timerDisplay.textContent = '8:00';
    modalContent.appendChild(timerDisplay);

    const progressContainer = document.createElement('div');
    progressContainer.className = 'circular-progress';
    const progressValue = document.createElement('span');
    progressValue.className = 'progress-value';
    progressValue.id = `progress-value-${i}`;
    progressValue.textContent = '100%';
    progressContainer.appendChild(progressValue);
    modalContent.appendChild(progressContainer);

    const qrScannerDiv = document.createElement('div');
    qrScannerDiv.id = `qr-scanner-${i}`;
    qrScannerDiv.style.display = 'none';
    modalContent.appendChild(qrScannerDiv);

    const controlButton = document.createElement('button');
    controlButton.id = `control-${i}`;
    controlButton.className = 'control-button off';
    controlButton.textContent = 'Ligar';
    controlButton.onclick = () => toggleShower(i);
    modalContent.appendChild(controlButton);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }
}

function openModal(showerNum) {
  const modal = document.getElementById(`modal-${showerNum}`);
  modal.style.display = 'block';
}

function closeModal(showerNum) {
  const modal = document.getElementById(`modal-${showerNum}`);
  modal.style.display = 'none';
  if (delayTimers[showerNum - 1]) {
    clearInterval(delayTimers[showerNum - 1]);
    delayTimers[showerNum - 1] = null;
  }
}

function showNotification(message, type = 'error') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  const text = document.createElement('span');
  text.className = 'notification-text';
  text.textContent = message;
  
  const closeButton = document.createElement('button');
  closeButton.className = 'notification-close';
  closeButton.innerHTML = '×';
  
  notification.appendChild(text);
  notification.appendChild(closeButton);
  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    closeNotification(notification);
  }, 5000);

  // Close on click
  closeButton.onclick = () => closeNotification(notification);
}

function closeNotification(notification) {
  notification.style.animation = 'fadeOutNotification 0.3s ease-out forwards';
  setTimeout(() => {
    notification.remove();
  }, 300); // Match animation duration
}

let qrCodeScanner = null;

function toggleShower(showerNum) {
  const controlButton = document.getElementById(`control-${showerNum}`);
  const qrScannerDiv = document.getElementById(`qr-scanner-${showerNum}`);
  const modalContent = document.querySelector(`#modal-${showerNum} .modal-content`);

  if (controlButton.textContent === 'Desligar') {
    fetch('/deactivate-shower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showerNum }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showerStates = data.states;
          showerTimers = data.remainingTimes; // Sync timers
          stopTimer(showerNum - 1);
          updateButtons();
          location.reload();
        } else {
          showNotification(data.message, 'error');
        }
      })
      .catch(err => {
        showerStates[showerNum - 1] = false;
        showerTimers[showerNum - 1] = 0;
        stopTimer(showerNum - 1);
        updateButtons();
        showNotification('Falha ao desligar o chuveiro. Atualize localmente.', 'error');
        location.reload();
      });
    return;
  }

  qrScannerDiv.style.display = 'block';
  controlButton.disabled = true;

  if (qrCodeScanner) {
    qrCodeScanner.stop().then(() => {
      qrCodeScanner = null;
      startQrScanner(showerNum);
    }).catch(err => {
      qrCodeScanner = null;
      startQrScanner(showerNum);
    });
  } else {
    startQrScanner(showerNum);
  }
}

function startQrScanner(showerNum) {
  const qrScannerDiv = document.getElementById(`qr-scanner-${showerNum}`);
  const controlButton = document.getElementById(`control-${showerNum}`);
  const modalContent = document.querySelector(`#modal-${showerNum} .modal-content`);

  qrCodeScanner = new Html5Qrcode(`qr-scanner-${showerNum}`);
  qrCodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 }, disableFlip: false },
    (decodedText) => {
      fetch('/validate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode: decodedText, showerNum }),
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            qrCodeScanner.stop().then(() => {
              qrScannerDiv.style.display = 'none';
              controlButton.disabled = false;
              showConfirmation(showerNum, modalContent, decodedText);
            });
          } else {
            showNotification(data.message, 'error');
          }
        })
        .catch(err => {
          showNotification('Falha ao validar QR code. Por favor tente novamente.', 'error');
        })
        .finally(() => {
          qrCodeScanner.stop().then(() => {
            qrScannerDiv.style.display = 'none';
            controlButton.disabled = false;
          });
        });
    },
    (errorMessage) => console.log(`QR Scan error: ${errorMessage}`)
  ).catch(err => {
    qrScannerDiv.style.display = 'none';
    controlButton.disabled = false;
    showNotification('Falha ao iniciar o QR scanner. Por favor checar as permissões da camera.', 'error');
  });
}

function showConfirmation(showerNum, modalContent, qrCode) {
  modalContent.innerHTML = `
    <div class="confirmation-state">
      <p class="confirmation-text">Chuveiro ligará em:</p>
      <div class="progress-bar-container">
        <div class="progress-bar" id="progress-bar-${showerNum}"></div>
      </div>
      <p class="confirmation-timer" id="delay-timer-${showerNum}">0:30</p>
      <button id="confirm-${showerNum}" class="control-button off">OK</button>
    </div>
  `;

  const confirmButton = document.getElementById(`confirm-${showerNum}`);
  confirmButton.onclick = () => startDelayTimer(showerNum, modalContent, qrCode);
}

function startDelayTimer(showerNum, modalContent, qrCode) {
  let delayTime = 30; // 30 seconds
  const delayTimerDisplay = document.getElementById(`delay-timer-${showerNum}`);
  const confirmButton = document.getElementById(`confirm-${showerNum}`);
  const progressBar = document.getElementById(`progress-bar-${showerNum}`);
  
  confirmButton.style.display = 'none'; // Hide the OK button
  progressBar.classList.add('active'); // Start the progress animation

  delayTimers[showerNum - 1] = setInterval(() => {
    if (delayTime > 0) {
      delayTime--;
      const minutes = Math.floor(delayTime / 60);
      const seconds = delayTime % 60;
      delayTimerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    } else {
      clearInterval(delayTimers[showerNum - 1]);
      delayTimers[showerNum - 1] = null;
      activateShower(showerNum, modalContent, qrCode);
    }
  }, 1000);
}

function activateShower(showerNum, modalContent, qrCode) {
  fetch('/activate-shower', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ showerNum }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showerStates = data.states;
        showerTimers = data.remainingTimes; // Sync timers
        updateButtons();

        modalContent.innerHTML = `
          <h3><i class="fa-solid fa-shower"></i> ${showerNum}</h3>
          <span class="close-button" onclick="closeModal(${showerNum})">×</span>
          <p id="timer-${showerNum}" class="timer-display">8:00</p>
          <div class="circular-progress">
            <span class="progress-value" id="progress-value-${showerNum}">100%</span>
          </div>
          <div id="qr-scanner-${showerNum}" style="display: none;"></div>
          <button id="control-${showerNum}" class="control-button on">Desligar</button>
        `;
        
        document.getElementById(`control-${showerNum}`).onclick = () => toggleShower(showerNum);
        setTimeout(() => startTimer(showerNum - 1, data.remainingTimes[showerNum - 1]), 0);
      } else {
        showNotification(data.message, 'error');
        resetModal(showerNum, modalContent);
      }
    })
    .catch(err => {
      showNotification('Falha ao ativar o chuveiro. Por favor tente novamente.', 'error');
      resetModal(showerNum, modalContent);
    });
}

function resetModal(showerNum, modalContent) {
  modalContent.innerHTML = `
    <h3><i class="fa-solid fa-shower"></i> ${showerNum}</h3>
    <span class="close-button" onclick="closeModal(${showerNum})">×</span>
    <p id="timer-${showerNum}" class="timer-display">8:00</p>
    <div class="circular-progress">
      <span class="progress-value" id="progress-value-${showerNum}">100%</span>
    </div>
    <div id="qr-scanner-${showerNum}" style="display: none;"></div>
    <button id="control-${showerNum}" class="control-button off">Ligar</button>
  `;
  document.getElementById(`control-${showerNum}`).onclick = () => toggleShower(showerNum);
}

function startTimer(index, initialTime = 480000) {
  showerTimers[index] = initialTime;
  const totalTime = 480;
  clearInterval(timerIntervals[index]);

  const timerDisplay = document.getElementById(`timer-${index + 1}`);
  const progressCircle = document.querySelector(`#modal-${index + 1} .circular-progress`);
  const progressValue = document.getElementById(`progress-value-${index + 1}`);

  if (!timerDisplay || !progressCircle || !progressValue) {
    console.error(`Timer elements not found for shower ${index + 1}`);
    return;
  }

  timerIntervals[index] = setInterval(() => {
    if (showerTimers[index] > 0) {
      showerTimers[index] -= 1000;
      const minutes = Math.floor(showerTimers[index] / 60000);
      const seconds = Math.floor((showerTimers[index] % 60000) / 1000);
      const remainingSeconds = Math.floor(showerTimers[index] / 1000);
      const progressPercentage = Math.round((remainingSeconds / totalTime) * 100);

      timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      progressValue.textContent = `${progressPercentage}%`;
      progressCircle.style.background = `conic-gradient(#7d2ae8 ${progressPercentage * 3.6}deg, #ededed 0deg)`;
    } else {
      stopTimer(index);
    }
  }, 1000);
  updateButtons();
}

function stopTimer(index) {
  clearInterval(timerIntervals[index]);
  timerIntervals[index] = null;
  showerTimers[index] = 0;

  const timerDisplay = document.getElementById(`timer-${index + 1}`);
  const progressCircle = document.querySelector(`#modal-${index + 1} .circular-progress`);
  const progressValue = document.getElementById(`progress-value-${index + 1}`);

  if (timerDisplay) timerDisplay.textContent = '0:00';
  if (progressCircle && progressValue) {
    progressValue.textContent = '0%';
    progressCircle.style.background = `conic-gradient(#7d2ae8 0deg, #ededed 0deg)`;
  }
  updateButtons();
}

function updateButtons() {
  for (let i = 1; i <= 10; i++) {
    const triggerButton = document.getElementById(`shower-trigger-${i}`);
    const controlButton = document.getElementById(`control-${i}`);
    if (!triggerButton || !controlButton) continue;

    if (showerStates[i - 1]) {
      triggerButton.disabled = true;
      controlButton.textContent = 'Desligar';
      controlButton.className = 'control-button on';
    } else {
      triggerButton.disabled = false;
      controlButton.textContent = 'Ligar';
      controlButton.className = 'control-button off';
    }
  }
}

setInterval(() => {
  fetch('/get-shower-states', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(response => response.json())
    .then(data => {
      const oldStates = [...showerStates];
      showerStates = data.states;
      const remainingTimes = data.remainingTimes || Array(10).fill(0);
      for (let i = 0; i < 10; i++) {
        if (oldStates[i] && !showerStates[i]) {
          stopTimer(i);
          closeModal(i + 1);
        } else if (showerStates[i] && !timerIntervals[i] && remainingTimes[i] > 0) {
          startTimer(i, remainingTimes[i]);
        } else if (showerStates[i] && timerIntervals[i]) {
          showerTimers[i] = remainingTimes[i]; // Sync with backend
        }
      }
      updateButtons();
    })
    .catch(err => console.error('Error polling states:', err));
}, 100);

window.onload = () => {
  createButtons();
  updateButtons();
};