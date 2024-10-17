// Reemplaza 'your_emailjs_user_id', 'your_service_id', y 'your_template_id' con los valores obtenidos de EmailJS
const emailjsUserID = '7IEpSpkY5kKrEerjl';
const emailjsServiceID = 'service_28rzr6x';
const emailjsTemplateID = 'template_50mtswa';

document.addEventListener('DOMContentLoaded', () => {
    emailjs.init('7IEpSpkY5kKrEerjl');

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

    async function fetchMessages() {
    const address = 'ecash:qplm2jhzuteklx9naquzwfe97tx3h8eu4gyq385tw8';
    const url = `https://explorer.e.cash/api/address/${address}/transactions`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        const transactions = data.transactions;
        const messagesList = document.getElementById('messages-list');

        transactions.forEach(tx => {
            const opReturnMessage = tx.outputs.find(output => output.script_type === 'op_return');

            if (opReturnMessage && opReturnMessage.script) {
                const message = parseOpReturn(opReturnMessage.script);
                const messageItem = document.createElement('li');
                messageItem.textContent = message;
                messagesList.appendChild(messageItem);
            }
        });
    } catch (error) {
        console.error("Error fetching messages:", error);
    }
}

// Helper function to decode the OP_Return data
function parseOpReturn(script) {
    // Assuming the OP_Return message is in hex, this will convert it to readable text
    const hex = script.replace(/^6a/, ''); // OP_RETURN starts with 6a
    const decodedMessage = hex.match(/.{1,2}/g).map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
    return decodedMessage;
}

// Function to fetch messages from blockchain (using an API to get OP_Return transactions)
async function fetchMessages() {
    const messagesList = document.getElementById("messages-list");
    const payButtonAddress = "ecash:qplm2jhzuteklx9naquzwfe97tx3h8eu4gyq385tw8"; // Dirección del PayButton

    try {
        // Fetching transactions from a blockchain API
        const response = await fetch(`https://api.blockexplorer.ecash/${payButtonAddress}/op_returns`);
        const data = await response.json();

        // Limpiar lista anterior
        messagesList.innerHTML = '';

        if (data.length === 0) {
            messagesList.innerHTML = '<li>No se han enviado mensajes aún.</li>';
        } else {
            // Iterar sobre las transacciones y añadir los mensajes decodificados
            data.forEach(transaction => {
                const script = transaction.vout[0].scriptPubKey.hex; // Assuming vout contains the script
                const message = parseOpReturn(script);
                
                // Crear el elemento de la lista con el mensaje decodificado
                const listItem = document.createElement("li");
                listItem.textContent = message;
                messagesList.appendChild(listItem);
            });
        }
    } catch (error) {
        console.error("Error al obtener los mensajes OP_Return:", error);
        messagesList.innerHTML = '<li>Error al cargar los mensajes.</li>';
    }
}

// Call the function to load the messages when the page loads
document.addEventListener('DOMContentLoaded', (event) => {
    fetchMessages();
});
