document.getElementById('insert-form').addEventListener('submit', function (event) {
    event.preventDefault();

    const formData = {
        name: document.getElementById('name').value,
        date: document.getElementById('dateTimeInput').value,
        value: document.getElementById('value').value,
        motive: document.getElementById('motive').value,
        // manager is no longer included here as it will come from the server-side authentication
    };

    fetch('/submit-form-posto', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
    })
    .then(response => {
        if (response.ok) {
            return response.json(); // Changed to json() to get the manager data
        } else {
            throw new Error('Failed to submit form');
        }
    })
    .then(data => {
        console.log('Server response:', data);
        showPopup();

        // Add the manager from the server response to formData for printing
        formData.manager = data.manager;
        prepareForPrinting(formData);
    })
    .catch(error => {
        console.error('Error:', error);
    });
});

// showPopup function remains the same
function showPopup() {
    const popup = document.getElementById('popup');
    popup.style.display = 'block';

    document.getElementById('close-popup').onclick = function() {
        popup.style.display = 'none';
        window.location.reload();
    };

    window.onclick = function(event) {
        if (event.target == popup) {
            popup.style.display = 'none';
            window.location.reload();
        }
    };
}

// prepareForPrinting remains the same
function prepareForPrinting(data) {
    document.getElementById('print-name').innerText = `Nome: ${data.name}`;
    document.getElementById('print-date').innerText = `Data: ${data.date}`;
    document.getElementById('print-value').innerText = `Valor: ${data.value}`;
    document.getElementById('print-motive').innerText = `Motivo: ${data.motive}`;
    document.getElementById('print-manager').innerText = `Encarregado: ${data.manager}`;

    document.getElementById('printable-area').style.display = 'block';
    window.print();
    document.getElementById('printable-area').style.display = 'none';
}