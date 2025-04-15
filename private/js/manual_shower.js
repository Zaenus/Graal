let showerStates = Array(10).fill(false);
let timerIntervals = Array(10).fill(null);
let showerTimers = Array(10).fill(0);

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
  console.log(`Opening modal ${showerNum}, shower state: ${showerStates[showerNum - 1]}`);
  modal.style.display = 'block';
}

function closeModal(showerNum) {
  const modal = document.getElementById(`modal-${showerNum}`);
  console.log(`Closing modal ${showerNum}`);
  modal.style.display = 'none';
}

function toggleShower(showerNum) {
  const controlButton = document.getElementById(`control-${showerNum}`);
  console.log(`Toggle shower ${showerNum}, current text: ${controlButton.textContent}`);

  if (controlButton.textContent === 'Desligar') {
    console.log(`Attempting to deactivate shower ${showerNum}`);
    fetch('/deactivate-shower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showerNum }),
    })
      .then(response => response.json())
      .then(data => {
        console.log('Deactivate response data:', data);
        if (data.success) {
          showerStates = data.states;
          showerTimers = data.remainingTimes; // Sync timers
          stopTimer(showerNum - 1);
          updateButtons();
          console.log(`Refreshing page after successful deactivation of shower ${showerNum}`);
          location.reload();
        } else {
          console.error('Deactivation failed:', data.message);
          alert(data.message);
        }
      })
      .catch(err => {
        console.error('Error during deactivation:', err);
        showerStates[showerNum - 1] = false;
        showerTimers[showerNum - 1] = 0;
        stopTimer(showerNum - 1);
        updateButtons();
        alert('Failed to deactivate shower. Updated locally.');
        console.log(`Refreshing page after error in deactivation of shower ${showerNum}`);
        location.reload();
      });
  } else {
    console.log(`Attempting to activate shower ${showerNum}`);
    fetch('/activate-shower-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showerNum }),
    })
      .then(response => response.json())
      .then(data => {
        console.log('Activate response data:', data);
        if (data.success) {
          showerStates = data.states;
          showerTimers = data.remainingTimes; // Sync timers
          startTimer(showerNum - 1, data.remainingTimes[showerNum - 1]);
          updateButtons();
        } else {
          alert(data.message);
        }
      })
      .catch(err => {
        console.error('Error during activation:', err);
        alert('Failed to activate shower. Please try again.');
      });
  }
}

function startTimer(index, initialTime = 480000) {
  showerTimers[index] = initialTime; // Use backend-provided time or default to 8 minutes
  const totalTime = 480; // Total time in seconds
  clearInterval(timerIntervals[index]);
  const timerDisplay = document.getElementById(`timer-${index + 1}`);
  const progressCircle = document.querySelector(`#modal-${index + 1} .circular-progress`);
  const progressValue = document.getElementById(`progress-value-${index + 1}`);

  timerIntervals[index] = setInterval(() => {
    if (showerTimers[index] > 0) {
      showerTimers[index] -= 1000;
      const minutes = Math.floor(showerTimers[index] / 60000);
      const seconds = Math.floor((showerTimers[index] % 60000) / 1000);
      const remainingSeconds = Math.floor(showerTimers[index] / 1000);
      const progressPercentage = Math.round((remainingSeconds / totalTime) * 100);

      if (timerDisplay) {
        timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      }
      if (progressValue && progressCircle) {
        progressValue.textContent = `${progressPercentage}%`;
        progressCircle.style.background = `conic-gradient(#7d2ae8 ${progressPercentage * 3.6}deg, #ededed 0deg)`;
      }
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

  if (timerDisplay) {
    timerDisplay.textContent = '0:00';
  }
  if (progressCircle && progressValue) {
    progressValue.textContent = '0%';
    progressCircle.style.background = `conic-gradient(#7d2ae8 0deg, #ededed 0deg)`;
  }
  updateButtons();
}

function updateButtons() {
  console.log('updateButtons called with states:', showerStates);
  for (let i = 1; i <= 10; i++) {
    const triggerButton = document.getElementById(`shower-trigger-${i}`);
    const controlButton = document.getElementById(`control-${i}`);
    if (!triggerButton || !controlButton) continue;

    if (showerStates[i - 1]) {
      triggerButton.classList.add('inactive'); // Turn red when active
      controlButton.textContent = 'Desligar';
      controlButton.className = 'control-button on';
    } else {
      triggerButton.classList.remove('inactive'); // Back to blue when inactive
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
      console.log('Polled states:', data.states);
      const oldStates = [...showerStates];
      showerStates = data.states;
      const remainingTimes = data.remainingTimes || Array(10).fill(0);
      console.log('Applied states:', showerStates);
      for (let i = 0; i < 10; i++) {
        if (oldStates[i] && !showerStates[i]) {
          console.log(`Shower ${i + 1} turned off externally`);
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