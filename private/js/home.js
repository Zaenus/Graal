const body = document.querySelector("body"),
      sidebar = document.querySelector(".sidebar"),
      toggle = document.querySelector(".toggle"),
      sidebarToggler = document.querySelector(".sidebar-toggler"),
      menuToggler = document.querySelector(".menu-toggler"),
      searchBtn = document.querySelector(".search-box"),
      modeSwitch = document.querySelector(".toggle-switch"),
      modeText = document.querySelector(".mode-text"),
      holeriteIcon = document.querySelector(".uil-bill"),
      homeIcon = document.querySelector(".bx-home-alt"),
      homeRed = document.querySelector(".index_image");

// Ensure these heights match the CSS sidebar height values
let collapsedSidebarHeight = "56px"; // Height in mobile view (collapsed)
let fullSidebarHeight = "calc(100vh - 32px)"; // Height in larger screen

// Toggle sidebar's collapsed state
sidebarToggler.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

const changePassword = document.querySelector(".bx-chevron-down");
const changeP = document.querySelector(".password-change-select");
const profilePage = document.querySelector(".user-profile");

changePassword.addEventListener("click", () => {
  const showChange = document.querySelector(".password-change");

  showChange.classList.toggle("open");
  if(showChange.classList.contains('open')){
    showChange.style.display = 'block';
    changePassword.style.transform = 'rotate(-180deg)';
    changePassword.style.transition = '0.5s';
  }else{
    showChange.style.display = 'none';
    changePassword.style.transform = 'rotate(360deg)';
    changePassword.style.transition = '0.5s';
  }
});

function openChangePass() {
  window.location.href = '/password';
}

changeP.addEventListener("click", openChangePass);

function openProfilePage() {
  window.location.href = '/user_profile';
}

profilePage.addEventListener("click", openProfilePage);
      
let userCPF = ''; // Store the user CPF globally
let userName = ''; // Store the user name globally for chat messages


document.addEventListener('DOMContentLoaded', function() {
  fetch('/user-data')
    .then(response => {
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access Denied: You do not have permission to access this resource.');
        } else {
          throw new Error('Failed to fetch user data');
        }
      }
      return response.json();
    })
    .then(data => {
      // Set the user's name
      document.querySelector('.user-name').textContent = data.name;
      userCPF = data.cpf;  // Store CPF globally for use later
      userName = data.name; // Store name globally for chat

      // Update the profile image:
      const profileImg = document.querySelector('.profile_image');
      // If the user has a profile image saved, use it; otherwise, use a default image.
      profileImg.src = data.image ? data.image : 'images/Rexxar_Misha.jpg';

    })
    .catch(error => {
      console.error('Error fetching user data:', error.message);
      alert(error.message);
    });
});   

// Update sidebar height and menu toggle text
const toggleMenu = (isMenuActive) => {
  sidebar.style.height = isMenuActive ? `${sidebar.scrollHeight}px` : collapsedSidebarHeight;
  menuToggler.querySelector("span").innerText = isMenuActive ? "close" : "menu";
}

// Toggle menu-active class and adjust height
menuToggler.addEventListener("click", () => {
  toggleMenu(sidebar.classList.toggle("menu-active"));
});

// Chat Functionality
const socket = io();

const sendMessage = () => {
    const userMessage = document.getElementById('user-input').value.trim();
    if (userMessage) {
        socket.emit('send_message', userMessage, userName || 'You');
        document.getElementById('user-input').value = '';
    }
};

document.getElementById('send-button').addEventListener('click', () => {
    sendMessage();
});

document.getElementById('user-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

socket.on('new_message', (data) => {
  const chatLogDiv = document.querySelector('.chat-log');
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message-container');
  
  if (data.username === document.querySelector('.user-name').textContent) {
      // Style for the user's message
      messageDiv.classList.add('user-message');
  } else {
      // Style for other users' messages
      messageDiv.classList.add('other-message');
  }
  
  // Add the message text
  messageDiv.textContent = `${data.username}: ${data.text}`;
  
  // Append to chat log
  chatLogDiv.appendChild(messageDiv);
  chatLogDiv.scrollTop = chatLogDiv.scrollHeight; // Auto-scroll
});

document.getElementById('chat-close-button').addEventListener('click', () => {

  const chatContainer = document.querySelector('.chat-popup');
  const closeButton = document.getElementById('chat-close-button');
  
  // Toggle minimized state
  chatContainer.classList.toggle('minimized');
  
  // Change button content based on state
  if (chatContainer.classList.contains('minimized')) {
      closeButton.innerHTML = '<i class="uil uil-angle-up"></i>'; // Upward arrow
  } else {
      closeButton.innerHTML = '<i class="uil uil-times"></i>'; // X symbol
  }
});