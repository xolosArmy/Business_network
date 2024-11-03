document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');


// Initialize Google Translate
function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'es',
        includedLanguages: 'en,fr,de,it,ja,ko,pt,ru,zh-CN'
    }, 'google_translate_element');
}


    const businessList = document.getElementById('business-list');

    const businesses = [
        {
            name: 'Xolos Ramirez',
            description: 'El mejor criadero de perro prehispánico xoloitzcuintle en México.',
            url: 'https://www.xolosramirez.com'
        }
        // Puedes agregar más negocios aquí
    ];

    businesses.forEach(business => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <h3>${business.name}</h3>
            <p>${business.description}</p>
            <a href="${business.url}" target="_blank">${business.url}</a>
        `;
        businessList.appendChild(listItem);
    });
});

    
