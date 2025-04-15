const form = document.querySelector("form");
const fileInput = document.querySelector(".file-input");
const progressArea = document.querySelector(".progress-area");
const uploadedArea = document.querySelector(".uploaded-area");

// Load uploaded files from localStorage
let uploadedFiles = JSON.parse(localStorage.getItem("uploadedFiles")) || [];

// Render uploaded files from localStorage on page load
renderUploadedFiles();

// form click event
form.addEventListener("click", () => {
  fileInput.click();
});

fileInput.onchange = async ({ target }) => {
  let files = target.files;
  if (files.length > 0) {
    try {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        let fileName = file.name;
        if (fileName.length >= 12) {
          let splitName = fileName.split(".");
          fileName = splitName[0].substring(0, 13) + "... ." + splitName[1];
        }
        const formData = new FormData();
        formData.append("file", file);

        axios.post("/upload", formData, {
          onUploadProgress: (progressEvent) => {
            let fileLoaded = Math.floor(
              (progressEvent.loaded / progressEvent.total) * 100
            );
            let fileTotal = Math.floor(progressEvent.total / 1000);
            let fileSize =
              fileTotal < 1024
                ? fileTotal + " KB"
                : (progressEvent.loaded / (1024 * 1024)).toFixed(2) + " MB";
            let progressHTML = `<li class="row">
                                  <i class="fas fa-file-alt"></i>
                                  <div class="content">
                                    <div class="details">
                                      <span class="name">${fileName} • Uploading</span>
                                      <span class="percent">${fileLoaded}%</span>
                                    </div>
                                    <div class="progress-bar">
                                      <div class="progress" style="width: ${fileLoaded}%"></div>
                                    </div>
                                  </div>
                                </li>`;
            uploadedArea.classList.add("onprogress");
            progressArea.innerHTML += progressHTML;
          },
        }).then((response) => {
          let fileLoaded = 100;
          let fileTotal = Math.floor(file.size / 1000);
          let fileSize =
            fileTotal < 1024
              ? fileTotal + " KB"
              : (file.size / (1024 * 1024)).toFixed(2) + " MB";
          let uploadedHTML = `<li class="row">
                                <div class="content upload">
                                  <i class="fas fa-file-alt"></i>
                                  <div class="details">
                                    <span class="name">${fileName} • Uploaded</span>
                                    <span class="size">${fileSize}</span>
                                  </div>
                                </div>
                                <i class="fas fa-check"></i>
                              </li>`;
          uploadedArea.classList.remove("onprogress");
          uploadedArea.insertAdjacentHTML("afterbegin", uploadedHTML);

          // Save uploaded file information to localStorage
          const uploadedFile = {
            name: fileName,
            size: fileSize,
            uploaded: true,
          };
          uploadedFiles.push(uploadedFile);
          saveUploadedFiles();

          // Check if it is the last file
          if (i === files.length - 1) {
            progressArea.innerHTML = "";
          }
          console.log(response.data);
        });
      }
    } catch (error) {
      console.log(error);
    }
  }
};

// Render uploaded files from localStorage
function renderUploadedFiles() {
  uploadedArea.innerHTML = "";
  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    let uploadedHTML = `<li class="row">
                          <div class="content upload">
                            <i class="fas fa-file-alt"></i>
                            <div class="details">
                              <span class="name">${file.name} • Uploaded</span>
                              <span class="size">${file.size}</span>
                            </div>
                          </div>
                          <i class="fas fa-check"></i>
                        </li>`;
    uploadedArea.insertAdjacentHTML("afterbegin", uploadedHTML);
  }
}

// Save uploaded files to localStorage
function saveUploadedFiles() {
  localStorage.setItem("uploadedFiles", JSON.stringify(uploadedFiles));
}

const searchForm = document.querySelector(".button");
const searchInput = document.querySelector(".search-input");
const searchResultsContainer = document.querySelector(".search-result");

searchForm.addEventListener("click", async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (query) {
    try {
      const response = await axios.get(`/search?query=${query}`);
      const searchResults = response.data;
      displaySearchResults(searchResults);
    } catch (error) {
      console.error("Error occurred during search:", error);
    }
  }
});

function displaySearchResults(searchResults) {
  searchResultsContainer.innerHTML = "";
  if (searchResults.length === 0) {
    searchResultsContainer.textContent = "No results found.";
    return;
  }
  searchResults.forEach((result) => {
    const resultItem = document.createElement("li");
    resultItem.textContent = result.name;
    searchResultsContainer.appendChild(resultItem);
  });
}
