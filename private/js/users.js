document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('/get-users');
        const users = await response.json();

        const peopleList = document.getElementById('peopleList');
        peopleList.innerHTML = ''; // Clear any existing content

        users.forEach(user => {
            const li = document.createElement('li');
            li.textContent = `CPF : ${user.cpf} - Nome : ${user.name} - Perfil: ${user.profile}`;
            li.dataset.cpf = user.cpf;

            li.addEventListener('click', function() {
                showPopupOptions(user.cpf);
            });

            peopleList.appendChild(li);
        });
    } catch (error) {
        console.error('Error fetching users:', error);
    }
});

document.querySelector('.addBtn').addEventListener('click', async () => {
    const name = document.getElementById('name').value;
    const cpf = document.getElementById('cpf').value;
    const profile = document.getElementById('perfil').value;

    if (name && cpf && profile) {
        try {
            const response = await fetch('/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, cpf, profile })
            });

            if (response.ok) {
                showAddPopup();
                document.getElementById('popup').style.display = 'none';
                // Optionally, refresh the user list or clear the form
            } else {
                alert('Failed to create user.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to create user.');
        }
    } else {
        alert('Please fill in all fields.');
    }
});

function openDeletePopup(cpf) {
    const popup = document.getElementById('popupRemove');
    const confirmBtn = document.getElementById('confirmRemoveBtn');

    popup.style.display = 'block';

    confirmBtn.onclick = async function() {
        try {
            const response = await fetch(`/delete-user/${cpf}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                alert('User deleted successfully!');
                document.location.reload(); // Reload the page to update the list
            } else {
                alert('Error deleting user.');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Error deleting user.');
        } finally {
            popup.style.display = 'none';
        }
    };
}

const addUser = document.querySelector(".addUser");

function showPopup() {
    const popup = document.getElementById('popup');
    popup.style.display = 'block';

    document.getElementById('close-popup').onclick = function() {
        popup.style.display = 'none';
        window.location.reload(); // Reload the page after closing the popup
    };

    window.onclick = function(event) {
        if (event.target == popup) {
            popup.style.display = 'none';
            window.location.reload(); // Reload the page after closing the popup
        }
    };
}

function showAddPopup() {
    const popupAdd = document.getElementById('popupAdd');
    popupAdd.style.display = 'block';

    document.getElementById('close-popup-add').onclick = function() {
        popupAdd.style.display = 'none';
        window.location.reload(); // Reload the page after closing the popup
    };

    window.onclick = function(event) {
        if (event.target == popupAdd) {
            popupAdd.style.display = 'none';
            window.location.reload(); // Reload the page after closing the popup
        }
    };
}

let selectedCpf = null;
const fileUpdater = document.getElementById('file-uploader');

function showPopupOptions(cpf) {
    const popupOption = document.getElementById('popupOptions');

    selectedCpf = cpf;

    popupOption.style.display = 'block';

    document.getElementById('close-popup-option').onclick = function() {
        popupOption.style.display = 'none';
        window.location.reload();
    };

    document.getElementById('deleteBtn').onclick = function() {
        openDeletePopup(cpf);
    };

    document.getElementById('uploadBtn').onclick = function() {
        fileUpdater.style.display = 'block';
        popupOption.style.display = 'none';

        fileUpdater.classList.add('active'); // Add class when popup is active
    };
}

addUser.addEventListener("click", showPopup);

document.getElementById('cancelRemoveBtn').addEventListener('click', function() {
    document.getElementById('popupRemove').style.display = 'none';
});

document.getElementById('close-popup-remove').addEventListener('click', function() {
    document.getElementById('popupRemove').style.display = 'none';
});

document.getElementById('close-upload').addEventListener('click', function() {
    document.getElementById('file-uploader').style.display = 'none';
});

const fileList = document.querySelector(".file-list");
const fileBrowseButton = document.querySelector(".file-browse-button");
const fileBrowseInput = document.querySelector(".file-browse-input");
const fileUploadBox = document.querySelector(".file-upload-box");
const fileCompletedStatus = document.querySelector(".file-completed-status");

let totalFiles = 0;
let completedFiles = 0;

const createFileItemHTML = (file, uniqueIdentifier) => {
    const {name, size} = file;
    const extension = name.split(".").pop();
    const formattedFileSize = size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(2)} MB` : `${(size / 1024).toFixed(2)} KB`;

    return `<li class="file-item" id="file-item-${uniqueIdentifier}">
                <div class="file-extension">${extension}</div>
                <div class="file-content-wrapper">
                <div class="file-content">
                    <div class="file-details">
                    <h5 class="file-name">${name}</h5>
                    <div class="file-info">
                        <small class="file-size">0 MB / ${formattedFileSize}</small>
                        <small class="file-divider">•</small>
                        <small class="file-status">Uploading...</small>
                    </div>
                    </div>
                    <button class="cancel-button">
                    <i class="bx bx-x"></i>
                    </button>
                </div>
                <div class="file-progress-bar">
                    <div class="file-progress"></div>
                </div>
                </div>
            </li>`;
}

const handleFileUploading = (file, cpf, uniqueIdentifier) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("cpf", cpf);

    xhr.upload.addEventListener("progress", (e) => {
        const fileProgress = document.querySelector(`#file-item-${uniqueIdentifier} .file-progress`);
        const fileSize = document.querySelector(`#file-item-${uniqueIdentifier} .file-size`);
        const formattedFileSize = file.size >= 1024 * 1024  ? `${(e.loaded / (1024 * 1024)).toFixed(2)} MB / ${(e.total / (1024 * 1024)).toFixed(2)} MB` : `${(e.loaded / 1024).toFixed(2)} KB / ${(e.total / 1024).toFixed(2)} KB`;

        const progress = Math.round((e.loaded / e.total) * 100);
        fileProgress.style.width = `${progress}%`;
        fileSize.innerText = formattedFileSize;
    });

    xhr.open("POST", "/upload-file", true);
    xhr.send(formData);

    return xhr;
}

const handleSelectedFiles = (fileList, cpf) => {
    const files = Array.from(fileList);  // Convert FileList to an array
    if (files.length === 0) return;
    totalFiles += files.length;

    files.forEach((file, index) => {
        const uniqueIdentifier = Date.now() + index;
        const fileItemHTML = createFileItemHTML(file, uniqueIdentifier);
        document.querySelector('.file-list').insertAdjacentHTML("afterbegin", fileItemHTML);  // Make sure you target the correct `.file-list`
        const currentFileItem = document.querySelector(`#file-item-${uniqueIdentifier}`);
        const cancelFileUploadButton = currentFileItem.querySelector(".cancel-button");

        const xhr = handleFileUploading(file, cpf, uniqueIdentifier);

        // Update file status text and change color of it 
        const updateFileStatus = (status, color) => {
            currentFileItem.querySelector(".file-status").innerText = status;
            currentFileItem.querySelector(".file-status").style.color = color;
        }

        xhr.addEventListener("readystatechange", () => {
            // Handling completion of file upload
            if(xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
                completedFiles++;
                cancelFileUploadButton.remove();
                updateFileStatus("Completed", "#00B125");
                document.querySelector('.file-completed-status').innerText = `${completedFiles} / ${totalFiles} files completed`;
            }
        });

        // Handling cancellation of file upload
        cancelFileUploadButton.addEventListener("click", () => {
            xhr.abort(); // Cancel file upload
            updateFileStatus("Cancelled", "#E3413F");
            cancelFileUploadButton.remove();
        });

        // Show alert if there is any error during file uploading
        xhr.addEventListener("error", () => {
            updateFileStatus("Error", "#E3413F");
            alert("An error occurred during the file upload!");
        });
    });

    document.querySelector('.file-completed-status').innerText = `${completedFiles} / ${totalFiles} files completed`;
}

fileUploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    handleSelectedFiles(e.dataTransfer.files, selectedCpf);
    fileUploadBox.classList.remove("active");
    fileUploadBox.querySelector(".box-title").textContent = "Drag and drop files here!";
});

fileUploadBox.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileUploadBox.querySelector(".box-title").textContent = "Release to upload files!";
    fileUploadBox.classList.add("active");
});

fileUploadBox.addEventListener("dragleave", (e) => {
    e.preventDefault();
    fileUploadBox.classList.remove("active");
    fileUploadBox.querySelector(".box-title").textContent = "Drag and drop files here!";
});

fileBrowseButton.addEventListener("click", () => fileBrowseInput.click());

fileBrowseInput.addEventListener("change", () => {
    handleSelectedFiles(fileBrowseInput.files, selectedCpf);
});