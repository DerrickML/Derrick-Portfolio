document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('contact-form');
  const submitButton = document.getElementById('submitButton');
  const originalsubmitButtonHtml = submitButton.innerHTML
  const captchaModal = new bootstrap.Modal(document.getElementById('captchaModal'));
  const captchaAnswer = document.getElementById('captchaAnswer');
  const checkCaptcha = document.getElementById('checkCaptcha');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitButton.innerHTML =
    '<span class="spinner-grow spinner-grow-sm" role="status" aria-hidden="true"></span>Sending Form...'
    submitButton.disabled = true
    captchaModal.show();
  });

  checkCaptcha.addEventListener('click', function () {
    if (parseInt(captchaAnswer.value) === 2) {
      sendFormData();
      captchaModal.hide();
    } else {
      showMessage('Incorrect answer. Please try again.', 'text-danger', 'captchaMessage');
      captchaAnswer.value = '';
    }
  });

  function sendFormData() {
    const formData = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      subject: document.getElementById('subject').value,
      message: document.getElementById('message').value
    };

    fetch('/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
      showMessage('Message sent successfully!', 'text-success', 'mailMessage');
      form.reset();
      captchaAnswer.value = ''; // Reset the captcha input
      submitButton.innerHTML = originalsubmitButtonHtml
      submitButton.disabled = false
    })
    .catch((error) => {
      console.error('Error:', error);
      showMessage('An error occurred while sending the message.', 'text-danger', 'mailMessage');
      submitButton.innerHTML = originalsubmitButtonHtml
      submitButton.disabled = false
    });
  }

  //Function to display the error message
  function showMessage(message, className, elementID) {
    const messageElement = document.getElementById(elementID);
    messageElement.textContent = message;
    messageElement.className = className;
    setTimeout(() => messageElement.textContent = '', 3000); // Clear message after 3 seconds
  }
});
