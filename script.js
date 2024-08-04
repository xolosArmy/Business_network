// Reemplaza 'your_emailjs_user_id', 'your_service_id', y 'your_template_id' con los valores obtenidos de EmailJS
const emailjsUserID = 'service_28rzr6x';
const emailjsServiceID = 'service_28rzr6x';
const emailjsTemplateID = 'template_trao8pi';

document.addEventListener('DOMContentLoaded', () => {
    emailjs.init(emailjsUserID);

    const form = document.getElementById('contact-form');
    form.addEventListener('submit', (event) => {
        event.preventDefault();

        emailjs.sendForm(emailjsServiceID, emailjsTemplateID, form)
            .then((response) => {
                alert('Mensaje enviado exitosamente!');
                form.reset();
            }, (error) => {
                alert('Error al enviar el mensaje. Intenta nuevamente.');
            });
    });

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
