document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('contact-form');
  const submitButton = document.getElementById('submitButton');
  const originalSubmitButtonText = submitButton.textContent;
  const captchaModal = new bootstrap.Modal(document.getElementById('captchaModal'));
  const captchaAnswer = document.getElementById('captchaAnswer');
  const checkCaptcha = document.getElementById('checkCaptcha');
  let isSending = false;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (isSending) return;
    showMessage('', '', 'mailMessage');
    showMessage('', '', 'captchaMessage');
    captchaAnswer.value = '';
    captchaModal.show();
  });

  checkCaptcha.addEventListener('click', function () {
    if (isSending) return;

    if (Number(captchaAnswer.value) === 2) {
      sendFormData();
      captchaModal.hide();
    } else {
      showMessage(captchaAnswer.dataset.incorrectMessage || 'Incorrect answer. Please try again.', 'text-danger', 'captchaMessage');
      captchaAnswer.value = '';
      captchaAnswer.focus();
    }
  });

  document.getElementById('captchaModal').addEventListener('shown.bs.modal', function () {
    captchaAnswer.focus();
  });

  async function sendFormData() {
    const formData = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      subject: document.getElementById('subject').value,
      message: document.getElementById('message').value
    };

    isSending = true;
    submitButton.innerHTML =
      `<span class="spinner-grow spinner-grow-sm" role="status" aria-hidden="true"></span> ${submitButton.dataset.sendingLabel || 'Sending...'}`;
    submitButton.disabled = true;
    checkCaptcha.disabled = true;

    try {
      const response = await fetch('/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to send your message.');
      }

      showMessage(data.message || form.dataset.successFallback || 'Message sent successfully!', 'text-success', 'mailMessage');
      form.reset();
      captchaAnswer.value = ''; // Reset the captcha input
    } catch (error) {
      console.error('Error:', error);
      showMessage(error.message || form.dataset.errorFallback || 'Unable to send your message.', 'text-danger', 'mailMessage');
    } finally {
      isSending = false;
      submitButton.textContent = submitButton.dataset.submitLabel || originalSubmitButtonText;
      submitButton.disabled = false;
      checkCaptcha.disabled = false;
    }
  }

  //Function to display the error message
  function showMessage(message, className, elementID) {
    const messageElement = document.getElementById(elementID);
    messageElement.textContent = message;
    messageElement.className = className || 'text-center';
    if (message) {
      setTimeout(() => messageElement.textContent = '', 10000);
    }
  }
});
