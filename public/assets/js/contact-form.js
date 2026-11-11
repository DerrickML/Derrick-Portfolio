document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('contact-form');
  const submitButton = document.getElementById('submitButton');
  const originalSubmitButtonText = submitButton.textContent;
  const captchaModal = new bootstrap.Modal(document.getElementById('captchaModal'));
  const captchaAnswer = document.getElementById('captchaAnswer');
  const checkCaptcha = document.getElementById('checkCaptcha');
  let isSending = false;
  let isLoadingChallenge = false;
  const messageTimers = new Map();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (isSending || isLoadingChallenge) return;
    if (window.PortfolioData.preview) return showMessage('Messages cannot be sent from a draft preview.', 'text-danger', 'mailMessage');
    showMessage('', '', 'mailMessage');
    showMessage('', '', 'captchaMessage');
    captchaAnswer.value = '';
    isLoadingChallenge = true;
    submitButton.disabled = true;
    try {
      const challenge = await window.PortfolioData.fetchJson('/api/contact/challenge');
      document.getElementById('captchaQuestion').textContent = challenge.question;
      captchaModal.show();
    } catch { showMessage('Unable to load the security check. Please try again.', 'text-danger', 'mailMessage'); }
    finally { isLoadingChallenge = false; submitButton.disabled = false; }
  });

  checkCaptcha.addEventListener('click', function () {
    if (isSending) return;

    if (captchaAnswer.value.trim()) {
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

  captchaAnswer.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      checkCaptcha.click();
    }
  });

  document.getElementById('captchaModal').addEventListener('hidden.bs.modal', function () {
    if (!submitButton.disabled) submitButton.focus();
  });

  async function sendFormData() {
    const formData = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      subject: document.getElementById('subject').value,
      message: document.getElementById('message').value,
      answer: captchaAnswer.value.trim(),
    };

    isSending = true;
    submitButton.textContent = submitButton.dataset.sendingLabel || 'Sending...';
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
    clearTimeout(messageTimers.get(elementID));
    messageTimers.delete(elementID);
    messageElement.textContent = message;
    messageElement.className = className || 'text-center';
    if (message) {
      messageTimers.set(elementID, setTimeout(() => {
        messageElement.textContent = '';
        messageTimers.delete(elementID);
      }, 10000));
    }
  }
});
