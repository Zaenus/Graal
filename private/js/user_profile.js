    // Show preview when a file is selected
    const profileInput = document.getElementById('profile-image');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview');

    profileInput.addEventListener('change', function () {
      const file = this.files[0];
      if (file) {
        previewContainer.style.display = 'block';
        const reader = new FileReader();
        reader.onload = function(e) {
          previewImage.src = e.target.result;
        }
        reader.readAsDataURL(file);
      } else {
        previewContainer.style.display = 'none';
      }
    });

    function showMessage(message) {
      const popup = document.getElementById('message-popup');
      const popupMessage = document.getElementById('popup-message');
      const popupCloseButton = document.getElementById('popup-close-button');
    
      popupMessage.textContent = message;
      popup.classList.remove('hidden');
    
      popupCloseButton.addEventListener('click', () => {
        popup.classList.add('hidden');
        window.location.reload();
      }, { once: true });
    }

    // Handle form submission
    const form = document.getElementById('profile-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData();
      formData.append('image', profileInput.files[0]);

      try {
        const response = await fetch('/upload-profile', {
          method: 'POST',
          body: formData,
          // Note: Do NOT set the Content-Type header here,
          // let the browser add the appropriate multipart/form-data boundary.
        });

        const result = await response.json();
        if (response.ok) {
          showMessage('Profile image updated successfully!');
        } else {
          showMessage('Error: ' + result.error);
        }
      } catch (error) {
        console.error('Upload error:', error);
        showMessage('An error occurred during the upload.');
      }
    });