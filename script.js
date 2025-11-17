document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed');

    // Wait for Google Translate script to load
    function loadGoogleTranslateScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Initialize Google Translate
    window.googleTranslateElementInit = function () {
        new google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: 'es,fr,de,it,ja,ko,pt,ru,zh-CN'
        }, 'google_translate_element');
    };

    try {
        await loadGoogleTranslateScript();
        console.log("Google Translate script loaded successfully.");
    } catch (error) {
        console.error("Failed to load Google Translate script:", error);
    }
});

setTimeout(function() {
  const popup = document.getElementById('popup-xolo');
  if (popup) {
    popup.style.display = 'block';
  }
}, 8000);

