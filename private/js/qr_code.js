const wrapper = document.querySelector(".wrapper"),
  generateBtn = wrapper.querySelector(".form button"),
  qrImg = wrapper.querySelector(".qr-code img"),
  printButton = document.getElementById("printButton");

generateBtn.addEventListener("click", () => {
  let qrValue = generateRandomQRCode();
  if (!qrValue) return; // Stop if generateRandomQRCode returns undefined (e.g., due to missing plate)
  generateBtn.innerText = "Generating QR Code...";
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrValue}`;
  
  qrImg.onload = () => { // Use onload to ensure the image is fully loaded
    wrapper.classList.add("active");
    generateBtn.innerText = "Generate QR Code";
    printButton.style.display = "block";
  };
  
  qrImg.onerror = () => { // Handle potential errors with image loading
    alert("Failed to load QR code image. Please try again.");
    generateBtn.innerText = "Generate QR Code";
  };
});

function generateRandomQRCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  const expirationTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const enterpriseName = document.getElementById("empresa").value;
  const conductorName = document.getElementById("motorista").value;
  const plate = document.getElementById("placa").value;

  if (!plate) {
    alert("Favor informar a placa.");
    return; // Return undefined to stop execution
  }

  const qrCodeData = {
    code: result,
    expiration: expirationTime,
    enterprise_name: enterpriseName,
    conductor_name: conductorName,
    plate: plate,
  };

  fetch("/insert-qr-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(qrCodeData),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        console.log(data.message);
      } else {
        console.error("Failed to insert QR code:", data.message);
      }
    })
    .catch((error) => console.error("Error:", error));

  return result;
}

printButton.addEventListener("click", function () {
  if (qrImg.src && qrImg.complete) { // Check if the image is loaded
    printQRCode();
    window.location.reload();
  } else {
    alert("Please wait for the QR code to generate fully before printing.");
  }
});

function printQRCode() {
  const qrWindow = window.open("", "_blank");
  qrWindow.document.write(`
    <html>
      <head>
        <title>Print QR Code</title>
        <style>
          body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <img src="${qrImg.src}" alt="QR Code" onload="window.print();">
      </body>
    </html>
  `);
  qrWindow.document.close();
  qrWindow.focus();
  qrWindow.onafterprint = function () {
    qrWindow.close();
  };
}